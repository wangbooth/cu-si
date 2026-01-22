#!/usr/bin/env node

/**
 * Cusi - 配置管理 CLI
 * 用于管理 Claude Code Hook 的配置
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.cusi');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const STATE_FILE = join(CONFIG_DIR, 'state.json');

const DEFAULT_CONFIG = {
  enabled: true,
  nightStart: 22,
  nightEnd: 5,
  reminderInterval: 45,
  pauseUntil: null,
  reminderLevel: 0,
  escalationTime: 30,
  showSource: true,
  language: 'zh'
};

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureConfigDir();
  if (existsSync(CONFIG_FILE)) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) };
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function clearState() {
  ensureConfigDir();
  writeFileSync(STATE_FILE, JSON.stringify({}, null, 2));
}

function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Cusi - 程序员猝死提醒 配置管理工具                   ║
╚══════════════════════════════════════════════════════════════╝

用法: cusi-config <命令> [参数]

命令:
  status              显示当前配置状态
  enable              启用提醒
  disable             禁用提醒
  pause <时长>        暂停提醒
                      - 1, 2, 3     暂停 1/2/3 小时
                      - tonight     今晚不再提醒 (到早上 6 点)
  resume              恢复提醒 (取消暂停)
  set <项> <值>       修改配置
                      - night-start <小时>    深夜开始时间 (0-23)
                      - night-end <小时>      深夜结束时间 (0-23)
                      - interval <分钟>       提醒间隔 (分钟)
  reset               重置为默认配置
  test                测试提醒 (立即显示一次提醒)

示例:
  cusi-config status
  cusi-config pause 2
  cusi-config pause tonight
  cusi-config set night-start 23
  cusi-config set interval 60

配置文件位置: ${CONFIG_FILE}
`);
}

function showStatus() {
  const config = loadConfig();
  const now = new Date();
  const hour = now.getHours();

  const isNight = config.nightStart > config.nightEnd
    ? (hour >= config.nightStart || hour < config.nightEnd)
    : (hour >= config.nightStart && hour < config.nightEnd);

  const isPaused = config.pauseUntil && new Date(config.pauseUntil) > now;

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                      Cusi 状态                               ║
╚══════════════════════════════════════════════════════════════╝

  启用状态: ${config.enabled ? '✅ 已启用' : '❌ 已禁用'}
  深夜时段: ${config.nightStart}:00 - ${config.nightEnd}:00
  提醒间隔: ${config.reminderInterval} 分钟
  当前时间: ${now.toLocaleTimeString('zh-CN')}
  是否深夜: ${isNight ? '🌙 是' : '☀️ 否'}
  暂停状态: ${isPaused ? `⏸️  暂停到 ${new Date(config.pauseUntil).toLocaleString('zh-CN')}` : '▶️  未暂停'}

配置文件: ${CONFIG_FILE}
`);
}

function pauseReminder(duration) {
  const config = loadConfig();
  let pauseUntil;

  if (duration === 'tonight') {
    // 暂停到明天早上 6 点
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(6, 0, 0, 0);
    pauseUntil = tomorrow;
  } else {
    const hours = parseInt(duration, 10);
    if (isNaN(hours) || hours < 1 || hours > 12) {
      console.error('❌ 无效的时长，请输入 1-12 的数字或 "tonight"');
      process.exit(1);
    }
    pauseUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  config.pauseUntil = pauseUntil.toISOString();
  saveConfig(config);

  console.log(`✅ 提醒已暂停到 ${pauseUntil.toLocaleString('zh-CN')}`);
}

function resumeReminder() {
  const config = loadConfig();
  config.pauseUntil = null;
  saveConfig(config);
  clearState();
  console.log('✅ 提醒已恢复');
}

function enableReminder() {
  const config = loadConfig();
  config.enabled = true;
  config.pauseUntil = null;
  saveConfig(config);
  console.log('✅ 提醒已启用');
}

function disableReminder() {
  const config = loadConfig();
  config.enabled = false;
  saveConfig(config);
  console.log('✅ 提醒已禁用');
}

function setSetting(key, value) {
  const config = loadConfig();

  switch (key) {
    case 'night-start':
    case 'nightStart': {
      const hour = parseInt(value, 10);
      if (isNaN(hour) || hour < 0 || hour > 23) {
        console.error('❌ 无效的小时数，请输入 0-23');
        process.exit(1);
      }
      config.nightStart = hour;
      console.log(`✅ 深夜开始时间已设置为 ${hour}:00`);
      break;
    }

    case 'night-end':
    case 'nightEnd': {
      const hour = parseInt(value, 10);
      if (isNaN(hour) || hour < 0 || hour > 23) {
        console.error('❌ 无效的小时数，请输入 0-23');
        process.exit(1);
      }
      config.nightEnd = hour;
      console.log(`✅ 深夜结束时间已设置为 ${hour}:00`);
      break;
    }

    case 'interval': {
      const minutes = parseInt(value, 10);
      if (isNaN(minutes) || minutes < 5 || minutes > 240) {
        console.error('❌ 无效的间隔时间，请输入 5-240 分钟');
        process.exit(1);
      }
      config.reminderInterval = minutes;
      console.log(`✅ 提醒间隔已设置为 ${minutes} 分钟`);
      break;
    }

    default:
      console.error(`❌ 未知的配置项: ${key}`);
      console.log('可用的配置项: night-start, night-end, interval');
      process.exit(1);
  }

  saveConfig(config);
}

function resetConfig() {
  saveConfig(DEFAULT_CONFIG);
  clearState();
  console.log('✅ 配置已重置为默认值');
}

function testReminder() {
  console.log(`
──────────────────────────────────────────────────────
⚠️ 健康警示 | ${new Date().toLocaleTimeString('zh-CN')}
──────────────────────────────────────────────────────

📋 某大厂程序员连续加班一周后在工位突发不适，经抢救无效离世。

📖 据同事反映，当事人此前已连续多日加班至凌晨，期间曾多次表示
胸闷、头痛，但因项目紧急未能及时就医。事发当天凌晨仍在处理线上
故障。

📍 广东 · 深圳 | 👤 30-35岁 | 🏢 互联网
📰 来源: 示例新闻

⏰ 这是一条测试提醒，提醒您关注自己的健康。

──────────────────────────────────────────────────────
暂停提醒: 运行 cusi-config pause [1|2|tonight]
关闭提醒: 运行 cusi-config disable
──────────────────────────────────────────────────────
`);
}

// ============================================================================
// 主程序
// ============================================================================

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'status':
  case undefined:
    showStatus();
    break;

  case 'enable':
    enableReminder();
    break;

  case 'disable':
    disableReminder();
    break;

  case 'pause':
    if (!args[1]) {
      console.error('❌ 请指定暂停时长，例如: cusi-config pause 2');
      process.exit(1);
    }
    pauseReminder(args[1]);
    break;

  case 'resume':
    resumeReminder();
    break;

  case 'set':
    if (!args[1] || !args[2]) {
      console.error('❌ 请指定配置项和值，例如: cusi-config set interval 60');
      process.exit(1);
    }
    setSetting(args[1], args[2]);
    break;

  case 'reset':
    resetConfig();
    break;

  case 'test':
    testReminder();
    break;

  case 'help':
  case '-h':
  case '--help':
    showHelp();
    break;

  default:
    console.error(`❌ 未知命令: ${command}`);
    showHelp();
    process.exit(1);
}
