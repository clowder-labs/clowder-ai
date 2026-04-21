import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../page';
import { apiFetch } from '@/utils/api-client';

const mockReplace = vi.fn();

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/utils/userId', () => ({
  setIsSkipAuth: vi.fn(),
  setSessionId: vi.fn(),
  setUserId: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function flush(count = 3) {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function getReactProps(element: Element): Record<string, unknown> | null {
  for (const key of Object.keys(element)) {
    if (key.startsWith('__reactProps$')) {
      return (element as Record<string, unknown>)[key] as Record<string, unknown>;
    }
  }
  return null;
}

async function changeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  flushSync(() => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const reactProps = getReactProps(input);
    const syntheticEvent = { target: input, currentTarget: input };
    if (typeof reactProps?.onInput === 'function') {
      (reactProps.onInput as (event: unknown) => void)(syntheticEvent);
    }
    if (typeof reactProps?.onChange === 'function') {
      (reactProps.onChange as (event: unknown) => void)(syntheticEvent);
    }
  });
  await flush();
}

async function clickElement(element: HTMLElement) {
  flushSync(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
}

describe('LoginPage password visibility toggle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockReplace.mockReset();
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/islogin') {
        return Promise.resolve(
          jsonResponse({
            islogin: false,
            isskip: false,
            hascode: true,
            provider: {
              id: 'huawei-iam',
              mode: 'form',
              submitLabel: '登录',
              description: 'Authenticate with Huawei IAM.',
              fields: [
                {
                  name: 'userType',
                  label: '账号类型',
                  type: 'select',
                  options: [
                    { value: 'huawei', label: '华为云账号' },
                    { value: 'iam', label: 'IAM 用户' },
                  ],
                },
                { name: 'domainName', label: '租户 / 域名', type: 'text', required: true },
                { name: 'userName', label: 'IAM 用户名', type: 'text' },
                { name: 'password', label: '密码', type: 'password', required: true },
                { name: 'promotionCode', label: '邀请码', type: 'text' },
              ],
            },
          }),
        );
      }
      if (url === '/api/login' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ success: false, message: '登录失败' }, 200));
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    flushSync(() => {
      root.unmount();
    });
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('keeps password eye visible after login failure and additional typing', async () => {
    flushSync(() => {
      root.render(React.createElement(LoginPage));
    });
    await flush();

    const domainInput = container.querySelector('#domainName') as HTMLInputElement | null;
    const passwordInput = container.querySelector('#password') as HTMLInputElement | null;
    const form = container.querySelector('form');

    expect(domainInput).not.toBeNull();
    expect(passwordInput).not.toBeNull();
    expect(container.querySelector('[data-testid="login-password-visibility-toggle"]')).toBeNull();

    await changeInputValue(domainInput!, 'example-domain');
    await changeInputValue(passwordInput!, 'secret');

    const toggle = container.querySelector(
      '[data-testid="login-password-visibility-toggle"]',
    ) as HTMLButtonElement | null;

    expect(toggle).not.toBeNull();
    expect(passwordInput?.type).toBe('password');

    flushSync(() => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/login',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(container.textContent).toContain('登录失败');

    const passwordInputAfterFailure = container.querySelector('#password') as HTMLInputElement | null;
    expect(passwordInputAfterFailure?.value).toBe('secret');

    await changeInputValue(passwordInputAfterFailure!, 'secret-more');

    expect(container.querySelector('[data-testid="login-password-visibility-toggle"]')).not.toBeNull();
  });

  it('renders login copy without mojibake text', async () => {
    flushSync(() => {
      root.render(React.createElement(LoginPage));
    });
    await flush();

    expect(container.textContent).toContain('欢迎使用 OfficeClaw');
    expect(container.textContent).toContain('专家团思辨模式');
    expect(container.textContent).toContain('登录');
    expect(container.textContent).not.toContain('鍗');
    expect(container.textContent).not.toContain('鐧');
  });

  it('prevents copying and cutting password content', async () => {
    flushSync(() => {
      root.render(React.createElement(LoginPage));
    });
    await flush();

    const passwordInput = container.querySelector('#password') as HTMLInputElement | null;
    expect(passwordInput).not.toBeNull();

    await changeInputValue(passwordInput!, 'secret');

    const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
    const cutEvent = new Event('cut', { bubbles: true, cancelable: true });

    expect(passwordInput?.dispatchEvent(copyEvent)).toBe(false);
    expect(copyEvent.defaultPrevented).toBe(true);
    expect(passwordInput?.dispatchEvent(cutEvent)).toBe(false);
    expect(cutEvent.defaultPrevented).toBe(true);
  });

  it('applies the native password reveal suppression class to the login password input', async () => {
    flushSync(() => {
      root.render(React.createElement(LoginPage));
    });
    await flush();

    const passwordInput = container.querySelector('#password') as HTMLInputElement | null;
    expect(passwordInput).not.toBeNull();
    expect(passwordInput?.className).toContain('login-password-input');
  });

  it('clears the login error when switching account type', async () => {
    flushSync(() => {
      root.render(React.createElement(LoginPage));
    });
    await flush();

    const domainInput = container.querySelector('#domainName') as HTMLInputElement | null;
    const passwordInput = container.querySelector('#password') as HTMLInputElement | null;
    const form = container.querySelector('form');

    expect(domainInput).not.toBeNull();
    expect(passwordInput).not.toBeNull();

    await changeInputValue(domainInput!, 'example-domain');
    await changeInputValue(passwordInput!, 'secret');

    flushSync(() => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(container.textContent).toContain('登录失败');

    const switchButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '切换到 IAM',
    );

    expect(switchButton).toBeDefined();

    await clickElement(switchButton!);
    await flush();

    expect(container.textContent).not.toContain('登录失败');
  });
});
