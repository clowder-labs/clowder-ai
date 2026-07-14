import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { LimbNodeStatus } from '@cat-cafe/shared';
import type { LimbRegistry } from '../LimbRegistry.js';
import {
  availableBleCommands,
  type BleDecodedValue,
  type BleGattService,
  decodeBleCommandValue,
  findBleAdapterCommand,
  getBleAdapter,
  selectBleAdapter,
} from './BleAdapters.js';
import { BLE_BINDING_SCOPE, type BleBinding, type IBleBindingStore } from './BleBindingStore.js';
import type { BleHelperClientStatus } from './BleHelperClientTypes.js';
import type { BleHelperEvent } from './BleHelperProtocol.js';
import { BleLimbNode, type BleLimbNodeExecutor } from './BleLimbNode.js';
import { type BleHelperRequester, BleScanSession, type BleScanSnapshot } from './BleScanSession.js';

export interface BleManagerHelper extends BleHelperRequester {
  readonly status: BleHelperClientStatus;
  on(event: 'state', listener: (status: BleHelperClientStatus) => void): this;
  on(event: 'event', listener: (message: BleHelperEvent) => void): this;
  off(event: 'state', listener: (status: BleHelperClientStatus) => void): this;
  off(event: 'event', listener: (message: BleHelperEvent) => void): this;
}

interface LoggerLike {
  warn(message: string): void;
  info(message: string): void;
}

export interface BleDeviceManagerOptions {
  helper: BleManagerHelper;
  store: IBleBindingStore;
  registry: LimbRegistry;
  platform?: string;
  logger?: LoggerLike;
}

export interface BleBindingView {
  bindingId: string;
  displayName: string;
  adapterId: string;
  commands: string[];
  nodeId: string;
  createdAt: number;
  lastConnectedAt: number | null;
}

export interface BleManagerStatus {
  platform: string;
  available: boolean;
  state: BleHelperClientStatus['state'];
  reason: string | null;
  restartAttempts: number;
  bindingCount: number;
}

interface BindInput {
  sessionId: string;
  discoveryId: string;
}

interface NotificationSubscription {
  binding: BleBinding;
  command: string;
}

