/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import InvitationPage from '../page';
import { apiFetch } from '@/utils/api-client';
import { clearAuthIdentity, setAuthIdentity, setCanCreateModel, setIsSkipAuth } from '@/utils/userId';

const mockRouterReplace = vi.fn();

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
  setCanCreateModel: vi.fn(),
  setIsSkipAuth: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);
const mockClearAuthIdentity = vi.mocked(clearAuthIdentity);
const mockSetAuthIdentity = vi.mocked(setAuthIdentity);
const mockSetCanCreateModel = vi.mocked(setCanCreateModel);
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

async function changeInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('InvitationPage', () => {
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
    window.history.replaceState({}, '', 'http://localhost:3003/login/invitation');

    mockRouterReplace.mockReset();
    mockApiFetch.mockReset();
    mockClearAuthIdentity.mockReset();
    mockSetAuthIdentity.mockReset();
    mockSetCanCreateModel.mockReset();
    mockSetIsSkipAuth.mockReset();

    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/islogin') {
        return Promise.resolve(
          jsonResponse({
            islogin: false,
            pendingInvitation: true,
            isskip: false,
            canCreateModel: true,
            userId: 'domain-1:alice',
            userName: 'alice',
          }),
        );
      }
      if (url === '/api/login/invitation' && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            success: true,
            userId: 'domain-1:alice',
            userName: 'alice',
            redirectTo: '/',
          }),
        );
      }
      if (url === '/api/logout' && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            success: true,
            logoutUrl: '/login',
          }),
        );
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

  it('submits invitation code and redirects home', async () => {
    await act(async () => {
      root.render(React.createElement(InvitationPage));
    });
    await flush();

    expect(mockSetAuthIdentity).toHaveBeenCalledWith({ userId: 'domain-1:alice', userName: 'alice' });
    const input = container.querySelector('#promotionCode') as HTMLInputElement | null;
    const form = container.querySelector('form');
    expect(input).not.toBeNull();

    await changeInputValue(input!, 'invite-123');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    await flush();

    expect(mockSetIsSkipAuth).toHaveBeenCalledWith(false);
    expect(mockSetCanCreateModel).toHaveBeenCalledWith(true);
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/login/invitation',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockSetAuthIdentity).toHaveBeenCalledWith({ userId: 'domain-1:alice', userName: 'alice' });
    expect(mockRouterReplace).toHaveBeenCalledWith('/?authSuccess=1');
  });

  it('stays on page in preview mode without checking login state', async () => {
    window.history.replaceState({}, '', 'http://localhost:3003/login/invitation?preview=1');

    await act(async () => {
      root.render(React.createElement(InvitationPage));
    });
    await flush();

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect((container.querySelector('#promotionCode') as HTMLInputElement | null)?.disabled).toBe(false);
  });

  it('clears stale identity before redirecting to login when invitation state is missing', async () => {
    mockApiFetch.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          islogin: false,
          pendingInvitation: false,
          isskip: false,
          canCreateModel: false,
        }),
      ),
    );

    await act(async () => {
      root.render(React.createElement(InvitationPage));
    });
    await flush();

    expect(mockClearAuthIdentity).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith('/login');
  });

  it('calls logout and redirects when clicking relogin', async () => {
    const locationReplaceSpy = vi.spyOn(window.location, 'replace').mockImplementation(() => undefined as any);

    await act(async () => {
      root.render(React.createElement(InvitationPage));
    });
    await flush();

    const reloginButton = container.querySelector('button[type="button"]');
    expect(reloginButton).not.toBeNull();

    await act(async () => {
      reloginButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/logout', expect.objectContaining({ method: 'POST' }));
    expect(mockClearAuthIdentity).toHaveBeenCalled();
    expect(locationReplaceSpy).toHaveBeenCalledWith('/login');

    locationReplaceSpy.mockRestore();
  });
});
