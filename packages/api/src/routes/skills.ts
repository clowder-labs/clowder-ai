/**
 * Skills Route
 * GET  /api/skills          — Clowder AI 共享 Skills 看板数据
 * GET  /api/skills/search   — 搜索 SkillHub 远程 skill
 * GET  /api/skills/trending — 获取热门 skill
 * GET  /api/skills/preview  — 预览远程 skill SKILL.md 内容
 * POST /api/skills/install  — 安装远程 skill
 * POST /api/skills/uninstall — 卸载远程 skill
 */

import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, readlink, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { parse as parseYaml } from 'yaml';
import { parseSkillFrontmatter } from '../domains/cats/services/skillhub/frontmatter-parser.js';
import { loadInstalledRegistry } from '../domains/cats/services/skillhub/InstalledSkillRegistry.js';
import { fetchSkillContent, searchSkills, trendingSkills } from '../domains/cats/services/skillhub/SkillHubService.js';
import {
  getInstalledRecords,
  installSkill,
  SkillInstallError,
  uninstallSkill,
} from '../domains/cats/services/skillhub/SkillInstallManager.js';
import { resolveCatCafeHostRoot } from '../utils/cat-cafe-root.js';
import { pathsEqual } from '../utils/project-path.js';
import { resolveUserId } from '../utils/request-identity.js';

interface SkillMount {
  claude: boolean;
  codex: boolean;
  gemini: boolean;
}

interface SkillEntry {
  name: string;
  category: string;
  trigger: string;
  source: 'local' | 'skillhub';
  skillhubUrl?: string;
  mounts: SkillMount;
}

interface SkillsSummary {
  total: number;
  allMounted: boolean;
  registrationConsistent: boolean;
}

interface SkillsResponse {
  skills: SkillEntry[];
  summary: SkillsSummary;
}

function resolveCatCafeSkillsSourceDir(): string {
  return resolve(resolveCatCafeHostRoot(process.cwd()), 'cat-cafe-skills');
}

const CAT_CAFE_SKILLS_SRC = resolveCatCafeSkillsSourceDir();
const CAT_CAFE_ROOT = dirname(CAT_CAFE_SKILLS_SRC);

async function isCorrectSymlink(linkPath: string, expectedTarget: string): Promise<boolean> {
  try {
    const stat = await lstat(linkPath);
    if (!stat.isSymbolicLink()) return false;
    const dest = await readlink(linkPath);
    const absDest = isAbsolute(dest) ? dest : resolve(dirname(linkPath), dest);
    const [realDest, realExpected] = await Promise.all([
      realpath(absDest).catch(() => absDest),
      realpath(expectedTarget).catch(() => expectedTarget),
    ]);
    const normalizedDest = realDest.replace(/[/\\]$/, '');
    const normalizedExpected = realExpected.replace(/[/\\]$/, '');
    return pathsEqual(normalizedDest, normalizedExpected);
  } catch {
    return false;
  }
}

async function listSkillDirs(skillsSrc: string): Promise<string[]> {
  try {
    const { readdir } = await import('node:fs/promises');
    const dirs = await readdir(skillsSrc, { withFileTypes: true });
    const names: string[] = [];
    for (const e of dirs) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      try {
        await readFile(join(skillsSrc, e.name, 'SKILL.md'), 'utf-8');
        names.push(e.name);
      } catch {
        // skip
      }
    }
    return names;
  } catch {
    return [];
  }
}

interface BootstrapEntry {
  name: string;
  category: string;
  trigger: string;
}

interface SkillMeta {
  description?: string;
  triggers?: string[];
}