function toBindingView(binding: BleBinding): BleBindingView {
  return {
    bindingId: binding.bindingId,
    displayName: binding.displayName,
    adapterId: binding.adapterId,
    commands: [...binding.commands],
    nodeId: binding.nodeId,
    createdAt: binding.createdAt,
    lastConnectedAt: binding.lastConnectedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseGattServices(value: unknown): BleGattService[] {
  if (!isRecord(value) || !Array.isArray(value.services) || value.services.length > 64) {
    throw new Error('BLE helper returned an invalid GATT inspection');
  }
  return value.services.map((service): BleGattService => {
    if (!isRecord(service) || typeof service.uuid !== 'string' || service.uuid.length > 64) {
      throw new Error('BLE helper returned an invalid GATT service');
    }
    if (!Array.isArray(service.characteristics) || service.characteristics.length > 128) {
      throw new Error('BLE helper returned an invalid characteristic list');
    }
    return {
      uuid: service.uuid,
      characteristics: service.characteristics.map((characteristic) => {
        if (
          !isRecord(characteristic) ||
          typeof characteristic.uuid !== 'string' ||
          characteristic.uuid.length > 64 ||
          !Array.isArray(characteristic.properties) ||
          !characteristic.properties.every((property) => typeof property === 'string' && property.length <= 32)
        ) {
          throw new Error('BLE helper returned an invalid GATT characteristic');
        }
        return { uuid: characteristic.uuid, properties: [...characteristic.properties] as string[] };
      }),
    };
  });
}

function decodeBase64Value(value: unknown): Buffer {
  if (!isRecord(value) || typeof value.valueBase64 !== 'string' || value.valueBase64.length > 5_464) {
    throw new Error('BLE helper returned an invalid characteristic value');
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.valueBase64)) {
    throw new Error('BLE helper returned malformed base64 data');
  }
  const decoded = Buffer.from(value.valueBase64, 'base64');
  if (decoded.byteLength > 4 * 1024) throw new Error('BLE characteristic value exceeds 4 KiB');
  return decoded;
}

function notificationKey(deviceId: string, serviceUuid: string, characteristicUuid: string): string {
  return `${deviceId}:${serviceUuid.toLowerCase()}:${characteristicUuid.toLowerCase()}`;
}

export class BleDeviceManager extends EventEmitter implements BleLimbNodeExecutor {
  private readonly helper: BleManagerHelper;
  private readonly store: IBleBindingStore;
  private readonly registry: LimbRegistry;
  private readonly platform: string;
  private readonly logger: LoggerLike;
  private readonly scan: BleScanSession;
  private readonly bindings = new Map<string, BleBinding>();
  private readonly subscriptions = new Map<string, NotificationSubscription>();

  constructor(options: BleDeviceManagerOptions) {
    super();
    this.helper = options.helper;
    this.store = options.store;
    this.registry = options.registry;
    this.platform = options.platform ?? process.platform;
    this.logger = options.logger ?? console;
    this.scan = new BleScanSession(this.helper);
    this.helper.on('state', this.handleHelperState);
    this.helper.on('event', this.handleHelperEvent);
  }

  async initialize(): Promise<void> {
    const persisted = await this.store.list(BLE_BINDING_SCOPE);
    for (const binding of persisted) {
      const adapter = getBleAdapter(binding.adapterId);
      const declared = new Set(adapter?.commands.map((command) => command.command) ?? []);
      if (!adapter || binding.commands.some((command) => !declared.has(command))) {
        this.logger.warn(`Ignoring BLE binding with unknown adapter or command: ${binding.bindingId}`);
        continue;
      }
      try {
        await this.registerBinding(binding);
      } catch (error) {
        this.logger.warn(`Failed to hydrate BLE binding '${binding.bindingId}': ${String(error)}`);
      }
    }
  }

  status(): BleManagerStatus {
    const helperStatus = this.helper.status;
    return {
      platform: this.platform,
      available: this.platform === 'darwin' && helperStatus.state !== 'unsupported',
      state: helperStatus.state,
      reason: helperStatus.reason,
      restartAttempts: helperStatus.restartAttempts,
      bindingCount: this.bindings.size,
    };
  }

  async listBindings(): Promise<BleBindingView[]> {
    return [...this.bindings.values()].map(toBindingView).sort((a, b) => a.createdAt - b.createdAt);
  }

  startScan(): Promise<{ sessionId: string; startedAt: number; expiresAt: number }> {
    return this.scan.start();
  }

  stopScan(): Promise<void> {
    return this.scan.stop();
  }

  scanSnapshot(): BleScanSnapshot {
    return this.scan.snapshot();
  }

  async bind(input: BindInput): Promise<BleBindingView> {
    const discovery = this.scan.resolveDiscovery(input.sessionId, input.discoveryId);
    if (!discovery) throw new Error('BLE discovery is not available in the active scan session');
    if ([...this.bindings.values()].some((binding) => binding.platformDeviceId === discovery.platformDeviceId)) {
      throw new Error('BLE device is already bound');
    }

    const inspection = await this.helper.request('device.inspect', { deviceId: discovery.platformDeviceId });
    const services = parseGattServices(inspection);
    const adapter = selectBleAdapter(services);
    if (!adapter) throw new Error('BLE device does not expose a supported adapter profile');
    const commands = availableBleCommands(adapter, services).map((command) => command.command);
    if (commands.length === 0) throw new Error('BLE device has no supported readable or notifiable characteristics');

    const bindingId = randomUUID();
    const now = Date.now();
    const binding: BleBinding = {
      bindingId,
      scopeId: BLE_BINDING_SCOPE,
      platformDeviceId: discovery.platformDeviceId,
      displayName: discovery.name?.trim().slice(0, 128) || `BLE ${bindingId.slice(0, 8)}`,
      adapterId: adapter.id,
      commands,
      nodeId: `ble:${bindingId}`,
      createdAt: now,
      lastConnectedAt: now,
    };

    await this.store.put(binding);
    try {
      await this.registerBinding(binding);
    } catch (error) {
      await this.store.delete(binding.scopeId, binding.bindingId);
      throw error;
    }
    return toBindingView(binding);
  }

  async unbind(bindingId: string): Promise<boolean> {
    const binding = this.bindings.get(bindingId);
    if (!binding) return false;
    await this.store.delete(binding.scopeId, binding.bindingId);
    this.bindings.delete(bindingId);
    this.registry.deregister(binding.nodeId);
    for (const [key, subscription] of this.subscriptions) {
      if (subscription.binding.bindingId === bindingId) this.subscriptions.delete(key);
    }
    try {
      await this.helper.request('device.disconnect', { deviceId: binding.platformDeviceId });
    } catch (error) {
      this.logger.warn(`BLE device disconnect after unbind failed: ${String(error)}`);
    }
    return true;
  }

  async execute(binding: BleBinding, commandName: string): Promise<unknown> {
    const liveBinding = this.bindings.get(binding.bindingId);
    if (!liveBinding || !liveBinding.commands.includes(commandName)) throw new Error('BLE binding is no longer active');
    const command = findBleAdapterCommand(liveBinding.adapterId, commandName);
    if (!command) throw new Error(`BLE adapter does not declare command: ${commandName}`);
    const params = {
      deviceId: liveBinding.platformDeviceId,
      serviceUuid: command.serviceUuid,
      characteristicUuid: command.characteristicUuid,
    };
    if (command.mode === 'notify') {
      await this.helper.request('gatt.subscribe', params);
      this.subscriptions.set(
        notificationKey(liveBinding.platformDeviceId, command.serviceUuid, command.characteristicUuid),
        { binding: liveBinding, command: commandName },
      );
      return { subscribed: true };
    }
    const result = await this.helper.request('gatt.read', params);
    return decodeBleCommandValue(liveBinding.adapterId, commandName, decodeBase64Value(result));
  }

  nodeHealth(): LimbNodeStatus {
    return this.helper.status.state === 'degraded' || this.helper.status.state === 'unsupported'
      ? 'degraded'
      : 'online';
  }

  dispose(): void {
    this.scan.dispose();
    this.helper.off('state', this.handleHelperState);
    this.helper.off('event', this.handleHelperEvent);
  }

  private async registerBinding(binding: BleBinding): Promise<void> {
    if (this.registry.getNode(binding.nodeId)) throw new Error(`Limb node already registered: ${binding.nodeId}`);
    await this.registry.register(new BleLimbNode(binding, this));
    this.bindings.set(binding.bindingId, { ...binding, commands: [...binding.commands] });
  }

  private readonly handleHelperState = (status: BleHelperClientStatus): void => {
    const nodeStatus: LimbNodeStatus =
      status.state === 'degraded' || status.state === 'unsupported' ? 'degraded' : 'online';
    for (const binding of this.bindings.values()) this.registry.updateStatus(binding.nodeId, nodeStatus);
    this.emit('state', this.status());
  };

  private readonly handleHelperEvent = (message: BleHelperEvent): void => {
    if (message.event !== 'gatt.notification') return;
    const key = notificationKey(message.data.deviceId, message.data.serviceUuid, message.data.characteristicUuid);
    const subscription = this.subscriptions.get(key);
    if (!subscription) return;
    try {
      const value = decodeBleCommandValue(
        subscription.binding.adapterId,
        subscription.command,
        decodeBase64Value({ valueBase64: message.data.valueBase64 }),
      );
      this.emit('notification', {
        bindingId: subscription.binding.bindingId,
        nodeId: subscription.binding.nodeId,
        command: subscription.command,
        observedAt: message.data.observedAt,
        value,
      } satisfies {
        bindingId: string;
        nodeId: string;
        command: string;
        observedAt: number;
        value: BleDecodedValue;
      });
    } catch (error) {
      this.logger.warn(`Ignoring invalid BLE notification: ${String(error)}`);
    }
  };
}
