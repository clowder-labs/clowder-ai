/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Version Route
 * GET /api/curversion — 返回当前版本信息
 * GET /api/lastversion — 返回最新版本信息
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';
import { getErrorMessage } from '../utils/index.js';

interface VersionRoutesOptions {
  projectRoot?: string;
}

const DEFAULT_VERSION = '0.1.0';

function readVersionFromJsonFile(filePath: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    return typeof parsed?.version === 'string' && parsed.version.trim().length > 0 ? parsed.version.trim() : null;
  } catch {
    return null;
  }
}

function getCurrentVersion(projectRoot: string): string {
  const packageVersion = readVersionFromJsonFile(resolve(projectRoot, 'package.json'));
  if (packageVersion) return packageVersion;

  const releaseVersion = readVersionFromJsonFile(resolve(projectRoot, '.clowder-release.json'));
  if (releaseVersion) return releaseVersion;

  return DEFAULT_VERSION;
}

const HUAWEI_CLAW_VERSION_URL = process.env.HUAWEI_CLAW_URL! + "/v1/claw/client-latest-version";

export async function versionRoutes(app: FastifyInstance, opts: VersionRoutesOptions = {}): Promise<void> {
  const projectRoot = opts.projectRoot ?? resolveActiveProjectRoot();

  app.get('/api/curversion', async () => {
    const version = getCurrentVersion(projectRoot);
    return {
      version,
      name: '@office-claw/api',
      current: true,
    };
  });

  app.get('/api/lastversion', async (request) => {
    console.log('projectRoot:', projectRoot);
    const curversion = getCurrentVersion(projectRoot);
    try {
      const userId = (request.headers['x-office-claw-user'] ?? request.headers['x-cat-cafe-user']) as string;
      if (!userId) {
        throw new Error('Unauthorized: Missing user ID');
      }
      const response = await fetch(HUAWEI_CLAW_VERSION_URL, {
        headers: {
          'Content-Type': 'application/json;charset=utf8',
        },
      });
      if (!response.ok) {
        const { error_code, error_message } = await getErrorMessage(response);
        throw new Error(`错误码: ${error_code}, 错误信息: ${error_message}`);
      }
      const data: any = await response.json();
      return {
        curversion,
        lastversion: data.latest_version || curversion,
        downloadUrl: data.download_url || '',
        description: data.description || '',
      };
    } catch(err) {
      console.error('获取最新版本信息失败，', err);
      return {
        curversion,
        lastversion: '0.1.2',
        downloadUrl: 'https://openjiuwen-ci.obs.cn-north-4.myhuaweicloud.com/office-claw/windows/20-20260416-075116/20/OfficeClaw-0.1.0-windows-x64-setup.exe',
        description: '版本更新信息如下：\n1. 修复了已知的若干问题，提升了稳定性和性能。\n2. 新增了自动更新功能，用户可以更便捷地获取最新版本。\n3. 优化了用户界面，提升了使用体验。\n4. 增强了安全性，修补了若干安全漏洞。\n请尽快更新到最新版本以获得更好的使用体验和安全保障。',
      };
    }
  });
}
