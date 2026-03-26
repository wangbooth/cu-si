#!/usr/bin/env node

/**
 * Cusi - Claude Code Hook
 * 程序员猝死提醒 - 在深夜工作时提醒程序员注意健康
 *
 * Hook 类型: stop (在 Claude 完成响应后触发)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// 配置路径
// ============================================================================

const CONFIG_DIR = join(homedir(), '.cusi');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const STATE_FILE = join(CONFIG_DIR, 'state.json');
const EVENTS_FILE = join(__dirname, '..', '..', 'data', 'events.json');

const EVENTS_UPDATE_URL = 'https://raw.githubusercontent.com/wangbooth/cu-si/main/data/events.json';
const EVENTS_UPDATE_INTERVAL_DAYS = 7;

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG = {
  enabled: true,
  nightStart: 22,        // 深夜开始时间 (24小时制)
  nightEnd: 5,           // 深夜结束时间
  reminderInterval: 45,  // 提醒间隔 (分钟)
  pauseUntil: null,      // 暂停到某个时间点
  reminderLevel: 0,      // 当前提醒级别 (0: 温和, 1: 警示, 2: 强烈)
  escalationTime: 30,    // 升级提醒的时间间隔 (分钟)
  showSource: true,      // 是否显示新闻来源
  language: 'zh'         // 语言
};

// ============================================================================
// 工具函数
// ============================================================================

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureConfigDir();
  if (existsSync(CONFIG_FILE)) {
    try {
      const content = readFileSync(CONFIG_FILE, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
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

function loadState() {
  ensureConfigDir();
  if (existsSync(STATE_FILE)) {
    try {
      const content = readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }
  return {};
}

function saveState(state) {
  ensureConfigDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadEvents() {
  // 先尝试从项目目录加载
  if (existsSync(EVENTS_FILE)) {
    try {
      const content = readFileSync(EVENTS_FILE, 'utf8');
      return JSON.parse(content).events || [];
    } catch {
      // 继续尝试其他路径
    }
  }

  // 尝试从配置目录加载
  const localEventsFile = join(CONFIG_DIR, 'events.json');
  if (existsSync(localEventsFile)) {
    try {
      const content = readFileSync(localEventsFile, 'utf8');
      return JSON.parse(content).events || [];
    } catch {
      // 返回内置事件
    }
  }

  // 返回内置的示例事件
  return getBuiltinEvents();
}

function getBuiltinEvents() {
  return [
    {
      id: 'BUILTIN-001',
      date_period: '2024-Q4',
      age_range: '30-35岁',
      industry: '互联网',
      province: '广东',
      city: '深圳',
      summary: '某大厂程序员连续加班一周后在工位突发不适，经抢救无效离世。',
      details: '据同事反映，当事人此前已连续多日加班至凌晨，期间曾多次表示胸闷、头痛，但因项目紧急未能及时就医。事发当天凌晨仍在处理线上故障。',
      source: 'https://example.com/news/1',
      source_name: '示例新闻',
      tags: ['加班', '熬夜', '忽视身体信号', '猝死']
    },
    {
      id: 'BUILTIN-002',
      date_period: '2024-Q3',
      age_range: '25-30岁',
      industry: '游戏',
      province: '上海',
      summary: '游戏公司开发者上线前连续通宵，回家后突发意外。',
      details: '为赶游戏上线节点，团队连续多日通宵加班。当事人在项目上线后回家休息时突发不适，送医后不治。',
      source: 'https://example.com/news/2',
      source_name: '示例新闻',
      tags: ['连续工作', '熬夜', '过劳', '猝死']
    }
  ];
}

// ============================================================================
// 时间检查
// ============================================================================

function isNightTime(config) {
  const now = new Date();
  const hour = now.getHours();

  // 处理跨午夜的情况 (如 22:00 - 05:00)
  if (config.nightStart > config.nightEnd) {
    return hour >= config.nightStart || hour < config.nightEnd;
  }
  return hour >= config.nightStart && hour < config.nightEnd;
}

function isPaused(config) {
  if (!config.pauseUntil) return false;
  const pauseUntil = new Date(config.pauseUntil);
  return new Date() < pauseUntil;
}

function shouldRemind(config, state) {
  if (!config.enabled) return false;
  if (!isNightTime(config)) return false;
  if (isPaused(config)) return false;

  const lastReminder = state.lastReminder ? new Date(state.lastReminder) : null;
  if (!lastReminder) return true;

  const minutesSinceLastReminder = (Date.now() - lastReminder.getTime()) / 1000 / 60;
  return minutesSinceLastReminder >= config.reminderInterval;
}

// ============================================================================
// 提醒级别与内容
// ============================================================================

function getReminderLevel(config, state) {
  if (!state.lastReminder) return 0;

  const lastEscalation = state.lastEscalation ? new Date(state.lastEscalation) : null;
  if (!lastEscalation) return 0;

  const minutesSinceEscalation = (Date.now() - lastEscalation.getTime()) / 1000 / 60;

  // 如果用户忽略了上次提醒，升级级别
  if (state.ignoredLastReminder && minutesSinceEscalation >= config.escalationTime) {
    return Math.min((state.currentLevel || 0) + 1, 2);
  }

  return state.currentLevel || 0;
}

function selectEvent(events, state) {
  if (events.length === 0) return null;

  // 避免重复展示最近展示过的事件
  const recentlyShown = state.recentlyShownEvents || [];
  const availableEvents = events.filter(e => !recentlyShown.includes(e.id));

  // 如果都展示过了，清空记录重新开始
  const pool = availableEvents.length > 0 ? availableEvents : events;

  // 随机选择一个事件
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

function formatReminder(event, level, config) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const divider = '─'.repeat(50);
  const warningIcon = level === 0 ? '💡' : level === 1 ? '⚠️' : '🚨';
  const levelText = level === 0 ? '温馨提示' : level === 1 ? '健康警示' : '紧急警示';

  let message = `\n${divider}\n`;
  message += `${warningIcon} ${levelText} | ${timeStr}\n`;
  message += `${divider}\n\n`;

  if (level === 0) {
    // 温和提醒
    message += `现在是深夜 ${timeStr}，您已经工作很长时间了。\n`;
    message += `\n💤 建议：适当休息，保护身体。\n`;
  } else {
    // 警示/强烈警示 - 展示事件
    if (event) {
      message += `📋 ${event.summary}\n\n`;

      if (level === 2 && event.details) {
        message += `📖 ${event.details}\n\n`;
      }

      message += `📍 ${event.province}${event.city ? ' · ' + event.city : ''} | `;
      message += `👤 ${event.age_range} | 🏢 ${event.industry}\n`;

      if (config.showSource && event.source_name) {
        message += `📰 来源: ${event.source_name}\n`;
      }

      message += `\n`;
    }

    message += `⏰ 现在是 ${timeStr}，请认真考虑是否需要继续工作。\n`;
  }

  message += `\n${divider}\n`;
  message += `暂停提醒: 运行 cusi-config pause [1|2|tonight]\n`;
  message += `关闭提醒: 运行 cusi-config disable\n`;
  message += `${divider}\n`;

  return message;
}

// ============================================================================
// 主逻辑
// ============================================================================

// ============================================================================
// 后台事件数据更新
// ============================================================================

function scheduleEventsUpdate() {
  const localEventsFile = join(CONFIG_DIR, 'events.json');
  try {
    const stat = statSync(localEventsFile);
    const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays < EVENTS_UPDATE_INTERVAL_DAYS) return;
  } catch {
    // file doesn't exist yet, skip background update (install.sh handles first download)
    return;
  }

  // Spawn detached child process to download in background without blocking exit
  const script = `
    const https = require('https');
    const fs = require('fs');
    const url = process.env.CUSI_EVENTS_URL;
    const dest = process.env.CUSI_EVENTS_DEST;
    https.get(url, res => {
      if (res.statusCode !== 200) return;
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { JSON.parse(data); fs.writeFileSync(dest, data); } catch (_) {}
      });
    }).on('error', () => {});
  `;

  const child = spawn(process.execPath, ['-e', script], {
    detached: true,
    stdio: 'ignore',
    env: { CUSI_EVENTS_URL: EVENTS_UPDATE_URL, CUSI_EVENTS_DEST: localEventsFile }
  });
  child.unref();
}

function main() {
  scheduleEventsUpdate();

  const config = loadConfig();
  const state = loadState();

  // 检查是否应该提醒
  if (!shouldRemind(config, state)) {
    process.exit(0);
  }

  // 获取提醒级别
  const level = getReminderLevel(config, state);

  // 加载事件数据
  const events = loadEvents();

  // 选择事件 (仅在警示级别时需要)
  const event = level > 0 ? selectEvent(events, state) : null;

  // 格式化并输出提醒
  const reminder = formatReminder(event, level, config);
  console.error(reminder);  // 使用 stderr 以便不影响 Claude 的输出

  // 更新状态
  const newState = {
    ...state,
    lastReminder: new Date().toISOString(),
    lastEscalation: state.lastEscalation || new Date().toISOString(),
    currentLevel: level,
    ignoredLastReminder: true,  // 假设用户会忽略，下次检查时判断
    recentlyShownEvents: event
      ? [...(state.recentlyShownEvents || []).slice(-9), event.id]
      : state.recentlyShownEvents || []
  };

  saveState(newState);
  process.exit(0);
}

// 运行
main();
