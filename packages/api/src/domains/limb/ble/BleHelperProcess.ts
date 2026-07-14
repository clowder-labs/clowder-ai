import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BleHelperProcess extends EventEmitter {
  stdin: {
    write(data: string, callback?: (error?: Error | null) => void): boolean;
  };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill(signal?: NodeJS.Signals): boolean;
}

export function resolveBleHelperExecutable(arch = process.arch): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const apiRoot = resolve(moduleDir, '../../../..');
  const architecture = arch === 'arm64' ? 'arm64' : 'x64';
  const candidates = [
    resolve(apiRoot, 'ble-helper', 'ble-helper'),
    resolve(apiRoot, '..', '..', 'bundled', `ble-helper-darwin-${architecture}`, 'ble-helper'),
    resolve(apiRoot, '..', '..', 'native', 'ble-helper', 'macos', '.build', architecture, 'ble-helper'),
  ];
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error('BLE helper executable not found');
  }
  return executable;
}

export function spawnBleHelperProcess(helperPath?: string): BleHelperProcess {
  const executable = helperPath ?? resolveBleHelperExecutable();
  return spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], shell: false }) as ChildProcessWithoutNullStreams;
}
