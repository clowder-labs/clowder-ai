/**
 * useCapabilities — fetches Edition capability manifest from /api/edition/capabilities.
 *
 * Exposes identity mode, feature flags, and branding for capability-driven UI.
 *
 * @see binary-core-product-line-v3.md §4.4
 * [宪宪/Opus-46🐾] F140 Phase A — AC-A6
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

interface BrandingConfig {
  appName: string;
  windowTitle?: string;
  logoSrc?: string;
  themeColor?: string;
  locale?: string;
}

interface CapabilityManifest {
  branding: BrandingConfig;
  identity: { mode: 'no-auth' | 'trusted-header' | 'jwt' };
  features: Record<string, boolean>;
  connectors: string[];
  modelSources: string[];
}

interface UseCapabilitiesResult {
  capabilities: CapabilityManifest | null;
  isLoading: boolean;
  error: string | null;
  identityMode: 'no-auth' | 'trusted-header' | 'jwt';
  isFeatureEnabled: (feature: string) => boolean;
  appName: string;
}

export function useCapabilities(): UseCapabilitiesResult {
  const [capabilities, setCapabilities] = useState<CapabilityManifest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      try {
        const res = await apiFetch('/api/edition/capabilities');
        if (!res.ok) throw new Error(`capabilities fetch failed: ${res.status}`);
        const data: CapabilityManifest = await res.json();
        setCapabilities(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return {
    capabilities,
    isLoading,
    error,
    identityMode: capabilities?.identity.mode ?? 'no-auth',
    isFeatureEnabled: (feature: string) => capabilities?.features[feature] ?? false,
    appName: capabilities?.branding.appName ?? 'Clowder AI',
  };
}
