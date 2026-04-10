import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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
  setUserId: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function changeInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

async function clickElement(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
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
        return Promise.resolve(jsonResponse({ islogin: false, isskip: false, hascode: true }));
      }
      if (url === '/api/login' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ success: false, message: '登录失败' }, 200));
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('keeps password eye visible after login failure and additional typing', async () => {
    await act(async () => {
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

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
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
    await act(async () => {
      root.render(React.createElement(LoginPage));
    });
    await flush();

    expect(container.textContent).toContain('欢迎使用 OfficeClaw');
    expect(container.textContent).toContain('专家团思辨模式');
    expect(container.textContent).toContain('登录');
    expect(container.textContent).not.toContain('�');
  });

  it('prevents copying and cutting password content', async () => {
    await act(async () => {
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
    await act(async () => {
      root.render(React.createElement(LoginPage));
    });
    await flush();

    const passwordInput = container.querySelector('#password') as HTMLInputElement | null;
    expect(passwordInput).not.toBeNull();
    expect(passwordInput?.className).toContain('login-password-input');
  });

  it('clears the login error when switching account type', async () => {
    await act(async () => {
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

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    await flush();

    expect(container.textContent).toContain('登录失败');

    const switchButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('IAM'),
    );

    expect(switchButton).toBeDefined();

    await clickElement(switchButton!);
    await flush();

    expect(container.textContent).not.toContain('登录失败');
  });

  it('clears password, account, tenant, and iam username inputs when switching account type', async () => {
    await act(async () => {
      root.render(React.createElement(LoginPage));
    });
    await flush();

    const domainInput = container.querySelector('#domainName') as HTMLInputElement | null;
    const passwordInput = container.querySelector('#password') as HTMLInputElement | null;

    expect(domainInput).not.toBeNull();
    expect(passwordInput).not.toBeNull();

    await changeInputValue(domainInput!, 'cloud-account');
    await changeInputValue(passwordInput!, 'secret');

    const switchToIamButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('IAM'),
    );
    expect(switchToIamButton).toBeDefined();

    await clickElement(switchToIamButton!);
    await flush();

    const tenantInput = container.querySelector('#domainName') as HTMLInputElement | null;
    const iamUserInput = container.querySelector('#userName') as HTMLInputElement | null;
    const iamPasswordInput = container.querySelector('#password') as HTMLInputElement | null;

    expect(tenantInput?.value).toBe('');
    expect(iamUserInput?.value).toBe('');
    expect(iamPasswordInput?.value).toBe('');

    await changeInputValue(tenantInput!, 'tenant-name');
    await changeInputValue(iamUserInput!, 'iam-user');
    await changeInputValue(iamPasswordInput!, 'next-secret');

    const switchToHuaweiButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('华为云'),
    );
    expect(switchToHuaweiButton).toBeDefined();

    await clickElement(switchToHuaweiButton!);
    await flush();

    const huaweiAccountInput = container.querySelector('#domainName') as HTMLInputElement | null;
    const huaweiPasswordInput = container.querySelector('#password') as HTMLInputElement | null;
    const hiddenIamUserInput = container.querySelector('#userName') as HTMLInputElement | null;

    expect(huaweiAccountInput?.value).toBe('');
    expect(huaweiPasswordInput?.value).toBe('');
    expect(hiddenIamUserInput).toBeNull();
  });
});
