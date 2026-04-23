#!/usr/bin/env node
/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */


/**
 * OfficeClaw MCP Server — Signals Surface
 * 只暴露 Signal Hunter 工具。
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerSignalToolset } from './server-toolsets.js';
import { initOfficeClawDir } from './utils/path-validator.js';

function createBaseServer(name: string): McpServer {
  return new McpServer({
    name,
    version: '0.1.0',
  });
}

/**
 * Create a Signals MCP server instance with Signal Hunter tools
 * (inbox, search, study, article management) registered.
 */
export function createSignalsServer(): McpServer {
  const server = createBaseServer('office-claw-signals-mcp');
  registerSignalToolset(server);
  return server;
}

async function main(): Promise<void> {
  initOfficeClawDir();
  const server = createSignalsServer();
  const transport = new StdioServerTransport();
  console.error('[office-claw-signals] MCP Server starting...');
  await server.connect(transport);
  console.error('[office-claw-signals] MCP Server running on stdio');
}

const isEntryPoint = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isEntryPoint) {
  main().catch((err) => {
    console.error('[office-claw-signals] Fatal error:', err);
    process.exit(1);
  });
}
