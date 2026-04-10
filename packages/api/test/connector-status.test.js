/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildConnectorStatus } from '../dist/routes/connector-hub.js';

describe('buildConnectorStatus', () => {
  it('returns all platforms as not configured when env is empty', () => {
    const result = buildConnectorStatus({});
    assert.equal(result.length, 4);

    const feishu = result.find((p) => p.id === 'feishu');
    assert.ok(feishu);
    assert.equal(feishu.configured, false);
    assert.equal(feishu.fields.length, 0);

    const dingtalk = result.find((p) => p.id === 'dingtalk');
    assert.ok(dingtalk);
    assert.equal(dingtalk.configured, false);

    const weixin = result.find((p) => p.id === 'weixin');
    assert.ok(weixin);
    assert.equal(weixin.configured, false);
    assert.equal(weixin.fields.length, 0);
  });

  it('marks feishu as configured when QR-bound credentials are present', () => {
    const result = buildConnectorStatus({
      FEISHU_APP_ID: 'cli_abcdef123456',
      FEISHU_APP_SECRET: 'secretvalue123',
    });
    const feishu = result.find((p) => p.id === 'feishu');
    assert.ok(feishu);
    assert.equal(feishu.configured, true);
    assert.equal(feishu.fields.length, 0);
  });

  it('marks feishu as not configured when only partial QR-bound credentials are present', () => {
    const result = buildConnectorStatus({
      FEISHU_APP_ID: 'cli_abc',
    });
    const feishu = result.find((p) => p.id === 'feishu');
    assert.ok(feishu);
    assert.equal(feishu.configured, false);
  });

  it('marks dingtalk as configured when both credentials are set', () => {
    const result = buildConnectorStatus({
      DINGTALK_APP_KEY: 'ding-app-key',
      DINGTALK_APP_SECRET: 'ding-secret',
    });
    const dingtalk = result.find((p) => p.id === 'dingtalk');
    assert.ok(dingtalk);
    assert.equal(dingtalk.configured, true);
    assert.equal(dingtalk.fields[0].currentValue, 'ding-app-key');
    assert.equal(dingtalk.fields[1].currentValue, '••••••••');
  });

  it('treats placeholder default values as not configured', () => {
    const result = buildConnectorStatus({
      DINGTALK_APP_KEY: '(未设置 → 不启用)',
    });
    const dingtalk = result.find((p) => p.id === 'dingtalk');
    assert.ok(dingtalk);
    assert.equal(dingtalk.configured, false);
    assert.equal(dingtalk.fields[0].currentValue, null);
  });

  it('fully masks sensitive values without leaking suffix', () => {
    const result = buildConnectorStatus({
      DINGTALK_APP_KEY: 'mykey123',
      DINGTALK_APP_SECRET: 'mysecretvalue99',
    });
    const dingtalk = result.find((p) => p.id === 'dingtalk');
    assert.ok(dingtalk);
    assert.equal(dingtalk.configured, true);

    const key = dingtalk.fields.find((f) => f.envName === 'DINGTALK_APP_KEY');
    assert.ok(key);
    assert.equal(key.currentValue, 'mykey123');

    const secret = dingtalk.fields.find((f) => f.envName === 'DINGTALK_APP_SECRET');
    assert.ok(secret);
    assert.equal(secret.currentValue, '••••••••');
  });

  it('includes docsUrl and steps for each platform', () => {
    const result = buildConnectorStatus({});
    for (const platform of result) {
      assert.ok(platform.docsUrl.startsWith('https://'));
      assert.ok(platform.steps.length >= 3);
      for (const step of platform.steps) {
        assert.ok(typeof step.text === 'string' && step.text.length > 0, 'step must have non-empty text');
      }
    }
  });

  it('feishu exposes QR-only setup steps', () => {
    const result = buildConnectorStatus({});
    const feishu = result.find((p) => p.id === 'feishu');
    assert.ok(feishu);
    assert.deepEqual(
      feishu.steps.map((s) => s.text),
      ['点击「生成二维码」按钮', '使用飞书扫描二维码并确认授权', '授权成功后自动连接，无需重启服务'],
    );
  });

  it('ignores legacy Feishu mode flags when QR-bound credentials are absent', () => {
    const result = buildConnectorStatus({
      FEISHU_CONNECTION_MODE: 'webhook',
      FEISHU_VERIFICATION_TOKEN: 'legacy-token',
    });
    const feishu = result.find((p) => p.id === 'feishu');
    assert.ok(feishu);
    assert.equal(feishu.configured, false);
  });

  it('keeps feishu QR-only even when legacy mode flags are set', () => {
    const result = buildConnectorStatus({
      FEISHU_CONNECTION_MODE: 'websocket',
      FEISHU_VERIFICATION_TOKEN: 'legacy-token',
    });
    const feishu = result.find((p) => p.id === 'feishu');
    assert.ok(feishu);
    assert.equal(feishu.fields.length, 0);
  });
});
