/**
 * Branding constants + server-side branding fetch.
 *
 * Neutral defaults for the open-source Core.
 * Edition builds override via NEXT_PUBLIC_APP_NAME or /api/edition/branding.
 *
 * [宪宪/Opus-46🐾] F140 Phase A — SSR Branding
 */

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Clowder AI';

interface BrandingConfig {
  appName: string;
  windowTitle?: string;
  logoSrc?: string;
  themeColor?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3004';

/** Server-side branding fetch (for generateMetadata / layout). */
export async function getServerBranding(): Promise<BrandingConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/edition/branding`, {
      next: { revalidate: 300 },
    });
    if (res.ok) return res.json();
  } catch {
    // API not available (build time, cold start) — fall back to env
  }
  return { appName: APP_NAME };
}
