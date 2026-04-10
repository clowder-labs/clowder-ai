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
    expect(slackItem?.querySelector('.ui-status-badge.ui-status-badge-unconfigured')).not.toBeNull();
    expect(weixinItem?.querySelector('.ui-status-badge.ui-status-badge-unconfigured')).not.toBeNull();

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
    expect(weixinItem?.querySelector('.ui-status-badge.ui-status-badge-unconfigured')).not.toBeNull();

    await act(async () => {
      (container.querySelector('[data-testid="weixin-qr"]') as HTMLButtonElement | null)?.click();
    });
    await flushEffects();

    expect(statusCallCount).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[data-testid="platform-item-weixin"] .ui-status-badge.ui-status-badge-configured')).not.toBeNull();
    expect(container.querySelector('[data-testid="platform-item-weixin"]')?.textContent).toContain('已启用');
  });

  it('uses business-theme unconfigured badge tokens when business theme is active', async () => {
    const globalsCss = readFileSync(globalsCssPath, 'utf8');
    const businessThemeBlock = globalsCss.match(/\[data-ui-theme="business"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(businessThemeBlock).toContain('--status-badge-unconfigured-surface: #f0f0f0;');
    expect(businessThemeBlock).toContain('--status-badge-unconfigured-text: var(--text-label-secondary);');
  });

  it('calls the Feishu test endpoint and renders the returned status', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
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
                steps: ['创建应用', '填写凭证', '保存配置'],
                fields: [
                  { envName: 'FEISHU_APP_ID', label: 'App ID', sensitive: false, currentValue: null },
                  { envName: 'FEISHU_APP_SECRET', label: 'App Secret', sensitive: true, currentValue: null },
                ],
              },
            ],
          }),
        );
      }
      if (url === '/api/connector/test/feishu') {
        expect(init?.method).toBe('POST');
        return Promise.resolve(
          jsonResponse({
            ok: true,
            message: '飞书应用认证成功，机器人信息可访问。',
            warnings: ['当前为 webhook 模式，但未提供 Verification Token；事件订阅仍无法完成。'],
            bot: { name: 'Clowder Bot' },
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(React.createElement(HubConnectorConfigTab));
    });
    await flushEffects();

    const testButton = Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('测试连接'));
    expect(testButton).not.toBeUndefined();

    await act(async () => {
      testButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/connector/test/feishu',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(container.querySelector('[data-testid="save-result"]')?.textContent).toContain('已识别 Clowder Bot');
  });
  it('marks connector credential fields with standard anti-autofill attributes', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/connector/status') {
        return Promise.resolve(
          jsonResponse({
            platforms: [
              {
                id: 'dingtalk',
                name: '閽夐挐',
                nameEn: 'DingTalk',
                configured: false,
                docsUrl: 'https://open.dingtalk.com/',
                steps: ['鍒涘缓搴旂敤', '濉啓鍑瘉', '淇濆瓨閰嶇疆'],
                fields: [
                  { envName: 'DINGTALK_CLIENT_ID', label: 'Client ID', sensitive: false, currentValue: null },
                  { envName: 'DINGTALK_CLIENT_SECRET', label: 'Client Secret', sensitive: true, currentValue: null },
                ],
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

    const accountInput = container.querySelector('[data-testid="field-DINGTALK_CLIENT_ID"]') as HTMLInputElement | null;
    const secretInput = container.querySelector(
      '[data-testid="field-DINGTALK_CLIENT_SECRET"]',
    ) as HTMLInputElement | null;

    expect(accountInput).not.toBeNull();
    expect(secretInput).not.toBeNull();
    expect(accountInput?.getAttribute('autocomplete')).toBe('off');
    expect(accountInput?.getAttribute('name')).toBe('connector-DINGTALK_CLIENT_ID');
    expect(accountInput?.getAttribute('data-form-type')).toBe('other');
    expect(secretInput?.getAttribute('autocomplete')).toBe('new-password');
    expect(secretInput?.getAttribute('name')).toBe('connector-DINGTALK_CLIENT_SECRET');
    expect(secretInput?.getAttribute('data-1p-ignore')).toBe('true');
    expect(secretInput?.getAttribute('data-lpignore')).toBe('true');
  });
});
