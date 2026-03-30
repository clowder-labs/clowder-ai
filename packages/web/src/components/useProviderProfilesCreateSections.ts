'use client';

import { useCallback, useState } from 'react';
import { parseProviderEnvText } from './hub-provider-env';
import type { ProfileItem } from './hub-provider-profiles.types';
import type { AcpProviderKind } from './hub-provider-profiles.sections';

const DEFAULT_ACP_ARGS = 'gateway acp stdio';
const DEFAULT_ACP_CWD = '/opt/workspace/agent-teams';

function splitCommandArgs(value: string): string[] {
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

interface CreateSectionsOptions {
  bindableProviders: ProfileItem[];
  mutationProjectPath: string | null;
  callApi: (path: string, init: RequestInit) => Promise<Record<string, unknown>>;
  refresh: () => Promise<void>;
  setBusyId: (value: string | null) => void;
  setError: (value: string | null) => void;
}

export function useProviderProfilesCreateSections(options: CreateSectionsOptions) {
  const [createKind, setCreateKind] = useState<AcpProviderKind>('api_key');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createProtocol, setCreateProtocol] = useState<'anthropic' | 'openai' | 'google'>('anthropic');
  const [createBaseUrl, setCreateBaseUrl] = useState('');
  const [createApiKey, setCreateApiKey] = useState('');
  const [createModels, setCreateModels] = useState<string[]>([]);
  const [createAcpCommand, setCreateAcpCommand] = useState('agent-teams');
  const [createAcpArgs, setCreateAcpArgs] = useState(DEFAULT_ACP_ARGS);
  const [createAcpCwd, setCreateAcpCwd] = useState(DEFAULT_ACP_CWD);
  const [createAcpEnvText, setCreateAcpEnvText] = useState('');
  const [createAcpBoundProviderRef, setCreateAcpBoundProviderRef] = useState('');
  const [createAcpDefaultModel, setCreateAcpDefaultModel] = useState('');

  const resetCreateProfileForm = useCallback(() => {
    setCreateDisplayName('');
    setCreateProtocol('anthropic');
    setCreateBaseUrl('');
    setCreateApiKey('');
    setCreateModels([]);
    setCreateAcpCommand('agent-teams');
    setCreateAcpArgs(DEFAULT_ACP_ARGS);
    setCreateAcpCwd(DEFAULT_ACP_CWD);
    setCreateAcpEnvText('');
    setCreateAcpBoundProviderRef('');
    setCreateAcpDefaultModel('');
  }, []);

  const handleCreateBoundProviderRefChange = useCallback(
    (value: string) => {
      setCreateAcpBoundProviderRef(value);
      const nextModels = options.bindableProviders.find((profile) => profile.id === value)?.models ?? [];
      setCreateAcpDefaultModel((current) => (current && nextModels.includes(current) ? current : ''));
    },
    [options.bindableProviders],
  );

  const createProfile = useCallback(async () => {
    if (!createDisplayName.trim()) {
      options.setError('请输入账号显示名');
      return;
    }
    if (createKind === 'acp') {
      if (!createAcpCommand.trim()) {
        options.setError('ACP provider 需要填写 command');
        return;
      }
      if (
        (createAcpBoundProviderRef.trim() && !createAcpDefaultModel.trim()) ||
        (!createAcpBoundProviderRef.trim() && createAcpDefaultModel.trim())
      ) {
        options.setError('绑定上游 Provider 时必须同时选择默认模型');
        return;
      }
    } else if (!createBaseUrl.trim() || !createApiKey.trim()) {
      options.setError('API Key 账号需要填写 baseUrl 和 apiKey');
      return;
    }

    options.setBusyId('create');
    options.setError(null);
    try {
      await options.callApi('/api/provider-profiles', {
        method: 'POST',
        body: JSON.stringify(
          createKind === 'acp'
            ? {
                projectPath: options.mutationProjectPath ?? undefined,
                kind: 'acp',
                displayName: createDisplayName.trim(),
                command: createAcpCommand.trim(),
                args: splitCommandArgs(createAcpArgs),
                cwd: createAcpCwd.trim(),
                ...(parseProviderEnvText(createAcpEnvText) ? { env: parseProviderEnvText(createAcpEnvText) } : {}),
                ...(createAcpBoundProviderRef.trim()
                  ? {
                      boundProviderRef: createAcpBoundProviderRef.trim(),
                      defaultModel: createAcpDefaultModel.trim(),
                    }
                  : {}),
              }
            : {
                projectPath: options.mutationProjectPath ?? undefined,
                displayName: createDisplayName.trim(),
                authType: 'api_key',
                protocol: createProtocol,
                baseUrl: createBaseUrl.trim(),
                apiKey: createApiKey.trim(),
                models: createModels,
              },
        ),
      });
      resetCreateProfileForm();
      await options.refresh();
    } catch (err) {
      options.setError(err instanceof Error ? err.message : String(err));
    } finally {
      options.setBusyId(null);
    }
  }, [
    createAcpArgs,
    createAcpBoundProviderRef,
    createAcpCommand,
    createAcpCwd,
    createAcpDefaultModel,
    createAcpEnvText,
    createApiKey,
    createBaseUrl,
    createDisplayName,
    createKind,
    createModels,
    createProtocol,
    options,
    resetCreateProfileForm,
  ]);

  return {
    providerCreateSectionProps: {
      kind: createKind,
      displayName: createDisplayName,
      protocol: createProtocol,
      baseUrl: createBaseUrl,
      apiKey: createApiKey,
      models: createModels,
      command: createAcpCommand,
      args: createAcpArgs,
      cwd: createAcpCwd,
      envText: createAcpEnvText,
      boundProviderRef: createAcpBoundProviderRef,
      defaultModel: createAcpDefaultModel,
      bindableProviders: options.bindableProviders,
      busy: false,
      onKindChange: setCreateKind,
      onDisplayNameChange: setCreateDisplayName,
      onProtocolChange: setCreateProtocol,
      onBaseUrlChange: setCreateBaseUrl,
      onApiKeyChange: setCreateApiKey,
      onModelsChange: setCreateModels,
      onCommandChange: setCreateAcpCommand,
      onArgsChange: setCreateAcpArgs,
      onCwdChange: setCreateAcpCwd,
      onEnvTextChange: setCreateAcpEnvText,
      onBoundProviderRefChange: handleCreateBoundProviderRefChange,
      onDefaultModelChange: setCreateAcpDefaultModel,
      onCreate: createProfile,
    },
  };
}
