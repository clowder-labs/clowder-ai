import type { LimbCapability, LimbCommandSchema } from '@cat-cafe/shared';

export interface BleGattCharacteristic {
  uuid: string;
  properties: string[];
}

export interface BleGattService {
  uuid: string;
  characteristics: BleGattCharacteristic[];
}

export interface BleAdapterCommand {
  command: string;
  capability: string;
  serviceUuid: string;
  characteristicUuid: string;
  mode: 'read' | 'notify';
  decode(value: Buffer): BleDecodedValue;
}

export interface BleAdapterDefinition {
  id: string;
  displayName: string;
  commands: readonly BleAdapterCommand[];
}

export interface BleDecodedValue {
  kind: 'battery' | 'temperature' | 'humidity' | 'button';
  value: number | 'press' | 'double_press' | 'hold';
  unit: '%' | '°C' | 'event';
}

const BLUETOOTH_BASE_SUFFIX = '-0000-1000-8000-00805f9b34fb';

export function normalizeGattUuid(uuid: string): string {
  const normalized = uuid.trim().toLowerCase();
  if (normalized.startsWith('0000') && normalized.endsWith(BLUETOOTH_BASE_SUFFIX)) {
    return normalized.slice(4, 8);
  }
  return normalized;
}

function requireLength(value: Buffer, expected: number, label: string): void {
  if (value.byteLength !== expected) {
    throw new Error(`${label} value has invalid length: expected ${expected}, received ${value.byteLength}`);
  }
}

