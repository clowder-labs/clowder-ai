/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F130: Centralized Pino Logger — stdout + pino-roll dual-write with redaction.
 *
 * KD-1: Self-built Pino instance passed to Fastify — usable outside Fastify too.
 * KD-5: Redaction ships with Phase A (logging to disk = copying leak surface).
 *
 * Usage:
 *   import { logger } from '../infrastructure/logger.js';
 *   logger.info({ threadId, catId }, 'Cat invoked');
 */

import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { format as utilFormat } from 'node:util';
import pino from 'pino';

const require = createRequire(import.meta.url);

/**
 * --debug CLI flag: `node dist/index.js --debug` sets log level to 'debug'.
 * Precedence: --debug flag > LOG_LEVEL env var > default 'info'.
 */
export const isDebugMode = process.argv.includes('--debug');
const LOG_LEVEL = (isDebugMode ? 'debug' : (process.env.LOG_LEVEL ?? 'info')) as pino.Level;
import { findMonorepoRoot } from '../utils/monorepo-root.js';
const LOG_DIR = resolve(findMonorepoRoot(), 'data', 'logs', 'api');
const RETENTION_FILES = 14;

/**
 * Pino redaction paths — masks values at these JSON paths.
 * Uses fast-redact: compiled once at creation, zero per-log overhead.
 */
const REDACT_PATHS = [
  // === HTTP Headers ===
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.headers["x-callback-token"]',
  'req.headers["x-office-claw-hook-token"]',
  'req.headers["x-access-key"]',
  'req.headers["x-acs-dingtalk-access-token"]',
  'req.headers["x-goog-api-key"]',
  'req.headers["x-sign"]',
  // === Top-level fields ===
  'authorization',
  'cookie',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'password',
  'credential',
  'credentials',
  'callbackToken',
  'hookToken',
  'accessToken',
  'sk',
  'appSecret',
  'privateKey',
  'userId',
  'CAT_CAFE_USER_ID',
  // === Environment variables ===
  'OFFICE_CLAW_CALLBACK_TOKEN',
  'OFFICE_CLAW_ANTHROPIC_API_KEY',
  'OFFICE_CLAW_HOOK_TOKEN',
  'AOM_TOKEN',
  'GITHUB_TOKEN',
  'DINGTALK_APP_SECRET',
  'WEIXIN_BOT_TOKEN',
  'WECOM_BOT_SECRET',
  'WECOM_AGENT_SECRET',
  'WECOM_TOKEN',
  'WECOM_ENCODING_AES_KEY',
  'VAPID_PRIVATE_KEY',
  'F102_API_KEY',
];

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

const transport = pino.transport({
  targets: [
    {
      target: 'pino/file',
      options: { destination: 1 },
      level: LOG_LEVEL,
    },
    {
      target: require.resolve('pino-roll'),
      options: {
        file: resolve(LOG_DIR, 'api.log'),
        frequency: 'daily',
        dateFormat: 'yyyy-MM-dd',
        limit: { count: RETENTION_FILES },
        mkdir: true,
      },
      level: LOG_LEVEL,
    },
  ],
});

export const logger = pino(
  {
    level: LOG_LEVEL,
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
  },
  transport,
);

export function createModuleLogger(module: string): pino.Logger {
  return logger.child({ module });
}

export const LOG_DIR_PATH = LOG_DIR;

/**
 * KD-7: Redirect unmigrated console.* to stderr so process-layer `2>>`
 * captures them alongside tsx watch output and crash dumps.
 *
 * Why: macOS bash `tee` pipelines create orphan processes that
 * `kill $(jobs -p)` cannot clean up. Using `2>>` for process-layer
 * capture is the only orphan-free approach, but it only captures stderr.
 * This monkey-patch bridges the gap until Phase B migrates all console.*
 * to the Pino logger.
 */
const stderrWrite = (prefix: string, args: unknown[]) => {
  process.stderr.write(`[console.${prefix}] ${utilFormat(...args)}\n`);
};

const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

console.log = (...args: unknown[]) => {
  stderrWrite('log', args);
  origLog.apply(console, args);
};
console.warn = (...args: unknown[]) => {
  stderrWrite('warn', args);
  origWarn.apply(console, args);
};
console.error = (...args: unknown[]) => {
  stderrWrite('error', args);
  origError.apply(console, args);
};
