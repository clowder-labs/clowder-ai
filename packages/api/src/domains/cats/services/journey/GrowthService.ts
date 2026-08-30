/**
 * F160 Cat Journey RPG — Journey Service
 * Reads/writes footfall counters in Redis, computes attributes and profiles.
 *
 * Footfall is stored as simple Redis integers: growth:{catId}:{dimension} → total footfall.
 * Level formula: level = floor(sqrt(footfall / 100))  (quadratic curve)
 * Footfall to next: (level+1)^2 * 100 - footfall
 */

import type {
  BondLevel,
  CatAttributes,
  CatBond,
  CatGrowthProfile,
  CatTitle,
  DimensionStat,
  FootfallEvent,
  FootfallSource,
  GrowthDimension,
  GrowthOverview,
  TitleCondition,
  TitleDefinition,
  UnlockedTitle,
} from '@cat-cafe/shared';
import {
  CO_CREATOR_ACTOR_ID,
  catRegistry,
  GROWTH_DIMENSIONS,
  isCoCreatorActor,
  TITLE_DEFINITIONS,
} from '@cat-cafe/shared';
import type { RedisClient } from '@cat-cafe/shared/utils';
import { createModuleLogger } from '../../../../infrastructure/logger.js';
import { growthAuditKey, growthBondKey, growthTitleKey, growthXpKey } from '../stores/redis-keys/growth-keys.js';

const log = createModuleLogger('growth');

/** Footfall per source type, mapped to the dimension it feeds. */
const FOOTFALL_RULES: Record<FootfallSource, { dimension: GrowthDimension; footfall: number }> = {
  task_complete: { dimension: 'execution', footfall: 50 },
  session_seal: { dimension: 'execution', footfall: 20 },
  review_given: { dimension: 'review', footfall: 40 },
  review_received: { dimension: 'collaboration', footfall: 15 },
  tool_use: { dimension: 'execution', footfall: 1 },
  tool_use_mcp: { dimension: 'insight', footfall: 3 },
  tool_use_skill: { dimension: 'aesthetics', footfall: 3 },
  mention_collab: { dimension: 'collaboration', footfall: 10 },
  deep_collab: { dimension: 'collaboration', footfall: 20 },
  discussion: { dimension: 'architecture', footfall: 15 },
  pr_merged: { dimension: 'execution', footfall: 80 },
  bug_caught: { dimension: 'review', footfall: 60 },
  design_feedback: { dimension: 'aesthetics', footfall: 30 },
  rich_block_create: { dimension: 'aesthetics', footfall: 20 },
  evidence_cite: { dimension: 'insight', footfall: 25 },
  cache_efficiency: { dimension: 'insight', footfall: 15 },
  ideate_discussion: { dimension: 'architecture', footfall: 25 },
  error_recovery: { dimension: 'execution', footfall: 30 },
  fast_execution: { dimension: 'execution', footfall: 20 },
};

function levelFromFootfall(footfall: number): number {
  return Math.floor(Math.sqrt(footfall / 100));
}

function footfallForLevel(level: number): number {
  return level * level * 100;
}

function buildDimensionStat(dimension: GrowthDimension, footfall: number): DimensionStat {
  const level = levelFromFootfall(footfall);
  return { dimension, footfall, level, footfallToNext: footfallForLevel(level + 1) - footfall };
}

/** Footfall sources that map to achievement counters. */
const SOURCE_TO_COUNTER: Partial<Record<FootfallSource, string>> = {
  task_complete: 'tasks',
  review_given: 'reviews',
  session_seal: 'sessions',
};

export class GrowthService {
  /** Phase C: Optional AchievementService — set after construction to avoid circular deps. */
  achievementService?: { incrementCounter(memberId: string, counter: string): void };
  /** Phase E: Optional EvolutionService — records milestone narrative events. */
  evolutionService?: import('./EvolutionService.js').EvolutionService;

  constructor(private readonly redis: RedisClient) {}

  /** Resolve ioredis keyPrefix for SCAN operations. */
  private get keyPrefix(): string {
    return (this.redis as { options?: { keyPrefix?: string } }).options?.keyPrefix ?? '';
  }

