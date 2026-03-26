#!/usr/bin/env node

/**
 * Cusi - 安装/卸载脚本
 * 将 hook 添加到 Claude Code 的配置中
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse optional overrides from CLI args (used by install.sh for project-level installs)
// --settings-file=/path/to/settings.json
// --hook-path=/path/to/hook.js
const _args = process.argv.slice(2);
function _getFlag(name) {
  const entry = _args.find(a => a.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : null;
}

const CLAUDE_CONFIG_DIR = join(homedir(), '.claude');
const CLAUDE_SETTINGS_FILE = _getFlag('--settings-file') || join(CLAUDE_CONFIG_DIR, 'settings.json');
const HOOK_SCRIPT = _getFlag('--hook-path') || join(__dirname, 'hook.js');
const CUSI_CONFIG_DIR = join(homedir(), '.cusi');

const HOOK_NAME = 'cusi-health-reminder';

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadClaudeSettings() {
  ensureDir(dirname(CLAUDE_SETTINGS_FILE));
  if (existsSync(CLAUDE_SETTINGS_FILE)) {
    try {
      return JSON.parse(readFileSync(CLAUDE_SETTINGS_FILE, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveClaudeSettings(settings) {
  ensureDir(dirname(CLAUDE_SETTINGS_FILE));
  writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function install() {
  console.log('🔧 正在安装 Cusi Claude Code Hook...\n');

  // 确保 hook 脚本有执行权限
  try {
    chmodSync(HOOK_SCRIPT, '755');
  } catch (e) {
    console.warn('⚠️  无法设置执行权限，可能需要手动执行: chmod +x', HOOK_SCRIPT);
  }

  // 加载 Claude 设置
  const settings = loadClaudeSettings();

  // 初始化 hooks 配置
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // 添加 stop hook
  if (!settings.hooks.stop) {
    settings.hooks.stop = [];
  }

  // 检查是否已安装
  const existingHookIndex = settings.hooks.stop.findIndex(
    hook => hook.name === HOOK_NAME || (hook.command && hook.command.includes('cusi'))
  );

  const hookConfig = {
    name: HOOK_NAME,
    command: `node "${HOOK_SCRIPT}"`,
    description: '程序员健康提醒 - 深夜工作时提醒注意休息'
  };

  if (existingHookIndex >= 0) {
    // 更新现有 hook
    settings.hooks.stop[existingHookIndex] = hookConfig;
    console.log('📝 更新现有 hook 配置');
  } else {
    // 添加新 hook
    settings.hooks.stop.push(hookConfig);
    console.log('➕ 添加新 hook 配置');
  }

  // 保存设置
  saveClaudeSettings(settings);

  // 创建 cusi 配置目录
  ensureDir(CUSI_CONFIG_DIR);

  console.log(`
✅ 安装成功！

配置信息:
  Claude 设置: ${CLAUDE_SETTINGS_FILE}
  Cusi 配置:   ${CUSI_CONFIG_DIR}
  Hook 脚本:   ${HOOK_SCRIPT}

使用方法:
  cusi-config status     查看当前状态
  cusi-config pause 2    暂停 2 小时
  cusi-config disable    禁用提醒
  cusi-config help       查看帮助

Hook 将在每次 Claude 完成响应后检查是否需要提醒。
深夜时段 (默认 22:00-05:00) 会收到健康提醒。
`);
}

function uninstall() {
  console.log('🔧 正在卸载 Cusi Claude Code Hook...\n');

  const settings = loadClaudeSettings();

  if (settings.hooks && settings.hooks.stop) {
    const initialLength = settings.hooks.stop.length;
    settings.hooks.stop = settings.hooks.stop.filter(
      hook => hook.name !== HOOK_NAME && !(hook.command && hook.command.includes('cusi'))
    );

    if (settings.hooks.stop.length < initialLength) {
      saveClaudeSettings(settings);
      console.log('✅ Hook 已从 Claude 配置中移除');
    } else {
      console.log('ℹ️  未找到已安装的 hook');
    }
  } else {
    console.log('ℹ️  Claude 配置中没有 hooks');
  }

  console.log(`
卸载完成。

注意：Cusi 的配置文件保留在 ${CUSI_CONFIG_DIR}
如需完全删除，请手动运行:
  rm -rf ${CUSI_CONFIG_DIR}
`);
}

// ============================================================================
// 主程序
// ============================================================================

if (_args.includes('--uninstall') || _args.includes('-u') || _args.includes('uninstall')) {
  uninstall();
} else {
  install();
}
