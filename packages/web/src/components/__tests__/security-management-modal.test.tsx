import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/utils/api-client';
import SecurityManagementModal from '../SecurityManagementModal';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SecurityManagementModal', () => {
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
    mockApiFetch.mockImplementation((path, init) => {
      if (path === '/api/config/relayclaw/security' && !init?.method) {
        return Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: {
                mcp_exec_command: { '*': 'ask', patterns: { 'git status *': 'allow' } },
                write_memory: 'allow',
              },
            },
          }),
        );
      }
      if (path === '/api/config/relayclaw/security' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body ?? '{}')) as { permissions?: unknown };
        return Promise.resolve(
          jsonResponse({
            permissions: body.permissions ?? {},
          }),
        );
      }
      throw new Error(`Unexpected apiFetch path: ${String(path)}`);
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

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('loads permissions config from the API proxy when the modal opens', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/config/relayclaw/security');
    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;
    expect(pageToggle?.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('mcp_exec_command');
    expect(container.textContent).toContain('write_memory');
  });

  it('treats missing permissions.enabled as enabled when loading config', async () => {
    mockApiFetch.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          permissions: {
            tools: {
              mcp_exec_command: { '*': 'ask' },
            },
          },
        }),
      ),
    );

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;

    expect(pageToggle?.getAttribute('aria-checked')).toBe('true');
  });

  it('saves approval guard changes through the API proxy', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      pageToggle?.click();
      await Promise.resolve();
    });

    const patchCall = mockApiFetch.mock.calls.find(
      ([path, init]) => path === '/api/config/relayclaw/security' && init?.method === 'PATCH',
    );
    expect(patchCall?.[1]?.body ? JSON.parse(String(patchCall[1].body)) : null).toEqual({
      permissions: {
        enabled: false,
      },
    });
    expect(pageToggle?.getAttribute('aria-checked')).toBe('false');
  });

  it('saves tool policy toggles as ask or allow and preserves patterns', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const commandToggle = container.querySelector(
      '[data-testid="security-policy-toggle-mcp_exec_command"]',
    ) as HTMLButtonElement | null;
    const memoryToggle = container.querySelector(
      '[data-testid="security-policy-toggle-write_memory"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      commandToggle?.click();
      await Promise.resolve();
    });

    const firstPatchBody = mockApiFetch.mock.calls
      .filter(([path, init]) => path === '/api/config/relayclaw/security' && init?.method === 'PATCH')
      .map(([, init]) => JSON.parse(String(init?.body ?? '{}')))[0];

    expect(firstPatchBody).toEqual({
      permissions: {
        tools: {
          mcp_exec_command: {
            '*': 'allow',
            patterns: {
              'git status *': 'allow',
            },
          },
        },
      },
    });
    expect(commandToggle?.getAttribute('aria-checked')).toBe('false');

    await act(async () => {
      memoryToggle?.click();
      await Promise.resolve();
    });

    const lastPatchBody = mockApiFetch.mock.calls
      .filter(([path, init]) => path === '/api/config/relayclaw/security' && init?.method === 'PATCH')
      .map(([, init]) => JSON.parse(String(init?.body ?? '{}')))
      .at(-1);

    expect(lastPatchBody).toEqual({
      permissions: {
        tools: {
          write_memory: 'ask',
        },
      },
    });
    expect(memoryToggle?.getAttribute('aria-checked')).toBe('true');
  });

  it('reverts optimistic changes when save fails', async () => {
    mockApiFetch.mockImplementation((path, init) => {
      if (path === '/api/config/relayclaw/security' && !init?.method) {
        return Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: {
                mcp_exec_command: { '*': 'ask', patterns: { 'git status *': 'allow' } },
                write_memory: 'allow',
              },
            },
          }),
        );
      }
      if (path === '/api/config/relayclaw/security' && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ error: 'save failed' }, 500));
      }
      throw new Error(`Unexpected apiFetch path: ${String(path)}`);
    });

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      pageToggle?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pageToggle?.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('save failed');
  });

  it('keeps later successful tool toggles when an earlier save fails', async () => {
    const firstSave = createDeferred<Response>();
    const secondSave = createDeferred<Response>();
    mockApiFetch.mockImplementation((path, init) => {
      if (path === '/api/config/relayclaw/security' && !init?.method) {
        return Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: {
                mcp_exec_command: { '*': 'ask', patterns: { 'git status *': 'allow' } },
                write_memory: 'allow',
              },
            },
          }),
        );
      }
      if (path === '/api/config/relayclaw/security' && init?.method === 'PATCH') {
        return mockApiFetch.mock.calls.filter(([, callInit]) => callInit?.method === 'PATCH').length === 1
          ? firstSave.promise
          : secondSave.promise;
      }
      throw new Error(`Unexpected apiFetch path: ${String(path)}`);
    });

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const commandToggle = container.querySelector(
      '[data-testid="security-policy-toggle-mcp_exec_command"]',
    ) as HTMLButtonElement | null;
    const memoryToggle = container.querySelector(
      '[data-testid="security-policy-toggle-write_memory"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      commandToggle?.click();
      memoryToggle?.click();
      await Promise.resolve();
    });

    secondSave.resolve(
      jsonResponse({
        permissions: {
          tools: {
            write_memory: 'ask',
          },
        },
      }),
    );
    await flush();

    firstSave.resolve(jsonResponse({ error: 'first save failed' }, 500));
    await flush();

    expect(commandToggle?.getAttribute('aria-checked')).toBe('true');
    expect(memoryToggle?.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('first save failed');
  });
});
