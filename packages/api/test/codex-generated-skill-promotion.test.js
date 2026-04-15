/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';

const { CodexAgentService } = await import('../dist/domains/cats/services/agents/providers/CodexAgentService.js');

function createMockProcess() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const emitter = new EventEmitter();
  const proc = {
    stdout,
    stderr,
    pid: 12345,
    exitCode: null,
    kill: () => {
      process.nextTick(() => {
        if (!stdout.destroyed) stdout.end();
        emitter.emit('exit', null, 'SIGTERM');
      });
      return true;
    },
    on: (event, listener) => {
      emitter.on(event, listener);
      return proc;
    },
    once: (event, listener) => {
      emitter.once(event, listener);
      return proc;
    },
    _emitter: emitter,
  };
  return proc;
}

function createMockSpawnFn(proc) {
  return () => proc;
}

async function collect(iterable) {
  const items = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

function emitCodexEvents(proc, events) {
  for (const event of events) {
    proc.stdout.write(`${JSON.stringify(event)}\n`);
  }
  proc.stdout.end();
  proc._emitter.emit('exit', 0, null);
}

test('CodexAgentService promotes generated skills into office-claw-skills after file_change events', async () => {
  const previousOfficeClawRoot = process.env.OFFICE_CLAW_CONFIG_ROOT;
  const tempRoot = mkdtempSync(join(tmpdir(), 'codex-generated-skill-'));
  const workspaceRoot = join(tempRoot, 'workspace');
  const generatedSkillDir = join(workspaceRoot, 'random-output', 'weekly-brief');
  mkdirSync(generatedSkillDir, { recursive: true });
  writeFileSync(
    join(generatedSkillDir, 'SKILL.md'),
    '---\ndescription: prepare a weekly sales brief\ntriggers:\n  - weekly brief\n---\n\n# Weekly Brief\n',
    'utf-8',
  );
  writeFileSync(join(generatedSkillDir, 'notes.txt'), 'draft\n', 'utf-8');
  process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

  try {
    const proc = createMockProcess();
    const service = new CodexAgentService({ spawnFn: createMockSpawnFn(proc) });

    const promise = collect(service.invoke('create a skill', { workingDirectory: workspaceRoot }));
    emitCodexEvents(proc, [
      { type: 'thread.started', thread_id: 't-skill' },
      {
        type: 'item.completed',
        item: {
          type: 'file_change',
          status: 'completed',
          changes: [{ path: 'random-output/weekly-brief/SKILL.md' }, { path: 'random-output/weekly-brief/notes.txt' }],
        },
      },
    ]);

    await promise;

    assert.equal(existsSync(join(tempRoot, 'office-claw-skills', 'weekly-brief', 'SKILL.md')), true);
    assert.equal(existsSync(join(tempRoot, 'office-claw-skills', 'weekly-brief', 'notes.txt')), true);
    assert.equal(existsSync(generatedSkillDir), false);
  } finally {
    if (previousOfficeClawRoot === undefined) delete process.env.OFFICE_CLAW_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_CONFIG_ROOT = previousOfficeClawRoot;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
