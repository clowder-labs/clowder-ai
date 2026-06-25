'use client';

import type { CatData } from '@/hooks/useCatData';
import {
  CAT_AGENT_PROTOCOL_OPTIONS,
  CATAGENT_COMMAND_POLICY_PRESET_OPTIONS,
  CATAGENT_CUSTOM_COMMAND_POLICY_PRESET_OPTION,
  CODEX_APPROVAL_OPTIONS,
  CODEX_AUTH_MODE_OPTIONS,
  CODEX_SANDBOX_OPTIONS,
  type CodexRuntimeSettings,
  getCliEffortOptionsForClient,
  type HubCatEditorFormState,
  NATIVE_TOOL_LEVEL_OPTIONS,
  SESSION_CHAIN_OPTIONS,
  SESSION_STRATEGY_OPTIONS,
  type StrategyFormState,
} from './hub-cat-editor.model';
import { RangeField, SectionCard, SelectField, TextField } from './hub-cat-editor-fields';
import { TagEditor } from './hub-tag-editor';

type FormPatch = Partial<HubCatEditorFormState>;

export function AdvancedRuntimeSection({
  cat,
  form,
  strategyForm,
  loadingStrategy,
  strategyError,
  codexSettings,
  loadingCodexSettings,
  codexSettingsError,
  codexSettingsEditable,
  showCodexSettings,
  onChange,
  onStrategyChange,
  onCodexChange,
}: {
  cat?: CatData | null;
  form: HubCatEditorFormState;
  strategyForm: StrategyFormState | null;
  loadingStrategy: boolean;
  strategyError: string | null;
  codexSettings: CodexRuntimeSettings | null;
  loadingCodexSettings: boolean;
  codexSettingsError: string | null;
  codexSettingsEditable: boolean;
  showCodexSettings: boolean;
  onChange: (patch: FormPatch) => void;
  onStrategyChange: (patch: Partial<StrategyFormState>) => void;
  onCodexChange: (patch: Partial<CodexRuntimeSettings>) => void;
}) {
  const effectiveCodexSettings = codexSettings ?? {
    sandboxMode: 'workspace-write' as const,
    approvalPolicy: 'on-request' as const,
    authMode: 'oauth' as const,
  };
  const cliEffortOptions = getCliEffortOptionsForClient(form.clientId);
  const sessionChainEnabled = form.sessionChain === 'true' && (strategyForm?.sessionChainEnabled ?? true);
  const catAgentCommandPolicyPresetOptions =
    form.commandPolicyPreset === 'custom'
      ? [...CATAGENT_COMMAND_POLICY_PRESET_OPTIONS, CATAGENT_CUSTOM_COMMAND_POLICY_PRESET_OPTION]
      : CATAGENT_COMMAND_POLICY_PRESET_OPTIONS;

  return (
    <SectionCard
      title="高级运行时参数"
      description="contextBudget + Session 策略 + Client 特有参数。标有 (Codex) 的参数仅在选择对应 Client 时显示。"
      tone="success"
    >
      <p className="text-xs leading-5 text-[var(--console-runtime-hint)]">
        上下文预算会随成员配置一起持久化到运行时 catalog。4 项要么全部留空，要么全部填写。
      </p>
      <div className="space-y-2">
        <TextField
          label="Max Prompt Tokens"
          value={form.maxPromptTokens}
          onChange={(value) => onChange({ maxPromptTokens: value })}
          inputMode="numeric"
          tone="success"
          placeholder="留空默认 48000"
        />
        <TextField
          label="Max Context Tokens"
          value={form.maxContextTokens}
          onChange={(value) => onChange({ maxContextTokens: value })}
          inputMode="numeric"
          tone="success"
          placeholder="留空默认 128000"
        />
        <TextField
          label="Max Messages"
          value={form.maxMessages}
          onChange={(value) => onChange({ maxMessages: value })}
          inputMode="numeric"
          tone="success"
          placeholder="留空默认 50"
        />
        <TextField
          label="Max Content Length Per Msg"
          ariaLabel="Max Content Length Per Msg"
          value={form.maxContentLengthPerMsg}
          onChange={(value) => onChange({ maxContentLengthPerMsg: value })}
          inputMode="numeric"
          tone="success"
          placeholder="留空默认 16000"
        />
        <SelectField
          label="Session Chain"
          value={form.sessionChain}
          options={SESSION_CHAIN_OPTIONS}
          onChange={(value) => onChange({ sessionChain: value as HubCatEditorFormState['sessionChain'] })}
          tone="success"
        />
        {cliEffortOptions ? (
          <SelectField
            label="CLI Effort"
            value={form.cliEffort}
            options={[
              { value: '', label: '默认（按 Client）' },
              ...cliEffortOptions.map((value) => ({ value, label: value })),
            ]}
            onChange={(value) => onChange({ cliEffort: value as HubCatEditorFormState['cliEffort'] })}
            tone="success"
          />
        ) : null}
        {form.clientId !== 'antigravity' && form.clientId !== 'catagent' ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-cafe">额外 CLI 参数</p>
            <TagEditor
              tags={form.cliConfigArgs}
              onChange={(nextTags) => onChange({ cliConfigArgs: nextTags })}
              addLabel="+ 添加参数"
              placeholder="例如 --model xxx 或 --flag value"
              emptyLabel="无额外参数"
              tone="green"
            />
            <p className="text-label leading-4 text-cafe-muted">
              每条直接追加到 CLI 命令，与系统参数重复时以用户参数为准。`CLI Effort` 请优先用上面的结构化字段。
            </p>
          </div>
        ) : null}
        {form.clientId === 'catagent' ? (
          <div className="space-y-1">
            <SelectField
              label="工具级别 (CatAgent)"
              value={form.nativeToolLevel}
              options={NATIVE_TOOL_LEVEL_OPTIONS}
              onChange={(value) => {
                const nativeToolLevel = value as HubCatEditorFormState['nativeToolLevel'];
                onChange({
                  nativeToolLevel,
                  commandPolicyPreset:
                    nativeToolLevel === 'L2'
                      ? form.commandPolicyPreset === ''
                        ? 'git-readonly'
                        : form.commandPolicyPreset
                      : form.commandPolicyPreset === 'custom'
                        ? 'custom'
                        : '',
                });
              }}
              tone="success"
            />
            <p className="text-label leading-4 text-cafe-muted">
              L0 只读 · L1 可写文件（write_file / patch_file）· L2 可执行命令（run_command）。保存后下次调用即生效。
            </p>
            {form.nativeToolLevel === 'L2' ? (
              <SelectField
                label="命令策略 (CatAgent L2)"
                value={form.commandPolicyPreset}
                options={catAgentCommandPolicyPresetOptions}
                onChange={(value) =>
                  onChange({ commandPolicyPreset: value as HubCatEditorFormState['commandPolicyPreset'] })
                }
                tone="success"
              />
            ) : null}
            {form.nativeToolLevel === 'L2' ? (
              <p className="text-label leading-4 text-cafe-muted">
                预设只允许只读的 git status / diff。选择“不允许命令”时 L2 仍会 fail-closed 拒绝执行。
              </p>
            ) : null}
            {form.nativeToolLevel === 'L2' && form.commandPolicyPreset === 'custom' ? (
              <p className="text-label leading-4 text-cafe-muted">
                当前成员已有自定义策略；此处只保留或切换到内置预设，不编辑自定义 JSON。
              </p>
            ) : null}
            {/* F159 Phase G G2 (AC-G16): wire protocol selector for CatAgent. */}
            <SelectField
              label="协议 (CatAgent)"
              value={form.catAgentProtocol}
              options={CAT_AGENT_PROTOCOL_OPTIONS}
              onChange={(value) => onChange({ catAgentProtocol: value as HubCatEditorFormState['catAgentProtocol'] })}
              tone="success"
            />
            <p className="text-label leading-4 text-cafe-muted">
              选择 catagent 调用的 wire protocol。默认 Anthropic Messages，需要绑 Anthropic 兼容账号； OpenAI Chat 走
              `/v1/chat/completions`，需要绑 OpenAI 兼容账号——切换协议后请确认账号 family 匹配。
            </p>
          </div>
        ) : null}
      </div>

      {cat ? (
        <div className="space-y-3 rounded-[14px] bg-[var(--console-runtime-group-bg)] p-[14px]">
          {loadingStrategy ? <p className="text-sm text-cafe-secondary">Session 策略加载中...</p> : null}
          {strategyError ? (
            <p className="rounded-[20px] border border-conn-red-ring bg-conn-red-bg px-3 py-2 text-sm text-conn-red-text">
              {strategyError}
            </p>
          ) : null}
          {strategyForm && !sessionChainEnabled ? (
            <div className="rounded-[10px] bg-[var(--console-field-bg)] px-4 py-3 text-xs leading-5 text-[var(--cafe-accent)]">
              <p className="font-semibold">Session Chain 未开启</p>
              <p>
                当前成员不会记录或续接 Session Chain，下面的 Session 策略不会生效；先开启 Session Chain 后再配置策略。
              </p>
            </div>
          ) : null}
          {strategyForm && sessionChainEnabled ? (
            <div className="space-y-4">
              <div className="rounded-[10px] bg-[var(--console-runtime-field-bg)] px-4 py-3 text-xs leading-5 text-[var(--console-runtime-hint)]">
                阈值基于 context 填充率 = 当前 tokens / Max Context Tokens。拖动滑条调节百分比。
              </div>
              <div className="space-y-2">
                <SelectField
                  label="Session Strategy"
                  value={strategyForm.strategy}
                  options={SESSION_STRATEGY_OPTIONS.filter(
                    (option) => option.value !== 'hybrid' || strategyForm.hybridCapable,
                  )}
                  onChange={(value) => onStrategyChange({ strategy: value as StrategyFormState['strategy'] })}
                  tone="success"
                />
                <RangeField
                  label={strategyForm.strategy === 'compress' ? 'Session Observe Threshold' : 'Session Warn Threshold'}
                  value={strategyForm.warnThreshold}
                  onChange={(value) => onStrategyChange({ warnThreshold: value })}
                  hint={
                    strategyForm.strategy === 'compress'
                      ? 'context 填充到此比例时前端弹出观测提示（compress 下仅观测，不触发封印）'
                      : 'context 填充到此比例时前端弹出警告提示'
                  }
                />
                <RangeField
                  label={
                    strategyForm.strategy === 'compress'
                      ? 'Session Observe Threshold (upper)'
                      : 'Session Action Threshold'
                  }
                  value={strategyForm.actionThreshold}
                  onChange={(value) => onStrategyChange({ actionThreshold: value })}
                  hint={
                    strategyForm.strategy === 'compress'
                      ? 'compress 策略下此阈值仅用于观测，不触发封印。Session 会在 CLI 压缩后继续存活'
                      : 'context 填充到此比例时触发 Session 策略动作（如 handoff 换 session）'
                  }
                />
                {strategyForm.strategy === 'hybrid' ? (
                  <TextField
                    label="Max Compressions"
                    value={strategyForm.maxCompressions}
                    onChange={(value) => onStrategyChange({ maxCompressions: value })}
                    inputMode="numeric"
                    tone="success"
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showCodexSettings ? (
        <div className="space-y-3 rounded-[14px] bg-[var(--console-runtime-group-bg)] p-[14px]">
          {loadingCodexSettings ? <p className="text-sm text-cafe-secondary">Codex 运行参数加载中...</p> : null}
          {codexSettingsError ? (
            <p className="rounded-[20px] border border-conn-red-ring bg-conn-red-bg px-3 py-2 text-sm text-conn-red-text">
              {codexSettingsError}
            </p>
          ) : null}
          {!loadingCodexSettings && !codexSettingsEditable ? (
            <p className="rounded-[10px] bg-[var(--console-field-bg)] px-3 py-2 text-xs leading-5 text-[var(--cafe-accent)]">
              Codex 配置基线未加载成功，以下 3 项已禁用；请刷新后重试，避免保存时误以为已生效。
            </p>
          ) : null}
          <p className="text-center text-xs font-semibold text-cafe-muted">── Codex 专属 (仅 Client=Codex 时显示) ──</p>
          <p className="rounded-[10px] bg-[var(--console-runtime-field-bg)] px-3 py-2 text-xs leading-5 text-[var(--console-runtime-hint)]">
            成员资料与 Codex 执行参数收敛到同一个入口保存。保存后会分别写入成员 overlay 与全局运行配置。
          </p>
          <div className="space-y-2">
            <SelectField
              label="Codex Sandbox (Codex)"
              ariaLabel="Codex Sandbox"
              value={effectiveCodexSettings.sandboxMode}
              options={CODEX_SANDBOX_OPTIONS}
              onChange={(value) => onCodexChange({ sandboxMode: value as CodexRuntimeSettings['sandboxMode'] })}
              disabled={!codexSettingsEditable}
              tone="success"
            />
            <SelectField
              label="Codex Approval (Codex)"
              ariaLabel="Codex Approval"
              value={effectiveCodexSettings.approvalPolicy}
              options={CODEX_APPROVAL_OPTIONS}
              onChange={(value) => onCodexChange({ approvalPolicy: value as CodexRuntimeSettings['approvalPolicy'] })}
              disabled={!codexSettingsEditable}
              tone="success"
            />
            <SelectField
              label="Codex Auth Mode (Codex)"
              ariaLabel="Codex Auth Mode"
              value={effectiveCodexSettings.authMode}
              options={CODEX_AUTH_MODE_OPTIONS}
              onChange={(value) => onCodexChange({ authMode: value as CodexRuntimeSettings['authMode'] })}
              disabled={!codexSettingsEditable}
              tone="success"
            />
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
