/**
 * Global fetch proxy dispatcher setup.
 *
 * Node.js v22 native `fetch()` does NOT honor `HTTPS_PROXY` / `HTTP_PROXY`
 * environment variables. This module bridges that gap by installing undici's
 * `EnvHttpProxyAgent` as the global dispatcher when proxy env vars are detected.
 *
 * `EnvHttpProxyAgent` automatically reads:
 *   - `HTTP_PROXY` / `http_proxy`
 *   - `HTTPS_PROXY` / `https_proxy`
 *   - `NO_PROXY` / `no_proxy`   (bypass list; typically `localhost,127.0.0.1,::1`)
 *
 * Import this module as a side-effect import at the top of the server entry
 * point — before any code that calls `fetch()`.
 *
 * Why global: CatAgentService (and potentially other outbound HTTP clients)
 * use native `fetch()`. A global dispatcher is the only way to make native
 * `fetch()` proxy-aware without patching every call site.
 */

import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { createModuleLogger } from './logger.js';

const log = createModuleLogger('proxy-dispatcher');

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;

if (proxyUrl) {
  try {
    setGlobalDispatcher(new EnvHttpProxyAgent());
    log.info(`Global fetch proxy enabled: ${proxyUrl}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Failed to set global proxy dispatcher: ${msg}`);
  }
}
