/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginCallbackPage from '../page';
import { apiFetch } from '@/utils/api-client';
import { clearAuthIdentity, setAuthIdentity, setIsSkipAuth } from '@/utils/userId';

const mockRouterReplace = vi.fn();
const mockLocationReplace = vi.fn();

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/utils/userId', () => ({
  clearAuthIdentity: vi.fn(),
  setAuthIdentity: vi.fn(),
  setIsSkipAuth: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);
const mockClearAuthIdentity = vi.mocked(clearAuthIdentity);
const mockSetAuthIdentity = vi.mocked(setAuthIdentity);
const mockSetIsSkipAuth = vi.mocked(setIsSkipAuth);
const originalLocation = window.location;

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

describe('LoginCallbackPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mockRouterReplace.mockReset();
    mockLocationReplace.mockReset();
    mockApiFetch.mockReset();
    mockClearAuthIdentity.mockReset();
    mockSetAuthIdentity.mockReset();
    mockSetIsSkipAuth.mockReset();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        href: 'http://localhost:3003/login/callback?ticket=test-ticket',
        replace: mockLocationReplace,
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('stores identity and redirects home after callback success', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        userId: 'domain-1:alice',
        userName: 'alice',
        redirectTo: '/',
      }),
    );

    await act(async () => {
      root.render(React.createElement(LoginCallbackPage));
    });
    await flush();

    expect(container.textContent).toContain('登录中...');
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/login/callback',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockSetIsSkipAuth).toHaveBeenCalledWith(false);
    expect(mockSetAuthIdentity).toHaveBeenCalledWith({ userId: 'domain-1:alice', userName: 'alice' });
    expect(mockRouterReplace).toHaveBeenCalledWith('/?authSuccess=1');
  });

  it('redirects to invitation page when activation code is required', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        needCode: true,
        userId: 'domain-1:alice',
        userName: 'alice',
        redirectTo: '/login/invitation',
      }),
    );

    await act(async () => {
      root.render(React.createElement(LoginCallbackPage));
    });
    await flush();

    expect(mockSetAuthIdentity).toHaveBeenCalledWith({ userId: 'domain-1:alice', userName: 'alice' });
    expect(mockRouterReplace).toHaveBeenCalledWith('/login/invitation');
  });

  it('clears stale identity before redirecting to login when callback fails', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        success: false,
        message: 'ticket invalid',
      }, 401),
    );

    await act(async () => {
      root.render(React.createElement(LoginCallbackPage));
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(mockClearAuthIdentity).toHaveBeenCalledTimes(1);
    expect(mockLocationReplace).toHaveBeenCalledWith('/login');
  });

  it('reuses the same callback request across strict-mode remounts', async () => {
    let resolveResponse: ((value: Response) => void) | null = null;
    const deferredResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        href: 'http://localhost:3003/login/callback?ticket=strict-mode-ticket',
        replace: mockLocationReplace,
      },
    });

    mockApiFetch.mockReturnValueOnce(deferredResponse);

    await act(async () => {
      root.render(React.createElement(React.StrictMode, null, React.createElement(LoginCallbackPage)));
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    resolveResponse?.(
      jsonResponse({
        success: true,
        needCode: true,
        userId: 'domain-1:alice',
        userName: 'alice',
        redirectTo: '/login/invitation',
      }),
    );

    await flush();

    expect(mockSetAuthIdentity).toHaveBeenCalledWith({ userId: 'domain-1:alice', userName: 'alice' });
    expect(mockRouterReplace).toHaveBeenCalledWith('/login/invitation');
  });
});
