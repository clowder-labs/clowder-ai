import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubConnectorConfigTab } from '@/components/HubConnectorConfigTab';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/components/WeixinQrPanel', () => ({
  WeixinQrPanel: ({
    configured,
    onConfigured,
  }: {
    configured: boolean;
    onConfigured?: () => void | Promise<void>;
  }) =>
    React.createElement(
      'button',
      {
        'data-testid': 'weixin-qr',
        'data-configured': configured ? 'true' : 'false',
        onClick: () => void onConfigured?.(),
      },
      configured ? 'connected' : 'idle',
    ),
}));
vi.mock('@/components/FeishuQrPanel', () => ({
  FeishuQrPanel: ({
    configured,
    onConfirmed,
  }: {
    configured: boolean;
    onConfirmed?: () => void | Promise<void>;
  }) =>
    React.createElement(
      'button',
      {
        'data-testid': 'feishu-qr',
        'data-configured': configured ? 'true' : 'false',
        onClick: () => void onConfirmed?.(),
      },
      configured ? 'connected' : 'idle',
    ),
}));

const mockApiFetch = vi.mocked(apiFetch);
const testDir = dirname(fileURLToPath(import.meta.url));
const globalsCssPath = resolve(testDir, '..', '..', 'app', 'globals.css');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('HubConnectorConfigTab layout', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/connector/status') {
        return Promise.resolve(
          jsonResponse({
            platforms: [
              {
                id: 'slack',
                name: 'Slack',
                nameEn: 'Slack',
                configured: false,
                docsUrl: 'https://example.com/docs',
                steps: ['Open app settings', 'Save credentials'],
                fields: [{ envName: 'SLACK_TOKEN', label: 'Token', sensitive: false, currentValue: null }],
              },
              {
                id: 'weixin',
                name: '微信',
                nameEn: 'WeChat',
                configured: false,
                docsUrl: '',
                steps: ['扫码绑定', '完成确认'],
                fields: [],
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.documentElement.removeAttribute('data-ui-theme');
    vi.clearAllMocks();
  });

  it('renders platform list in left pane and selected details in right pane', async () => {
    await act(async () => {
      root.render(React.createElement(HubConnectorConfigTab));
    });
    await flushEffects();

    const leftPane = container.querySelector('[data-testid="connector-left-pane"]');
    const rightPane = container.querySelector('[data-testid="connector-right-pane"]');
    expect(leftPane).not.toBeNull();
    expect(rightPane).not.toBeNull();

    const slackItem = container.querySelector('[data-testid="platform-item-slack"]');
    const weixinItem = container.querySelector('[data-testid="platform-item-weixin"]');
    expect(slackItem).not.toBeNull();
    expect(weixinItem).not.toBeNull();
    expect(slackItem?.textContent).toContain('未配置');
    expect(weixinItem?.textContent).toContain('未配置');

    expect(container.querySelector('input[data-testid="field-SLACK_TOKEN"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="weixin-qr"]')).toBeNull();

    await act(async () => {
      weixinItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="weixin-qr"]')).not.toBeNull();
    expect(container.querySelector('input[data-testid="field-SLACK_TOKEN"]')).toBeNull();
  });

  it('refreshes platform status after Weixin QR panel reports configuration success', async () => {
    let statusCallCount = 0;
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/connector/status') {
        statusCallCount += 1;
        return Promise.resolve(
          jsonResponse({
            platforms: [
              {
                id: 'weixin',
                name: '微信',
                nameEn: 'WeChat',
                configured: statusCallCount > 1,
                docsUrl: '',
                steps: ['扫码绑定', '完成确认'],
                fields: [],
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(React.createElement(HubConnectorConfigTab));
    });
    await flushEffects();

    const weixinItem = container.querySelector('[data-testid="platform-item-weixin"]');
    expect(weixinItem?.textContent).toContain('未配置');

    await act(async () => {
      (container.querySelector('[data-testid="weixin-qr"]') as HTMLButtonElement | null)?.click();
    });
    await flushEffects();

    expect(statusCallCount).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[data-testid="platform-item-weixin"]')?.textContent).toContain('已启用');
  });

  it('uses business-theme unconfigured badge tokens when business theme is active', async () => {
    const globalsCss = readFileSync(globalsCssPath, 'utf8');
    const businessThemeBlock = globalsCss.match(/\[data-ui-theme="business"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(businessThemeBlock).toContain('--status-badge-unconfigured-surface: #f0f0f0;');
    expect(businessThemeBlock).toContain('--status-badge-unconfigured-text: var(--text-label-secondary);');
  });

  it('renders Feishu as QR-only flow without credential form or test button', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/connector/status') {
        return Promise.resolve(
          jsonResponse({
            platforms: [
              {
                id: 'feishu',
                name: '飞书',
                nameEn: 'Feishu / Lark',
                configured: false,
                docsUrl: 'https://open.feishu.cn/document/home',
                steps: ['生成二维码', '扫码授权', '自动连接'],
                fields: [],
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(React.createElement(HubConnectorConfigTab));
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="feishu-qr"]')).not.toBeNull();
    expect(container.querySelector('input[data-testid^="field-FEISHU_"]')).toBeNull();
    const testButton = Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('测试连接'));
    expect(testButton).toBeUndefined();
    const saveButton = Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('保存配置'));
    expect(saveButton).toBeUndefined();
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      '/api/connector/test/feishu',
      expect.anything(),
    );
  });

  it('refreshes platform status after Feishu QR panel reports configuration success', async () => {
    let statusCallCount = 0;
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/connector/status') {
        statusCallCount += 1;
        return Promise.resolve(
          jsonResponse({
            platforms: [
              {
                id: 'feishu',
                name: '飞书',
                nameEn: 'Feishu / Lark',
                configured: statusCallCount > 1,
                docsUrl: 'https://open.feishu.cn/document/home',
                steps: ['生成二维码', '扫码授权', '自动连接'],
                fields: [],
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(React.createElement(HubConnectorConfigTab));
    });
    await flushEffects();

    const feishuItem = container.querySelector('[data-testid="platform-item-feishu"]');
    expect(feishuItem?.textContent).toContain('未配置');

    await act(async () => {
      (container.querySelector('[data-testid="feishu-qr"]') as HTMLButtonElement | null)?.click();
    });
    await flushEffects();

    expect(statusCallCount).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[data-testid="platform-item-feishu"]')?.textContent).toContain('已启用');
  });
});
