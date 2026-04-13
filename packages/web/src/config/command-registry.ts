/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Slash command registry — single source of truth for all chat commands.
 * Used by useChatCommands (dispatch) and HubCommandsTab (display).
 *
 * To add a new command:
 * 1. Add a CommandDefinition here
 * 2. Add the handler in useChatCommands.ts
 * That's it — the "命令速查" tab picks it up automatically.
 */

export type CommandCategory = 'connector';

export interface CommandDefinition {
  /** The command string, e.g. '/help' */
  name: string;
  /** Usage pattern, e.g. '/config set <key> <value>' */
  usage: string;
  /** Human-readable description (Chinese) */
  description: string;
  /** Grouping category for display */
  category: CommandCategory;
}

export const COMMAND_CATEGORIES: Record<CommandCategory, string> = {
  connector: '跨平台',
};

export const COMMANDS: CommandDefinition[] = [
  // --- connector (F088, Telegram/飞书等跨平台命令) ---
  { name: '/where', usage: '/where', description: '查看当前绑定的 thread', category: 'connector' },
  { name: '/new', usage: '/new [标题]', description: '创建新 thread 并切换', category: 'connector' },
  { name: '/threads', usage: '/threads', description: '列出最近的 threads', category: 'connector' },
  { name: '/use', usage: '/use <F号|序号|关键词>', description: '切换到指定 thread', category: 'connector' },
];
