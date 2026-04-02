import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('embedded Agent Teams binding ignores legacy ACP profiles and accepts openai api_key profiles', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'embedded-agentteams-binding-'));
  try {
    const { createProviderProfile, setBootstrapBinding } = await import('../dist/config/provider-profiles.js');
    const { createAcpModelProfile } = await import('../dist/config/acp-model-profiles.js');
    const {
      resolveEmbeddedAgentTeamsBinding,
      resolveEmbeddedAgentTeamsLegacyModelProfile,
    } = await import('../dist/utils/embedded-runtime-bindings.js');

    const legacyAcpProfile = await createProviderProfile(projectRoot, {
      kind: 'acp',
      displayName: 'Agent Teams Local',
      command: 'agent-teams',
      args: ['gateway', 'acp', 'stdio'],
      protocol: 'acp',
      authType: 'none',
      modelAccessMode: 'clowder_default_profile',
      defaultModelProfileRef: 'agent-teams-default',
    });

    const openAiProfile = await createProviderProfile(projectRoot, {
      provider: 'openai',
      name: 'codex-sponsor',
      mode: 'api_key',
      authType: 'api_key',
      protocol: 'openai',
      baseUrl: 'https://openai.example/v1',
      apiKey: 'sk-test',
      models: ['gpt-5.4', 'gpt-4o-mini'],
      setActive: false,
    });

    assert.equal(await resolveEmbeddedAgentTeamsBinding(projectRoot, legacyAcpProfile.id), null);

    const binding = await resolveEmbeddedAgentTeamsBinding(projectRoot, openAiProfile.id);
    assert.ok(binding, 'expected an embedded Agent Teams binding');
    assert.equal(binding.accountRef, openAiProfile.id);
    assert.equal(binding.profile.protocol, 'openai');
    assert.equal(binding.profile.authType, 'api_key');

    const glmProfile = await createAcpModelProfile(projectRoot, {
      displayName: 'GLM 5',
      provider: 'openai_compatible',
      model: 'glm-5',
      baseUrl: 'https://glm.example/v1',
      apiKey: 'glm-secret',
    });
    const legacyEmbeddedProfile = await createProviderProfile(projectRoot, {
      kind: 'acp',
      displayName: 'Legacy Embedded Agent Teams',
      command: 'agent-teams',
      args: ['gateway', 'acp', 'stdio'],
      protocol: 'acp',
      authType: 'none',
      modelAccessMode: 'clowder_default_profile',
      defaultModelProfileRef: glmProfile.id,
    });

    const legacyModelProfile = await resolveEmbeddedAgentTeamsLegacyModelProfile(projectRoot, legacyEmbeddedProfile.id);
    assert.ok(legacyModelProfile, 'expected legacy embedded Agent Teams ACP profile to resolve');
    assert.equal(legacyModelProfile.id, glmProfile.id);
    assert.equal(legacyModelProfile.model, 'glm-5');

    await setBootstrapBinding(projectRoot, 'openai', {
      enabled: true,
      mode: 'api_key',
      accountRef: openAiProfile.id,
    });

    const inheritedBinding = await resolveEmbeddedAgentTeamsBinding(projectRoot);
    assert.ok(inheritedBinding, 'expected embedded Agent Teams to inherit the openai bootstrap binding');
    assert.equal(inheritedBinding.accountRef, openAiProfile.id);
    assert.equal(inheritedBinding.profile.protocol, 'openai');
    assert.equal(inheritedBinding.profile.authType, 'api_key');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
