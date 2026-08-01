#!/usr/bin/env node

process.env.CAT_CAFE_SKIP_PRODUCTION_INSTALL_GUARD = '1';

await import('./check-node-runtime.mjs');
