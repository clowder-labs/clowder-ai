import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type DownloadStatus = 'idle' | 'downloading' | 'success' | 'error' | 'cancelled';

export interface DownloadProgress {
  status: DownloadStatus;
  progress: number;
  totalBytes: number;
  receivedBytes: number;
  fileName: string;
  filePath: string | null;
  errorMessage: string | null;
  startTime: number | null;
  endTime: number | null;
}

interface DownloadTask {
  url: string;
  fileName: string;
  abortController: AbortController | null;
  progress: DownloadProgress;
}

const downloadTasks = new Map<string, DownloadTask>();

function getDownloadDir(): string {
  const downloadDir = join(tmpdir(), 'office-claw-downloads');
  if (!existsSync(downloadDir)) {
    mkdirSync(downloadDir, { recursive: true });
  }
  return downloadDir;
}

export function getDownloadProgress(taskId: string): DownloadProgress | null {
  const task = downloadTasks.get(taskId);
  if (!task) return null;
  return task.progress;
}

export function startDownload(taskId: string, url: string, fileName: string): DownloadProgress {
  const existingTask = downloadTasks.get(taskId);
  if (existingTask && existingTask.progress.status === 'downloading') {
    return existingTask.progress;
  }

  const downloadDir = getDownloadDir();
  const filePath = join(downloadDir, fileName);

  const task: DownloadTask = {
    url,
    fileName,
    abortController: new AbortController(),
    progress: {
      status: 'downloading',
      progress: 0,
      totalBytes: 0,
      receivedBytes: 0,
      fileName,
      filePath,
      errorMessage: null,
      startTime: Date.now(),
      endTime: null,
    },
  };

  downloadTasks.set(taskId, task);

  runDownload(task, filePath).catch(console.error);

  return task.progress;
}

async function runDownload(task: DownloadTask, filePath: string): Promise<void> {
  try {
    const response = await fetch(task.url, { signal: task.abortController?.signal });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
    task.progress.totalBytes = totalBytes;

    if (!response.body) {
      throw new Error('No response body');
    }

    const fileStream = createWriteStream(filePath);
    let receivedBytes = 0;

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      fileStream.write(value);
      receivedBytes += value.length;
      task.progress.receivedBytes = receivedBytes;
      if (totalBytes > 0) {
        task.progress.progress = Math.round((receivedBytes / totalBytes) * 100);
      }
    }

    fileStream.end();

    task.progress.status = 'success';
    task.progress.progress = 100;
    task.progress.endTime = Date.now();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      task.progress.status = 'cancelled';
      task.progress.endTime = Date.now();
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        } catch {}
      }
    } else {
      task.progress.status = 'error';
      task.progress.errorMessage = error instanceof Error ? error.message : 'Download failed';
      task.progress.endTime = Date.now();
    }
  }
}

export function cancelDownload(taskId: string): boolean {
  const task = downloadTasks.get(taskId);
  if (!task || task.progress.status !== 'downloading') {
    return false;
  }

  if (task.abortController) {
    task.abortController.abort();
  }

  return true;
}

export function clearDownloadTask(taskId: string): void {
  const task = downloadTasks.get(taskId);
  if (task?.progress.filePath && existsSync(task.progress.filePath)) {
    try {
      unlinkSync(task.progress.filePath);
    } catch {}
  }
  downloadTasks.delete(taskId);
}
