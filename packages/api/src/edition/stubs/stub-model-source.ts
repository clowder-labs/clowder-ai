/**
 * Stub IModelSource for Core (community edition).
 *
 * Returns no models. Edition replaces this with real model sources
 * via EditionRegistry.addModelSource().
 *
 * [宪宪/Opus-46🐾] F140 Phase A — AC-A5
 */

import type { IModelSource, ModelEntry, RuntimeModelConfig } from '../types.js';

export class StubModelSource implements IModelSource {
  readonly id = 'stub';

  async listModels(): Promise<ModelEntry[]> {
    return [];
  }

  async resolveRuntimeConfig(modelId: string): Promise<RuntimeModelConfig> {
    throw new Error(`StubModelSource: no runtime config for model "${modelId}". Register an Edition model source.`);
  }
}
