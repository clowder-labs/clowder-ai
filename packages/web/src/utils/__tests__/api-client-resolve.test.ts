import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ---------- helpers to mock browser Location ---------- */

function stubLocation(overrides: Partial<Location> | null) {
  if (overrides === null) {
    vi.stubGlobal('location', undefined);
    return;
  }
  vi.stubGlobal('location', {
    hostname: overrides.hostname ?? 'localhost',
    port: overrides.port ?? '',
    protocol: overrides.protocol ?? 'http:',
    ...overrides,
  });
}

/* ---------- suite ---------- */

describe('resolveApiUrl', () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_API_URL = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_API_URL;
    }
  });

  async function loadResolveApiUrl() {
    vi.resetModules();
    const mod = await import('../api-client');
    return mod.resolveApiUrl;
  }

  // ── Cloudflare Tunnel ──

  it('returns Cloudflare API when hostname is cafe.clowder-ai.com', async () => {
    stubLocation({ hostname: 'cafe.clowder-ai.com', protocol: 'https:', port: '' });
    const resolve = await loadResolveApiUrl();
    expect(resolve()).toBe('https://api.clowder-ai.com');
  });

  // ── Explicit env (non-localhost) always wins ──

  it('uses NEXT_PUBLIC_API_URL when explicitly set to non-localhost', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    stubLocation({ hostname: '1.2.3.4', port: '' });
    const resolve = await loadResolveApiUrl();
    expect(resolve()).toBe('https://api.example.com');
  });

  // ── localhost env + remote access → same-origin proxy ──

  it('skips localhost env when accessed remotely (reverse proxy)', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3004';
    stubLocation({ hostname: '1.2.3.4', protocol: 'http:', port: '' });
    const resolve = await loadResolveApiUrl();
    expect(resolve()).toBe('http://1.2.3.4');
  });

  it('uses same-origin proxy for 127.0.0.1 env when accessed remotely with an explicit web port', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:3004';
    stubLocation({ hostname: '10.0.0.5', protocol: 'http:', port: '3003' });
    const resolve = await loadResolveApiUrl();
    expect(resolve()).toBe('http://10.0.0.5:3003');
  });

  it('does not derive a nonexistent remote API port when runtime web/API ports are non-adjacent', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3122';
    stubLocation({ hostname: '100.64.1.23', protocol: 'http:', port: '5122' });
    const resolve = await loadResolveApiUrl();
    expect(resolve()).toBe('http://100.64.1.23:5122');
  });

  // ── localhost env + local access → use env (no skip) ──

  it('uses localhost env when accessed locally', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3004';
    stubLocation({ hostname: 'localhost', port: '3003' });
    const resolve = await loadResolveApiUrl();
    expect(resolve()).toBe('http://localhost:3004');
  });

  // ── Symmetric fix: cloud env + local access → skip env, hit local API
  //    (avoids forcing localhost browser through Cloudflare Tunnel round-trip)

  it('skips cloud env when accessed from localhost (avoids tunnel round-trip)', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.clowder-ai.com';
    stubLocation({ hostname: 'localhost', protocol: 'http:', port: '3003' });
    const resolve = await loadResolveApiUrl();
    expect(resolve()).toBe('http://localhost:3004');
  });

  it('skips cloud env when accessed from 127.0.0.1', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.clowder-ai.com';
    stubLocation({ hostname: '127.0.0.1', protocol: 'http:', port: '3011' });
    const resolve = await loadResolveApiUrl();
    expect(resolve()).toBe('http://127.0.0.1:3012');
  });

  // ── No env, browser, reverse proxy (empty port) → same origin ──

  it('returns same-origin when port is empty (reverse proxy)', async () => {
    stubLocation({ hostname: '1.2.3.4', protocol: 'https:', port: '' });
    const resolve = await loadResolveApiUrl();
    expect(resolve()).toBe('https://1.2.3.4');
  });

  // ── No env, browser, direct port → port+1 ──

  it('derives API port from frontend port (3003→3004)', async () => {
    stubLocation({ hostname: '192.168.1.10', protocol: 'http:', port: '3003' });
    const resolve = await loadResolveApiUrl();
    expect(resolve()).toBe('http://192.168.1.10:3004');
  });

  it('derives API port for alpha convention (3011→3012)', async () => {
    stubLocation({ hostname: 'localhost', protocol: 'http:', port: '3011' });
    const resolve = await loadResolveApiUrl();
    expect(resolve()).toBe('http://localhost:3012');
  });
});
