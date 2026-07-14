import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/utils/api-client', () => ({ apiFetch }));
vi.mock('../../useConfirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import { BleDevicesContent } from '../BleDevicesContent';

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => payload };
}

describe('BleDevicesContent', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    apiFetch.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders the unsupported state without offering a scan action', async () => {
    apiFetch.mockResolvedValue(
      jsonResponse({
        platform: 'linux',
        available: false,
        state: 'unsupported',
        reason: 'BLE helper is only available on macOS in Phase A',
        restartAttempts: 0,
        bindingCount: 0,
      }),
    );

    await act(async () => root.render(<BleDevicesContent />));
    await act(async () => Promise.resolve());

    expect(container.textContent).toContain('当前平台暂不支持 BLE');
    expect(container.textContent).toContain('BLE helper is only available on macOS');
    expect(container.textContent).not.toContain('扫描附近设备');
  });

  it('renders scanning results and binds using opaque IDs only', async () => {
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      const requestKey = `${init?.method ?? 'GET'} ${path}`;
      switch (requestKey) {
        case 'GET /api/limb/ble/status':
          return jsonResponse({
            platform: 'darwin',
            available: true,
            state: 'ready',
            reason: null,
            restartAttempts: 0,
            bindingCount: 0,
          });
        case 'GET /api/limb/ble/bindings':
          return jsonResponse({ bindings: [] });
        case 'GET /api/limb/ble/scan':
          return jsonResponse({
            active: true,
            sessionId: 'scan-opaque',
            startedAt: Date.now(),
            expiresAt: Date.now() + 30_000,
            discoveries: [
              {
                discoveryId: 'discovery-opaque',
                name: 'Desk Sensor',
                rssi: -47,
                serviceUuids: ['181a'],
              },
            ],
          });
        case 'POST /api/limb/ble/bindings':
          return jsonResponse(
            {
              bindingId: 'binding-1',
              displayName: 'Desk Sensor',
              adapterId: 'standard.environmental',
              commands: ['ble.temperature.read'],
              nodeId: 'ble:binding-1',
              createdAt: Date.now(),
              lastConnectedAt: Date.now(),
            },
            true,
            201,
          );
        default:
          throw new Error(`Unexpected request: ${requestKey}`);
      }
    });

    await act(async () => root.render(<BleDevicesContent />));
    await act(async () => Promise.resolve());
    expect(container.textContent).toContain('Desk Sensor');
    expect(container.textContent).toContain('正在扫描');

    const bindButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('绑定设备'),
    );
    expect(bindButton).toBeTruthy();
    await act(async () => bindButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const bindCall = apiFetch.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(bindCall?.[1]?.body as string)).toEqual({
      sessionId: 'scan-opaque',
      discoveryId: 'discovery-opaque',
    });
    expect(bindCall?.[1]?.body).not.toContain('deviceId');
  });

  it('shows degraded helper state and keeps existing bindings visible', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.endsWith('/status')) {
        return jsonResponse({
          platform: 'darwin',
          available: true,
          state: 'degraded',
          reason: 'helper restart attempts exhausted',
          restartAttempts: 3,
          bindingCount: 1,
        });
      }
      if (path.endsWith('/bindings')) {
        return jsonResponse({
          bindings: [
            {
              bindingId: 'binding-1',
              displayName: 'Desk Sensor',
              adapterId: 'standard.environmental',
              commands: ['ble.temperature.read'],
              nodeId: 'ble:binding-1',
              createdAt: 100,
              lastConnectedAt: 100,
            },
          ],
        });
      }
      if (path.endsWith('/scan')) {
        return jsonResponse({ active: false, sessionId: null, startedAt: null, expiresAt: null, discoveries: [] });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    await act(async () => root.render(<BleDevicesContent />));
    await act(async () => Promise.resolve());

    expect(container.textContent).toContain('BLE helper 已降级');
    expect(container.textContent).toContain('helper restart attempts exhausted');
    expect(container.textContent).toContain('Desk Sensor');
    expect(container.textContent).toContain('重试并扫描');
    expect(
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('重试并扫描'))
        ?.disabled,
    ).toBe(false);
  });
});
