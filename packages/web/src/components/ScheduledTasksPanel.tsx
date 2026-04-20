'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { AppModal } from './AppModal';
import { formatCronFrequency } from './scheduled-task-frequency';
import { EmptyDataState } from './shared/EmptyDataState';
import { OverflowTooltip } from './shared/OverflowTooltip';

type ScheduledTasksPanelProps = {
  onCreateTask?: () => void;
};

type ScheduleTrigger =
  | { type: 'interval'; ms: number }
  | { type: 'cron'; expression: string; timezone?: string }
  | { type: 'once'; fireAt: number };

type ScheduleTaskSummaryResponse = {
  tasks: Array<{
    id: string;
    dynamicTaskId?: string;
    deliveryThreadId?: string | null;
    threadTitle?: string | null;
    source: 'builtin' | 'dynamic';
    trigger: ScheduleTrigger;
    enabled: boolean;
    effectiveEnabled: boolean;
    display?: {
      label?: string;
      description?: string;
    };
    lastRun: {
      started_at: string;
      subject_key: string;
    } | null;
    subjectPreview: string | null;
  }>;
};

type ScheduleControlResponse = {
  global?: {
    enabled?: boolean;
  };
  overrides?: Array<{
    taskId: string;
    enabled: boolean;
  }>;
};

type ScheduledTaskItem = {
  taskId: string;
  dynamicTaskId?: string;
  source: 'builtin' | 'dynamic';
  taskName: string;
  prompt: string;
  frequency: string;
  nextExcuteTime: string;
  effectiveTime: string;
  status: string;
  enabled: boolean;
  createTime: string;
  sessionName: string;
};

type ScheduleControlSnapshot = {
  globalEnabled: boolean;
  overrideEnabledByTaskId: Map<string, boolean>;
};
const TASK_TIME_ICON = '/icons/time-time.svg';

function formatFrequency(trigger: ScheduleTrigger): string {
  if (trigger.type === 'interval') {
    const minutes = Math.max(1, Math.round(trigger.ms / 60000));
    return `每隔 ${minutes} 分钟`;
  }
  if (trigger.type === 'once') {
    const date = new Date(trigger.fireAt);
    return date.toLocaleString('zh-CN');
  }
  if (trigger.type === 'cron') {
    return formatCronFrequency(trigger.expression);
  }
  return `任务类型: ${(trigger as any).type || '未知'}`;
}

function extractThreadId(subjectKey: string | null | undefined): string | null {
  if (!subjectKey) return null;
  if (subjectKey.startsWith('thread-')) return subjectKey.slice(7);
  if (subjectKey.startsWith('thread:')) return subjectKey.slice(7);
  return null;
}

function computeEffectiveEnabled(
  task: ScheduleTaskSummaryResponse['tasks'][number],
  control?: ScheduleControlSnapshot,
): boolean {
  if (!control) return task.effectiveEnabled;
  if (!task.enabled) return false;
  if (!control.globalEnabled) return false;
  const overrideEnabled = control.overrideEnabledByTaskId.get(task.id);
  if (overrideEnabled === false) return false;
  return true;
}

function toViewTask(
  task: ScheduleTaskSummaryResponse['tasks'][number],
  control?: ScheduleControlSnapshot,
): ScheduledTaskItem {
  const id = task.dynamicTaskId ?? task.id;
  const threadId = task.deliveryThreadId ?? extractThreadId(task.lastRun?.subject_key);
  const threadName = task.threadTitle?.trim() || threadId || '-';
  const effectiveEnabled = computeEffectiveEnabled(task, control);
  const isOnce = task.trigger.type === 'once';
  const fireAtTime = isOnce ? (task.trigger as { type: 'once'; fireAt: number }).fireAt : null;
  return {
    taskId: id,
    dynamicTaskId: task.dynamicTaskId,
    source: task.source,
    taskName: task.display?.label?.trim() || task.id,
    prompt: task.display?.description?.trim() || '暂无描述',
    frequency: formatFrequency(task.trigger),
    nextExcuteTime: '-',
    effectiveTime: isOnce && fireAtTime ? new Date(fireAtTime).toLocaleString('zh-CN') : '长期有效',
    status: effectiveEnabled ? 'running' : 'paused',
    enabled: effectiveEnabled,
    createTime: task.lastRun?.started_at ?? '',
    sessionName: threadName,
  };
}

