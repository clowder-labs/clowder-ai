/**
 * F160 Phase D — Co-Creator Leadership Service (铲屎官六维)
 *
 * Independent from cat trait dimensions. Tracks how effectively the co-creator
 * coordinates, delegates, explores, and guides their cat team.
 *
 * Redis keys:
 *   leadership:{dimension} → total footfall (INCRBY)
 *   leadership:audit       → sorted set of footfall events
 *   leadership:titles      → sorted set of unlocked titles
 *
 * Level formula: same quadratic curve as cat traits — level = floor(sqrt(footfall / 100))
 */

import type {
  CatTitle,
  LeadershipDimension,
  LeadershipFootfallSource,
  LeadershipProfile,
  LeadershipStat,
  LeadershipTitleCondition,
  LeadershipTitleDefinition,
  UnlockedTitle,
} from '@cat-cafe/shared';
import {
  CO_CREATOR_ACTOR_ID,
  LEADERSHIP_DIMENSIONS,
  LEADERSHIP_SHADOW_DIMS,
  LEADERSHIP_TITLE_DEFINITIONS,
} from '@cat-cafe/shared';
import type { RedisClient } from '@cat-cafe/shared/utils';
import { createModuleLogger } from '../../../../infrastructure/logger.js';
import { leadershipAuditKey, leadershipTitleKey, leadershipXpKey } from '../stores/redis-keys/growth-keys.js';

const log = createModuleLogger('leadership');

// ── Footfall Rules ──────────────────────────────────────────────

const LEADERSHIP_FOOTFALL_RULES: Record<
  LeadershipFootfallSource,
  { dimension: LeadershipDimension; footfall: number }
> = {
  multi_mention_dispatch: { dimension: 'coordination', footfall: 15 },
  multi_mention_success: { dimension: 'coordination', footfall: 25 },
  target_diversity: { dimension: 'coordination', footfall: 10 },
  task_no_intervention: { dimension: 'delegation', footfall: 20 },
  deep_collab_initiated: { dimension: 'delegation', footfall: 15 },
  tool_category_breadth: { dimension: 'exploration', footfall: 10 },
  new_skill_first_use: { dimension: 'exploration', footfall: 30 },
  feature_initiated: { dimension: 'exploration', footfall: 20 },
  one_shot_completion: { dimension: 'guidance', footfall: 25 },
  low_clarification: { dimension: 'guidance', footfall: 15 },
  direction_confirmed: { dimension: 'decision', footfall: 20 },
  direction_confirmed_explicit: { dimension: 'decision', footfall: 20 },
  feedback_applied: { dimension: 'feedback', footfall: 20 },
  clarification_observed: { dimension: 'decision', footfall: 1 },
};

// ── Level Math ───────────────────────────────────────────────────

function levelFromFootfall(footfall: number): number {
  return Math.floor(Math.sqrt(footfall / 100));
}

function footfallForLevel(level: number): number {
  return level * level * 100;
}

const shadowSet = new Set<string>(LEADERSHIP_SHADOW_DIMS);

function buildLeadershipStat(dimension: LeadershipDimension, footfall: number): LeadershipStat {
  const level = levelFromFootfall(footfall);
  return {
    dimension,
    footfall,
    level,
    footfallToNext: footfallForLevel(level + 1) - footfall,
    shadow: shadowSet.has(dimension),
  };
}

const RARITY_ORDER: Record<string, number> = { legendary: 4, epic: 3, rare: 2, common: 1 };

// ── Service ──────────────────────────────────────────────────────

export class LeadershipService {
  constructor(private readonly redis: RedisClient) {}

  /** Award leadership footfall. Fire-and-forget. */
  awardFootfall(source: LeadershipFootfallSource, multiplier = 1): void {
    const rule = LEADERSHIP_FOOTFALL_RULES[source];
    if (!rule) return;
    const amount = Math.max(1, Math.round(rule.footfall * multiplier));
    const key = leadershipXpKey(rule.dimension);
    const ts = Date.now();

    const pipeline = this.redis.pipeline();
    pipeline.incrby(key, amount);
    const event = { dimension: rule.dimension, footfall: amount, source, timestamp: ts };
    const member = JSON.stringify({ ...event, _seq: Math.random().toString(36).slice(2, 8) });
    pipeline.zadd(leadershipAuditKey(), ts, member);
    pipeline
      .exec()
      .then(() => {
        // AC-D4: Check title unlocks after footfall change (fire-and-forget)
        this.getProfile()
          .then((profile) => this.checkTitleUnlocks(profile))
          .catch((err: unknown) => log.warn({ err }, 'Leadership title check failed'));
      })
      .catch((err: unknown) => {
        log.warn({ err, source }, 'Failed to award leadership footfall');
      });
  }

