# Cusi - Claude Code Hook

程序员猝死提醒 - Claude Code 插件

在深夜使用 Claude Code 时，自动提醒程序员注意休息和健康。

## 安装

```bash
cd claude-code-hook
npm run install-hook
```

## 卸载

```bash
npm run uninstall-hook
```

## 配置管理

```bash
# 查看状态
node src/cli.js status

# 暂停提醒
node src/cli.js pause 2          # 暂停 2 小时
node src/cli.js pause tonight    # 今晚不再提醒

# 恢复/禁用
node src/cli.js resume           # 恢复提醒
node src/cli.js disable          # 禁用提醒
node src/cli.js enable           # 启用提醒

# 修改设置
node src/cli.js set night-start 23   # 深夜开始时间
node src/cli.js set night-end 6      # 深夜结束时间
node src/cli.js set interval 60      # 提醒间隔 (分钟)

# 测试
node src/cli.js test             # 显示测试提醒

# 重置
node src/cli.js reset            # 重置为默认配置
```

## 工作原理

1. Hook 使用 Claude Code 的 `stop` 事件，在每次 Claude 完成响应后触发
2. 检查当前是否在深夜时段（默认 22:00-05:00）
3. 检查距上次提醒是否超过设定间隔（默认 45 分钟）
4. 如需提醒，输出健康警示信息

## 提醒策略

采用渐进式提醒：

| 级别 | 触发条件 | 内容 |
|------|----------|------|
| 温和 | 首次触发 | "现在是深夜，您已工作很长时间" |
| 警示 | 忽略后 30 分钟 | 展示程序员猝死事件摘要 |
| 强烈 | 继续忽略 | 展示完整事件详情 |

## 配置文件

- Claude 设置：`~/.claude/settings.json`
- Cusi 配置：`~/.cusi/config.json`
- Cusi 状态：`~/.cusi/state.json`

## 默认配置

```json
{
  "enabled": true,
  "nightStart": 22,
  "nightEnd": 5,
  "reminderInterval": 45,
  "escalationTime": 30,
  "showSource": true
}
```
