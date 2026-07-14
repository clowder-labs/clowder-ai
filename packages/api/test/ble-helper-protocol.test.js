import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BLE_HELPER_MAX_LINE_BYTES,
  encodeBleHelperRequest,
  parseBleHelperMessage,
} from '../dist/domains/limb/ble/BleHelperProtocol.js';

describe('BleHelperProtocol', () => {
  it('encodes a versioned allowlisted request', () => {
    const line = encodeBleHelperRequest('scan.start', { sessionId: 'scan-1', timeoutMs: 30_000 }, 'req-1');
    assert.equal(line.endsWith('\n'), true);
    assert.deepEqual(JSON.parse(line), {
      protocol: 'ble-helper',
      version: 1,
      requestId: 'req-1',
      command: 'scan.start',
      params: { sessionId: 'scan-1', timeoutMs: 30_000 },
    });
  });

  it('has no arbitrary GATT write command', () => {
    assert.throws(
      () => encodeBleHelperRequest('gatt.write', { deviceId: 'device-1', valueBase64: 'AQ==' }, 'req-1'),
      /Unsupported BLE helper command/,
    );
  });

  it('parses the required handshake', () => {
    const message = parseBleHelperMessage('{"protocol":"ble-helper","version":1,"kind":"hello"}');
    assert.equal(message.kind, 'hello');
  });

  it('rejects an unknown protocol version', () => {
    assert.throws(
      () => parseBleHelperMessage('{"protocol":"ble-helper","version":2,"kind":"hello"}'),
      /Unsupported BLE helper protocol version/,
    );
  });

  it('rejects malformed JSON and oversized lines', () => {
    assert.throws(() => parseBleHelperMessage('{not-json}'), /Invalid BLE helper JSON/);
    assert.throws(() => parseBleHelperMessage('x'.repeat(BLE_HELPER_MAX_LINE_BYTES + 1)), /exceeds/);
  });

  it('rejects notification payloads above 4 KiB', () => {
    const line = JSON.stringify({
      protocol: 'ble-helper',
      version: 1,
      kind: 'event',
      event: 'gatt.notification',
      data: {
        deviceId: 'device-1',
        serviceUuid: '180f',
        characteristicUuid: '2a19',
        valueBase64: Buffer.alloc(4097).toString('base64'),
        observedAt: Date.now(),
      },
    });
    assert.throws(() => parseBleHelperMessage(line), /Invalid BLE helper message/);
  });

  it('rejects malformed base64 notification data', () => {
    const line = JSON.stringify({
      protocol: 'ble-helper',
      version: 1,
      kind: 'event',
      event: 'gatt.notification',
      data: {
        deviceId: 'device-1',
        serviceUuid: '180f',
        characteristicUuid: '2a19',
        valueBase64: 'not base64!',
        observedAt: Date.now(),
      },
    });
    assert.throws(() => parseBleHelperMessage(line), /Invalid BLE helper message/);
  });
});
