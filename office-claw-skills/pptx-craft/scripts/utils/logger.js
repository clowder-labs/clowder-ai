/**
 * 轻量级日志模块
 *
 * 支持 log / warn / error 三个级别，带 ANSI 颜色区分。
 * error 级别始终可见，不可关闭。
 * 自动检测 TTY 环境，非终端时关闭颜色。
 *
 * 用法：
 *   import { log, warn, error, configureFromArgs } from '../utils/logger.js';
 *   configureFromArgs(process.argv.slice(2));  // 解析 --log-level=log|warn|error
 *   log('正常信息');
 *   warn('警告信息');   // 黄色
 *   error('错误信息');  // 红色
 */

// ANSI 颜色码
const ANSI = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

// 日志级别：数值越小越重要
// log(2) 显示所有，warn(1) 只显示 warn+error，error(0) 只显示 error
const LEVELS = { error: 0, warn: 1, log: 2 };

let currentLevel = LEVELS.log;

/**
 * 检测当前是否应该输出 ANSI 颜色码
 * spawnSync + stdio:'inherit' 会继承主进程的 TTY 状态
 */
function shouldColorize() {
  return process.stdout.isTTY !== false;
}

/**
 * 设置日志级别
 * @param {'error'|'warn'|'log'} level
 */
function setLevel(level) {
  if (LEVELS[level] !== undefined) {
    currentLevel = LEVELS[level];
  }
}

/**
 * 从 CLI 参数中解析 --log-level 标志
 * @param {string[]} args - process.argv.slice(2)
 */
function configureFromArgs(args) {
  const levelArg = args.find(a => a.startsWith('--log-level='));
  if (levelArg) {
    const level = levelArg.split('=')[1];
    if (LEVELS[level] !== undefined) {
      currentLevel = LEVELS[level];
    }
  }
}

/**
 * 标准日志 — 不着色，保持 emoji 原生风格
 * 用于：标题行、配置信息、文件处理结果、统计摘要
 */
function log(...msgs) {
  if (LEVELS.log <= currentLevel) {
    console.log(...msgs);
  }
}

/**
 * 警告日志 — 黄色高亮
 * 用于：非致命异常、部分文件失败等
 */
function warn(...msgs) {
  if (LEVELS.warn <= currentLevel) {
    if (shouldColorize()) {
      console.warn(ANSI.yellow + msgs.join(' ') + ANSI.reset);
    } else {
      console.warn(...msgs);
    }
  }
}

/**
 * 错误日志 — 红色高亮，始终可见
 * 用于：用法提示、参数错误、路径不存在、致命错误
 */
function error(...msgs) {
  if (shouldColorize()) {
    console.error(ANSI.red + msgs.join(' ') + ANSI.reset);
  } else {
    console.error(...msgs);
  }
}

export { log, warn, error, setLevel, configureFromArgs, LEVELS };
