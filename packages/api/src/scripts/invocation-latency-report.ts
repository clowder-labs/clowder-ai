import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMonorepoRoot } from '../utils/monorepo-root.js';

export interface InvocationLatencyReportArgs {
  readonly logPath: string;
  readonly invocationId?: string;
  readonly catId?: string;
  readonly limit: number;
  readonly json: boolean;
  readonly help: boolean;
}

export interface InvocationLatencyCheckpointRecord {
  readonly latencyStage: string;
  readonly stageAt: number;
  readonly parentInvocationId?: string;
  readonly invocationId?: string;
  readonly threadId?: string;
  readonly userId?: string;
  readonly catId?: string;
  readonly sessionId?: string;
  readonly outcome?: string;
  readonly clientSentAt?: number;
  readonly serverReceivedAt?: number;
  readonly officeReceivedAt?: number;
  readonly agentForwardedAt?: number;
  readonly agentFirstReplyAt?: number;
}

export interface InvocationLatencySummary {
  parentInvocationId: string;
  catId?: string;
  invocationId?: string;
  threadId?: string;
  userId?: string;
  sessionId?: string;
  outcome?: string;
  clientSentAt?: number;
  serverReceivedAt?: number;
  officeReceivedAt?: number;
  agentForwardedAt?: number;
  agentFirstReplyAt?: number;
  agentReplyCompletedAt?: number;
}

export interface InvocationLatencyReportIo {
  log(message: string): void;
  error(message: string): void;
}

const USAGE_LINES = [
  'Usage: pnpm --filter @cat-cafe/api latency-report -- [options]',
  '',
  'Options:',
  '  --invocation <id>  filter by parent invocation id',
  '  --cat <catId>      filter by cat id',
  '  --limit <n>        limit output rows (default: 20)',
  '  --log <path>       read a specific api.log file',
  '  --json             emit JSON instead of one-line summaries',
  '  --help             print this help',
];

function defaultLogPath(): string {
  return join(findMonorepoRoot(process.cwd()), 'data', 'logs', 'api', 'api.log');
}

