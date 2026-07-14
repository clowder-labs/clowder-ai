import type { BleBindingView, BleDiscoveryView, BleStatus } from './ble-device-types';
import { SettingsBadge, SettingsCard, SettingsDeleteButton, SettingsPrimaryButton, SettingsText } from './primitives';

function signalLabel(rssi: number): string {
  if (rssi >= -55) return '信号强';
  if (rssi >= -70) return '信号中等';
  return '信号较弱';
}

export function bleStatusBadge(status: BleStatus): {
  tone: 'emerald' | 'amber' | 'red' | 'slate';
  label: string;
} {
  if (status.state === 'ready') return { tone: 'emerald', label: 'BLE 就绪' };
  if (status.state === 'starting') return { tone: 'amber', label: '正在启动 helper' };
  if (status.state === 'degraded') return { tone: 'red', label: 'BLE 已降级' };
  if (status.state === 'unsupported') return { tone: 'slate', label: '当前不支持' };
  return { tone: 'slate', label: '按需启动' };
}

export function BleDiscoveryCard({
  discovery,
  disabled,
  onBind,
}: {
  discovery: BleDiscoveryView;
  disabled: boolean;
  onBind: () => void;
}) {
  return (
    <SettingsCard className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <SettingsText as="p" variant="sm" tone="default" className="truncate font-semibold">
          {discovery.name ?? '未命名 BLE 设备'}
        </SettingsText>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <SettingsBadge tone={discovery.rssi >= -70 ? 'blue' : 'amber'}>{signalLabel(discovery.rssi)}</SettingsBadge>
          <SettingsText className="hidden sm:inline">
            {discovery.serviceUuids.length > 0 ? discovery.serviceUuids.join(' · ') : '服务待检查'}
          </SettingsText>
        </div>
      </div>
      <SettingsPrimaryButton onClick={onBind} disabled={disabled}>
        绑定设备
      </SettingsPrimaryButton>
    </SettingsCard>
  );
}

export function BleBindingCard({
  binding,
  disabled,
  onUnbind,
}: {
  binding: BleBindingView;
  disabled: boolean;
  onUnbind: () => void;
}) {
  return (
    <SettingsCard className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <SettingsText as="p" variant="sm" tone="default" className="font-semibold">
            {binding.displayName}
          </SettingsText>
          <SettingsBadge tone="emerald">已绑定</SettingsBadge>
        </div>
        <SettingsText as="p" className="mt-1">
          {binding.adapterId}
        </SettingsText>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {binding.commands.map((command) => (
            <SettingsBadge key={command} tone="slate" size="xxs">
              {command}
            </SettingsBadge>
          ))}
        </div>
      </div>
      <SettingsDeleteButton onClick={onUnbind} disabled={disabled} aria-label={`解除绑定 ${binding.displayName}`} />
    </SettingsCard>
  );
}
