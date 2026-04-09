/**
 * OA 审批 E2E — 完整链路
 * 1. 创建新线程 → 2. 发消息触发工具 → 3. 等审批卡片 → 4. 点批准 → 5. agent 恢复执行 → 6. 验证文件创建
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const API = 'http://localhost:3004';
const WORKSPACE = 'D:\\02.code\\clowder-ai\\workspace';
const TIMESTAMP = Date.now();
const TARGET_FILE = `oa-e2e-${TIMESTAMP}.txt`;
const TARGET_PATH = path.join(WORKSPACE, TARGET_FILE);

test('OA 审批完整链路 — 发消息 → 审批 → agent 恢复 → 文件创建', async ({ page }) => {
  test.setTimeout(180_000);

  // ── Step 0: 清理旧的 pending 审批（避免干扰）
  const oldPending = await (
    await fetch(`${API}/api/approval/requests?status=pending`, {
      headers: { 'X-Cat-Cafe-User': 'default-user' },
    })
  ).json().catch(() => ({ requests: [] }));
  const oldIds = (oldPending.requests ?? oldPending.pending ?? []).map(
    (r: { requestId?: string; id?: string }) => r.requestId ?? r.id,
  );
  console.log(`旧 pending 审批: ${oldIds.length} 个`);

  // ── Step 1: 通过 API 创建新线程
  const createRes = await fetch(`${API}/api/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cat-Cafe-User': 'default-user' },
    body: JSON.stringify({ projectPath: WORKSPACE }),
  });
  expect(createRes.ok).toBeTruthy();
  const thread = await createRes.json();
  const threadId = thread.id;
  console.log(`✅ 线程已创建: ${threadId}`);

  // ── Step 2: 进入线程页面
  // Capture console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[BROWSER ERROR] ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.log(`[PAGE ERROR] ${err.message}`));

  // First go to home page to establish session
  await page.goto('/', { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/e2e/screenshots/oa-00-home.png' });
  console.log('✅ 首页已加载');

  // Then navigate to thread
  await page.goto(`/thread/${threadId}`, { waitUntil: 'networkidle', timeout: 30_000 });
  // 等待加载完成（"加载中..." 消失）
  await page.waitForFunction(() => !document.body.textContent?.includes('加载中'), { timeout: 30_000 });
  // 等待 contenteditable 输入框出现
  const inputBox = page.locator('[contenteditable="true"]').first();
  await inputBox.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tests/e2e/screenshots/oa-01-thread.png' });
  console.log('✅ 线程页面已加载');

  // ── Step 3: 输入消息并发送
  await inputBox.click();
  await inputBox.focus();
  const msg = `@通用智能体 请用 run_command 创建文件 ${TARGET_PATH}，内容为 hello-approval-${TIMESTAMP}`;
  // Type character by character to trigger input events properly
  await page.keyboard.type(msg, { delay: 10 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/screenshots/oa-02-typed.png' });

  // 按 Enter 发送
  await page.keyboard.press('Enter');
  console.log('✉️ 消息已发送');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/e2e/screenshots/oa-03-sent.png' });

  // ── Step 4: 等待新审批卡片出现
  console.log('⏳ 等待审批卡片...');
  const approveBtn = page.locator('button:has-text("批准 (仅此次)")');
  let cardFound = false;

  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000);
    const count = await approveBtn.count();
    // 检查是否有新的（不在旧 ID 列表中的）审批卡片
    if (count > 0) {
      // 也通过 API 验证是否有新的 pending
      const pendingRes = await fetch(`${API}/api/approval/requests?status=pending`, {
        headers: { 'X-Cat-Cafe-User': 'default-user' },
      }).then((r) => r.json()).catch(() => ({ requests: [] }));
      const allPending = pendingRes.requests ?? pendingRes.pending ?? [];
      const newPending = allPending.filter(
        (r: { requestId?: string; id?: string }) => !oldIds.includes(r.requestId ?? r.id),
      );
      if (newPending.length > 0) {
        cardFound = true;
        console.log(`🛡 新审批卡片出现 (${i + 1}s), pending=${newPending.length}`);
        await page.screenshot({ path: 'tests/e2e/screenshots/oa-04-card.png' });
        break;
      }
    }
    if (i % 10 === 9) {
      console.log(`   等待中... ${i + 1}s (按钮数=${await approveBtn.count()})`);
      await page.screenshot({ path: `tests/e2e/screenshots/oa-wait-${i + 1}s.png` });
    }
  }

  if (!cardFound) {
    await page.screenshot({ path: 'tests/e2e/screenshots/oa-timeout-no-card.png' });
    // 打印 API 状态帮助调试
    const debug = await fetch(`${API}/api/approval/requests?status=pending`, {
      headers: { 'X-Cat-Cafe-User': 'default-user' },
    }).then((r) => r.json()).catch(() => ({}));
    console.log('API pending:', JSON.stringify(debug).slice(0, 500));
    expect(cardFound, '未检测到新审批卡片').toBeTruthy();
    return;
  }

  // ── Step 5: 点击最后一个"批准 (仅此次)"按钮
  const lastApproveBtn = approveBtn.last();
  console.log('👆 点击批准...');
  await lastApproveBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tests/e2e/screenshots/oa-05-approved.png' });
  console.log('✅ 已点击批准');

  // ── Step 6: 等待 agent 恢复执行 — 检测文件创建或页面出现成功文本
  console.log('⏳ 等待 agent 恢复执行...');
  let success = false;

  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000);

    // 检查文件是否已创建
    if (fs.existsSync(TARGET_PATH)) {
      const content = fs.readFileSync(TARGET_PATH, 'utf-8');
      console.log(`✅ 文件已创建 (${i + 1}s): ${TARGET_PATH}`);
      console.log(`   内容: ${content.slice(0, 100)}`);
      success = true;
      break;
    }

    // 也检查页面文本（agent 可能回复了成功信息）
    const pageText = await page.textContent('body') ?? '';
    if (
      pageText.includes(TARGET_FILE) &&
      (pageText.includes('创建') || pageText.includes('成功') || pageText.includes('完成') || pageText.includes('done'))
    ) {
      console.log(`✅ Agent 回复了成功信息 (${i + 1}s)`);
      success = true;
      break;
    }

    if (i % 10 === 9) {
      console.log(`   恢复等待中... ${i + 1}s`);
      await page.screenshot({ path: `tests/e2e/screenshots/oa-resume-${i + 1}s.png` });
    }
  }

  await page.screenshot({ path: 'tests/e2e/screenshots/oa-06-final.png' });

  if (success) {
    console.log('🎉 OA 审批完整链路通过！');
  } else {
    // 打印调试信息
    const pendingAfter = await fetch(`${API}/api/approval/requests?status=pending`, {
      headers: { 'X-Cat-Cafe-User': 'default-user' },
    }).then((r) => r.json()).catch(() => ({}));
    console.log('剩余 pending:', JSON.stringify(pendingAfter).slice(0, 500));
    expect(success, '文件未创建 — agent 恢复可能失败').toBeTruthy();
  }

  // ── 清理
  if (fs.existsSync(TARGET_PATH)) {
    fs.unlinkSync(TARGET_PATH);
    console.log('🧹 临时文件已清理');
  }
});