function asPositiveInt(raw: string, flag: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flag} requires a positive integer`);
  }
  return value;
}

export function parseInvocationLatencyReportArgs(
  argv: readonly string[],
  cwd = process.cwd(),
): InvocationLatencyReportArgs {
  let invocationId: string | undefined;
  let catId: string | undefined;
  let limit = 20;
  let logPath = join(findMonorepoRoot(cwd), 'data', 'logs', 'api', 'api.log');
  let json = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--invocation') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--invocation requires a value');
      invocationId = value;
      i += 1;
      continue;
    }
    if (arg === '--cat') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--cat requires a value');
      catId = value;
      i += 1;
      continue;
    }
    if (arg === '--limit') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--limit requires a value');
      limit = asPositiveInt(value, '--limit');
      i += 1;
      continue;
    }
    if (arg === '--log') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--log requires a value');
      logPath = resolve(cwd, value);
      i += 1;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return {
    logPath,
    ...(invocationId ? { invocationId } : {}),
    ...(catId ? { catId } : {}),
    limit,
    json,
    help,
  };
}

function usage(): string {
  return USAGE_LINES.join('\n');
}

function pickMin(current: number | undefined, next: number | undefined): number | undefined {
  if (typeof next !== 'number') return current;
  if (typeof current !== 'number') return next;
  return Math.min(current, next);
}

function pickMax(current: number | undefined, next: number | undefined): number | undefined {
  if (typeof next !== 'number') return current;
  if (typeof current !== 'number') return next;
  return Math.max(current, next);
}

function parseLatencyCheckpointLine(line: string): InvocationLatencyCheckpointRecord | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.latencyStage !== 'string' || typeof record.stageAt !== 'number') return null;

  const readString = (key: string): string | undefined =>
    typeof record[key] === 'string' && (record[key] as string).trim() ? (record[key] as string) : undefined;
  const readNumber = (key: string): number | undefined =>
    typeof record[key] === 'number' && Number.isFinite(record[key]) ? (record[key] as number) : undefined;

  return {
    latencyStage: record.latencyStage,
    stageAt: record.stageAt,
    ...(readString('parentInvocationId') ? { parentInvocationId: readString('parentInvocationId') } : {}),
    ...(readString('invocationId') ? { invocationId: readString('invocationId') } : {}),
    ...(readString('threadId') ? { threadId: readString('threadId') } : {}),
    ...(readString('userId') ? { userId: readString('userId') } : {}),
    ...(readString('catId') ? { catId: readString('catId') } : {}),
    ...(readString('sessionId') ? { sessionId: readString('sessionId') } : {}),
    ...(readString('outcome') ? { outcome: readString('outcome') } : {}),
    ...(readNumber('clientSentAt') !== undefined ? { clientSentAt: readNumber('clientSentAt') } : {}),
    ...(readNumber('serverReceivedAt') !== undefined ? { serverReceivedAt: readNumber('serverReceivedAt') } : {}),
    ...(readNumber('officeReceivedAt') !== undefined ? { officeReceivedAt: readNumber('officeReceivedAt') } : {}),
    ...(readNumber('agentForwardedAt') !== undefined ? { agentForwardedAt: readNumber('agentForwardedAt') } : {}),
    ...(readNumber('agentFirstReplyAt') !== undefined ? { agentFirstReplyAt: readNumber('agentFirstReplyAt') } : {}),
  };
}

function mergeSharedFields(
  target: {
    invocationId?: string;
    threadId?: string;
    userId?: string;
    sessionId?: string;
    outcome?: string;
    clientSentAt?: number;
    serverReceivedAt?: number;
    officeReceivedAt?: number;
  },
  record: InvocationLatencyCheckpointRecord,
): void {
  if (!target.invocationId && record.invocationId) target.invocationId = record.invocationId;
  if (!target.threadId && record.threadId) target.threadId = record.threadId;
  if (!target.userId && record.userId) target.userId = record.userId;
  if (!target.sessionId && record.sessionId) target.sessionId = record.sessionId;
  if (record.outcome) target.outcome = record.outcome;
  target.clientSentAt = pickMin(target.clientSentAt, record.clientSentAt);
  target.serverReceivedAt = pickMin(target.serverReceivedAt, record.serverReceivedAt);
  target.officeReceivedAt = pickMin(target.officeReceivedAt, record.officeReceivedAt);
}

export function summarizeInvocationLatencyCheckpoints(
  records: readonly InvocationLatencyCheckpointRecord[],
): InvocationLatencySummary[] {
  const globals = new Map<string, Omit<InvocationLatencySummary, 'parentInvocationId'>>();
  const cats = new Map<string, InvocationLatencySummary>();

  const globalFor = (parentInvocationId: string) => {
    let current = globals.get(parentInvocationId);
    if (!current) {
      current = {};
      globals.set(parentInvocationId, current);
    }
    return current;
  };

  for (const record of records) {
    const parentInvocationId = record.parentInvocationId ?? record.invocationId;
    if (!parentInvocationId) continue;

    const global = globalFor(parentInvocationId);
    mergeSharedFields(global, record);

    if (record.latencyStage === 'agent_forwarded' || record.latencyStage === 'agent_first_reply' || record.latencyStage === 'agent_reply_completed') {
      const catId = record.catId ?? 'unknown';
      const key = `${parentInvocationId}::${catId}`;
      let summary = cats.get(key);
      if (!summary) {
        summary = { parentInvocationId, catId };
        cats.set(key, summary);
      }
      mergeSharedFields(summary, record);

      if (record.latencyStage === 'agent_forwarded') {
        summary.agentForwardedAt = pickMin(summary.agentForwardedAt, record.stageAt);
      }
      if (record.latencyStage === 'agent_first_reply') {
        summary.agentFirstReplyAt = pickMin(summary.agentFirstReplyAt, record.stageAt);
      }
      if (record.latencyStage === 'agent_reply_completed') {
        summary.agentReplyCompletedAt = pickMax(summary.agentReplyCompletedAt, record.stageAt);
      }
    }
  }

  const rows: InvocationLatencySummary[] = [];

  for (const [, summary] of cats) {
    const parentInvocationId = summary.parentInvocationId;
    const global = globals.get(parentInvocationId) ?? {};
    rows.push({
      ...global,
      ...summary,
      parentInvocationId,
      clientSentAt: pickMin(summary.clientSentAt, global.clientSentAt),
      serverReceivedAt: pickMin(summary.serverReceivedAt, global.serverReceivedAt),
      officeReceivedAt: pickMin(summary.officeReceivedAt, global.officeReceivedAt),
    });
  }

  for (const [parentInvocationId, global] of globals) {
    const hasCatRow = rows.some((row) => row.parentInvocationId === parentInvocationId);
    if (hasCatRow) continue;
    rows.push({
      parentInvocationId,
      ...global,
    });
  }

  rows.sort((a, b) => {
    const aTime =
      a.agentReplyCompletedAt ??
      a.agentFirstReplyAt ??
      a.agentForwardedAt ??
      a.officeReceivedAt ??
      a.serverReceivedAt ??
      a.clientSentAt ??
      0;
    const bTime =
      b.agentReplyCompletedAt ??
      b.agentFirstReplyAt ??
      b.agentForwardedAt ??
      b.officeReceivedAt ??
      b.serverReceivedAt ??
      b.clientSentAt ??
      0;
    return bTime - aTime;
  });

  return rows;
}

function formatTimestamp(value?: number): string {
  if (typeof value !== 'number') return '-';
  return new Date(value).toISOString();
}

function formatDuration(value?: number): string {
  return typeof value === 'number' ? `${value}ms` : '-';
}

function delta(from?: number, to?: number): number | undefined {
  if (typeof from !== 'number' || typeof to !== 'number') return undefined;
  return to - from;
}

export function formatInvocationLatencySummary(summary: InvocationLatencySummary): string {
  return [
    `invocation=${summary.parentInvocationId}`,
    `cat=${summary.catId ?? '-'}`,
    `outcome=${summary.outcome ?? '-'}`,
    `thread=${summary.threadId ?? '-'}`,
    `session=${summary.sessionId ?? '-'}`,
    `clientSentAt=${formatTimestamp(summary.clientSentAt)}`,
    `serverReceivedAt=${formatTimestamp(summary.serverReceivedAt)}`,
    `officeReceivedAt=${formatTimestamp(summary.officeReceivedAt)}`,
    `agentForwardedAt=${formatTimestamp(summary.agentForwardedAt)}`,
    `agentFirstReplyAt=${formatTimestamp(summary.agentFirstReplyAt)}`,
    `agentReplyCompletedAt=${formatTimestamp(summary.agentReplyCompletedAt)}`,
    `clientToServer=${formatDuration(delta(summary.clientSentAt, summary.serverReceivedAt))}`,
    `serverToOffice=${formatDuration(delta(summary.serverReceivedAt, summary.officeReceivedAt))}`,
    `officeToForward=${formatDuration(delta(summary.officeReceivedAt, summary.agentForwardedAt))}`,
    `forwardToFirstReply=${formatDuration(delta(summary.agentForwardedAt, summary.agentFirstReplyAt))}`,
    `firstReplyToCompleted=${formatDuration(delta(summary.agentFirstReplyAt, summary.agentReplyCompletedAt))}`,
    `forwardToCompleted=${formatDuration(delta(summary.agentForwardedAt, summary.agentReplyCompletedAt))}`,
    `serverToCompleted=${formatDuration(delta(summary.serverReceivedAt, summary.agentReplyCompletedAt))}`,
    `clientToCompleted=${formatDuration(delta(summary.clientSentAt, summary.agentReplyCompletedAt))}`,
  ].join(' ');
}

export function readInvocationLatencyCheckpoints(logPath: string): InvocationLatencyCheckpointRecord[] {
  if (!existsSync(logPath)) return [];
  const content = readFileSync(logPath, 'utf-8');
  return content
    .split(/\r?\n/)
    .map((line) => parseLatencyCheckpointLine(line))
    .filter((record): record is InvocationLatencyCheckpointRecord => record !== null);
}

export async function runInvocationLatencyReportCli(
  argv: readonly string[] = process.argv.slice(2),
  io: InvocationLatencyReportIo = console,
): Promise<number> {
  let args: InvocationLatencyReportArgs;
  try {
    args = parseInvocationLatencyReportArgs(argv);
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    io.error('');
    io.error(usage());
    return 1;
  }

  if (args.help) {
    io.log(usage());
    return 0;
  }

  const checkpointRecords = readInvocationLatencyCheckpoints(args.logPath);
  const summaries = summarizeInvocationLatencyCheckpoints(checkpointRecords)
    .filter((summary) => (args.invocationId ? summary.parentInvocationId === args.invocationId : true))
    .filter((summary) => (args.catId ? summary.catId === args.catId : true))
    .slice(0, args.limit);

  if (!existsSync(args.logPath)) {
    io.error(`[latency-report] log file not found: ${args.logPath}`);
    return 1;
  }

  if (summaries.length === 0) {
    io.log(
      `[latency-report] no matching checkpoints in ${args.logPath}${args.invocationId ? ` for invocation=${args.invocationId}` : ''}`,
    );
    return 0;
  }

  if (args.json) {
    io.log(JSON.stringify(summaries, null, 2));
  } else {
    for (const summary of summaries) {
      io.log(formatInvocationLatencySummary(summary));
    }
  }

  return 0;
}

async function main(): Promise<void> {
  const code = await runInvocationLatencyReportCli(process.argv.slice(2), console);
  if (code !== 0) {
    process.exitCode = code;
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath.length > 0 && entryPath === fileURLToPath(import.meta.url)) {
  main();
}

export const INVOCATION_LATENCY_DEFAULT_LOG_PATH = defaultLogPath();