  /** Award footfall + record audit event. Fire-and-forget — caller should not await. */
  awardFootfall(catId: string, source: FootfallSource, multiplier = 1): void {
    const rule = FOOTFALL_RULES[source];
    if (!rule) return;
    const amount = Math.max(1, Math.round(rule.footfall * multiplier));
    const key = growthXpKey(catId, rule.dimension);
    const ts = Date.now();

    // Increment total + append audit entry (pipelined, single RTT)
    const pipeline = this.redis.pipeline();
    pipeline.incrby(key, amount);
    const event: FootfallEvent = { catId, dimension: rule.dimension, footfall: amount, source, timestamp: ts };
    // Nonce ensures uniqueness when identical events fire in the same millisecond (e.g. tool_use bursts)
    const member = JSON.stringify({ ...event, _seq: Math.random().toString(36).slice(2, 8) });
    pipeline.zadd(growthAuditKey(catId), ts, member);
    pipeline
      .exec()
      .then((results) => {
        // Phase E (AC-E1): Detect level transitions from INCRBY result
        if (this.evolutionService && results) {
          const newFootfall = results[0]?.[1] as number | undefined;
          if (newFootfall != null) {
            const oldFootfall = newFootfall - amount;
            if (oldFootfall === 0) this.evolutionService.recordFirstDimension(catId, rule.dimension);
            const oldLevel = levelFromFootfall(oldFootfall);
            const newLevel = levelFromFootfall(newFootfall);
            if (newLevel > oldLevel) this.evolutionService.recordLevelUp(catId, rule.dimension, oldLevel, newLevel);
          }
        }

        // Phase B: Check title unlocks after footfall change (fire-and-forget)
        this.getAttributes(catId)
          .then((attrs) => this.checkTitleUnlocks(catId, attrs))
          .catch((err: unknown) => log.warn({ err, catId }, 'Title check failed'));
      })
      .catch((err: unknown) => {
        log.warn({ err, catId, source }, 'Failed to award footfall');
      });

    // Phase C: Increment achievement counter if applicable (fire-and-forget)
    const counter = SOURCE_TO_COUNTER[source];
    if (counter && this.achievementService) {
      this.achievementService.incrementCounter(catId, counter);
    }
  }

  /** AC-A5: Fetch recent footfall events for a cat, newest first. */
  async getFootfallEvents(catId: string, limit = 50, offset = 0): Promise<FootfallEvent[]> {
    const raw = await this.redis.zrevrange(growthAuditKey(catId), offset, offset + limit - 1);
    return raw.map((s) => JSON.parse(s) as FootfallEvent);
  }

  /** Read one cat's attributes from Redis. */
  async getAttributes(catId: string): Promise<CatAttributes> {
    const keys = GROWTH_DIMENSIONS.map((d) => growthXpKey(catId, d));
    const values = await this.redis.mget(...keys);

    const stats = {} as Record<GrowthDimension, DimensionStat>;
    let totalFootfall = 0;
    let levelSum = 0;
    let activeDimensions = 0;

    for (let i = 0; i < GROWTH_DIMENSIONS.length; i++) {
      const dim = GROWTH_DIMENSIONS[i]!;
      const footfall = parseInt(values[i] ?? '0', 10) || 0;
      stats[dim] = buildDimensionStat(dim, footfall);
      totalFootfall += footfall;
      levelSum += stats[dim].level;
      if (footfall > 0) activeDimensions++;
    }

    return {
      catId,
      stats,
      overallLevel: activeDimensions > 0 ? Math.floor(levelSum / activeDimensions) : 0,
      totalFootfall,
      updatedAt: Date.now(),
    };
  }

  // ── Phase B: Title System ──────────────────────────────────────────

  /** Check if a single title condition is met. */
  private conditionMet(cond: TitleCondition, attrs: CatAttributes): boolean {
    switch (cond.type) {
      case 'dimension_level':
        return (attrs.stats[cond.dimension]?.level ?? 0) >= cond.minLevel;
      case 'overall_level':
        return attrs.overallLevel >= cond.minLevel;
      case 'total_footfall':
        return attrs.totalFootfall >= cond.minFootfall;
    }
  }

  /** Check all title definitions against current attributes. Returns newly unlocked titles. */
  async checkTitleUnlocks(catId: string, attrs: CatAttributes): Promise<UnlockedTitle[]> {
    const existing = await this.getUnlockedTitles(catId);
    const existingIds = new Set(existing.map((t) => t.titleId));
    const newlyUnlocked: UnlockedTitle[] = [];

    for (const def of TITLE_DEFINITIONS) {
      if (existingIds.has(def.id)) continue;
      const allMet = def.conditions.every((c) => this.conditionMet(c, attrs));
      if (!allMet) continue;

      const unlock: UnlockedTitle = { titleId: def.id, catId, unlockedAt: Date.now() };
      await this.redis.zadd(growthTitleKey(catId), unlock.unlockedAt, JSON.stringify(unlock));
      newlyUnlocked.push(unlock);
      log.info({ catId, titleId: def.id }, 'Title unlocked');
    }
    return newlyUnlocked;
  }

  /** Get all unlocked titles for a cat, newest first. */
  async getUnlockedTitles(catId: string): Promise<UnlockedTitle[]> {
    const raw = await this.redis.zrevrange(growthTitleKey(catId), 0, -1);
    return raw.map((s) => JSON.parse(s) as UnlockedTitle);
  }

