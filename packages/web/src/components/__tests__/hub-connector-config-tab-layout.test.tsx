/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubConnectorConfigTab } from '@/components/HubConnectorConfigTab';
import { ToastContainer } from '@/components/ToastContainer';
import { useToastStore } from '@/stores/toastStore';
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
    useToastStore.setState({ toasts: [] });
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

  it('shows the shared centered loading state inside the right pane while loading connector status', async () => {
    let resolveStatus: ((value: Response) => void) | null = null;
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/connector/status') {
        return new Promise<Response>((resolve) => {
          resolveStatus = resolve;
        });
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(React.createElement(HubConnectorConfigTab));
      await Promise.resolve();
    });

    const rightPane = container.querySelector('[data-testid="connector-right-pane"]');
    expect(rightPane).not.toBeNull();
    expect(rightPane?.querySelector('[data-testid="skills-loading-state"]')).not.toBeNull();
    expect(rightPane?.textContent).not.toContain('加载中...');

    await act(async () => {
      resolveStatus?.(
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
          ],
        }),
      );
      await Promise.resolve();
    });
    await flushEffects();

    expect(rightPane?.querySelector('[data-testid="skills-loading-state"]')).toBeNull();
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

  it('refreshes platform status after Weixin disconnects', async () => {
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
                name: '寰俊',
                nameEn: 'WeChat',
                configured: statusCallCount === 1,
                docsUrl: '',
                steps: ['鎵爜缁戝畾', '瀹屾垚纭'],
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

    expect(container.querySelector('[data-testid="platform-item-weixin"]')?.textContent).toContain('已启用');

    await act(async () => {
      (container.querySelector('[data-testid="weixin-qr"]') as HTMLButtonElement | null)?.click();
    });
    await flushEffects();

    expect(statusCallCount).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[data-testid="platform-item-weixin"]')?.textContent).toContain('未配置');
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

  it('shows only the localized connector name in platform cards', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/connector/status') {
        return Promise.resolve(
          jsonResponse({
            platforms: [
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

    await act(async () => {
      root.render(React.createElement(HubConnectorConfigTab));
    });
    await flushEffects();

    const weixinItem = container.querySelector('[data-testid="platform-item-weixin"]');
    expect(weixinItem?.textContent).toContain('微信');
    expect(weixinItem?.textContent).not.toContain('WeChat');
  });
  it('routes dingtalk test-connection feedback through the global toast container', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/connector/status') {
        return Promise.resolve(
          jsonResponse({
            platforms: [
              {
                id: 'dingtalk',
                name: '钉钉',
                nameEn: 'DingTalk',
                configured: false,
                docsUrl: 'https://open.dingtalk.com/',
                steps: ['创建应用', '填写凭证', '测试连接'],
                fields: [{ envName: 'DINGTALK_CLIENT_ID', label: 'Client ID', sensitive: false, currentValue: null }],
              },
            ],
          }),
        );
      }
      if (url === '/api/connector/test/dingtalk' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ ok: true, message: '连接测试成功' }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(HubConnectorConfigTab),
          React.createElement(ToastContainer),
        ),
      );
    });
    await flushEffects();

    const input = container.querySelector('[data-testid="field-DINGTALK_CLIENT_ID"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      input!.value = 'ding-app-id';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const testButton = Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('测试连接'));
    expect(testButton).toBeDefined();

    await act(async () => {
      testButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="save-result"]')).toBeNull();
    expect(
      useToastStore
        .getState()
        .toasts.some((toast) => toast.type === 'success' && toast.title === '测试连接成功' && toast.message.includes('连接测试成功')),
    ).toBe(true);
  });

  it('routes save feedback through the global toast container', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/connector/status') {
        return Promise.resolve(
          jsonResponse({
            platforms: [
              {
                id: 'xiaoyi',
                name: '小艺',
                nameEn: 'Xiaoyi',
                configured: false,
                docsUrl: 'https://example.com/xiaoyi',
                steps: ['创建应用', '填写凭证', '测试连接'],
                fields: [{ envName: 'XIAOYI_APP_ID', label: 'App ID', sensitive: false, currentValue: null }],
              },
            ],
          }),
        );
      }
      if (url === '/api/config/env' && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ runtime: { applied: true } }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(HubConnectorConfigTab),
          React.createElement(ToastContainer),
        ),
      );
    });
    await flushEffects();

    const input = container.querySelector('[data-testid="field-XIAOYI_APP_ID"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, 'xiaoyi-app-id');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const saveButton = container.querySelector('[data-testid="save-xiaoyi"]');
    expect(saveButton).not.toBeNull();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="save-result"]')).toBeNull();
    expect(
      useToastStore
        .getState()
        .toasts.some((toast) => toast.type === 'success' && toast.title === '保存配置成功' && toast.message.includes('配置已保存并立即生效')),
    ).toBe(true);
  });

  it('routes disconnect feedback through the global toast container', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/connector/status') {
        return Promise.resolve(
          jsonResponse({
            platforms: [
              {
                id: 'xiaoyi',
                name: '小艺',
                nameEn: 'Xiaoyi',
                configured: true,
                docsUrl: 'https://example.com/xiaoyi',
                steps: ['创建应用', '填写凭证', '测试连接'],
                fields: [{ envName: 'XIAOYI_APP_ID', label: 'App ID', sensitive: false, currentValue: 'configured' }],
              },
            ],
          }),
        );
      }
      if (url === '/api/connector/xiaoyi/disconnect' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ runtime: { applied: true } }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(HubConnectorConfigTab),
          React.createElement(ToastContainer),
        ),
      );
    });
    await flushEffects();

    const disconnectButton = container.querySelector('[data-testid="disconnect-xiaoyi"]');
    expect(disconnectButton).not.toBeNull();

    await act(async () => {
      disconnectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="save-result"]')).toBeNull();
    expect(
      useToastStore
        .getState()
        .toasts.some((toast) => toast.type === 'success' && toast.title === '断开连接成功' && toast.message.includes('已断开连接')),
    ).toBe(true);
  });
});
