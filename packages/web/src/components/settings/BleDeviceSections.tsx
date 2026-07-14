import { HubIcon } from '../hub-icons';
import { BleBindingCard, BleDiscoveryCard, bleStatusBadge } from './BleDeviceCards';
import type { BleBindingView, BleScanSnapshot, BleStatus } from './ble-device-types';
import {
  SettingsBadge,
  SettingsEmptyState,
  SettingsPrimaryButton,
  SettingsSecondaryButton,
  SettingsSection,
  SettingsStatusStrip,
  SettingsText,
} from './primitives';

interface BleDeviceViewProps {
  status: BleStatus;
  bindings: BleBindingView[];
  scan: BleScanSnapshot;
  busyKey: string | null;
  error: string | null;
  onStartScan: () => void;
  onStopScan: () => void;
  onBind: (discoveryId: string) => void;
  onUnbind: (binding: BleBindingView) => void;
}

function BleStatusNotices({ status, error }: Pick<BleDeviceViewProps, 'status' | 'error'>) {
  return (
    <>
      {!status.available && (
        <SettingsStatusStrip tone="warn" bordered>
          <span>
            <strong>当前平台暂不支持 BLE。</strong> {status.reason}
          </span>
        </SettingsStatusStrip>
      )}
      {status.available && status.state === 'degraded' && (
        <SettingsStatusStrip tone="error" bordered>
          <span>
            <strong>BLE helper 已降级。</strong> {status.reason}
          </span>
        </SettingsStatusStrip>
      )}
      {error && <SettingsStatusStrip tone="error">{error}</SettingsStatusStrip>}
    </>
  );
}

function BleScanControls({
  status,
  scan,
  busyKey,
  onStartScan,
  onStopScan,
}: Pick<BleDeviceViewProps, 'status' | 'scan' | 'busyKey' | 'onStartScan' | 'onStopScan'>) {
  if (!status.available) return null;
  if (!scan.active) {
    const scanEnabled = status.state !== 'starting' && status.state !== 'unsupported';
    return (
      <SettingsPrimaryButton onClick={onStartScan} disabled={!scanEnabled || busyKey === 'scan'}>
        {status.state === 'degraded' ? '重试并扫描' : '扫描附近设备'}
      </SettingsPrimaryButton>
    );
  }

  const remainingSeconds = scan.expiresAt ? Math.max(0, Math.ceil((scan.expiresAt - Date.now()) / 1_000)) : null;
  return (
    <>
      <SettingsSecondaryButton onClick={onStopScan} disabled={busyKey === 'scan'}>
        停止扫描
      </SettingsSecondaryButton>
      <SettingsBadge tone="blue">
        正在扫描{remainingSeconds !== null ? ` · 剩余 ${remainingSeconds} 秒` : ''}
      </SettingsBadge>
    </>
  );
}

function BleDiscoveryList({
  status,
  scan,
  busyKey,
  onBind,
}: Pick<BleDeviceViewProps, 'status' | 'scan' | 'busyKey' | 'onBind'>) {
  if (!status.available) return null;
  if (scan.discoveries.length === 0) {
    return (
      <SettingsEmptyState
        icon={<HubIcon name="activity" className="mb-3 h-6 w-6 text-cafe-muted" />}
        title={scan.active ? '正在等待附近设备' : '当前扫描会话没有设备'}
        description={scan.active ? '保持设备处于广播状态。' : '发起扫描后，附近设备会在此处短暂显示。'}
      />
    );
  }
  return (
    <div className="space-y-2">
      {scan.discoveries.map((discovery) => (
        <BleDiscoveryCard
          key={discovery.discoveryId}
          discovery={discovery}
          disabled={busyKey !== null}
          onBind={() => onBind(discovery.discoveryId)}
        />
      ))}
    </div>
  );
}

function BleBindingsSection({
  bindings,
  busyKey,
  onUnbind,
}: Pick<BleDeviceViewProps, 'bindings' | 'busyKey' | 'onUnbind'>) {
  return (
    <SettingsSection title="已绑定设备" description="猫猫只能调用 adapter 声明的类型化能力，不能执行任意 GATT 写入。">
      {bindings.length === 0 ? (
        <SettingsText as="p">尚未绑定 BLE 设备。</SettingsText>
      ) : (
        <div className="space-y-2">
          {bindings.map((binding) => (
            <BleBindingCard
              key={binding.bindingId}
              binding={binding}
              disabled={busyKey !== null}
              onUnbind={() => onUnbind(binding)}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

export function BleDeviceSections(props: BleDeviceViewProps) {
  const badge = bleStatusBadge(props.status);
  return (
    <div className="space-y-5">
      <BleStatusNotices status={props.status} error={props.error} />
      <SettingsSection
        title="附近设备"
        description="扫描结果只保留到停止扫描或 30 秒超时。只有显式绑定的设备会持久保存。"
        badge={<SettingsBadge tone={badge.tone}>{badge.label}</SettingsBadge>}
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <BleScanControls
            status={props.status}
            scan={props.scan}
            busyKey={props.busyKey}
            onStartScan={props.onStartScan}
            onStopScan={props.onStopScan}
          />
        </div>
        <BleDiscoveryList status={props.status} scan={props.scan} busyKey={props.busyKey} onBind={props.onBind} />
      </SettingsSection>
      <BleBindingsSection bindings={props.bindings} busyKey={props.busyKey} onUnbind={props.onUnbind} />
    </div>
  );
}