function requireRange(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} value ${value} is outside ${min}..${max}`);
  }
  return value;
}

function decodeBattery(value: Buffer): BleDecodedValue {
  requireLength(value, 1, 'Battery');
  return { kind: 'battery', value: requireRange(value.readUInt8(0), 0, 100, 'Battery'), unit: '%' };
}

function decodeTemperature(value: Buffer): BleDecodedValue {
  requireLength(value, 2, 'Temperature');
  const decoded = value.readInt16LE(0) / 100;
  return { kind: 'temperature', value: requireRange(decoded, -273.15, 200, 'Temperature'), unit: '°C' };
}

function decodeHumidity(value: Buffer): BleDecodedValue {
  requireLength(value, 2, 'Humidity');
  const decoded = value.readUInt16LE(0) / 100;
  return { kind: 'humidity', value: requireRange(decoded, 0, 100, 'Humidity'), unit: '%' };
}

function decodeButton(value: Buffer): BleDecodedValue {
  requireLength(value, 1, 'Button');
  const event = value.readUInt8(0);
  const mapped = event === 1 ? 'press' : event === 2 ? 'double_press' : event === 3 ? 'hold' : null;
  if (!mapped) throw new Error(`Button value ${event} is outside the declared event set`);
  return { kind: 'button', value: mapped, unit: 'event' };
}

const BATTERY_COMMAND: BleAdapterCommand = {
  command: 'ble.battery.read',
  capability: 'ble.battery',
  serviceUuid: '180f',
  characteristicUuid: '2a19',
  mode: 'read',
  decode: decodeBattery,
};

const ENVIRONMENTAL_COMMANDS: readonly BleAdapterCommand[] = [
  {
    command: 'ble.temperature.read',
    capability: 'ble.environment',
    serviceUuid: '181a',
    characteristicUuid: '2a6e',
    mode: 'read',
    decode: decodeTemperature,
  },
  {
    command: 'ble.humidity.read',
    capability: 'ble.environment',
    serviceUuid: '181a',
    characteristicUuid: '2a6f',
    mode: 'read',
    decode: decodeHumidity,
  },
];

const CAT_CAFE_BUTTON_SERVICE = '7f9c0001-7d7e-4f1d-9d7b-5f2580000001';
const CAT_CAFE_BUTTON_CHARACTERISTIC = '7f9c0002-7d7e-4f1d-9d7b-5f2580000001';

export const BLE_ADAPTERS: Readonly<Record<string, BleAdapterDefinition>> = {
  'standard.environmental': {
    id: 'standard.environmental',
    displayName: 'Environmental Sensing',
    commands: ENVIRONMENTAL_COMMANDS,
  },
  'standard.battery': {
    id: 'standard.battery',
    displayName: 'Battery Service',
    commands: [BATTERY_COMMAND],
  },
  'cat-cafe.button.v1': {
    id: 'cat-cafe.button.v1',
    displayName: 'Cat Café Button v1',
    commands: [
      {
        command: 'ble.button.subscribe',
        capability: 'ble.button',
        serviceUuid: CAT_CAFE_BUTTON_SERVICE,
        characteristicUuid: CAT_CAFE_BUTTON_CHARACTERISTIC,
        mode: 'notify',
        decode: decodeButton,
      },
    ],
  },
};

export function getBleAdapter(adapterId: string): BleAdapterDefinition | null {
  return BLE_ADAPTERS[adapterId] ?? null;
}

function hasCharacteristic(services: readonly BleGattService[], command: BleAdapterCommand): boolean {
  const serviceUuid = normalizeGattUuid(command.serviceUuid);
  const characteristicUuid = normalizeGattUuid(command.characteristicUuid);
  return services.some(
    (service) =>
      normalizeGattUuid(service.uuid) === serviceUuid &&
      service.characteristics.some((characteristic) => {
        if (normalizeGattUuid(characteristic.uuid) !== characteristicUuid) return false;
        return command.mode === 'read'
          ? characteristic.properties.includes('read')
          : characteristic.properties.includes('notify') || characteristic.properties.includes('indicate');
      }),
  );
}

export function selectBleAdapter(services: readonly BleGattService[]): BleAdapterDefinition | null {
  const preference = ['standard.environmental', 'cat-cafe.button.v1', 'standard.battery'];
  for (const adapterId of preference) {
    const adapter = BLE_ADAPTERS[adapterId];
    if (adapter?.commands.some((command) => hasCharacteristic(services, command))) return adapter;
  }
  return null;
}

export function availableBleCommands(
  adapter: BleAdapterDefinition,
  services?: readonly BleGattService[],
): BleAdapterCommand[] {
  return adapter.commands.filter((command) => !services || hasCharacteristic(services, command));
}

export function findBleAdapterCommand(adapterId: string, commandName: string): BleAdapterCommand | null {
  return getBleAdapter(adapterId)?.commands.find((command) => command.command === commandName) ?? null;
}

export function decodeBleCommandValue(adapterId: string, commandName: string, value: Buffer): BleDecodedValue {
  const command = findBleAdapterCommand(adapterId, commandName);
  if (!command) throw new Error(`Command '${commandName}' is not declared by BLE adapter '${adapterId}'`);
  return command.decode(value);
}

export function buildBleLimbCapabilities(adapterId: string, allowedCommands?: readonly string[]): LimbCapability[] {
  const adapter = getBleAdapter(adapterId);
  if (!adapter) return [];
  const allowed = allowedCommands ? new Set(allowedCommands) : null;
  const grouped = new Map<string, string[]>();
  for (const command of adapter.commands) {
    if (allowed && !allowed.has(command.command)) continue;
    const commands = grouped.get(command.capability) ?? [];
    commands.push(command.command);
    grouped.set(command.capability, commands);
  }
  return [...grouped].map(([cap, commands]) => ({ cap, commands, authLevel: 'free' as const }));
}

export function buildBleCommandSchemas(
  adapterId: string,
  allowedCommands?: readonly string[],
): Record<string, LimbCommandSchema> {
  const adapter = getBleAdapter(adapterId);
  if (!adapter) return {};
  const allowed = allowedCommands ? new Set(allowedCommands) : null;
  return Object.fromEntries(
    adapter.commands
      .filter((command) => !allowed || allowed.has(command.command))
      .map((command) => [
        command.command,
        {
          description:
            command.mode === 'read'
              ? `Read typed ${command.capability} data from the bound BLE device.`
              : `Subscribe to typed ${command.capability} events from the bound BLE device.`,
          params: {},
        },
      ]),
  );
}
