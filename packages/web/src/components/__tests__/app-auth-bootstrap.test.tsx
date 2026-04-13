/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppAuthBootstrap } from '../AppAuthBootstrap';
import { apiFetch } from '@/utils/api-client';
import { clearAuthIdentity, setIsSkipAuth } from '@/utils/userId';

const mockReplace = vi.fn();
const mockRouter = { replace: mockReplace };
let mockPathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => mockRouter,
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/utils/userId', () => ({
  clearAuthIdentity: vi.fn(),
  setIsSkipAuth: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);
const mockClearAuthIdentity = vi.mocked(clearAuthIdentity);
const mockSetIsSkipAuth = vi.mocked(setIsSkipAuth);

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

describe('AppAuthBootstrap', () => {
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
    mockPathname = '/';
    mockReplace.mockReset();
    mockApiFetch.mockReset();
    mockClearAuthIdentity.mockReset();
    mockSetIsSkipAuth.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders children and stores isskip when startup auth reports logged in', async () => {
    mockApiFetch.mockImplementation(() => Promise.resolve(jsonResponse({ islogin: true, isskip: true })));

    await act(async () => {
      root.render(React.createElement(AppAuthBootstrap, null, React.createElement('div', null, 'ready')));
    });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/islogin');
    expect(mockSetIsSkipAuth).toHaveBeenCalledWith(true);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(container.textContent).toContain('ready');
  });

  it('redirects to login when startup auth reports not logged in', async () => {
    mockApiFetch.mockImplementation(() => Promise.resolve(jsonResponse({ islogin: false, isskip: false })));

    await act(async () => {
      root.render(React.createElement(AppAuthBootstrap, null, React.createElement('div', null, 'ready')));
    });
    await flush();

    expect(mockSetIsSkipAuth).toHaveBeenCalledWith(false);
    expect(mockClearAuthIdentity).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(container.textContent).not.toContain('ready');
  });

  it('does not run startup auth on the login page', async () => {
    mockPathname = '/login';

    await act(async () => {
      root.render(React.createElement(AppAuthBootstrap, null, React.createElement('div', null, 'login')));
    });
    await flush();

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(container.textContent).toContain('login');
  });
});
