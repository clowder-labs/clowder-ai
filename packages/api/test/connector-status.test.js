import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildConnectorStatus } from '../dist/routes/connector-hub.js';

function getPlatform(result, id) {
  const platform = result.find((item) => item.id === id);
  assert.ok(platform, `expected platform ${id}`);
  return platform;
}

describe('buildConnectorStatus', () => {
  it('returns all supported platforms', () => {
    const result = buildConnectorStatus({});
    assert.deepEqual(
      result.map((platform) => platform.id),
      ['feishu', 'weixin', 'dingtalk', 'xiaoyi'],
    );
  });

  it('marks all platforms as not configured when env is empty', () => {
    const result = buildConnectorStatus({});

    assert.equal(getPlatform(result, 'feishu').configured, false);
    assert.equal(getPlatform(result, 'weixin').configured, false);
    assert.equal(getPlatform(result, 'dingtalk').configured, false);
    assert.equal(getPlatform(result, 'xiaoyi').configured, false);
  });

  it('treats Feishu as configured only when both QR-bound credentials are present', () => {
    const configured = buildConnectorStatus({
      FEISHU_APP_ID: 'cli_abcdef123456',
      FEISHU_APP_SECRET: 'secretvalue123',
    });
    const missingSecret = buildConnectorStatus({
      FEISHU_APP_ID: 'cli_only_id',
    });

    assert.equal(getPlatform(configured, 'feishu').configured, true);
    assert.equal(getPlatform(missingSecret, 'feishu').configured, false);
    assert.equal(getPlatform(configured, 'feishu').fields.length, 0);
  });

  it('marks DingTalk as configured when both credentials are set', () => {
    const result = buildConnectorStatus({
      DINGTALK_APP_KEY: 'ding-app-key',
      DINGTALK_APP_SECRET: 'ding-secret',
    });
    const dingtalk = getPlatform(result, 'dingtalk');

    assert.equal(dingtalk.configured, true);
    assert.equal(dingtalk.fields.length, 2);
    assert.equal(dingtalk.fields[0]?.currentValue, 'ding-app-key');
    assert.ok(typeof dingtalk.fields[1]?.currentValue === 'string');
    assert.notEqual(dingtalk.fields[1]?.currentValue, 'ding-secret');
  });

  it('masks sensitive values consistently without leaking the original secret', () => {
    const first = buildConnectorStatus({
      DINGTALK_APP_KEY: 'key-1',
      DINGTALK_APP_SECRET: 'mysecretvalue99',
      XIAOYI_AGENT_ID: 'agent-id',
      XIAOYI_AK: 'ak-value',
      XIAOYI_SK: 'sk-value',
    });

    const dingtalk = getPlatform(first, 'dingtalk');
    const xiaoyi = getPlatform(first, 'xiaoyi');
    const dingSecret = dingtalk.fields.find((field) => field.envName === 'DINGTALK_APP_SECRET');
    const xiaoyiAk = xiaoyi.fields.find((field) => field.envName === 'XIAOYI_AK');
    const xiaoyiSk = xiaoyi.fields.find((field) => field.envName === 'XIAOYI_SK');

    assert.ok(dingSecret?.currentValue);
    assert.ok(xiaoyiAk?.currentValue);
    assert.ok(xiaoyiSk?.currentValue);
    assert.equal(dingSecret.currentValue, xiaoyiAk.currentValue);
    assert.equal(xiaoyiAk.currentValue, xiaoyiSk.currentValue);
    assert.equal(dingSecret.currentValue?.includes('mysecretvalue99'), false);
    assert.equal(xiaoyiAk.currentValue?.includes('ak-value'), false);
    assert.equal(xiaoyiSk.currentValue?.includes('sk-value'), false);
  });

  it('includes docsUrl and non-empty setup steps for each platform', () => {
    const result = buildConnectorStatus({});

    for (const platform of result) {
      assert.ok(platform.docsUrl.startsWith('https://'));
      assert.ok(platform.steps.length >= 3);
      for (const step of platform.steps) {
        assert.equal(typeof step.text, 'string');
        assert.ok(step.text.length > 0);
      }
    }
  });

  it('keeps Feishu QR-only even when legacy mode flags are set', () => {
    const result = buildConnectorStatus({
      FEISHU_CONNECTION_MODE: 'websocket',
      FEISHU_VERIFICATION_TOKEN: 'legacy-token',
    });
    const feishu = getPlatform(result, 'feishu');

    assert.equal(feishu.configured, false);
    assert.equal(feishu.fields.length, 0);
  });
});
