// HWS API Gateway Signature — Node.js TypeScript port
// Original: signer.js (HWS SDK-HMAC-SHA256)
import { createHash, createHmac } from 'node:crypto';

const Algorithm = 'SDK-HMAC-SHA256';
const HeaderXDate = 'X-Sdk-Date';
const HeaderAuthorization = 'Authorization';
const HeaderContentSha256 = 'x-sdk-content-sha256';

const hexTable: string[] = new Array(256);
for (let i = 0; i < 256; ++i)
  hexTable[i] = '%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase();

const noEscape = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0 - 15
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 16 - 31
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, // 32 - 47
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, // 48 - 63
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 64 - 79
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, // 80 - 95
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 96 - 111
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, // 112 - 127
];

// function urlEncode is based on https://github.com/nodejs/node/blob/master/lib/querystring.js
// Copyright Joyent, Inc. and other Node contributors.
export function urlEncode(str: unknown): string {
  const s = typeof str === 'string' ? str : String(str);
  let out = '';
  let lastPos = 0;

  for (let i = 0; i < s.length; ++i) {
    const c = s.charCodeAt(i);

    if (c < 0x80) {
      if (noEscape[c] === 1) continue;
      if (lastPos < i) out += s.slice(lastPos, i);
      lastPos = i + 1;
      out += hexTable[c];
      continue;
    }

    if (lastPos < i) out += s.slice(lastPos, i);

    if (c < 0x800) {
      lastPos = i + 1;
      out += hexTable[0xc0 | (c >> 6)] + hexTable[0x80 | (c & 0x3f)];
      continue;
    }
    if (c < 0xd800 || c >= 0xe000) {
      lastPos = i + 1;
      out +=
        hexTable[0xe0 | (c >> 12)] +
        hexTable[0x80 | ((c >> 6) & 0x3f)] +
        hexTable[0x80 | (c & 0x3f)];
      continue;
    }
    ++i;
    if (i >= s.length) throw new URIError('ERR_INVALID_URI');
    const c2 = s.charCodeAt(i) & 0x3ff;
    lastPos = i + 1;
    const cp = 0x10000 + (((c & 0x3ff) << 10) | c2);
    out +=
      hexTable[0xf0 | (cp >> 18)] +
      hexTable[0x80 | ((cp >> 12) & 0x3f)] +
      hexTable[0x80 | ((cp >> 6) & 0x3f)] +
      hexTable[0x80 | (cp & 0x3f)];
  }
  if (lastPos === 0) return s;
  if (lastPos < s.length) return out + s.slice(lastPos);
  return out;
}

export type QueryParams = Record<string, string[]>;

export class HttpRequest {
  method: string;
  host: string;
  uri: string;
  query: QueryParams;
  headers: Record<string, string>;
  body: string;

  constructor(method?: string, url?: string, headers?: Record<string, string>, body?: string) {
    this.method = method ?? '';
    this.headers = headers ?? {};
    this.body = body ?? '';
    this.query = {};
    this.host = '';
    this.uri = '';

    if (url !== undefined) {
      let u = url;
      const protoIdx = u.indexOf('://');
      if (protoIdx !== -1) u = u.substring(protoIdx + 3);

      const qIdx = u.indexOf('?');
      if (qIdx !== -1) {
        const queryStr = u.substring(qIdx + 1);
        u = u.substring(0, qIdx);
        for (const kv of queryStr.split('&')) {
          const eqIdx = kv.indexOf('=');
          let key: string;
          let value: string;
          if (eqIdx >= 0) {
            key = kv.substring(0, eqIdx);
            value = kv.substring(eqIdx + 1);
          } else {
            key = kv;
            value = '';
          }
          if (key) {
            key = decodeURI(key);
            value = decodeURI(value);
            const existing = this.query[key];
            if (existing === undefined) {
              this.query[key] = [value];
            } else {
              existing.push(value);
            }
          }
        }
      }

      const slashIdx = u.indexOf('/');
      if (slashIdx === -1) {
        this.host = u;
        this.uri = '/';
      } else {
        this.host = u.substring(0, slashIdx);
        this.uri = decodeURI(u.substring(slashIdx));
      }
    }
  }
}

