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

  it('renders project path and bootstrap button', () => {
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
    expect(container.textContent).toContain('尚未初始化治理');

    const button = container.querySelector('button');
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain('初始化治理并继续');
  });

  it('shows correct label for needs_confirmation', () => {
    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/home/user/proj',
          reasonKind: 'needs_confirmation',
        }),
      );
    });

    expect(container.textContent).toContain('治理初始化待确认');
  });

  it('calls confirm then retry on button click', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          invocationId: 'inv-456',
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

    expect(container.textContent).toContain('治理初始化完成');
    expect(container.textContent).toContain('已自动重试');
  });

  it('skips retry when invocationId is not provided', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
        }),
      );
    });

    const button = container.querySelector('button')!;
    await act(async () => {
      button.click();
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('治理初始化完成');
    expect(container.textContent).not.toContain('已自动重试');
  });

  it('shows error and retry button on confirm failure', async () => {
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
        }),
      );
    });

    const button = container.querySelector('button')!;
    await act(async () => {
      button.click();
    });

    expect(container.textContent).toContain('Path not allowed');
    const retryButton = container.querySelector('button');
    expect(retryButton).toBeTruthy();
    expect(retryButton?.textContent).toContain('重试');
  });

  it('extracts directory name from Windows backslash path', () => {
    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: 'C:\\workspace\\tmp',
          reasonKind: 'needs_bootstrap',
        }),
      );
    });

    // Should show "tmp", not the full "C:\workspace\tmp"
    expect(container.textContent).toContain('tmp');
    expect(container.textContent).not.toContain('C:\\workspace\\tmp');
  });

  it('calls onSelfClear when per-project governance status is ready on mount (F070 stale-banner self-heal)', async () => {
    const onSelfClear = vi.fn();
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ready: true,
        needsBootstrap: false,
        needsConfirmation: false,
      }),
    });

    await act(async () => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          invocationId: 'inv-stale',
          onSelfClear,
        }),
      );
      // flush mount effect microtasks
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/governance/status?projectPath=%2Ftest%2Fproj');
    expect(onSelfClear).toHaveBeenCalledTimes(1);
  });

  it('scopes self-heal status probe to the blocked cat provider', async () => {
    const onSelfClear = vi.fn();
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === '/api/governance/status?projectPath=%2Ftest%2Fproj&clientId=openai') {
        return {
          ok: true,
          json: async () => ({
            ready: false,
            needsBootstrap: true,
            needsConfirmation: false,
          }),
        };
      }
      if (url === '/api/governance/status?projectPath=%2Ftest%2Fproj') {
        return {
          ok: true,
          json: async () => ({
            ready: true,
            needsBootstrap: false,
            needsConfirmation: false,
          }),
        };
      }
      throw new Error(`unexpected url: ${url}`);
    });

    await act(async () => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          invocationId: 'inv-stale',
          clientId: 'openai',
          onSelfClear,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/governance/status?projectPath=%2Ftest%2Fproj&clientId=openai');
    expect(onSelfClear).not.toHaveBeenCalled();
  });

  it('does not call onSelfClear when governance status is not ready', async () => {
    const onSelfClear = vi.fn();
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ready: false,
        needsBootstrap: true,
        needsConfirmation: false,
      }),
    });

    await act(async () => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          onSelfClear,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSelfClear).not.toHaveBeenCalled();
    // banner stays visible — bootstrap button still rendered
    expect(container.querySelector('button')?.textContent).toContain('初始化治理并继续');
  });

  it('does not self-clear from registry-only health when project preflight is still blocked', async () => {
    const onSelfClear = vi.fn();
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === '/api/governance/health') {
        return {
          ok: true,
          json: async () => ({
            projects: [{ projectPath: '/test/proj', status: 'healthy' }],
          }),
        };
      }
      if (url === '/api/governance/status?projectPath=%2Ftest%2Fproj') {
        return {
          ok: true,
          json: async () => ({
            ready: false,
            needsBootstrap: false,
            needsConfirmation: true,
          }),
        };
      }
      throw new Error(`unexpected url: ${url}`);
    });

    await act(async () => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_confirmation',
          onSelfClear,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/governance/status?projectPath=%2Ftest%2Fproj');
    expect(onSelfClear).not.toHaveBeenCalled();
  });

  it('does not call onSelfClear when server omits the project', async () => {
    const onSelfClear = vi.fn();
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ projects: [] }),
    });

    await act(async () => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          onSelfClear,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSelfClear).not.toHaveBeenCalled();
  });

  it('does not call onSelfClear when health endpoint fails (network error)', async () => {
    const onSelfClear = vi.fn();
    mockApiFetch.mockRejectedValueOnce(new Error('network down'));

    await act(async () => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          onSelfClear,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSelfClear).not.toHaveBeenCalled();
    expect(container.querySelector('button')?.textContent).toContain('初始化治理并继续');
  });

  it('skips self-heal probe when onSelfClear is not provided', async () => {
    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
        }),
      );
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('resets to idle state when invocationId prop changes', async () => {
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

    expect(container.textContent).toContain('治理初始化完成');

    act(() => {
      root.render(
        React.createElement(GovernanceBlockedCard, {
          projectPath: '/test/proj',
          reasonKind: 'needs_bootstrap',
          invocationId: 'inv-B',
        }),
      );
    });

    const newButton = container.querySelector('button');
    expect(newButton).toBeTruthy();
    expect(newButton?.textContent).toContain('初始化治理并继续');
  });
});
