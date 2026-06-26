/**
 * F021/F202: Signals schedule factory.
 *
 * Signals owns one plugin schedule resource: schedule:signals:auto-fetch.
 * F202 handles plugin lifecycle; F139 handles cron execution. Source-level
 * frequency remains in sources.yaml and is selected by runSignalFetchScheduler().
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CapabilitiesConfig } from '@cat-cafe/shared';
import type { TaskSpec_P1 } from '../../infrastructure/scheduler/types.js';
import { loadSignalNotificationsSync } from '../signals/config/notifications-loader.js';
import type { SignalPaths } from '../signals/config/signal-paths.js';
import { resolveSignalPaths } from '../signals/config/signal-paths.js';
import type { SignalFetchSchedulerOptions, SignalFetchSchedulerSummary } from '../signals/services/fetch-scheduler.js';
import { runSignalFetchScheduler } from '../signals/services/fetch-scheduler.js';
import type { ScheduleFactory, ScheduleFactoryDeps, ScheduleFactoryRegistry } from './ScheduleFactoryRegistry.js';

export interface SignalsScheduleDeps extends ScheduleFactoryDeps {
  signalsPaths?: SignalPaths;
  getSignalGitHubApiToken?: () => string | undefined;
  runSignalFetchScheduler?: (options?: SignalFetchSchedulerOptions) => Promise<SignalFetchSchedulerSummary>;
}

interface SignalsAutoFetchSignal {
  readonly kind: 'signals:auto-fetch';
}

function asSignalsDeps(deps: ScheduleFactoryDeps): SignalsScheduleDeps {
  return deps as SignalsScheduleDeps;
}

function cronFromDailyDigest(dailyDigest: string): string {
  const [hour, minute] = dailyDigest.split(':').map((part) => Number.parseInt(part, 10));
  return `${minute} ${hour} * * *`;
}

function hasNotificationFailure(summary: SignalFetchSchedulerSummary): boolean {
  return summary.notifications?.email.status === 'error' || summary.notifications?.inApp.status === 'error';
}

function summarizeFailures(summary: SignalFetchSchedulerSummary): string {
  const fetchErrors = summary.errors.map((error) => `${error.sourceId}:${error.code}`);
  const notificationErrors: string[] = [];
  if (summary.notifications?.email.status === 'error') {
    notificationErrors.push(`email:${summary.notifications.email.error ?? 'unknown'}`);
  }
  if (summary.notifications?.inApp.status === 'error') {
    notificationErrors.push(`in-app:${summary.notifications.inApp.error ?? 'unknown'}`);
  }
  return [...fetchErrors, ...notificationErrors].join(', ');
}

const signalsAutoFetchFactory: ScheduleFactory = {
  pluginId: 'signals',
  factoryId: 'signals.auto-fetch',
  createTaskSpec(instanceId, deps) {
    const d = asSignalsDeps(deps);
    const paths = d.signalsPaths ?? resolveSignalPaths();
    const notifications = loadSignalNotificationsSync(paths);
    const schedule = notifications.notifications.schedule;
    const executeFetch = d.runSignalFetchScheduler ?? runSignalFetchScheduler;

    return {
      id: instanceId,
      profile: 'poller',
      trigger: {
        type: 'cron',
        expression: cronFromDailyDigest(schedule.daily_digest),
        timezone: schedule.timezone,
      },
      admission: {
        async gate() {
          return {
            run: true,
            workItems: [
              {
                signal: { kind: 'signals:auto-fetch' },
                subjectKey: 'signals:auto-fetch',
                dedupeKey: 'signals:auto-fetch',
              },
            ],
          };
        },
      },
      run: {
        overlap: 'skip',
        timeoutMs: 30 * 60_000,
        async execute(_signal: unknown) {
          const summary = await executeFetch({
            paths,
            getGitHubApiToken: d.getSignalGitHubApiToken,
          });

          d.log.info(
            '[signals] auto-fetch summary ' +
              [
                `processed=${summary.processedSources}`,
                `skipped=${summary.skippedSources}`,
                `new=${summary.newArticles}`,
                `stored=${summary.storedArticles}`,
                `duplicates=${summary.duplicateArticles}`,
                `errors=${summary.errors.length}`,
              ].join(' '),
          );

          if (summary.errors.length > 0 || hasNotificationFailure(summary)) {
            throw new Error(`[signals] auto-fetch failed: ${summarizeFailures(summary)}`);
          }
        },
      },
      state: { runLedger: 'sqlite' },
      outcome: { whenNoSignal: 'record' },
      enabled: () => true,
      display: {
        label: 'Signals auto-fetch',
        category: 'external',
        description: 'Fetches scheduled signal sources and publishes the daily digest.',
        subjectKind: 'external',
      },
    } satisfies TaskSpec_P1<SignalsAutoFetchSignal>;
  },
};

export function registerSignalsScheduleFactories(registry: ScheduleFactoryRegistry): void {
  registry.register(signalsAutoFetchFactory);
}

export const signalsScheduleFactories = [signalsAutoFetchFactory] as const;

const MIGRATION_MARKER_PATH = '.cat-cafe/f021-signals-schedule-migrated';

export interface SignalsMigrationScheduleEntry {
  id: string;
  type: 'schedule';
  enabled: boolean;
  source: 'cat-cafe';
  pluginId: 'signals';
  scheduleTaskId: string;
}

export function shouldRunSignalsScheduleMigration(
  projectRoot: string,
  existingCaps: CapabilitiesConfig | null,
): boolean {
  const hasAnySignalsSchedule = existingCaps?.capabilities.some(
    (cap) => cap.type === 'schedule' && cap.pluginId === 'signals',
  );
  if (hasAnySignalsSchedule) return false;

  return !existsSync(join(projectRoot, MIGRATION_MARKER_PATH));
}

export function markSignalsScheduleMigrationDone(projectRoot: string): void {
  const markerPath = join(projectRoot, MIGRATION_MARKER_PATH);
  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, new Date().toISOString());
}

function buildSignalsMigrationEntry(resourceName: string): SignalsMigrationScheduleEntry {
  return {
    id: `plugin:signals:${resourceName}`,
    type: 'schedule',
    enabled: true,
    source: 'cat-cafe',
    pluginId: 'signals',
    scheduleTaskId: `schedule:signals:${resourceName}`,
  };
}

export function buildSignalsMigrationEntries(manifest: {
  resources: { type: string; name?: string }[];
}): SignalsMigrationScheduleEntry[] {
  return manifest.resources.flatMap((resource) => {
    if (resource.type !== 'schedule' || !resource.name) return [];
    return [buildSignalsMigrationEntry(resource.name)];
  });
}
