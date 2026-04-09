/**
 * Edition API Routes — Binary Core Edition Surface (§7.1)
 *
 * GET /api/edition/capabilities — Full capability manifest
 * GET /api/edition/branding     — Branding config (appName, theme, logo)
 * GET /api/edition/status       — Edition identity + registry summary
 *
 * These endpoints expose the loaded Edition's configuration to the frontend,
 * enabling UI adaptation without hardcoding vendor knowledge into Core.
 *
 * [宪宪/Opus-46🐾] Phase 1 — Edition API Surface
 */

import type { FastifyPluginAsync } from 'fastify';
import type { BrandingConfig, CapabilityManifest, EditionConfig } from '../edition/types.js';

// ─── Types ───────────────────────────────────────────

export interface EditionApiRoutesOptions {
  editionConfig: EditionConfig;
}

interface EditionStatusResponse {
  edition: string;
  version: string;
  coreApiVersion: string;
  registry: {
    modelSources: number;
    skillSources: number;
    connectors: number;
  };
}

// ─── Route Plugin ────────────────────────────────────

export const editionApiRoutes: FastifyPluginAsync<EditionApiRoutesOptions> = async (app, opts) => {
  const { editionConfig } = opts;

  /**
   * GET /api/edition/capabilities — Full capability manifest
   * Frontend uses this to toggle UI sections based on edition features.
   */
  app.get('/api/edition/capabilities', async () => {
    const registry = editionConfig._registry;

    const manifest: CapabilityManifest = {
      branding: editionConfig.branding,
      identity: editionConfig.identity,
      features: editionConfig.features as CapabilityManifest['features'],
      connectors: registry?.connectors.map((c) => c.id) ?? [],
      modelSources: registry?.modelSources.map((m) => m.id) ?? [],
    };
    return manifest;
  });

  /**
   * GET /api/edition/branding — Branding config only
   * Lightweight endpoint for shell/header rendering.
   */
  app.get('/api/edition/branding', async () => {
    const branding: BrandingConfig = { ...editionConfig.branding };
    return branding;
  });

  /**
   * GET /api/edition/status — Edition identity + registry summary
   * Useful for admin/debug panels and CI health checks.
   */
  app.get('/api/edition/status', async () => {
    const registry = editionConfig._registry;

    const status: EditionStatusResponse = {
      edition: editionConfig.edition,
      version: editionConfig.version,
      coreApiVersion: editionConfig.coreApiVersion,
      registry: {
        modelSources: registry?.modelSources.length ?? 0,
        skillSources: registry?.skillSources.length ?? 0,
        connectors: registry?.connectors.length ?? 0,
      },
    };
    return status;
  });
};
