1. 项目概述

项目目标：开发一个专注提醒程序员避免过度熬夜加班的工具，通过真实、具体、最近的程序员猝死事件作为强烈视觉/心理冲击，打破“就这一次”的自我麻木循环。
核心理念：注意力在哪里，提醒就在哪里。优先在用户最专注的场景（浏览器、VS Code、Claude Code 等）介入。
定位：警示工具 + 健康倡导工具，非单纯吓唬。

2. 用户画像

主要用户：18-45岁中国程序员、测试、产品、运维等IT从业者。
痛点：经常熬夜加班，明知风险却容易麻木，循环“震惊→忘记→继续熬夜”。
使用场景：深夜编码、查文档、debug、review代码时。

3. 猝死提醒方式
优选选择最近发生的、距离用户较近的一些事件来提醒用户，以增强现实感和紧迫感。提醒内容需要友善但震撼，避免过于血腥或恐怖。

4. 核心功能需求（Functional Requirements）

4.1 Claude Code Hook
通过 hooks 在用户输入 Prompt 时判断是否处于深夜时间段（默认21:00-05:00，可自定义），如果是，则选择合适的猝死事件进行提醒。使用 prompt 类型的 hook 来实现。


4.2 Chrome 浏览器扩展

深夜时段（默认21:00-05:00，可自定义）每45-90分钟随机触发一次提醒。
获取用户大致地理位置，只取国家、省份、城市（缓存到localStorage，首次使用时获取）
支持fallback（网络失败时显示全国最新）

弹窗形式：
chrome.notifications（系统通知）+ 可选打开popup页面（更大展示）
强制阅读至少5秒（可通过setTimeout控制按钮可用）
按钮：【查看原文】、【今晚早睡】（点击后当天暂停提醒）、【关闭】

支持用户手动添加/编辑事件（本地存储）

4.3 VS Code 扩展

触发条件：深夜 + 连续编辑/保存文件超过N次（默认2小时内保存≥5次）
使用相同事件数据库和位置逻辑
弹窗使用 vscode.window.showWarningMessage 或自定义Webview
额外：检测git commit频率高时提高提醒频率

4.4 事件数据库

格式：JSON数组，按时间倒序（最新在上）
每条事件字段（必填）：
id
date (YYYY-MM-DD)
name（匿名化，如“李某”）
age
company（脱敏，如“某互联网大厂”）
province
city（精确到市级，如“广州”“武汉”“北京”）
details（关键震撼细节，200字以内）
source（新闻链接）
impact（可选：妻子催下班、抢救时被拉群、死后收消息等）

4.5 事实核查
通过 DeepResearch 来核查事件的真实性，确保所有事件均有公开报道来源，避免谣言。


5. 非功能需求

隐私：不收集、不上传任何个人信息；IP仅用于本地计算位置，不存储原始IP
性能：扩展体积<1MB，启动快
可用性：支持深色/浅色模式；弹窗文案震撼但不惊悚过度
可维护性：事件数据放在独立JSON文件，便于GitHub更新
兼容性：Chrome 最新版 + Edge；VS Code 1.80+
国际化：初始支持中英双语（可选）

6. 技术栈建议

Chrome Extension：Manifest V3 + JavaScript/TypeScript + Vite（推荐）
VS Code Extension：TypeScript + VS Code Extension API
存储：chrome.storage.local / vscode.ExtensionContext.globalState
事件管理：在公共 github 仓库中通过 issue 公开收集事件，github action 来将 issue 整理成 JSON 数据并更新到仓库中的 json 文件中，外部会用 ChatGPT Tasks 来定时获取事件数据并更新到 github issue 里。
可选：Tailwind CSS（美化popup）



7. 风险与注意事项

法律风险：所有事件必须来自公开媒体报道，注明来源，加免责声明（“仅供警示，非官方认定”）
伦理：尊重逝者及家属，匿名化处理敏感信息
API稳定性：ip-api.com可能有速率限制或被墙，准备2-3个备选API
审核风险：Chrome Web Store审核时需避免过于血腥文案
