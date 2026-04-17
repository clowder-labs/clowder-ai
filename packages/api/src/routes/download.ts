import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import {
  cancelDownload,
  checkAndUpdateProgress,
  clearDownloadTask,
  startDownload,
} from '../services/downloadService.js';

interface StartDownloadBody {
  taskId: string;
  url: string;
  fileName: string;
}

interface StatusQuery {
  taskId: string;
}

interface CancelBody {
  taskId: string;
}

interface ClearBody {
  taskId: string;
}

interface OpenQuery {
  taskId: string;
}

export async function downloadRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: StartDownloadBody }>('/api/download/start', async (request, reply) => {
    const { taskId, url, fileName } = request.body;

    if (!taskId || !url || !fileName) {
      return reply.status(400).send({ error: 'Missing required fields: taskId, url, fileName' });
    }

    const progress = startDownload(taskId, url, fileName);
    return progress;
  });

  app.get<{ Querystring: StatusQuery }>('/api/download/status', async (request, reply) => {
    const { taskId } = request.query;

    if (!taskId) {
      return reply.status(400).send({ error: 'Missing required query parameter: taskId' });
    }

    const progress = checkAndUpdateProgress(taskId);
    if (!progress) {
      return reply.status(404).send({ error: 'Download task not found' });
    }

    return progress;
  });

  app.get<{ Querystring: StatusQuery }>('/api/download/file', async (request, reply) => {
    const { taskId } = request.query;

    if (!taskId) {
      return reply.status(400).send({ error: 'Missing required query parameter: taskId' });
    }

    const progress = checkAndUpdateProgress(taskId);
    if (!progress || !progress.filePath) {
      return reply.status(404).send({ error: 'Download task not found or file not available' });
    }

    if (!existsSync(progress.filePath)) {
      return reply.status(404).send({ error: 'File not found' });
    }

    return reply
      .header('Content-Disposition', `attachment; filename="${progress.fileName}"`)
      .send(createReadStream(progress.filePath));
  });

  app.post<{ Querystring: OpenQuery }>('/api/download/open', async (request, reply) => {
    const { taskId } = request.query;

    if (!taskId) {
      return reply.status(400).send({ error: 'Missing required query parameter: taskId' });
    }

    const progress = checkAndUpdateProgress(taskId);
    if (!progress || !progress.filePath) {
      return reply.status(404).send({ error: 'Download task not found or file not available' });
    }

    if (!existsSync(progress.filePath)) {
      return reply.status(404).send({ error: 'File not found' });
    }

    try {
      spawn('cmd', ['/c', 'start', '', progress.filePath], { detached: true, stdio: 'ignore' });
      return { success: true };
    } catch {
      return reply.status(500).send({ error: 'Failed to open file' });
    }
  });

  app.post<{ Body: CancelBody }>('/api/download/cancel', async (request, reply) => {
    const { taskId } = request.body;

    if (!taskId) {
      return reply.status(400).send({ error: 'Missing required field: taskId' });
    }

    const cancelled = cancelDownload(taskId);
    if (!cancelled) {
      return reply.status(400).send({ error: 'Cannot cancel download: task not found or not downloading' });
    }

    return { success: true };
  });

  app.post<{ Body: ClearBody }>('/api/download/clear', async (request, reply) => {
    const { taskId } = request.body;

    if (!taskId) {
      return reply.status(400).send({ error: 'Missing required field: taskId' });
    }

    clearDownloadTask(taskId);
    return { success: true };
  });
}
