/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationCard } from '@/components/AuthorizationCard';
import type { AuthPendingRequest } from '@/hooks/useAuthorization';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

const request: AuthPendingRequest = {
  requestId: 'auth-1',
  catId: 'codex',
  threadId: 'thread-1',
  action: '申请获取文件夹写入权限',
  reason: '获取本地文件夹的编辑权限。',
  context: '您可以随时在安全管理中配置或修改安全策略',
  createdAt: Date.now(),
};

describe('AuthorizationCard', () => {
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders the approval card with the requested dimensions and type scale', () => {
    act(() => {
      root.render(React.createElement(AuthorizationCard, { request, onRespond: vi.fn() }));
    });

    const card = container.querySelector('[data-testid="authorization-card"]') as HTMLDivElement | null;
    const title = container.querySelector('[data-testid="authorization-card-title"]') as HTMLDivElement | null;
    const riskBadge = container.querySelector('[data-testid="authorization-card-risk-badge"]') as HTMLSpanElement | null;
    const description = container.querySelector(
      '[data-testid="authorization-card-description"]',
    ) as HTMLParagraphElement | null;
    const helper = container.querySelector('[data-testid="authorization-card-helper"]') as HTMLParagraphElement | null;

    expect(card).not.toBeNull();
    expect(card?.className).toContain('max-w-[482px]');
    expect(card?.className).toContain('min-h-[140px]');
    expect(card?.className).toContain('rounded-[16px]');

    expect(title?.textContent).toContain('申请获取文件夹写入权限');
    expect(title?.className).toContain('text-[14px]');
    expect(title?.className).toContain('font-semibold');

    expect(riskBadge?.textContent).toBe('中风险');
    expect(riskBadge?.className).toContain('text-[12px]');

    expect(description?.textContent).toContain('获取本地文件夹的编辑权限。');
    expect(description?.className).toContain('text-[12px]');
    expect(helper?.textContent).toContain('安全管理');
    expect(helper?.textContent).not.toContain('权限管理');
    expect(helper?.className).toContain('text-[12px]');
    expect(
      container.querySelector('[data-testid="authorization-card-security-management"]')?.textContent,
    ).toBe('安全管理');

    expect(container.querySelector('[data-testid="authorization-card-allow-once"]')?.textContent).toBe('本次允许');
    expect(container.querySelector('[data-testid="authorization-card-allow-always"]')?.textContent).toBe('始终允许');
    expect(container.querySelector('[data-testid="authorization-card-deny"]')?.textContent).toBe('拒绝');
  });

  it('calls the matching action payload for each button', async () => {
    const onRespond = vi.fn();

    await act(async () => {
      root.render(React.createElement(AuthorizationCard, { request, onRespond }));
    });

    await act(async () => {
      (container.querySelector('[data-testid="authorization-card-allow-once"]') as HTMLButtonElement | null)?.click();
    });
    expect(onRespond).toHaveBeenLastCalledWith('auth-1', true, 'once');

    await act(async () => {
      root.render(React.createElement(AuthorizationCard, { request, onRespond }));
    });
    await act(async () => {
      (container.querySelector('[data-testid="authorization-card-allow-always"]') as HTMLButtonElement | null)?.click();
    });
    expect(onRespond).toHaveBeenLastCalledWith('auth-1', true, 'global');

    await act(async () => {
      root.render(React.createElement(AuthorizationCard, { request, onRespond }));
    });
    await act(async () => {
      (container.querySelector('[data-testid="authorization-card-deny"]') as HTMLButtonElement | null)?.click();
    });
    expect(onRespond).toHaveBeenLastCalledWith('auth-1', false, 'once');
  });

  it('switches to the clicked disabled button while the response is pending', async () => {
    const deferred = createDeferred<void>();
    const onRespond = vi.fn(() => deferred.promise);

    await act(async () => {
      root.render(React.createElement(AuthorizationCard, { request, onRespond }));
    });

    await act(async () => {
      (container.querySelector('[data-testid="authorization-card-allow-once"]') as HTMLButtonElement | null)?.click();
      await Promise.resolve();
    });

    const submittingButton = container.querySelector(
      '[data-testid="authorization-card-submitting-action"]',
    ) as HTMLButtonElement | null;

    expect(submittingButton?.textContent).toBe('本次允许');
    expect(submittingButton?.disabled).toBe(true);
    expect(submittingButton?.className).toContain('border-[#DBDBDB]');
    expect(submittingButton?.className).toContain('bg-[#F0F0F0]');
    expect(submittingButton?.className).toContain('text-[#C2C2C2]');
    expect(container.querySelector('[data-testid="authorization-card-allow-always"]')).toBeNull();
    expect(container.querySelector('[data-testid="authorization-card-deny"]')).toBeNull();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
  });

  it('opens security management from the helper link', async () => {
    const onOpenSecurityManagement = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(AuthorizationCard, {
          request,
          onRespond: vi.fn(),
          onOpenSecurityManagement,
        }),
      );
    });

    await act(async () => {
      (
        container.querySelector('[data-testid="authorization-card-security-management"]') as HTMLButtonElement | null
      )?.click();
    });

    expect(onOpenSecurityManagement).toHaveBeenCalledTimes(1);
  });
});
