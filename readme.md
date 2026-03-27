# 过劳猝死提醒 (cu-si)

深夜还在用 Claude Code？这个工具会在你工作时，用**真实发生过的过劳猝死事件**提醒你注意健康。

事件来自公开媒体报道，覆盖互联网、医疗、教育、金融等各行业，不只是程序员。

## 安装

### 用户级（推荐）

安装一次，所有项目生效：

```bash
curl -fsSL https://raw.githubusercontent.com/wangbooth/cu-si/main/install.sh | bash -s -- --user
```

### 项目级

在项目根目录运行，只对当前项目生效：

```bash
curl -fsSL https://raw.githubusercontent.com/wangbooth/cu-si/main/install.sh | bash -s -- --project
```

### 卸载

```bash
# 用户级
curl -fsSL https://raw.githubusercontent.com/wangbooth/cu-si/main/install.sh | bash -s -- uninstall --user

# 项目级（在项目根目录运行）
curl -fsSL https://raw.githubusercontent.com/wangbooth/cu-si/main/install.sh | bash -s -- uninstall --project
```

**系统要求**：Node.js 18+、Claude Code

## 工作原理

每次 Claude 完成回应后，hook 自动检测：

- 当前是否在深夜时段（默认 22:00–05:00）
- 距上次提醒是否已超过间隔（默认 45 分钟）

满足条件时，直接在 Claude Code 界面弹出提醒。提醒分三个级别，随着持续忽略逐步升级：

| 级别 | 内容 |
|------|------|
| 温和提示 | 简短的休息提醒，随机变换措辞 |
| 健康警示 | 一条真实事件的摘要 |
| 紧急警示 | 事件完整详情 |

## 管理提醒

安装后，直接在 Claude Code 对话里说就行：

- "暂停提醒 2 小时"
- "今晚不再提醒"
- "关闭提醒"
- "把提醒时间改成 23 点到 6 点"

Claude 会直接帮你修改配置，无需运行任何命令。

## 贡献事件

发现了一条真实的过劳/猝死事件报道？[提交 Issue](../../issues/new/choose) 即可。

所有事件必须来自公开媒体，经人工审核后自动入库。

## 免责声明

本工具展示的事件均来自公开媒体报道，仅供健康警示参考，不代表官方认定。所有信息经过匿名化处理，尊重每一位逝者及其家属。
