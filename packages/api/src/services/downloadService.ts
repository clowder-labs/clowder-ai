import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getVersionVerifyData } from '../routes/version.js';

function calculateFileSha256(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!existsSync(filePath)) {
      resolve(null);
      return;
    }

    const hash = createHash('sha256');
    const fileStream = createReadStream(filePath);

    fileStream.on('data', (chunk) => {
      hash.update(chunk);
    });

    fileStream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    fileStream.on('error', () => {
      resolve(null);
    });
  });
}

async function verifyFileIntegrity(filePath: string, expectedSha256: string): Promise<boolean> {
  const actualSha256 = await calculateFileSha256(filePath);
  if (!actualSha256) return false;
  return actualSha256.toLowerCase() === expectedSha256.toLowerCase();
}

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
  taskId: string;
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

function parseVersionFromTaskId(taskId: string): string | null {
  const match = taskId.match(/^version-(.+)$/);
  return match ? match[1] : null;
}

function buildFilePathFromVersion(version: string): string {
  const fileName = `OfficeClaw-V${version}.exe`;
  return join(getDownloadDir(), fileName);
}

export async function checkAndUpdateProgress(taskId: string): Promise<DownloadProgress | null> {
  const task = downloadTasks.get(taskId);

  if (task) {
    if (task.progress.status === 'downloading' || task.progress.status === 'error') {
      return task.progress;
    }

    if (task.progress.status === 'success') {
      if (task.progress.filePath && existsSync(task.progress.filePath)) {
        return task.progress;
      }
      task.progress.status = 'error';
      task.progress.errorMessage = 'File not found';
      task.progress.endTime = Date.now();
      return task.progress;
    }

    return task.progress;
  }

  const version = parseVersionFromTaskId(taskId);
  if (!version) return null;

  const filePath = buildFilePathFromVersion(version);
  if (!existsSync(filePath)) return null;

  const expectedSha256 = getVersionVerifyData(version);
  if (expectedSha256 && !(await verifyFileIntegrity(filePath, expectedSha256))) {
    try {
      unlinkSync(filePath);
    } catch {}
    return null;
  }

  const fileName = `OfficeClaw-V${version}.exe`;
  return {
    status: 'success',
    progress: 100,
    totalBytes: 0,
    receivedBytes: 0,
    fileName,
    filePath,
    errorMessage: null,
    startTime: null,
    endTime: Date.now(),
  };
}

export function startDownload(taskId: string, url: string, fileName: string): DownloadProgress {
  const existingTask = downloadTasks.get(taskId);
  if (existingTask && existingTask.progress.status === 'downloading') {
    return existingTask.progress;
  }

  const downloadDir = getDownloadDir();
  const filePath = join(downloadDir, fileName);

  const task: DownloadTask = {
    taskId,
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

    const version = parseVersionFromTaskId(task.taskId);
    if (version) {
      const expectedSha256 = getVersionVerifyData(version);
      if (expectedSha256 && !(await verifyFileIntegrity(filePath, expectedSha256))) {
        try {
          unlinkSync(filePath);
        } catch {}
        task.progress.status = 'error';
        task.progress.errorMessage = 'File integrity check failed: sha256 mismatch, file deleted';
        task.progress.endTime = Date.now();
        return;
      }
    }

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

export function cleanupIncompleteDownloads(): void {
  for (const [taskId, task] of downloadTasks.entries()) {
    if (task.progress.status !== 'success') {
      if (task.abortController) {
        task.abortController.abort();
      }
      if (task.progress.filePath && existsSync(task.progress.filePath)) {
        try {
          unlinkSync(task.progress.filePath);
        } catch {}
      }
      downloadTasks.delete(taskId);
    }
  }
}
