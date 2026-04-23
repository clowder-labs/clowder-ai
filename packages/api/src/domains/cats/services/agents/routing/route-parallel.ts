/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Parallel Route Strategy
 * All cats respond independently to the same message.
 */

import type { OfficeClawConfigEntry, CatId } from '@office-claw/shared';
import { OFFICE_CLAW_CONFIGS, officeClawRegistry, getFriendlyAgentErrorMessage, classifyError } from '@office-claw/shared';
import { getCatContextBudget } from '../../../../../config/office-claw-budgets.js';
import { getConfigSessionStrategy, isSessionChainEnabled } from '../../../../../config/office-claw-config-loader.js';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';
import { estimateTokens } from '../../../../../utils/token-counter.js';
import { assembleContext } from '../../context/ContextAssembler.js';
import {
  buildInvocationContext,
  buildStaticIdentity,
  type InvocationContext,
} from '../../context/SystemPromptBuilder.js';
import { formatDegradationMessage } from '../../orchestration/DegradationPolicy.js';
import { buildSessionBootstrap } from '../../session/SessionBootstrap.js';
import type { StoredToolEvent } from '../../stores/ports/MessageStore.js';
import type { ThreadRoutingPolicyV1 } from '../../stores/ports/ThreadStore.js';
import { getVoiceBlockSynthesizer } from '../../tts/VoiceBlockSynthesizer.js';
import type { AgentMessage, AgentMessageType, MessageMetadata } from '../../types.js';
import { invokeSingleCat } from '../invocation/invoke-single-cat.js';
import { buildMcpCallbackInstructions, needsMcpInjection } from '../invocation/McpPromptInjector.js';
import { getRichBlockBuffer } from '../invocation/RichBlockBuffer.js';
import { mergeStreams } from '../invocation/stream-merge.js';
import { resolveDefaultClaudeMcpServerPath } from '../providers/ClaudeAgentService.js';
import { parseA2AMentions } from '../routing/a2a-mentions.js';
import { parseSystemInfoContent } from './parse-system-info.js';
import { appendGeneratedFileLocationDisclosure } from './generated-file-artifacts.js';
import { extractRichFromText, isValidRichBlock } from './rich-block-extract.js';
import type { RouteOptions, RouteStrategyDeps } from './route-helpers.js';
import {
  assembleIncrementalContext,
  detectContextDegradation,
  getService,
  isUserFacingSystemInfoContent,
  routeContentBlocksForCat,
  sanitizeInjectedContent,
  stripLeadingDirectCatMention,
  toStoredToolEvent,
  upsertMaxBoundary,
} from './route-helpers.js';
import { appendThinkingChunk } from './thinking-chunk-merge.js';

const log = createModuleLogger('route-parallel');

