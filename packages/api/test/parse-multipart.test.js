import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { parseMultipart } from '../dist/routes/parse-multipart.js';

test('parseMultipart drains file stream before waiting for remaining parts', async () => {
  const uploadDir = await mkdtemp(join(tmpdir(), 'cat-cafe-parse-multipart-'));
  let fileConsumed = false;
  let releaseIterator = false;

  const request = {
    parts: async function* () {
      yield { type: 'field', fieldname: 'content', value: 'hello with image' };

      yield {
        type: 'file',
        fieldname: 'images',
        filename: 'cat.png',
        mimetype: 'image/png',
        toBuffer: async () => {
          fileConsumed = true;
          return Buffer.from('fake-png');
        },
      };

      while (!fileConsumed && !releaseIterator) {
        await delay(5);
      }

      yield { type: 'field', fieldname: 'threadId', value: 'thread-test' };
    },
  };

  try {
    const parsed = await Promise.race([
      parseMultipart(request, uploadDir),
      (async () => {
        await delay(300);
        throw new Error('parseMultipart timed out waiting for file stream drain');
      })(),
    ]);

    assert.ok(!('error' in parsed), 'expected multipart parse success');
    assert.equal(parsed.threadId, 'thread-test');
    assert.equal(parsed.contentBlocks.length, 2);
    assert.equal(parsed.contentBlocks[0].type, 'text');
    assert.equal(parsed.contentBlocks[1].type, 'image');
  } finally {
    releaseIterator = true;
    await rm(uploadDir, { recursive: true, force: true });
  }
});

test('parseMultipart returns file contentBlocks for attachments', async () => {
  const uploadDir = await mkdtemp(join(tmpdir(), 'cat-cafe-parse-multipart-files-'));

  const request = {
    parts: async function* () {
      yield { type: 'field', fieldname: 'content', value: 'hello with file' };
      yield {
        type: 'file',
        fieldname: 'attachments',
        filename: 'report.pdf',
        mimetype: 'application/pdf',
        toBuffer: async () => Buffer.from('fake-pdf'),
      };
    },
  };

  try {
    const parsed = await parseMultipart(request, uploadDir);
    assert.ok(!('error' in parsed), 'expected multipart parse success');
    assert.equal(parsed.contentBlocks.length, 2);
    assert.equal(parsed.contentBlocks[0].type, 'text');
    assert.equal(parsed.contentBlocks[1].type, 'file');
    assert.equal(parsed.contentBlocks[1].fileName, 'report.pdf');
    assert.equal(parsed.contentBlocks[1].mimeType, 'application/pdf');
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
  }
});

test('parseMultipart stores attachments in the resolved workspace target when available', async () => {
  const uploadDir = await mkdtemp(join(tmpdir(), 'cat-cafe-parse-multipart-workspace-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'cat-cafe-parse-workspace-root-'));

  const request = {
    parts: async function* () {
      yield { type: 'field', fieldname: 'content', value: 'hello workspace file' };
      yield { type: 'field', fieldname: 'threadId', value: 'thread-workspace' };
      yield {
        type: 'file',
        fieldname: 'attachments',
        filename: 'report.pdf',
        mimetype: 'application/pdf',
        toBuffer: async () => Buffer.from('fake-pdf'),
      };
      yield {
        type: 'file',
        fieldname: 'images',
        filename: 'photo.png',
        mimetype: 'image/png',
        toBuffer: async () => Buffer.from('fake-png'),
      };
    },
  };

  try {
    const parsed = await parseMultipart(request, uploadDir, async (threadId) => ({
      kind: 'workspace',
      worktreeId: 'workspace_test_123',
      workspaceRoot,
      directoryPath: `.cat-cafe/chat-uploads/${threadId}`,
    }));

    assert.ok(!('error' in parsed), 'expected multipart parse success');
    assert.equal(parsed.threadId, 'thread-workspace');
    assert.equal(parsed.contentBlocks.length, 3);

    const imageBlock = parsed.contentBlocks.find((block) => block.type === 'image');
    const fileBlock = parsed.contentBlocks.find((block) => block.type === 'file');
    assert.ok(imageBlock, 'expected image block');
    assert.ok(fileBlock, 'expected file block');
    assert.match(imageBlock.url, /^\/api\/workspace\/file\/raw\?/);
    assert.match(fileBlock.url, /^\/api\/workspace\/download\?/);
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
