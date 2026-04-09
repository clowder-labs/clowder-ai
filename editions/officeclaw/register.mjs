/**
 * OfficeClaw Edition Module — vendor extensions for Huawei XiaoYi + jiuwenclaw sidecar.
 *
 * This is the REAL call site for Core's Edition registration API.
 * Loaded by edition-loader.ts when edition.json specifies editionMain.
 *
 * Phase 0: proves the wiring pattern end-to-end.
 *   - XiaoyiAdapter lives here (src/XiaoyiAdapter.ts, compiled to dist/)
 *   - Only connector + sidecar registrations wired; remaining hooks follow
 */

import {
  registerEditionConnectorPlugin,
  registerEditionConnectorPlatform,
  registerEditionSidecarPaths,
} from '@cat-cafe/api/edition';

/** @param {import('@cat-cafe/api/edition').EditionRegistry} registry */
export async function register(registry) {
  // ── 1. Connector platform definition (Hub UI) ──────────

  registerEditionConnectorPlatform({
    id: 'xiaoyi',
    name: '\u5c0f\u827a',
    nameEn: 'Huawei XiaoYi',
    fields: [
      { envName: 'XIAOYI_AGENT_ID', label: 'Agent ID', sensitive: false },
      { envName: 'XIAOYI_AK', label: 'Access Key (AK)', sensitive: true },
      { envName: 'XIAOYI_SK', label: 'Secret Key (SK)', sensitive: true },
    ],
    docsUrl: 'https://developer.huawei.com/consumer/cn/hag/abilityportal/',
    steps: [
      { text: '\u5728\u534e\u4e3a\u5c0f\u827a\u5f00\u653e\u5e73\u53f0\u521b\u5efa\u667a\u80fd\u4f53\uff0c\u65b0\u5efa\u51ed\u8bc1\u83b7\u53d6 AK / SK' },
      { text: '\u914d\u7f6e\u767d\u540d\u5355\u5206\u7ec4\uff0c\u6dfb\u52a0\u8c03\u8bd5\u7528\u534e\u4e3a\u8d26\u53f7' },
      { text: '\u586b\u5199\u4ee5\u4e0b\u914d\u7f6e\u5e76\u4fdd\u5b58\uff0c\u91cd\u542f API \u670d\u52a1\u540e\u751f\u6548' },
    ],
  });

  // ── 2. Connector runtime adapter plugin ────────────────

  registerEditionConnectorPlugin({
    id: 'xiaoyi',
    async start(deps) {
      const ak = process.env.XIAOYI_AK;
      const sk = process.env.XIAOYI_SK;
      const agentId = process.env.XIAOYI_AGENT_ID;
      if (!ak || !sk || !agentId) return; // not configured

      const { XiaoyiAdapter } = await import('./dist/XiaoyiAdapter.js');

      const adapter = new XiaoyiAdapter(deps.log, {
        ak,
        sk,
        agentId,
        wsUrl1: process.env.XIAOYI_WS_URL1,
        wsUrl2: process.env.XIAOYI_WS_URL2,
      });

      deps.adapters.set('xiaoyi', adapter);

      adapter.startConnection(async (msg) => {
        const attachments = msg.attachments?.map((a) => ({
          type: a.type,
          platformKey: a.url,
          ...(a.fileName ? { fileName: a.fileName } : {}),
        }));
        await deps.connectorRouter.route(
          'xiaoyi', msg.chatId, msg.text, msg.messageId, attachments,
        );
      });

      deps.stopFns.push(() => adapter.stopConnection());
      deps.log.info('[OfficeClaw Edition] Xiaoyi connector started');
    },
  });

  // ── 3. Sidecar paths: jiuwenclaw agent ─────────────────

  registerEditionSidecarPaths({
    vendorSubdir: 'jiuwenclaw',
    vendorExeName: 'jiuwenclaw.exe',
    pythonModule: 'jiuwenclaw.app',
    homeSubdir: '.jiuwenclaw',
    legacyAppDir: 'vendor/jiuwenclaw',
    envPrefix: 'JIUWENCLAW',
    readyPatterns: ['Agent Runtime Started', 'Uvicorn running on'],
  });
}