export async function* routeParallel(
  deps: RouteStrategyDeps,
  targetCats: CatId[],
  message: string,
  userId: string,
  threadId: string,
  options: RouteOptions = {},
): AsyncIterable<AgentMessage> {
  const {
    contentBlocks,
    uploadDir,
    signal,
    promptTags,
    contextHistory,
    history,
    currentUserMessageId,
    modeSystemPrompt,
    modeSystemPromptByCat,
  } = options;
  const thinkingMode = options.thinkingMode ?? 'play';
  // P2-3 fix: also consider default MCP server path (ClaudeAgentService has fallback resolution)
  const mcpServerPath = process.env.OFFICE_CLAW_MCP_SERVER_PATH || resolveDefaultClaudeMcpServerPath();
  const incrementalMode = Boolean(currentUserMessageId && deps.deliveryCursorStore);

  const degradationMsgs: AgentMessage[] = [];
  const boundaryByCat = new Map<CatId, string | undefined>();

  // F042 Wave 3: Fetch thread participant activity once (shared across all cats).
  let activeParticipants: { catId: CatId; lastMessageAt: number; messageCount: number }[] = [];
  if (deps.invocationDeps.threadStore) {
    try {
      activeParticipants = await deps.invocationDeps.threadStore.getParticipantsWithActivity(threadId);
    } catch {
      /* best-effort */
    }
  }
  // F042: Fetch thread routingPolicy once (shared across all cats).
  let routingPolicy: ThreadRoutingPolicyV1 | undefined;
  // F073 P4: SOP stage hint from workflow-sop (告示牌 — info only, cats decide actions)
  let sopStageHint: { stage: string; suggestedSkill: string | null; featureId: string } | undefined;
  // F092: Voice companion mode
  let voiceMode: boolean | undefined;
  // F087: Bootcamp state for CVO onboarding
  let bootcampState: InvocationContext['bootcampState'];
  if (deps.invocationDeps.threadStore) {
    try {
      const thread = await deps.invocationDeps.threadStore.get(threadId);
      routingPolicy = thread?.routingPolicy;
      voiceMode = thread?.voiceMode;
      bootcampState = thread?.bootcampState;
      // F073 P4: Read workflow-sop if thread is linked to a backlog item
      if (thread?.backlogItemId && deps.invocationDeps.workflowSopStore) {
        try {
          const sop = await deps.invocationDeps.workflowSopStore.get(thread.backlogItemId);
          if (sop) {
            sopStageHint = {
              stage: sop.stage,
              suggestedSkill: sop.nextSkill,
              featureId: sop.featureId,
            };
          }
        } catch {
          /* best-effort: SOP hint failure does not block invocation */
        }
      }
    } catch {
      /* best-effort */
    }
  }

  const streams = await Promise.all(
    targetCats.map(async (catId) => {
      const catConfig: OfficeClawConfigEntry | undefined =
        officeClawRegistry.tryGet(catId as string)?.config ?? OFFICE_CLAW_CONFIGS[catId as string];
      const isRelayClaw = catConfig?.provider === 'relayclaw';
      const teammates = targetCats.filter((id) => id !== catId);
      // Build identity: static goes in -p content (+ systemPrompt as defense-in-depth), dynamic in -p only.
      // Non-Claude HTTP callback instructions → per-message (session history may be lost on compress).
      const mcpAvailable = (catConfig?.mcpSupport ?? false) && !!mcpServerPath;
      const staticIdentity = buildStaticIdentity(catId, {
        mcpAvailable,
        ...(isRelayClaw
          ? { omitMagicWords: true, omitRichBlockToolLine: true, omitRichBlockReference: true }
          : {}),
      });
      // F041: inject HTTP callback only when MCP is NOT actually available (fallback)
      const mcpInstructions = needsMcpInjection(mcpAvailable)
        ? buildMcpCallbackInstructions({
            currentCatId: catId as string,
            teammates: teammates.map((id) => id as string),
          })
        : '';
      const invocationContext = buildInvocationContext({
        catId,
        mode: 'parallel',
        teammates,
        mcpAvailable,
        ...(promptTags && promptTags.length > 0 ? { promptTags } : {}),
        ...(activeParticipants.length > 0 ? { activeParticipants } : {}),
        ...(routingPolicy ? { routingPolicy } : {}),
        ...(sopStageHint ? { sopStageHint } : {}),
        ...(voiceMode ? { voiceMode } : {}),
        ...(bootcampState ? { bootcampState, threadId } : {}),
      });

      const targetContentBlocks = routeContentBlocksForCat(catId, contentBlocks);
      const targetUploadDir = targetContentBlocks ? uploadDir : undefined;

      // F24 Phase E: Bootstrap context for Session #2+
      let bootstrapCtx = '';
      if (
        isSessionChainEnabled(catId) &&
        deps.invocationDeps.sessionChainStore &&
        deps.invocationDeps.transcriptReader
      ) {
        try {
          const bootstrapDepth = getConfigSessionStrategy(catId)?.handoff?.bootstrapDepth;
          const bootstrap = await buildSessionBootstrap(
            {
              sessionChainStore: deps.invocationDeps.sessionChainStore,
              transcriptReader: deps.invocationDeps.transcriptReader,
              ...(deps.invocationDeps.taskStore ? { taskStore: deps.invocationDeps.taskStore } : {}),
              ...(deps.invocationDeps.threadStore ? { threadStore: deps.invocationDeps.threadStore } : {}),
              ...(bootstrapDepth ? { bootstrapDepth } : {}),
            },
            catId,
            threadId,
          );
          if (bootstrap) {
            bootstrapCtx = bootstrap.text;
          }
        } catch {
          // Best-effort: bootstrap failure doesn't block invocation
        }
      }

      let prompt: string;
      if (incrementalMode) {
        // A+ fix: calculate effective context budget by deducting ALL system parts from maxPromptTokens.
        const parCatModePromptForBudget = modeSystemPromptByCat?.[catId as string] ?? modeSystemPrompt;
        const parIncBudget = getCatContextBudget(catId as string);
        const parIncSystemTokens = estimateTokens(
          [staticIdentity, invocationContext, parCatModePromptForBudget, bootstrapCtx, mcpInstructions]
            .filter(Boolean)
            .join('\n'),
        );
        const parIncMessageTokens = estimateTokens(message);
        const parEffectiveContextBudget = Math.min(
          Math.max(0, parIncBudget.maxPromptTokens - parIncSystemTokens - parIncMessageTokens - 200),
          parIncBudget.maxContextTokens,
        );

        const inc = await assembleIncrementalContext(
          deps,
          userId,
          threadId,
          catId,
          currentUserMessageId,
          thinkingMode,
          { effectiveMaxContextTokens: parEffectiveContextBudget },
        );
        boundaryByCat.set(catId, inc.boundaryId);
        if (inc.degradation) {
          degradationMsgs.push({
            type: 'system_info' as AgentMessageType,
            catId,
            content: inc.degradation,
            timestamp: Date.now(),
          } as AgentMessage);
        }
        const parCatModePrompt = modeSystemPromptByCat?.[catId as string] ?? modeSystemPrompt;
        const parts = [invocationContext, parCatModePrompt, bootstrapCtx, mcpInstructions].filter(Boolean);
        if (inc.contextText) parts.push(inc.contextText);
        // F35 fix: only inject raw message when it was genuinely absent from unseen rows.
        // If it was present but filtered out (e.g. whisper), injecting would leak private content.
        if (!inc.includesCurrentUserMessage && !inc.currentMessageFilteredOut) parts.push(message);
        prompt = parts.join('\n\n---\n\n');
      } else {
        // Per-cat context budget (Phase 4.0)
        let catContextHistory = contextHistory;
        if (history && history.length > 0 && !contextHistory) {
          const budget = getCatContextBudget(catId as string);
          // F8: token-based budget — estimate non-context tokens, remainder goes to context
          // A+ fix: include catModePrompt + bootstrapCtx in system parts estimate (P2-1)
          const parCatModePromptLegacyForBudget = modeSystemPromptByCat?.[catId as string] ?? modeSystemPrompt;
          const parSystemTokens = estimateTokens(
            [staticIdentity, invocationContext, parCatModePromptLegacyForBudget, bootstrapCtx, mcpInstructions]
              .filter(Boolean)
              .join('\n'),
          );
          const parPromptTokens = estimateTokens(message);
          const budgetForContext = Math.max(0, budget.maxPromptTokens - parSystemTokens - parPromptTokens - 200);
          const { contextText, messageCount } = assembleContext(history, {
            maxMessages: budget.maxMessages,
            maxContentLength: budget.maxContentLengthPerMsg,
            maxTotalTokens: Math.min(budgetForContext, budget.maxContextTokens),
          });
          catContextHistory = contextText || undefined;

          // Degradation check: notify user if context was truncated (count budget or char budget)
          const degradation = detectContextDegradation(history.length, messageCount, budget);
          if (degradation?.degraded) {
            degradationMsgs.push({
              type: 'system_info' as AgentMessageType,
              catId,
              content: formatDegradationMessage(degradation),
              timestamp: Date.now(),
            } as AgentMessage);
          }
        }

        const parCatModePromptLegacy = modeSystemPromptByCat?.[catId as string] ?? modeSystemPrompt;
        if (invocationContext || parCatModePromptLegacy || mcpInstructions || bootstrapCtx) {
          const parts = [invocationContext, parCatModePromptLegacy, bootstrapCtx, mcpInstructions].filter(Boolean);
          if (catContextHistory) parts.push(catContextHistory);
          prompt = `${parts.join('\n\n---\n\n')}\n\n---\n\n${message}`;
        } else if (catContextHistory) {
          prompt = `${catContextHistory}\n\n---\n\n${message}`;
        } else {
          prompt = message;
        }
      }

      return invokeSingleCat(deps.invocationDeps, {
        catId,
        service: getService(deps.services, catId),
        prompt,
        userPrompt: stripLeadingDirectCatMention(message, catId),
        userId,
        threadId,
        ...(targetContentBlocks ? { contentBlocks: targetContentBlocks } : {}),
        ...(targetUploadDir ? { uploadDir: targetUploadDir } : {}),
        ...(signal ? { signal } : {}),
        ...(staticIdentity ? { systemPrompt: staticIdentity } : {}),
        ...(options.resumeCatId === catId ? { resumeSession: true } : {}),
        isLastCat: false,
      });
    }),
  );

  // Yield degradation notifications before streaming starts (BACKLOG #32)
  for (const dm of degradationMsgs) {
    yield dm;
  }

  const catText = new Map<string, string>();
  const catThinking = new Map<string, string>();
  const catMeta = new Map<string, MessageMetadata>();
  const catSawUserFacingSystemInfo = new Map<string, boolean>();
  const catToolEvents = new Map<string, StoredToolEvent[]>();
  // F060: Collect inline rich blocks per cat from system_info stream
  const catStreamRichBlocks = new Map<string, import('@office-claw/shared').RichBlock[]>();
  const catErrorText = new Map<string, string>();
  const catHadError = new Set<string>();
  const catErrorTransformed = new Set<string>(); // Track which cats had errors transformed
  // F22 R2 P1-1: Capture own invocationId per cat from stream
  const catInvocationId = new Map<string, string>();
  let completedCount = 0;
  let yieldedFinalDone = false;

  // #80: Per-cat draft flush state
  const catFlushTime = new Map<string, number>();
  const catFlushLen = new Map<string, number>();
  const catFlushToolLen = new Map<string, number>();
  const FLUSH_INTERVAL_MS = 2000;
  const FLUSH_CHAR_DELTA = 2000;
  const noop = () => {};

  // Issue #83: Independent keepalive timer — touch draft every 60s during long tool calls.
  const KEEPALIVE_INTERVAL_MS = 60_000;
  let keepaliveTimer: ReturnType<typeof setInterval> | undefined;
  // Track which cats have had their keepalive started
  let keepaliveStarted = false;

  for await (const msg of mergeStreams(streams, (idx, err) => {
    log.error({ streamIndex: idx, err }, 'Parallel stream error');
  })) {
    // F22 R2 P1-1: Capture invocationId from the initial system_info per cat.
    // Keep forwarding this boundary event so frontend can reset stale task progress.
    if (msg.type === 'system_info' && msg.content && msg.catId && !catInvocationId.has(msg.catId)) {
      try {
        const parsed = parseSystemInfoContent(msg.content);
        if (!parsed) throw new Error('not parseable system_info');
        if (parsed.type === 'invocation_created' && typeof parsed.invocationId === 'string') {
          catInvocationId.set(msg.catId, parsed.invocationId);
          // #80 fix: seed flush baseline so interval triggers after FLUSH_INTERVAL_MS
          catFlushTime.set(msg.catId, Date.now());
          // Issue #83: Start a single keepalive timer that touches all active drafts.
          if (deps.draftStore && !keepaliveStarted) {
            keepaliveStarted = true;
            keepaliveTimer = setInterval(() => {
              for (const [, invId] of catInvocationId) {
                deps.draftStore!.touch(userId, threadId, invId)?.catch?.(noop);
              }
            }, KEEPALIVE_INTERVAL_MS);
          }
        }
      } catch {
        /* ignore parse errors */
      }
    }
    if (msg.type === 'text' && msg.content && msg.catId) {
      catText.set(msg.catId, (catText.get(msg.catId) ?? '') + msg.content);
    }
    // F045: Accumulate thinking blocks per cat for persistence (F5 recovery)
    if (msg.type === 'system_info' && msg.content && msg.catId) {
      if (isUserFacingSystemInfoContent(msg.content)) {
        catSawUserFacingSystemInfo.set(msg.catId, true);
      }
      try {
        const parsed = parseSystemInfoContent(msg.content);
        if (!parsed) throw new Error('not parseable system_info');
        if (parsed.type === 'thinking' && typeof parsed.text === 'string') {
          const prev = catThinking.get(msg.catId) ?? '';
          const mergeStrategy = parsed.mergeStrategy === 'append' ? 'append' : 'paragraph';
          catThinking.set(msg.catId, appendThinkingChunk(prev, parsed.text, mergeStrategy));
        }
        // F060: Collect inline rich_block for persistence (P1 fix)
        if (parsed.type === 'rich_block' && parsed.block && isValidRichBlock(parsed.block)) {
          const arr = catStreamRichBlocks.get(msg.catId) ?? [];
          arr.push(parsed.block);
          catStreamRichBlocks.set(msg.catId, arr);
        }
      } catch {
        /* ignore parse errors */
      }
    }
    if (msg.type === 'error' && msg.catId) {
      catHadError.add(msg.catId);
      const rawError = msg.error ?? '';

      // 收集原始错误（用于日志/审计）
      if (rawError) {
        const prev = catErrorText.get(msg.catId) ?? '';
        catErrorText.set(msg.catId, `${prev}${prev ? '\n' : ''}${rawError}`);
      }

      // ✨ 转换为友好的 text 消息
      const errorKind = classifyError(rawError);
      const friendlyMessage = getFriendlyAgentErrorMessage({
        catId: msg.catId,
        error: rawError,
        errorCode: msg.errorCode,
        metadata: msg.metadata,
      });

      // 累积到 catText（和正常 text 一样，用于持久化）
      const prevText = catText.get(msg.catId) ?? '';
      catText.set(msg.catId, prevText + friendlyMessage);
      catErrorTransformed.add(msg.catId); // 标记已转换

      // 构造转换后的消息
      const transformedMsg = {
        type: 'text' as const,
        catId: msg.catId,
        content: friendlyMessage,
        timestamp: msg.timestamp,
        metadata: msg.metadata,
        origin: 'stream' as const,
        extra: {
          errorFallback: {
            v: 1 as const,
            kind: errorKind,
            rawError,
            timestamp: msg.timestamp,
          },
        },
      };

      // yield 转换后的消息（而不是原始 error）
      yield transformedMsg;
      continue; // ✅ 跳过后面的逻辑
    }
    // F070: done with errorCode (e.g. GOVERNANCE_BOOTSTRAP_REQUIRED) is an error
    // state — mark catHadError so we don't fall through to silent_completion.
    if (msg.type === 'done' && msg.errorCode && msg.catId) {
      catHadError.add(msg.catId);
    }
    // Accumulate tool events per cat
    const toolEvt = toStoredToolEvent(msg);
    if (toolEvt && msg.catId) {
      const arr = catToolEvents.get(msg.catId) ?? [];
      arr.push(toolEvt);
      catToolEvents.set(msg.catId, arr);
    }
    if (msg.metadata && msg.catId && !catMeta.has(msg.catId)) {
      catMeta.set(msg.catId, msg.metadata);
    }

    // #80: Draft flush — fire-and-forget periodic persistence per cat
    if (deps.draftStore && msg.catId && catInvocationId.has(msg.catId)) {
      const invId = catInvocationId.get(msg.catId)!;
      const now = Date.now();
      const lastFlush = catFlushTime.get(msg.catId) ?? now;
      const lastLen = catFlushLen.get(msg.catId) ?? 0;
      const curText = catText.get(msg.catId) ?? '';
      const charDelta = curText.length - lastLen;

      const lastToolLen = catFlushToolLen.get(msg.catId) ?? 0;
      const curTools = catToolEvents.get(msg.catId);
      const curToolLen = curTools?.length ?? 0;

      const neverFlushedCat = lastLen === 0 && lastToolLen === 0;
      if (
        msg.type === 'text' &&
        charDelta > 0 &&
        (neverFlushedCat || now - lastFlush >= FLUSH_INTERVAL_MS || charDelta >= FLUSH_CHAR_DELTA)
      ) {
        const curThinking = catThinking.get(msg.catId);
        deps.draftStore
          .upsert({
            userId,
            threadId,
            invocationId: invId,
            catId: msg.catId as CatId,
            content: curText,
            ...(curTools && curToolLen > 0 ? { toolEvents: curTools } : {}),
            ...(curThinking ? { thinking: curThinking } : {}),
            updatedAt: now,
          })
          ?.catch?.(noop);
        catFlushTime.set(msg.catId, now);
        catFlushLen.set(msg.catId, curText.length);
        catFlushToolLen.set(msg.catId, curToolLen);
      } else if (
        (msg.type === 'tool_use' || msg.type === 'tool_result') &&
        // Cloud R7 P1: bypass interval for the very first flush — tool-first invocations
        // must create a draft immediately, not wait 2s for the interval gate.
        (neverFlushedCat || now - lastFlush >= FLUSH_INTERVAL_MS)
      ) {
        // Cloud R6 P1: upsert when there's unsaved text OR new tool events —
        // tool-first invocations (no text yet) must still create a draft record.
        if (curText.length > lastLen || curToolLen > lastToolLen) {
          const curThinkingTool = catThinking.get(msg.catId);
          deps.draftStore
            .upsert({
              userId,
              threadId,
              invocationId: invId,
              catId: msg.catId as CatId,
              content: curText,
              ...(curTools && curToolLen > 0 ? { toolEvents: curTools } : {}),
              ...(curThinkingTool ? { thinking: curThinkingTool } : {}),
              updatedAt: now,
            })
            ?.catch?.(noop);
          catFlushLen.set(msg.catId, curText.length);
          catFlushToolLen.set(msg.catId, curToolLen);
        } else {
          deps.draftStore.touch(userId, threadId, invId)?.catch?.(noop);
        }
        catFlushTime.set(msg.catId, now);
      }
    }

    if (msg.type === 'done' && msg.catId) {
      completedCount++;
      // F22: Consume MCP-buffered rich blocks BEFORE text/empty branch —
      // blocks must be persisted even when the cat emits no text (cloud Codex P1).
      const ownInvId = catInvocationId.get(msg.catId);
      // Issue #83 P2 fix: Remove completed cat from keepalive set.
      // Without this, the shared keepalive timer would touch() a deleted draft,
      // recreating an orphan Redis hash key via HSET.
      catInvocationId.delete(msg.catId);
      const bufferedBlocks = getRichBlockBuffer().consume(threadId, msg.catId, ownInvId);
      const text = catText.get(msg.catId);
      if (text) {
        const meta = catMeta.get(msg.catId);
        const sanitized = sanitizeInjectedContent(text);
        // F22: Extract cc_rich blocks from text + merge with buffered
        const { cleanText, blocks: textBlocks } = extractRichFromText(sanitized);
        let allRichBlocks = [...bufferedBlocks, ...textBlocks, ...(catStreamRichBlocks.get(msg.catId) ?? [])];
        // F34-b: synthesize text-only audio blocks (voice messages)
        // F111: skip synthesis in voiceMode — frontend streams via /api/tts/stream
        if (!voiceMode) {
          const voiceSynth = getVoiceBlockSynthesizer();
          if (voiceSynth && allRichBlocks.some((b) => b.kind === 'audio' && 'text' in b)) {
            try {
              allRichBlocks = await voiceSynth.resolveVoiceBlocks(allRichBlocks, msg.catId as string);
            } catch (err) {
              log.error({ catId: msg.catId, err }, 'Voice block synthesis failed');
            }
          }
        }
        const storedContent = appendGeneratedFileLocationDisclosure(cleanText, allRichBlocks);
        const catTools = catToolEvents.get(msg.catId);
        // A2A only triggers in routeSerial; routeParallel stores mentions
        // but never chains (MVP safety boundary — see Phase 3.9 design doc)
        const mentions = parseA2AMentions(storedContent, msg.catId as CatId);
        if (mentions.length === 0 && storedContent.includes('@')) {
          log.debug(
            { threadId, catId: msg.catId, contentLen: storedContent.length },
            '[route-parallel] @ found in content but no A2A mention parsed (parallel never chains)',
          );
        } else if (mentions.length > 0) {
          log.debug(
            { threadId, catId: msg.catId, mentions },
            '[route-parallel] A2A mentions detected (stored only, not chained)',
          );
        }

        const thinking = catThinking.get(msg.catId);
        try {
          await deps.messageStore.append({
            userId,
            catId: msg.catId as CatId,
            content: storedContent,
            mentions,
            origin: 'stream',
            timestamp: Date.now(),
            threadId,
            ...(thinking ? { thinking } : {}),
            ...(meta ? { metadata: meta } : {}),
            ...(catTools && catTools.length > 0 ? { toolEvents: catTools } : {}),
            extra: {
              ...(allRichBlocks.length > 0 ? { rich: { v: 1 as const, blocks: allRichBlocks } } : {}),
              ...(ownInvId ? { stream: { invocationId: ownInvId } } : {}),
            },
          });
          // F088-P3: Stash rich blocks for outbound delivery
          if (options.persistenceContext && allRichBlocks.length > 0) {
            options.persistenceContext.richBlocks = [
              ...(options.persistenceContext.richBlocks ?? []),
              ...allRichBlocks,
            ];
          }
          // #80: Clean up draft only after successful append
          if (deps.draftStore && ownInvId) {
            deps.draftStore.delete(userId, threadId, ownInvId)?.catch?.(noop);
          }
          // Cloud Codex R4 P1 fix: Update activity in isolated try/catch to not affect append status
          if (deps.invocationDeps.threadStore) {
            try {
              await deps.invocationDeps.threadStore.updateParticipantActivity(threadId, msg.catId as CatId);
            } catch (activityErr) {
              log.warn({ catId: msg.catId, err: activityErr }, 'updateParticipantActivity failed');
            }
          }
        } catch (err) {
          log.error({ catId: msg.catId, err }, 'messageStore.append failed, degrading');
          if (options.persistenceContext) {
            options.persistenceContext.failed = true;
            options.persistenceContext.errors.push({
              catId: msg.catId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } else if (!catHadError.has(msg.catId)) {
        // No text content and no error.
        // Persist only when there is non-text payload (tool/thinking/rich).
        // Purely empty turns should not create blank chat bubbles.
        const meta = catMeta.get(msg.catId);
        const catTools = catToolEvents.get(msg.catId);
        const thinking = catThinking.get(msg.catId);
        const noTextBlocks = [...bufferedBlocks, ...(catStreamRichBlocks.get(msg.catId) ?? [])];
        const hasRichBlocks = noTextBlocks.length > 0;
        const sawUserFacingSystemInfo = catSawUserFacingSystemInfo.get(msg.catId) === true;
        const shouldPersistNoTextMessage =
          hasRichBlocks || (catTools?.length ?? 0) > 0 || Boolean(thinking?.trim().length ?? 0);

        // Diagnostic: if cat ran tools but produced no text, emit a system_info so the
        // user sees *something* instead of a silent vanish (bugfix: silent-exit P1).
        if (catTools && catTools.length > 0 && !hasRichBlocks && !sawUserFacingSystemInfo) {
          yield {
            type: 'system_info' as AgentMessageType,
            catId: msg.catId,
            content: JSON.stringify({
              type: 'silent_completion',
              detail: `${msg.catId} completed with tool calls but no text response.`,
              toolCount: catTools.length,
            }),
            timestamp: Date.now(),
          } as AgentMessage;
        }

        if (shouldPersistNoTextMessage) {
          try {
            await deps.messageStore.append({
              userId,
              catId: msg.catId as CatId,
              content: appendGeneratedFileLocationDisclosure('', noTextBlocks),
              mentions: [],
              origin: 'stream',
              timestamp: Date.now(),
              threadId,
              ...(thinking ? { thinking } : {}),
              ...(meta ? { metadata: meta } : {}),
              ...(catTools && catTools.length > 0 ? { toolEvents: catTools } : {}),
              extra: {
                ...(noTextBlocks.length > 0 ? { rich: { v: 1 as const, blocks: noTextBlocks } } : {}),
                ...(ownInvId ? { stream: { invocationId: ownInvId } } : {}),
              },
            });
            // F088-P3: Stash rich blocks for outbound delivery (no-text branch)
            if (options.persistenceContext && noTextBlocks.length > 0) {
              options.persistenceContext.richBlocks = [
                ...(options.persistenceContext.richBlocks ?? []),
                ...noTextBlocks,
              ];
            }
            // #80: Clean up draft only after successful append
            if (deps.draftStore && ownInvId) {
              deps.draftStore.delete(userId, threadId, ownInvId)?.catch?.(noop);
            }
            // Cloud Codex R4 P1 fix: Update activity in isolated try/catch to not affect append status
            if (deps.invocationDeps.threadStore) {
              try {
                await deps.invocationDeps.threadStore.updateParticipantActivity(threadId, msg.catId as CatId);
              } catch (activityErr) {
                log.warn({ catId: msg.catId, err: activityErr }, 'updateParticipantActivity failed');
              }
            }
          } catch (err) {
            log.error({ catId: msg.catId, err }, 'messageStore.append failed, degrading');
            if (options.persistenceContext) {
              options.persistenceContext.failed = true;
              options.persistenceContext.errors.push({
                catId: msg.catId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        } else if (!sawUserFacingSystemInfo) {
          yield {
            type: 'system_info' as AgentMessageType,
            catId: msg.catId,
            content: JSON.stringify({
              type: 'silent_completion',
              detail: `${msg.catId} completed without textual output.`,
              toolCount: 0,
            }),
            timestamp: Date.now(),
          } as AgentMessage;
          // No persisted message for fully silent turns.
          if (deps.draftStore && ownInvId) {
            deps.draftStore.delete(userId, threadId, ownInvId)?.catch?.(noop);
          }
        } else if (deps.draftStore && ownInvId) {
          deps.draftStore.delete(userId, threadId, ownInvId)?.catch?.(noop);
        }
      } else {
        // hadError but toolEvents exist — persist tool record so refresh shows what was attempted
        const catTools = catToolEvents.get(msg.catId);
        if (catTools && catTools.length > 0) {
          const meta = catMeta.get(msg.catId);
          const thinking = catThinking.get(msg.catId);
          try {
            await deps.messageStore.append({
              userId,
              catId: msg.catId as CatId,
              content: '',
              mentions: [],
              origin: 'stream',
              timestamp: Date.now(),
              threadId,
              ...(thinking ? { thinking } : {}),
              ...(meta ? { metadata: meta } : {}),
              toolEvents: catTools,
              ...(ownInvId ? { extra: { stream: { invocationId: ownInvId } } } : {}),
            });
            // #80: Clean up draft only after successful append
            if (deps.draftStore && ownInvId) {
              deps.draftStore.delete(userId, threadId, ownInvId)?.catch?.(noop);
            }
            // Cloud Codex R4 P1 fix: Update activity in isolated try/catch to not affect append status
            if (deps.invocationDeps.threadStore) {
              try {
                await deps.invocationDeps.threadStore.updateParticipantActivity(threadId, msg.catId as CatId);
              } catch (activityErr) {
                log.warn({ catId: msg.catId, err: activityErr }, 'updateParticipantActivity failed');
              }
            }
          } catch (err) {
            log.error({ catId: msg.catId, err }, 'messageStore.append (error+tools) failed, degrading');
            if (options.persistenceContext) {
              options.persistenceContext.failed = true;
              options.persistenceContext.errors.push({
                catId: msg.catId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      }

      // 降级逻辑：仅在错误未被流式循环转换时触发
      // 这种情况理论上不应该发生，但保留作为安全网
      const errorText = catErrorText.get(msg.catId);
      if (errorText && !catErrorTransformed.has(msg.catId)) {
        log.warn({ catId: msg.catId, errorText }, 'Error not transformed in stream loop — fallback persistence');
        const errorKind = classifyError(errorText);
        const friendlyMessage = getFriendlyAgentErrorMessage({
          catId: msg.catId,
          error: errorText,
        });
        const errorFallback = {
          v: 1 as const,
          kind: errorKind,
          rawError: errorText,
          timestamp: Date.now(),
        };

        try {
          await deps.messageStore.append({
            userId, // ← 改为 userId（而非 'system'）
            catId: msg.catId, // ← 改为 catId（而非 null）
            content: friendlyMessage, // ← 友好消息（而非 "Error: ..."）
            mentions: [],
            origin: 'stream',
            timestamp: Date.now(),
            threadId,
            extra: {
              errorFallback,
            },
          });
        } catch (err) {
          log.error({ catId: msg.catId, err }, 'messageStore.append (error fallback) failed');
        }

        yield {
          type: 'text' as AgentMessageType,
          catId: msg.catId as CatId,
          content: friendlyMessage,
          origin: 'stream',
          extra: { errorFallback },
          timestamp: Date.now(),
        } as AgentMessage;
      }

      // Ack cursor regardless of error: messages were assembled into the prompt
      // and delivered to the cat. Not acking causes infinite re-delivery.
      if (incrementalMode) {
        const boundaryId = boundaryByCat.get(msg.catId as CatId);
        if (boundaryId) {
          if (options.cursorBoundaries) {
            // ADR-008 S3: defer ack — caller acks after invocation succeeds
            upsertMaxBoundary(options.cursorBoundaries, msg.catId, boundaryId);
          } else if (deps.deliveryCursorStore) {
            // Legacy: ack immediately
            try {
              await deps.deliveryCursorStore.ackCursor(userId, msg.catId as CatId, threadId, boundaryId);
            } catch (err) {
              log.error({ catId: msg.catId, err }, 'ackCursor failed');
            }
          }
        }
      }

      const isFinal = completedCount === targetCats.length;

      // F5: When all parallel cats are done, emit follow-up hints for A2A mentions
      if (isFinal) {
        const followupMentions: Array<{ catId: string; mentionedBy: string }> = [];
        for (const [cid, text] of catText.entries()) {
          const ms = parseA2AMentions(text, cid as CatId);
          for (const target of ms) {
            followupMentions.push({ catId: target, mentionedBy: cid });
          }
        }
        if (followupMentions.length > 0) {
          yield {
            type: 'system_info' as AgentMessageType,
            catId: msg.catId as CatId,
            content: JSON.stringify({
              type: 'a2a_followup_available',
              mentions: followupMentions,
            }),
            timestamp: Date.now(),
          };
        }
      }

      yield { ...msg, isFinal };
      if (isFinal) yieldedFinalDone = true;
    } else {
      yield msg;
    }
  }

  // done-guarantee safety net: synthesize final done if loop exited without one
  if (!yieldedFinalDone && targetCats.length > 0) {
    yield {
      type: 'done' as AgentMessageType,
      catId: targetCats[targetCats.length - 1]!,
      isFinal: true,
      timestamp: Date.now(),
    } as AgentMessage;
  }

  // Issue #83: Stop keepalive timer — streaming loop has exited.
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = undefined;
  }
}
