import type { FastifyPluginAsync } from 'fastify';
import { resolveRuntimeAcpModelProfileById } from '../config/acp-model-profiles.js';
import { getProviderProfile, resolveRuntimeProviderProfileById } from '../config/provider-profiles.js';
import { runACPProviderProbe } from '../domains/cats/services/agents/providers/ACPAgentService.js';
import { resolveUserId } from '../utils/request-identity.js';
import { buildProbeHeaders, isInvalidModelProbeError, readProbeError } from './provider-profiles-probe.js';
import {
  draftTestBodySchema,
  inferProbeProtocol,
  probeUrl,
  resolveProjectRoot,
  testBodySchema,
  type ProviderProfilesRoutesOptions,
} from './provider-profiles.shared.js';

async function runApiKeyProviderProbe(
  fetchImpl: typeof fetch,
  input: {
    protocol: 'anthropic' | 'openai' | 'google';
    baseUrl: string;
    apiKey: string;
  },
): Promise<{ ok: true; status: number; message?: string } | { ok: false; status?: number; error: string }> {
  const modelProbePaths = input.protocol === 'google' ? ['/v1beta/models', '/models', '/v1/models'] : ['/v1/models'];
  let modelsRes: Response | null = null;
  let modelsError: string | null = null;

  for (const path of modelProbePaths) {
    const next = await fetchImpl(probeUrl(input.baseUrl, path), {
      method: 'GET',
      headers: buildProbeHeaders(input.protocol, input.apiKey),
    });
    modelsRes = next;
    if (next.ok) {
      return { ok: true, status: next.status };
    }
    modelsError = await readProbeError(next);
    if (next.status !== 404) break;
  }

  if (!modelsRes) {
    return {
      ok: false,
      error: 'Provider test did not execute',
    };
  }

  if (input.protocol === 'anthropic' && modelsRes.status === 404) {
    const messagesRes = await fetchImpl(probeUrl(input.baseUrl, '/v1/messages'), {
      method: 'POST',
      headers: {
        ...buildProbeHeaders(input.protocol, input.apiKey),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    if (messagesRes.ok) {
      return {
        ok: true,
        status: messagesRes.status,
      };
    }
    const messagesError = await readProbeError(messagesRes);
    if (messagesRes.status === 400 && isInvalidModelProbeError(messagesError)) {
      return {
        ok: true,
        status: 200,
        message: 'baseUrl and apiKey are valid; gateway rejected the probe model identifier',
      };
    }
    return {
      ok: false,
      status: messagesRes.status,
      error: messagesError,
    };
  }

  return {
    ok: false,
    status: modelsRes.status,
    error: modelsError ?? (await readProbeError(modelsRes)),
  };
}

export const providerProfileTestRoutes: FastifyPluginAsync<ProviderProfilesRoutesOptions> = async (app, opts) => {
  const fetchImpl = opts.fetchImpl ?? fetch;

  app.post('/api/provider-profiles/test-draft', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Cat-Cafe-User header or userId query)' };
    }

    const parsed = draftTestBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid body', details: parsed.error.issues };
    }

    const projectRoot = await resolveProjectRoot(parsed.data.projectPath);
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }

    const probeProtocol = inferProbeProtocol(
      parsed.data.baseUrl,
      parsed.data.protocol,
      parsed.data.models,
      parsed.data.displayName,
    );

    try {
      const probe = await runApiKeyProviderProbe(fetchImpl, {
        protocol: probeProtocol,
        baseUrl: parsed.data.baseUrl,
        apiKey: parsed.data.apiKey,
      });
      if (probe.ok) {
        return {
          ok: true,
          mode: 'api_key',
          status: probe.status,
          ...(probe.message ? { message: probe.message } : {}),
        };
      }
      reply.status(probe.status ?? 500);
      return {
        ok: false,
        mode: 'api_key',
        ...(probe.status ? { status: probe.status } : {}),
        error: probe.error,
      };
    } catch (err) {
      reply.status(500);
      return {
        ok: false,
        mode: 'api_key',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  app.post('/api/provider-profiles/:profileId/test', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Cat-Cafe-User header or userId query)' };
    }

    const parsed = testBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid body', details: parsed.error.issues };
    }
    const projectRoot = await resolveProjectRoot(parsed.data.projectPath);
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }
    const params = request.params as { profileId: string };

    const providerSelector = parsed.data.provider?.trim() || params.profileId;
    let profile;
    try {
      profile = await getProviderProfile(projectRoot, providerSelector, params.profileId);
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
    if (!profile) {
      reply.status(404);
      return { error: 'Profile not found' };
    }

    const runtime = await resolveRuntimeProviderProfileById(projectRoot, params.profileId);
    if (!runtime) {
      reply.status(400);
      return { error: 'Provider runtime profile could not be resolved' };
    }

    if (profile.kind === 'acp') {
      let acpModelProfile = undefined;
      if (runtime.modelAccessMode === 'clowder_default_profile') {
        const defaultModelProfileRef = runtime.defaultModelProfileRef?.trim();
        if (!defaultModelProfileRef) {
          reply.status(400);
          return { error: 'ACP provider requires defaultModelProfileRef for clowder_default_profile mode' };
        }
        acpModelProfile = await resolveRuntimeAcpModelProfileById(projectRoot, defaultModelProfileRef);
        if (!acpModelProfile) {
          reply.status(400);
          return { error: `ACP model profile "${defaultModelProfileRef}" not found or missing apiKey` };
        }
      }

      const probe = await runACPProviderProbe({
        providerProfile: runtime,
        workingDirectory: projectRoot,
        ...(acpModelProfile ? { acpModelProfile } : {}),
      });
      if (probe.ok) {
        return {
          ok: true,
          mode: 'none',
          status: 200,
        };
      }
      reply.status(500);
      return {
        ok: false,
        mode: 'none',
        error: probe.error,
      };
    }

    if (profile.authType !== 'api_key' || runtime.authType !== 'api_key' || !runtime.baseUrl || !runtime.apiKey) {
      reply.status(400);
      return { error: 'Only api_key or ACP providers can be tested' };
    }

    const explicitProbeProtocol =
      runtime.protocol === 'anthropic' || runtime.protocol === 'openai' || runtime.protocol === 'google'
        ? runtime.protocol
        : undefined;
    const probeProtocol =
      explicitProbeProtocol ??
      inferProbeProtocol(
        runtime.baseUrl,
        parsed.data.protocol ?? parsed.data.provider,
        runtime.models,
        profile.displayName,
        profile.name,
        profile.provider,
        profile.id,
      );
    try {
      const probe = await runApiKeyProviderProbe(fetchImpl, {
        protocol: probeProtocol,
        baseUrl: runtime.baseUrl,
        apiKey: runtime.apiKey,
      });
      if (probe.ok) {
        return {
          mode: 'api_key',
          ok: true,
          status: probe.status,
          ...(probe.message ? { message: probe.message } : {}),
        };
      }
      reply.status(probe.status ?? 500);
      return {
        ok: false,
        mode: 'api_key',
        ...(probe.status ? { status: probe.status } : {}),
        error: probe.error,
      };
    } catch (err) {
      reply.status(500);
      return {
        ok: false,
        mode: 'api_key',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
};