export function ScheduledTasksPanel({ onCreateTask }: ScheduledTasksPanelProps) {
  const [tasks, setTasks] = useState<ScheduledTaskItem[]>([]);
  const [selectedTask, setSelectedTask] = useState<ScheduledTaskItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [togglingTaskIds, setTogglingTaskIds] = useState<Set<string>>(new Set());
  const [deleteTargetTask, setDeleteTargetTask] = useState<ScheduledTaskItem | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const [tasksRes, controlRes] = await Promise.all([
          apiFetch('/api/schedule/tasks'),
          apiFetch('/api/schedule/control'),
        ]);
        if (!tasksRes.ok) return;
        const data = (await tasksRes.json()) as ScheduleTaskSummaryResponse;

        let controlSnapshot: ScheduleControlSnapshot | undefined;
        if (controlRes.ok) {
          const control = (await controlRes.json()) as ScheduleControlResponse;
          controlSnapshot = {
            globalEnabled: control.global?.enabled ?? true,
            overrideEnabledByTaskId: new Map((control.overrides ?? []).map((item) => [item.taskId, item.enabled])),
          };
        }
        if (cancelled) return;
        setTasks((data.tasks ?? []).map((task) => toViewTask(task, controlSnapshot)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateTasks = () => {
    onCreateTask?.();
  };

  const handleToggleTask = async (task: ScheduledTaskItem) => {
    if (task.source !== 'dynamic') return;
    const apiTaskId = task.taskId;
    if (!apiTaskId) return;
    if (togglingTaskIds.has(task.taskId)) return;

    const nextEnabled = !task.enabled;
    setTogglingTaskIds((prev) => new Set(prev).add(task.taskId));
    setTasks((prev) => prev.map((item) => (item.taskId === task.taskId ? { ...item, enabled: nextEnabled } : item)));

    try {
      if (nextEnabled) {
        // Re-enable by removing governance override.
        const res = await apiFetch(`/api/schedule/control/tasks/${encodeURIComponent(apiTaskId)}`, {
          method: 'DELETE',
        });
        if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      } else {
        // Disable by setting governance override.
        const res = await apiFetch(`/api/schedule/control/tasks/${encodeURIComponent(apiTaskId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      setTasks((prev) => prev.map((item) => (item.taskId === task.taskId ? { ...item, enabled: task.enabled } : item)));
    } finally {
      setTogglingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(task.taskId);
        return next;
      });
    }
  };

  const handleDeleteTask = (task: ScheduledTaskItem) => {
    if (task.source !== 'dynamic') return;
    setDeleteTargetTask(task);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetTask) return;
    const apiTaskId = deleteTargetTask.dynamicTaskId ?? deleteTargetTask.taskId;
    if (!apiTaskId) return;

    setIsDeletingTask(true);
    try {
      const res = await apiFetch(`/api/schedule/tasks/${encodeURIComponent(apiTaskId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setTasks((prev) => prev.filter((task) => task.taskId !== deleteTargetTask.taskId));
      setSelectedTask((prev) => (prev?.taskId === deleteTargetTask.taskId ? null : prev));
      setDeleteTargetTask(null);
    } catch {
      // Keep dialog open on failure.
    } finally {
      setIsDeletingTask(false);
    }
  };

  const taskIconMaskStyle = {
    WebkitMaskImage: `url(${TASK_TIME_ICON})`,
    maskImage: `url(${TASK_TIME_ICON})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    backgroundColor: 'var(--text-muted)',
  } as const;

  return (
    <div className="flex min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="ui-page-title">定时任务</h1>
        <button
          type="button"
          onClick={handleCreateTasks}
          className="inline-flex h-[28px] min-h-[28px] items-center rounded-full border border-[#2C3340] bg-[#181B21] px-4 text-[12px] font-medium text-white"
        >
          创建定时任务
        </button>
      </div>

      <div className="ui-panel border-0 shadow-none">
        {isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="text-[12px] text-[var(--text-muted)]">加载中...</div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="text-center">
              <EmptyDataState title="暂无定时任务" />
              <p className="mt-2 text-[12px] text-[var(--text-muted)]">暂无数据，您可以点击创建按钮新增定时任务</p>
            </div>
          </div>
        ) : (
          <div className="px-1 pb-4">
            <div className="grid grid-cols-3 gap-x-4 gap-y-6">
              {tasks.map((task) => (
                <article
                  key={task.taskId}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedTask(task)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedTask(task);
                    }
                  }}
                  className="group h-[194px] cursor-pointer rounded-[16px] border border-[var(--card-border)] bg-[var(--card-bg)] p-6 transition-shadow hover:bg-[var(--card-hover-bg)] hover:shadow-[0_4px_16px_0_rgba(0,0,0,0.08)]"
                >
                  <div className="flex h-full flex-col gap-4">
                    <div className="flex h-[48px] items-center justify-between gap-3">
                      <div className="flex h-full min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-card-muted)]">
                          <img src={TASK_TIME_ICON} alt="" aria-hidden="true" className="h-6 w-6 shrink-0" />
                        </div>
                        <h3 className="line-clamp-1 min-w-0 text-[16px] font-semibold text-[var(--text-primary)]">{task.taskName}</h3>
                      </div>
                      {task.source === 'dynamic' ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={task.enabled}
                          aria-label={`${task.taskName}开关`}
                          onClick={async (event) => {
                            event.stopPropagation();
                            await handleToggleTask(task);
                          }}
                          disabled={togglingTaskIds.has(task.taskId)}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-60 ${
                            task.enabled ? 'bg-[var(--text-accent)]' : 'bg-[var(--border-default)]'
                          }`}
                        >
                          <span
                            className={`absolute left-1 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.25)] transition-transform duration-200 ease-out motion-reduce:transition-none ${
                              task.enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      ) : null}
                    </div>

                    <p className="line-clamp-2 h-[44px] text-[14px] leading-[22px] text-[var(--text-secondary)]">{task.prompt}</p>

                    <div className="h-[24px]">
                      <div className="flex items-center gap-1.5 text-[12px] leading-6 text-[var(--text-muted)] group-hover:hidden">
                        <span aria-hidden="true" className="h-4 w-4 shrink-0" style={taskIconMaskStyle} />
                        <span>{task.frequency}</span>
                      </div>
                      <div className="hidden group-hover:flex">
                        {task.source === 'dynamic' ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteTask(task);
                            }}
                            className="bg-transparent p-0 text-[14px] font-normal leading-6 text-[var(--text-accent)]"
                          >
                            删除
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            aria-disabled="true"
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                            className="cursor-not-allowed bg-transparent p-0 text-[14px] font-normal leading-6 text-[var(--text-disabled)]"
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>

      <AppModal
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        title={selectedTask?.taskName ?? '任务详情'}
        panelClassName="w-[520px] max-w-[92vw] rounded-[12px] border border-[#E6EAF0] bg-white"
        bodyClassName="pt-2 text-left"
      >
        {selectedTask ? (
          <div className="space-y-4 text-left text-[14px] text-[#4B5565]">
            <div className="flex items-start gap-6">
              <div className="w-[72px] shrink-0 text-[12px] leading-6 text-[#98A1AF]">执行频率</div>
              <div className="min-w-0 flex-1 leading-6">{selectedTask.frequency}</div>
            </div>
            <div className="flex items-start gap-6">
              <div className="w-[72px] shrink-0 text-[12px] leading-6 text-[#98A1AF]">生效时间</div>
              <div className="min-w-0 flex-1 leading-6">{selectedTask.effectiveTime}</div>
            </div>
            <div className="flex items-start gap-6">
              <div className="w-[72px] shrink-0 text-[12px] leading-6 text-[#98A1AF]">描述</div>
              <div className="min-w-0 flex-1">
                <OverflowTooltip content={selectedTask.prompt} className="inline-flex max-w-full align-top">
                  <div className="min-w-0 leading-6 line-clamp-2">{selectedTask.prompt}</div>
                </OverflowTooltip>
              </div>
            </div>
            <div className="flex items-start gap-6">
              <div className="w-[72px] shrink-0 text-[12px] leading-6 text-[#98A1AF]">执行会话</div>
              <div className="min-w-0 flex-1">
                <OverflowTooltip content={selectedTask.sessionName} className="inline-flex max-w-full align-top">
                  <div className="min-w-0 max-w-full truncate text-[14px] leading-6 text-[#2F3A4B]">
                    {selectedTask.sessionName}
                  </div>
                </OverflowTooltip>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button type="button" onClick={() => setSelectedTask(null)} className="ui-button-primary">
                确定
              </button>
            </div>
          </div>
        ) : null}
      </AppModal>

      <AppModal
        open={!!deleteTargetTask}
        onClose={() => {
          if (isDeletingTask) return;
          setDeleteTargetTask(null);
        }}
        disableBackdropClose={isDeletingTask}
        title={
          <div className="flex items-center gap-2">
            <svg className="h-6 w-6 text-[#FAAD14]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12.866 3.5a1 1 0 0 0-1.732 0l-8.25 14.5A1 1 0 0 0 3.75 19.5h16.5a1 1 0 0 0 .866-1.5l-8.25-14.5ZM12 8a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Zm0 9a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 12 17Z" />
            </svg>
            <h3 className="text-[16px] font-bold text-gray-900">确认删除任务</h3>
          </div>
        }
        panelClassName="w-[500px]"
        bodyClassName="pt-5"
      >
        <div className="flex flex-col gap-5">
          <div className="space-y-1">
            <p className="text-sm text-gray-600">删除后，该任务将不可恢复。</p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTargetTask(null)}
              disabled={isDeletingTask}
              className="ui-button-default"
            >
              取消
            </button>
            <button
              type="button"
              onClick={async () => {
                await handleDeleteConfirm();
              }}
              disabled={isDeletingTask}
              className="ui-button-primary"
            >
              {isDeletingTask ? '删除中...' : '删除'}
            </button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
