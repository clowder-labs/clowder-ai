/**
 * CLI Parser Utilities
 * CLI 子进程解析工具导出
 */

export { formatCliExitError } from './cli/cli-format.js';
export type { CliSpawnerDeps } from './cli/cli-spawn.js';
export { isCliError, KILL_GRACE_MS, spawnCli } from './cli/cli-spawn.js';
export type {
  ChildProcessLike,
  CliSpawnOptions,
  CliTransformer,
  SpawnFn,
} from './cli/cli-types.js';
export { isParseError, parseNDJSON } from './parsing/ndjson-parser.js';
export { normalizeErrorMessage } from './parsing/normalize-error.js';
export { isUnderAllowedRoot, validateProjectPath } from './paths/project-path.js';
