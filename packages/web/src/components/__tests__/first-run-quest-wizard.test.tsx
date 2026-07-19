import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useCatData', () => ({
  useCatData: () => ({
    cats: [],
    isLoading: false,
    getCatById: () => undefined,
    getCatsByBreed: () => new Map(),
    refresh: () => Promise.resolve([]),
  }),
}));

import { FirstRunQuestWizard } from '@/components/FirstRunQuestWizard';

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

function WizardHost({ onCreated }: { onCreated?: (tid: string) => void }) {
  const [open, setOpen] = useState(true);
  return <FirstRunQuestWizard open={open} onClose={() => setOpen(false)} onCreated={onCreated ?? (() => {})} />;
}

function requirePayload(payload: Record<string, unknown> | null, label: string): Record<string, unknown> {
  if (!payload) {
    throw new Error(`${label} was not captured`);
  }
  return payload;
}

describe('FirstRunQuestWizard', () => {
  let container: HTMLDivElement;
  let root: Root;

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

  it('renders template step on open and loads templates', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('/api/cat-templates')) {
        return jsonResponse({
          templates: [
            {
              id: 'opus',
              name: '布偶猫',
              nickname: '宪宪',
              avatar: '/avatars/opus.png',
              color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
              roleDescription: '主架构师',
              personality: '温柔但有主见',
            },
          ],
        });
      }
      return jsonResponse({});
    });

    await act(async () => {
      root.render(<WizardHost />);
    });
    await flushEffects();

    // FirstRunQuestWizard uses createPortal to document.body
    expect(document.body.textContent).toContain('选择角色模板');
    expect(document.body.textContent).toContain('布偶猫');
    expect(document.body.textContent).toContain('宪宪');
  });

  it('shows step title for template step', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ templates: [] }));

    await act(async () => {
      root.render(<WizardHost />);
    });
    await flushEffects();

    // FirstRunQuestWizard uses createPortal to document.body
    expect(document.body.textContent).toContain('第 1 步');
    expect(document.body.textContent).toContain('选择角色模板');
  });

  it('shows empty state when no templates available', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ templates: [] }));

    await act(async () => {
      root.render(<WizardHost />);
    });
    await flushEffects();

    // FirstRunQuestWizard uses createPortal to document.body
    expect(document.body.textContent).toContain('暂无可用角色模板');
  });

  it('handles template API errors gracefully', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));

    await act(async () => {
      root.render(<WizardHost />);
    });
    await flushEffects();

    // Should degrade gracefully, not crash
    // FirstRunQuestWizard uses createPortal to document.body
    expect(document.body.textContent).toContain('暂无可用角色模板');
  });

  it('sends clientId (not client) in POST /api/cats payload', async () => {
    let catsPayload: Record<string, unknown> | null = null;

    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/cat-templates')) {
        return jsonResponse({
          templates: [
            {
              id: 'ragdoll',
              name: '布偶猫',
              nickname: '宪宪',
              avatar: '/avatars/opus.png',
              color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
              roleDescription: '主架构师',
              personality: '温柔',
            },
          ],
        });
      }
      if (url.includes('/api/first-run/available-clients')) {
        return jsonResponse({
          clients: [
            {
              client: 'claude',
              provider: 'anthropic',
              label: 'Claude',
              cli: 'claude',
              installed: true,
              hasApiKey: false,
            },
          ],
        });
      }
      if (url.includes('/api/accounts')) {
        return jsonResponse({
          providers: [
            {
              id: 'claude',
              displayName: 'Claude (OAuth)',
              name: 'Claude (OAuth)',
              authType: 'oauth',

              mode: 'subscription',
              models: ['claude-opus-4-6'],
              hasApiKey: false,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
            },
          ],
        });
      }
      if (url.includes('/api/first-run/connectivity-test')) {
        return jsonResponse({ ok: true, message: '连接成功' });
      }
      if (url === '/api/cats' && init?.method === 'POST') {
        catsPayload = JSON.parse(String(init.body)) as Record<string, unknown>;
        return jsonResponse({ cat: { id: 'ragdoll-test', displayName: '布偶猫' } });
      }
      if (url === '/api/threads' && init?.method === 'POST') {
        return jsonResponse({ id: 'thread-test-123' });
      }
      if (url === '/api/threads') {
        return jsonResponse({ threads: [] });
      }
      return jsonResponse({});
    });

    await act(async () => {
      root.render(<WizardHost />);
    });
    await flushEffects();

    // Step 1: select template
    // FirstRunQuestWizard uses createPortal to document.body
    const templateButton = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('布偶猫'),
    );
    expect(templateButton).toBeTruthy();
    await act(async () => {
      templateButton?.click();
    });
    await flushEffects();

    // Step 2: select client
    const clientButton = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Claude'));
    expect(clientButton).toBeTruthy();
    await act(async () => {
      clientButton?.click();
    });
    await flushEffects();

    // Step 3: profile auto-selected, select model, test, then create
    // Click test button
    const testButton = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('测试连接'));
    if (testButton) {
      await act(async () => {
        testButton.click();
      });
      await flushEffects();
    }

    // Click create button
    const createButton = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('创建猫猫'),
    );
    if (createButton && !createButton.disabled) {
      await act(async () => {
        createButton.click();
      });
      await flushEffects();
    }

    // Assert: POST /api/cats must use clientId, not client
    const payload = requirePayload(catsPayload, 'POST /api/cats payload');
    expect(payload.clientId).toBe('anthropic');
    expect(payload.client).toBeUndefined();
  });

  // F159 G2 follow-up: kitten/catagent template must POST with clientId=catagent
  // + catAgentProtocol=openai-chat + nativeToolLevel=L1 from template.runtimeDefaults,
  // overriding whichever client the user picked in step 2. Without this, picking 幼仔
  // in first-run still creates a 普通 anthropic/openai 成员 → /v1/messages 403.
  it('catagent template runtimeDefaults override selectedClient in POST payload', async () => {
    let catsPayload: Record<string, unknown> | null = null;
    let connectivityPayload: Record<string, unknown> | null = null;

    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/cat-templates')) {
        return jsonResponse({
          templates: [
            {
              id: 'kitten',
              name: '幼猫',
              nickname: '幼仔',
              avatar: '/avatars/catagent.png',
              color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
              roleDescription: '灵巧的轻装猫',
              personality: '直爽好奇',
              runtimeDefaults: {
                clientId: 'catagent',
                defaultModel: 'gpt-5.5',
                catAgentProtocol: 'openai-chat',
                nativeToolLevel: 'L1',
              },
            },
          ],
        });
      }
      // user picks an installed CLI client — for this test we want the *degenerate* case:
      // user has only Claude CLI installed but picked kitten/openai-chat template. The
      // FirstRunQuestWizard must override BOTH clientId (account family) AND client (CLI
      // probe binary) so connectivity-test runs the right CLI against the right account.
      if (url.includes('/api/first-run/available-clients')) {
        return jsonResponse({
          clients: [
            {
              client: 'claude',
              provider: 'anthropic',
              label: 'Claude',
              cli: 'claude',
              installed: true,
              hasApiKey: false,
            },
          ],
        });
      }
      if (url.includes('/api/accounts')) {
        return jsonResponse({
          providers: [
            {
              id: 'codex',
              provider: 'codex',
              displayName: 'OpenAI (Codex)',
              name: 'OpenAI (Codex)',
              authType: 'oauth',
              mode: 'subscription',
              clientId: 'openai',
              models: ['gpt-5.5'],
              hasApiKey: false,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
            },
          ],
        });
      }
      if (url.includes('/api/first-run/connectivity-test')) {
        connectivityPayload = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return jsonResponse({ ok: true, message: '连接成功' });
      }
      if (url === '/api/cats' && init?.method === 'POST') {
        catsPayload = JSON.parse(String(init.body)) as Record<string, unknown>;
        return jsonResponse({ cat: { id: 'kitten-abcd', displayName: '幼猫' } });
      }
      if (url === '/api/threads' && init?.method === 'POST') {
        return jsonResponse({ id: 'thread-test-kitten' });
      }
      if (url === '/api/threads') {
        return jsonResponse({ threads: [] });
      }
      return jsonResponse({});
    });

    await act(async () => {
      root.render(<WizardHost />);
    });
    await flushEffects();

    // Step 1: select 幼仔 template
    const templateButton = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('幼猫'));
    expect(templateButton).toBeTruthy();
    await act(async () => {
      templateButton?.click();
    });
    await flushEffects();

    // Step 2: select client. User picks Claude (the only CLI installed) — but the wizard
    // must remap to codex/openai because the template is kitten/openai-chat.
    const clientButton = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Claude'));
    expect(clientButton).toBeTruthy();
    await act(async () => {
      clientButton?.click();
    });
    await flushEffects();

    // Step 3: connectivity test + create
    const testButton = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('测试连接'));
    if (testButton) {
      await act(async () => {
        testButton.click();
      });
      await flushEffects();
    }

    const createButton = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('创建猫猫'),
    );
    if (createButton && !createButton.disabled) {
      await act(async () => {
        createButton.click();
      });
      await flushEffects();
    }

    // Assert: template runtimeDefaults override.
    const payload = requirePayload(catsPayload, 'POST /api/cats payload');
    expect(payload.clientId).toBe('catagent');
    expect(payload.catAgentProtocol).toBe('openai-chat');
    expect(payload.nativeToolLevel).toBe('L1');
    // Family consistency: accountRef from openai-family ConfigStep filter.
    // OpenAIChatAdapter.clientFamily='openai' will match account.clientFamily='openai' at invoke time.
    expect(payload.accountRef).toBe('codex');
    // connectivity-test must use the codex CLI probe (template's effective family),
    // NOT the claude probe that user picked in ClientStep. Without this, probe runs
    // wrong CLI binary against right account → testResult.ok fails → create blocked.
    const connectivityTestPayload = requirePayload(connectivityPayload, 'connectivity-test payload');
    expect(connectivityTestPayload.client).toBe('codex');
    // clientId comes from selectedProfile.provider (account-binding), which is 'codex'
    // for the OAuth builtin; what matters is it's openai-family (not 'claude'/'anthropic').
    expect(connectivityTestPayload.clientId).toBe('codex');
  });
});