  /** Read the full leadership profile snapshot (includes currentTitle). */
  async getProfile(): Promise<LeadershipProfile> {
    const keys = LEADERSHIP_DIMENSIONS.map((d) => leadershipXpKey(d));
    const values = await this.redis.mget(...keys);

    const stats = {} as Record<LeadershipDimension, LeadershipStat>;
    let totalFootfall = 0;
    let levelSum = 0;
    let activeDims = 0;

    for (let i = 0; i < LEADERSHIP_DIMENSIONS.length; i++) {
      const dim = LEADERSHIP_DIMENSIONS[i]!;
      const footfall = parseInt(values[i] ?? '0', 10) || 0;
      stats[dim] = buildLeadershipStat(dim, footfall);
      totalFootfall += footfall;
      if (!shadowSet.has(dim)) {
        levelSum += stats[dim].level;
        if (footfall > 0) activeDims++;
      }
    }

    const currentTitle = await this.getCurrentTitle();

    return {
      stats,
      leadershipLevel: activeDims > 0 ? Math.floor(levelSum / activeDims) : 0,
      totalFootfall,
      currentTitle,
      updatedAt: Date.now(),
    };
  }

  // ── Title System (AC-D4) ──────────────────────────────────────

  private conditionMet(cond: LeadershipTitleCondition, profile: LeadershipProfile): boolean {
    switch (cond.type) {
      case 'leadership_dim_level':
        return (profile.stats[cond.dimension]?.level ?? 0) >= cond.minLevel;
      case 'leadership_level':
        return profile.leadershipLevel >= cond.minLevel;
      case 'leadership_total_footfall':
        return profile.totalFootfall >= cond.minFootfall;
    }
  }

  async checkTitleUnlocks(profile: LeadershipProfile): Promise<UnlockedTitle[]> {
    const existing = await this.getUnlockedTitles();
    const existingIds = new Set(existing.map((t) => t.titleId));
    const newlyUnlocked: UnlockedTitle[] = [];

    for (const def of LEADERSHIP_TITLE_DEFINITIONS) {
      if (existingIds.has(def.id)) continue;
      if (!def.conditions.every((c) => this.conditionMet(c, profile))) continue;

      const ts = Date.now();
      // Use titleId as member — ZADD is idempotent per member, so concurrent
      // fire-and-forget calls cannot create duplicate unlock records.
      await this.redis.zadd(leadershipTitleKey(), ts, def.id);
      const unlock: UnlockedTitle = { titleId: def.id, catId: CO_CREATOR_ACTOR_ID, unlockedAt: ts };
      newlyUnlocked.push(unlock);
      log.info({ titleId: def.id }, 'Leadership title unlocked');
    }
    return newlyUnlocked;
  }

  async getUnlockedTitles(): Promise<UnlockedTitle[]> {
    // Members are titleId strings, scores are unlock timestamps
    const raw = await this.redis.zrevrange(leadershipTitleKey(), 0, -1, 'WITHSCORES');
    const titles: UnlockedTitle[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      titles.push({ titleId: raw[i]!, catId: CO_CREATOR_ACTOR_ID, unlockedAt: parseInt(raw[i + 1]!, 10) });
    }
    return titles;
  }

  async getCurrentTitle(): Promise<CatTitle | undefined> {
    const unlocked = await this.getUnlockedTitles();
    if (unlocked.length === 0) return undefined;

    const defMap = new Map<string, LeadershipTitleDefinition>();
    for (const d of LEADERSHIP_TITLE_DEFINITIONS) defMap.set(d.id, d);

    let best: { def: LeadershipTitleDefinition; unlock: UnlockedTitle } | undefined;
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

  /** Fetch recent leadership footfall events, newest first. */
  async getAuditLog(limit = 50, offset = 0): Promise<unknown[]> {
    const raw = await this.redis.zrevrange(leadershipAuditKey(), offset, offset + limit - 1);
    return raw.map((s) => JSON.parse(s));
  }
}