async function parseBootstrap(bootstrapPath: string): Promise<Map<string, BootstrapEntry>> {
  const result = new Map<string, BootstrapEntry>();
  try {
    const content = await readFile(bootstrapPath, 'utf-8');
    const lines = content.split('\n');
    let currentCategory = '';
    for (const line of lines) {
      const categoryMatch = line.match(/^###\s+(.+)/);
      if (categoryMatch?.[1]) {
        currentCategory = categoryMatch[1].trim();
        continue;
      }
      const rowMatch = line.match(/^\|\s*`([a-z][-a-z0-9_]*)`\s*\|\s*(.+?)\s*\|/);
      if (rowMatch?.[1]) {
        result.set(rowMatch[1], { name: rowMatch[1], category: currentCategory, trigger: rowMatch[2]?.trim() ?? '' });
      }
    }
  } catch {
    // not found
  }
  return result;
}

async function parseManifestSkillMeta(skillsSrcDir: string): Promise<Map<string, SkillMeta>> {
  const result = new Map<string, SkillMeta>();
  try {
    const content = await readFile(join(skillsSrcDir, 'manifest.yaml'), 'utf-8');
    const parsed = parseYaml(content) as {
      skills?: Record<string, { description?: unknown; triggers?: unknown }>;
    } | null;
    if (!parsed?.skills || typeof parsed.skills !== 'object') return result;
    for (const [name, meta] of Object.entries(parsed.skills)) {
      const description = typeof meta?.description === 'string' ? meta.description.trim() : undefined;
      const triggers = Array.isArray(meta?.triggers)
        ? meta.triggers
            .filter((v): v is string => typeof v === 'string')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
      if (description || (triggers && triggers.length > 0)) {
        result.set(name, { ...(description ? { description } : {}), ...(triggers?.length ? { triggers } : {}) });
      }
    }
  } catch {
    // skip
  }
  return result;
}

async function getBootstrapNames(skillsSrcDir: string): Promise<Set<string>> {
  return new Set((await parseBootstrap(join(skillsSrcDir, 'BOOTSTRAP.md'))).keys());
}

export const skillsRoutes: FastifyPluginAsync = async (app) => {
  // ────────────────────────────────────────────────────────
  // GET /api/skills
  // ────────────────────────────────────────────────────────
  app.get('/api/skills', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const [sourceSkills, bootstrapEntries, manifestMeta, installedRecords] = await Promise.all([
      listSkillDirs(CAT_CAFE_SKILLS_SRC),
      parseBootstrap(join(CAT_CAFE_SKILLS_SRC, 'BOOTSTRAP.md')),
      parseManifestSkillMeta(CAT_CAFE_SKILLS_SRC),
      getInstalledRecords(CAT_CAFE_ROOT),
    ]);

    const installedNameSet = new Set(installedRecords.map((r) => r.name));
    const installedRecordMap = new Map(installedRecords.map((r) => [r.name, r]));
    const home = homedir();
    const catDirs = {
      claude: join(home, '.claude', 'skills'),
      codex: join(home, '.codex', 'skills'),
      gemini: join(home, '.gemini', 'skills'),
    };

    const sourceSet = new Set(sourceSkills);
    const mountLookup = new Map<string, SkillEntry>();

    await Promise.all(
      sourceSkills.map(async (name) => {
        const expectedTarget = join(CAT_CAFE_SKILLS_SRC, name);
        const [claude, codex, gemini] = await Promise.all([
          isCorrectSymlink(join(catDirs.claude, name), expectedTarget),
          isCorrectSymlink(join(catDirs.codex, name), expectedTarget),
          isCorrectSymlink(join(catDirs.gemini, name), expectedTarget),
        ]);

        const isRemote = installedNameSet.has(name);
        const entry = bootstrapEntries.get(name);
        const meta = manifestMeta.get(name);

        let trigger = '';
        let category = entry?.category ?? '未分类';
        let source: 'local' | 'skillhub' = 'local';
        let skillhubUrl: string | undefined;

        if (isRemote) {
          const frontmatter = await parseSkillFrontmatter(join(CAT_CAFE_SKILLS_SRC, name));
          trigger = frontmatter.triggers?.join('、') ?? '';
          category = 'SkillHub';
          source = 'skillhub';
          skillhubUrl = installedRecordMap.get(name)?.skillhubUrl;
        } else {
          trigger = meta?.triggers?.length ? meta.triggers.join('、') : (entry?.trigger ?? '');
        }

        mountLookup.set(name, { name, category, trigger, source, skillhubUrl, mounts: { claude, codex, gemini } });
      }),
    );

    const ordered: string[] = [];
    const bootstrapOrdered = new Set<string>();
    for (const bsName of bootstrapEntries.keys()) {
      if (sourceSet.has(bsName)) {
        ordered.push(bsName);
        bootstrapOrdered.add(bsName);
      }
    }
    for (const name of sourceSkills) {
      if (!bootstrapOrdered.has(name)) ordered.push(name);
    }
    const skills = ordered.map((n) => mountLookup.get(n)!).filter(Boolean);

    const bootstrapNames = new Set(bootstrapEntries.keys());
    const unregistered = sourceSkills.filter((n) => !bootstrapNames.has(n) && !installedNameSet.has(n));
    const phantom = [...bootstrapNames].filter((n) => !sourceSet.has(n));
    const registrationConsistent = unregistered.length === 0 && phantom.length === 0;

    const localSkills = skills.filter((s) => s.source === 'local');
    const allMounted =
      localSkills.length === 0 || localSkills.every((s) => s.mounts.claude && s.mounts.codex && s.mounts.gemini);

    return { skills, summary: { total: skills.length, allMounted, registrationConsistent } } satisfies SkillsResponse;
  });

  // ────────────────────────────────────────────────────────
  // GET /api/skills/search
  // ────────────────────────────────────────────────────────
  app.get('/api/skills/search', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const query = (request.query as { q?: string }).q;
    if (!query) {
      reply.status(400);
      return { error: 'Missing required query parameter: q' };
    }

    const page = Number((request.query as { page?: string }).page) || 1;
    const limit = Number((request.query as { limit?: string }).limit) || 20;

    try {
      const result = await searchSkills(query, { page, limit });
      const installedNames = new Set((await getInstalledRecords(CAT_CAFE_ROOT)).map((r) => r.name));
      return {
        skills: result.data.map((s) => ({ ...s, isInstalled: installedNames.has(s.slug) })),
        total: result.total,
        page: result.page,
        hasMore: result.hasMore,
      };
    } catch (err) {
      reply.status(502);
      return { error: `SkillHub unavailable: ${err instanceof Error ? err.message : String(err)}` };
    }
  });

  // ────────────────────────────────────────────────────────
  // GET /api/skills/trending
  // ────────────────────────────────────────────────────────
  app.get('/api/skills/trending', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    try {
      const result = await trendingSkills();
      const installedNames = new Set((await getInstalledRecords(CAT_CAFE_ROOT)).map((r) => r.name));
      return {
        skills: result.data.map((s) => ({ ...s, isInstalled: installedNames.has(s.slug) })),
        total: result.total,
        page: result.page,
        hasMore: result.hasMore,
      };
    } catch (err) {
      reply.status(502);
      return { error: `SkillHub unavailable: ${err instanceof Error ? err.message : String(err)}` };
    }
  });

  // ────────────────────────────────────────────────────────
  // GET /api/skills/preview
  // ────────────────────────────────────────────────────────
  app.get('/api/skills/preview', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const q = request.query as { owner?: string; repo?: string; skill?: string };
    if (!q.owner || !q.repo || !q.skill) {
      reply.status(400);
      return { error: 'Missing: owner, repo, skill' };
    }

    try {
      const content = await fetchSkillContent(q.owner, q.repo, q.skill);
      return { content, owner: q.owner, repo: q.repo, skill: q.skill };
    } catch (err) {
      reply.status(502);
      return { error: `Failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  });

  // ────────────────────────────────────────────────────────
  // POST /api/skills/install
  // ────────────────────────────────────────────────────────
  app.post('/api/skills/install', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const body = request.body as {
      owner?: string;
      repo?: string;
      skill?: string;
      localName?: string;
      force?: boolean;
    };
    if (!body.owner || !body.repo || !body.skill) {
      reply.status(400);
      return { error: 'Missing: owner, repo, skill' };
    }

    try {
      return await installSkill(
        CAT_CAFE_ROOT,
        {
          owner: body.owner,
          repo: body.repo,
          skill: body.skill,
          localName: body.localName,
        },
        { force: body.force },
      );
    } catch (err) {
      if (err instanceof SkillInstallError) {
        const map: Record<string, number> = {
          CONFLICT: 409,
          VALIDATION: 422,
          NOT_FOUND: 404,
          FORBIDDEN: 403,
          DOWNLOAD: 502,
        };
        reply.status(map[err.code] ?? 500);
        return { success: false, error: err.message, code: err.code };
      }
      reply.status(500);
      return { success: false, error: String(err) };
    }
  });

  // ────────────────────────────────────────────────────────
  // POST /api/skills/uninstall
  // ────────────────────────────────────────────────────────
  app.post('/api/skills/uninstall', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const body = request.body as { name?: string };
    if (!body.name) {
      reply.status(400);
      return { error: 'Missing: name' };
    }

    try {
      const bootstrapNames = await getBootstrapNames(CAT_CAFE_SKILLS_SRC);
      await uninstallSkill(CAT_CAFE_ROOT, body.name, bootstrapNames);
      return { success: true, name: body.name };
    } catch (err) {
      if (err instanceof SkillInstallError) {
        const map: Record<string, number> = {
          CONFLICT: 409,
          VALIDATION: 422,
          NOT_FOUND: 404,
          FORBIDDEN: 403,
          DOWNLOAD: 502,
        };
        reply.status(map[err.code] ?? 500);
        return { success: false, error: err.message, code: err.code };
      }
      reply.status(500);
      return { success: false, error: String(err) };
    }
  });

  // ────────────────────────────────────────────────────────
  // POST /api/skills/upload — 上传本地 skill（JSON 格式）
  // ────────────────────────────────────────────────────────
  const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 单文件 5MB
  const MAX_FILES = 50; // 文件数量上限
  const MAX_TOTAL_SIZE = 5 * 1024 * 1024; // 总大小 5MB
  const PATH_TRAVERSAL_RE = /[/\\]|\.\./;

  app.post('/api/skills/upload', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const body = request.body as {
      name?: string;
      files?: { path: string; content: string }[];
      force?: boolean;
    };

    if (!body.name || !body.files?.length) {
      reply.status(400);
      return { success: false, error: 'Missing name or files' };
    }

    // 文件数量检查
    if (body.files.length > MAX_FILES) {
      reply.status(422);
      return { success: false, error: `Too many files (max ${MAX_FILES})` };
    }

    const skillName = body.name.trim();
    const forceOverwrite = body.force === true;
    if (!skillName || PATH_TRAVERSAL_RE.test(skillName)) {
      reply.status(422);
      return { success: false, error: 'Invalid skill name: must not contain path separators or parent references' };
    }
    if (!/^[\w][\w.-]*$/.test(skillName)) {
      reply.status(422);
      return { success: false, error: 'Invalid skill name: must start with alphanumeric, allow a-z0-9_-.' };
    }

    const skillsDir = resolve(CAT_CAFE_SKILLS_SRC);
    const skillDir = join(skillsDir, skillName);

    try {
      // 重名检查
      if (existsSync(skillDir)) {
        if (!forceOverwrite) {
          const registry = await loadInstalledRegistry(CAT_CAFE_ROOT);
          const existing = registry.skills.find((s) => s.name === skillName);
          if (existing) {
            reply.status(409);
            return {
              success: false,
              error: `Skill "${skillName}" already exists (source: ${existing.source}). Please rename or delete the existing skill first.`,
              conflict: { name: skillName, source: existing.source },
            };
          }
          // 目录存在但不在 registry 中（可能是手动创建的）
          reply.status(409);
          return {
            success: false,
            error: `Skill "${skillName}" already exists. Please rename or delete the existing skill first.`,
            conflict: { name: skillName, source: 'unknown' },
          };
        }
        // force=true 时删除旧目录
        const { rm } = await import('node:fs/promises');
        await rm(skillDir, { recursive: true, force: true });
        // 同时移除 registry 记录
        const { removeInstalledSkill } = await import('../domains/cats/services/skillhub/InstalledSkillRegistry.js');
        await removeInstalledSkill(CAT_CAFE_ROOT, skillName);
      }

      // Detect common prefix directory (e.g. all files under "my-skill/" folder)
      // If all paths share the same first directory, strip it
      const paths = body.files.map((f) => f.path.replace(/\\/g, '/'));
      let prefix = '';
      if (paths.length > 0) {
        const firstSegment = paths[0].split('/')[0];
        if (firstSegment && paths.every((p) => p.startsWith(`${firstSegment}/`))) {
          prefix = `${firstSegment}/`;
        }
      }

      // SKILL.md 预检查（前缀剥离后）
      const hasSkillMd = body.files.some((f) => {
        const relPath = f.path.replace(/\\/g, '/');
        const stripped = prefix ? relPath.slice(prefix.length) : relPath;
        return stripped === 'SKILL.md';
      });
      if (!hasSkillMd) {
        reply.status(422);
        return { success: false, error: 'Uploaded files must include SKILL.md' };
      }

      // 验证与写入（增强安全性 + 错误收集）
      const writtenFiles: string[] = [];
      const skippedFiles: { path: string; reason: string }[] = [];
      let totalSize = 0;

      for (const file of body.files) {
        const relPath = file.path.replace(/\\/g, '/').trim();

        // 跳过空路径
        if (!relPath) {
          skippedFiles.push({ path: '(empty)', reason: 'empty file path' });
          continue;
        }

        // 规范化路径：去除前导斜杠和重复的 /
        const stripped = prefix ? relPath.slice(prefix.length) : relPath;

        // 路径遍历检查
        if (stripped.includes('..') || stripped.startsWith('/')) {
          skippedFiles.push({ path: relPath, reason: 'path traversal detected' });
          continue;
        }

        // jail 检查
        const fullPath = resolve(skillDir, stripped);
        if (!fullPath.startsWith(resolve(skillDir) + sep)) {
          skippedFiles.push({ path: relPath, reason: 'path escapes skill directory' });
          continue;
        }

        // base64 解码
        let content: Buffer;
        try {
          content = Buffer.from(file.content, 'base64');
        } catch {
          skippedFiles.push({ path: relPath, reason: 'invalid base64 content' });
          continue;
        }

        // 单文件大小检查
        if (content.length > MAX_UPLOAD_SIZE) {
          reply.status(422);
          return {
            success: false,
            error: `File ${stripped} exceeds ${MAX_UPLOAD_SIZE / 1024 / 1024}MB limit`,
          };
        }

        // 总大小检查
        totalSize += content.length;
        if (totalSize > MAX_TOTAL_SIZE) {
          reply.status(422);
          return {
            success: false,
            error: `Total upload size exceeds ${MAX_TOTAL_SIZE / 1024 / 1024}MB limit`,
          };
        }

        // 写入文件
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, content);
        writtenFiles.push(relPath);
      }

      // 如果没有任何文件被写入，返回错误
      if (writtenFiles.length === 0) {
        reply.status(422);
        return {
          success: false,
          error: 'No valid files uploaded',
          skipped: skippedFiles,
        };
      }

      // SKILL.md 写入检查（冗余保护）
      if (!existsSync(join(skillDir, 'SKILL.md'))) {
        // 回滚：删除已写入的目录
        const { rm } = await import('node:fs/promises');
        await rm(skillDir, { recursive: true, force: true });
        reply.status(422);
        return { success: false, error: 'Uploaded files must include SKILL.md', skipped: skippedFiles };
      }

      // Create symlinks
      let mounts: { claude: boolean; codex: boolean; gemini: boolean } | undefined;
      try {
        const { createProviderSymlinks } = await import('../domains/cats/services/skillhub/SymlinkManager.js');
        mounts = await createProviderSymlinks(skillName, skillsDir);
      } catch (symlinkErr) {
        // symlink 失败不阻断，记录但继续
        const { createModuleLogger } = await import('../infrastructure/logger.js');
        const log = createModuleLogger('skills-upload');
        log.warn({ err: symlinkErr, skillName }, 'Symlink creation failed during upload');
        mounts = { claude: false, codex: false, gemini: false };
      }

      // Register in installed-skills.json
      const { addInstalledSkill } = await import('../domains/cats/services/skillhub/InstalledSkillRegistry.js');
      await addInstalledSkill(CAT_CAFE_ROOT, {
        name: skillName,
        source: 'local',
        skillhubUrl: '',
        owner: 'local',
        repo: 'upload',
        remoteSkillName: skillName,
        installedAt: new Date().toISOString(),
      });

      return {
        success: true,
        name: skillName,
        localPath: `cat-cafe-skills/${skillName}`,
        files: writtenFiles,
        skipped: skippedFiles.length > 0 ? skippedFiles : undefined,
        mounts,
      };
    } catch (err) {
      // 尝试回滚已写入的文件
      try {
        if (existsSync(skillDir)) {
          const { rm } = await import('node:fs/promises');
          await rm(skillDir, { recursive: true, force: true });
        }
      } catch {
        // 回滚失败，忽略
      }

      // 返回详细错误信息
      const errorMessage = err instanceof Error ? err.message : String(err);
      reply.status(500);
      return {
        success: false,
        error: `Upload failed: ${errorMessage}`,
        hint: 'Please check file contents and try again',
      };
    }
  });
};