  /** Get the highest-rarity title for display in profile card. */
  async getCurrentTitle(catId: string): Promise<CatTitle | undefined> {
    const unlocked = await this.getUnlockedTitles(catId);
    if (unlocked.length === 0) return undefined;

    const RARITY_ORDER: Record<string, number> = { legendary: 4, epic: 3, rare: 2, common: 1 };
    const defMap = new Map<string, TitleDefinition>();
    for (const d of TITLE_DEFINITIONS) defMap.set(d.id, d);

    let best: { def: TitleDefinition; unlock: UnlockedTitle } | undefined;
    for (const u of unlocked) {
      const def = defMap.get(u.titleId);
      if (!def) continue;
      if (!best || (RARITY_ORDER[def.rarity] ?? 0) > (RARITY_ORDER[best.def.rarity] ?? 0)) {
        best = { def, unlock: u };
      }
    }
    if (!best) return undefined;
    return { id: best.def.id, label: best.def.label, unlockedAt: best.unlock.unlockedAt };
  }

  // ── Phase B: Bond System ────────────────────────────────────────────

  /** Record a collaboration event between two cats. Fire-and-forget. */
  recordBondEvent(catA: string, catB: string): void {
    if (catA === catB) return;
    const key = growthBondKey(catA, catB);
    const pipeline = this.redis.pipeline();
    pipeline.hincrby(key, 'score', 1);
    pipeline.hincrby(key, 'interactions', 1);
    pipeline.hset(key, 'lastInteractionAt', String(Date.now()));
    pipeline.hset(key, 'catA', catA < catB ? catA : catB);
    pipeline.hset(key, 'catB', catA < catB ? catB : catA);
    pipeline.exec().catch((err: unknown) => {
      log.warn({ err, catA, catB }, 'Failed to record bond event');
    });
  }

  /** Get bond level from score. */
  static bondLevel(score: number): BondLevel {
    if (score >= 50) return 'soulmate';
    if (score >= 15) return 'partner';
    return 'acquaintance';
  }

  /** Get all bonds for a cat by scanning Redis. */
  async getBonds(catId: string): Promise<(CatBond & { level: BondLevel })[]> {
    const allCatIds = catRegistry.getAllIds().map(String);
    const bonds: (CatBond & { level: BondLevel })[] = [];

    for (const otherId of allCatIds) {
      if (otherId === catId) continue;
      const key = growthBondKey(catId, otherId);
      const data = await this.redis.hgetall(key);
      if (!data || !data.score) continue;
      const score = parseInt(data.score, 10) || 0;
      if (score === 0) continue;
      bonds.push({
        catA: data.catA ?? (catId < otherId ? catId : otherId),
        catB: data.catB ?? (catId < otherId ? otherId : catId),
        score,
        interactions: parseInt(data.interactions ?? '0', 10) || 0,
        lastInteractionAt: parseInt(data.lastInteractionAt ?? '0', 10) || 0,
        level: GrowthService.bondLevel(score),
      });
    }
    return bonds.sort((a, b) => b.score - a.score);
  }

  static readonly CO_CREATOR_ID = CO_CREATOR_ACTOR_ID;

  /** Build full journey profile for a cat or the co-creator. */
  async getProfile(catId: string): Promise<CatGrowthProfile | null> {
    if (isCoCreatorActor(catId)) {
      return this.getCoCreatorProfile();
    }
    const entry = catRegistry.tryGet(catId);
    if (!entry) return null;
    const config = entry.config;

    const attributes = await this.getAttributes(catId);
    const currentTitle = await this.getCurrentTitle(catId);
    return {
      catId,
      displayName: config.displayName ?? config.id,
      nickname: config.nickname,
      attributes,
      currentTitle,
      highlights: [],
    };
  }

  /** AC-C6: Build journey profile for the co-creator (not in catRegistry). */
  private async getCoCreatorProfile(): Promise<CatGrowthProfile> {
    const attributes = await this.getAttributes(GrowthService.CO_CREATOR_ID);
    const currentTitle = await this.getCurrentTitle(GrowthService.CO_CREATOR_ID);
    return {
      catId: GrowthService.CO_CREATOR_ID,
      displayName: '铲屎官',
      nickname: 'CVO',
      attributes,
      currentTitle,
      highlights: [],
    };
  }

  /** Build team journey overview across all registered cats + co-creator. */
  async getOverview(): Promise<GrowthOverview> {
    const catIds = catRegistry.getAllIds().map(String);

    const profiles = await Promise.all(catIds.map((id) => this.getProfile(id)));
    const valid = profiles.filter((p): p is CatGrowthProfile => p !== null);

    // AC-C6: Include co-creator if they have any footfall
    const coCreatorProfile = await this.getCoCreatorProfile();
    if (coCreatorProfile.attributes.totalFootfall > 0) {
      valid.unshift(coCreatorProfile);
    }

    const teamTotalFootfall = valid.reduce((s, p) => s + p.attributes.totalFootfall, 0);
    const teamLevel =
      valid.length > 0 ? Math.floor(valid.reduce((s, p) => s + p.attributes.overallLevel, 0) / valid.length) : 0;

    return {
      profiles: valid,
      teamLevel,
      teamTotalFootfall,
      fetchedAt: new Date().toISOString(),
    };
  }
}
