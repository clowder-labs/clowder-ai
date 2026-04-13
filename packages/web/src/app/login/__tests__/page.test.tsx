/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../page';
import { apiFetch } from '@/utils/api-client';
import { setAuthIdentity, setIsSkipAuth } from '@/utils/userId';

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
  setAuthIdentity: vi.fn(),
  setIsSkipAuth: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);
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

describe('LoginPage', () => {
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

    mockRouterReplace.mockReset();
    mockLocationReplace.mockReset();
    mockApiFetch.mockReset();
    mockSetAuthIdentity.mockReset();
    mockSetIsSkipAuth.mockReset();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        href: 'http://localhost:3003/login',
        replace: mockLocationReplace,
      },
    });

    mockApiFetch.mockResolvedValue(
      jsonResponse({
        islogin: false,
        isskip: false,
        pendingInvitation: false,
        loginUrl: 'https://auth.example.com/login',
      }),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders fallback login button and redirects to unified auth on click', async () => {
    await act(async () => {
      root.render(React.createElement(LoginPage));
    });
    await flush();

    const loginButton = container.querySelector('button');

    expect(mockApiFetch).toHaveBeenCalledWith('/api/islogin');
    expect(mockSetIsSkipAuth).toHaveBeenCalledWith(false);
    expect(mockLocationReplace).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(container.textContent).toContain('立即登录');
    expect(container.textContent).not.toContain('�');
    expect(loginButton).not.toBeNull();

    await act(async () => {
      loginButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockLocationReplace).toHaveBeenCalledWith('https://auth.example.com/login');
  });

  it('redirects to home when already logged in', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        islogin: true,
        isskip: false,
        userId: 'debug-user',
        userName: 'debug-user',
      }),
    );

    await act(async () => {
      root.render(React.createElement(LoginPage));
    });
    await flush();

    expect(mockSetAuthIdentity).toHaveBeenCalledWith({ userId: 'debug-user', userName: 'debug-user' });
    expect(mockRouterReplace).toHaveBeenCalledWith('/');
    expect(mockLocationReplace).not.toHaveBeenCalled();
  });

  it('redirects to invitation page when subscription activation is pending', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        islogin: false,
        isskip: false,
        pendingInvitation: true,
      }),
    );

    await act(async () => {
      root.render(React.createElement(LoginPage));
    });
    await flush();

    expect(mockRouterReplace).toHaveBeenCalledWith('/login/invitation');
    expect(mockLocationReplace).not.toHaveBeenCalled();
  });
});
