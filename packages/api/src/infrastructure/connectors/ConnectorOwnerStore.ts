/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface PersistedConnectorOwner {
  version: 1;
  ownerUserId: string;
  updatedAt: string;
}

export interface IConnectorOwnerStore {
  load(): PersistedConnectorOwner | null;
  save(ownerUserId: string): void;
  clear(): void;
}

const OWNER_FILENAME = 'connector-owner.local.json';

export class ConnectorOwnerStore implements IConnectorOwnerStore {
  private readonly filePath: string;
  private readonly legacyFilePath: string;

  constructor(hostRoot: string) {
    this.filePath = join(hostRoot, '.office-claw', OWNER_FILENAME);
    this.legacyFilePath = join(hostRoot, '.cat-cafe', OWNER_FILENAME);
  }

  load(): PersistedConnectorOwner | null {
    const filePath = existsSync(this.filePath) ? this.filePath : this.legacyFilePath;
    if (!existsSync(filePath)) return null;
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<PersistedConnectorOwner> | null;
      const ownerUserId = typeof parsed?.ownerUserId === 'string' ? parsed.ownerUserId.trim() : '';
      const updatedAt = typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : '';
      if (parsed?.version !== 1 || !ownerUserId || !updatedAt) return null;
      return { version: 1, ownerUserId, updatedAt };
    } catch {
      return null;
    }
  }

  save(ownerUserId: string): void {
    const trimmed = ownerUserId.trim();
    if (!trimmed) {
      this.clear();
      return;
    }
    const payload: PersistedConnectorOwner = {
      version: 1,
      ownerUserId: trimmed,
      updatedAt: new Date().toISOString(),
    };
    this.writeAtomic(`${JSON.stringify(payload, null, 2)}\n`);
  }

  clear(): void {
    for (const filePath of [this.filePath, this.legacyFilePath]) {
      try {
        unlinkSync(filePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }
  }

  private writeAtomic(content: string): void {
    const tempPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(tempPath, content, 'utf-8');
    try {
      renameSync(tempPath, this.filePath);
    } catch (err) {
      try {
        unlinkSync(tempPath);
      } catch {
        // best-effort cleanup
      }
      throw err;
    }
  }
}

export class NoopConnectorOwnerStore implements IConnectorOwnerStore {
  load(): PersistedConnectorOwner | null {
    return null;
  }

  save(_ownerUserId: string): void {}

  clear(): void {}
}
