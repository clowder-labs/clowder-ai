/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiFetch = vi.hoisted(() => vi.fn());

vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const { GovernanceBlockedCard } = await import('@/components/GovernanceBlockedCard');

describe('GovernanceBlockedCard', () => {
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
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders project name and action button', () => {
    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/home/user/my-project',
          reasonKind: 'needs_bootstrap',
          invocationId: 'inv-123',
        }),
      );
    });

    expect(container.querySelector('[data-testid="governance-blocked-card"]')).toBeTruthy();
    expect(container.textContent).toContain('my-project');
    expect(container.querySelector('button')).toBeTruthy();
  });

  it('calls confirm then retry on button click', async () => {
    const onResolved = vi.fn();
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          invocationId: 'inv-456',
          onResolved,
        }),
      );
    });

    const button = container.querySelector('button')!;
    await act(async () => {
      button.click();
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/governance/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: '/test/proj' }),
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/invocations/inv-456/retry', {
      method: 'POST',
    });

    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('skips retry when invocationId is not provided', async () => {
    const onResolved = vi.fn();
    mockApiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          onResolved,
        }),
      );
    });

    const button = container.querySelector('button')!;
    await act(async () => {
      button.click();
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('shows error and keeps unresolved when confirm fails', async () => {
    const onResolved = vi.fn();
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Path not allowed' }),
    });

    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          invocationId: 'inv-789',
          onResolved,
        }),
      );
    });

    const button = container.querySelector('button')!;
    await act(async () => {
      button.click();
    });

    expect(container.textContent).toContain('Path not allowed');
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('keeps unresolved when retry fails', async () => {
    const onResolved = vi.fn();
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'retry failed' }) });

    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          invocationId: 'inv-retry-fail',
          onResolved,
        }),
      );
    });

    const button = container.querySelector('button')!;
    await act(async () => {
      button.click();
    });

    expect(container.textContent).toContain('retry failed');
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('treats retry conflict with succeeded status as resolved', async () => {
    const onResolved = vi.fn();
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          code: 'INVOCATION_NOT_RETRYABLE',
          currentStatus: 'succeeded',
          error: "Cannot retry invocation with status 'succeeded'",
        }),
      });

    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          invocationId: 'inv-succeeded',
          onResolved,
        }),
      );
    });

    const button = container.querySelector('button')!;
    await act(async () => {
      button.click();
    });

    expect(container.textContent).not.toContain("Cannot retry invocation with status 'succeeded'");
    expect(container.querySelector('button')).toBeFalsy();
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('extracts directory name from Windows path', () => {
    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: 'C:\\workspace\\tmp',
          reasonKind: 'needs_bootstrap',
        }),
      );
    });

    expect(container.textContent).toContain('tmp');
    expect(container.textContent).not.toContain('C:\\workspace\\tmp');
  });

  it('resets to idle when invocationId changes', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          invocationId: 'inv-A',
        }),
      );
    });

    const button = container.querySelector('button')!;
    await act(async () => {
      button.click();
    });

    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          invocationId: 'inv-B',
        }),
      );
    });

    expect(container.querySelector('button')).toBeTruthy();
  });
});