export interface SignResult {
  hostname: string;
  path: string;
  method: string;
  headers: Record<string, string>;
}

export function findHeader(r: HttpRequest, header: string): string | null {
  for (const k of Object.keys(r.headers)) {
    if (k.toLowerCase() === header.toLowerCase()) return r.headers[k] as string;
  }
  return null;
}

export function SignedHeaders(r: HttpRequest): string[] {
  return Object.keys(r.headers)
    .map((k) => k.toLowerCase())
    .sort();
}

function hexEncodeSHA256Hash(body: string): string {
  return createHash('SHA256').update(body).digest().toString('hex');
}

function canonicalURI(r: HttpRequest): string {
  const parts = r.uri.split('/').map((v) => urlEncode(v));
  let urlpath = parts.join('/');
  if (urlpath[urlpath.length - 1] !== '/') urlpath += '/';
  return urlpath;
}

function canonicalQueryString(r: HttpRequest): string {
  const keys = Object.keys(r.query).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const encodedKey = urlEncode(key);
    const values = [...(r.query[key] ?? [])].sort();
    for (const v of values) {
      parts.push(encodedKey + '=' + urlEncode(v));
    }
  }
  return parts.join('&');
}

function canonicalHeaders(r: HttpRequest, signedHdrs: string[]): string {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.headers)) {
    lower[k.toLowerCase()] = v;
  }
  return signedHdrs.map((h) => h + ':' + (lower[h] ?? '').trim()).join('\n') + '\n';
}

export function CanonicalRequest(r: HttpRequest, signedHdrs: string[]): string {
  const hexencode = findHeader(r, HeaderContentSha256) ?? hexEncodeSHA256Hash(r.body);
  return (
    r.method +
    '\n' +
    canonicalURI(r) +
    '\n' +
    canonicalQueryString(r) +
    '\n' +
    canonicalHeaders(r, signedHdrs) +
    '\n' +
    signedHdrs.join(';') +
    '\n' +
    hexencode
  );
}

export function StringToSign(canonReq: string, t: string): string {
  return Algorithm + '\n' + t + '\n' + hexEncodeSHA256Hash(canonReq);
}

function signStringToSign(sts: string, signingKey: string): string {
  return createHmac('SHA256', signingKey).update(sts).digest().toString('hex');
}

function authHeaderValue(signature: string, key: string, signedHdrs: string[]): string {
  return (
    Algorithm + ' Access=' + key + ', SignedHeaders=' + signedHdrs.join(';') + ', Signature=' + signature
  );
}

function twoChar(s: number): string {
  return s >= 10 ? String(s) : '0' + s;
}

function getTime(): string {
  const d = new Date();
  return (
    String(d.getUTCFullYear()) +
    twoChar(d.getUTCMonth() + 1) +
    twoChar(d.getUTCDate()) +
    'T' +
    twoChar(d.getUTCHours()) +
    twoChar(d.getUTCMinutes()) +
    twoChar(d.getUTCSeconds()) +
    'Z'
  );
}

export class Signer {
  Key = '';
  Secret = '';

  Sign(r: HttpRequest): SignResult {
    let headerTime = findHeader(r, HeaderXDate);
    if (headerTime === null) {
      headerTime = getTime();
      r.headers[HeaderXDate] = headerTime;
    }
    if (r.method !== 'PUT' && r.method !== 'PATCH' && r.method !== 'POST') {
      r.body = '';
    }
    let queryString = canonicalQueryString(r);
    if (queryString !== '') queryString = '?' + queryString;

    if (findHeader(r, 'host') === null) {
      r.headers['host'] = r.host;
    }
    const signedHdrs = SignedHeaders(r);
    const canonReq = CanonicalRequest(r, signedHdrs);
    const sts = StringToSign(canonReq, headerTime);
    const signature = signStringToSign(sts, this.Secret);
    r.headers[HeaderAuthorization] = authHeaderValue(signature, this.Key, signedHdrs);

    return {
      hostname: r.host,
      path: encodeURI(r.uri) + queryString,
      method: r.method,
      headers: r.headers,
    };
  }
}
