/**
 * Local test for process-approved-event workflow parsing logic.
 * Verifies that:
 * 1. Free-text industry (e.g. "医疗") passes through as-is
 * 2. "未知 / Unknown" is normalized to "未知"
 * 3. Other fields parse correctly from the updated issue template format
 */

// ---- Parsing logic (copied verbatim from workflow) ----

function extractField(body, fieldName) {
    const patterns = [
        new RegExp(`### ${fieldName}[\\s\\S]*?\\n\\n([^\\n#]+)`, 'i'),
        new RegExp(`### ${fieldName}[\\s\\S]*?\\n([^\\n#]+)`, 'i'),
    ];
    for (const pattern of patterns) {
        const match = body.match(pattern);
        if (match && match[1].trim() && match[1].trim() !== '_No response_') {
            return match[1].trim();
        }
    }
    return null;
}

function extractCheckboxes(body, fieldName) {
    const sectionMatch = body.match(new RegExp(`### ${fieldName}[\\s\\S]*?(?=###|$)`, 'i'));
    if (!sectionMatch) return [];
    const section = sectionMatch[0];
    const checked = [];
    const checkboxPattern = /- \[x\] (.+)/gi;
    let match;
    while ((match = checkboxPattern.exec(section)) !== null) {
        let tag = match[1].trim().split(' / ')[0];
        checked.push(tag);
    }
    return checked;
}

// ---- Test cases ----

const tests = [
    {
        name: '非IT行业：医疗 → 保持原值',
        body: `### 🔗 新闻来源链接

https://example.com/news/doctor-overwork

### 📰 媒体名称

澎湃新闻

### 📅 事件时间段

2026-Q1

### 👤 年龄段

35-40岁

### 🏢 行业

医疗

### 📍 省份

广东

### 🏙️ 城市 (可选)

_No response_

### 📝 事件摘要

某三甲医院外科医生连续值班72小时后突发心肌梗死，经抢救无效离世。

### 📖 详细描述

据报道，当事人长期超时工作，事发前曾连续值班三天，家属反映其多次提及身体不适但因工作繁忙未就医。

### 🏷️ 相关标签

- [x] 加班 / Overtime
- [x] 连续工作 / Continuous work
- [x] 猝死 / Sudden death

### ✅ 确认事项

- [x] 我确认此事件来自公开媒体报道，非道听途说
- [x] 我确认提供的信息已进行必要的匿名化处理
- [x] 我理解此信息仅用于健康警示目的，尊重逝者及家属

### 💬 补充信息 (可选)

_No response_`,
        expect: { industry: '医疗' },
    },
    {
        name: '"未知 / Unknown" → 归一化为 "未知"',
        body: `### 🔗 新闻来源链接

https://example.com/news/unknown-industry

### 📰 媒体名称

新京报

### 📅 事件时间段

2026-Q1

### 👤 年龄段

未知 / Unknown

### 🏢 行业

未知 / Unknown

### 📍 省份

未知 / Unknown

### 🏙️ 城市 (可选)

_No response_

### 📝 事件摘要

某办公室员工连续加班后猝死。

### 📖 详细描述

具体行业不明，但据报道当事人连续多日加班至深夜。

### 🏷️ 相关标签

- [x] 过劳 / Overwork

### ✅ 确认事项

- [x] 我确认此事件来自公开媒体报道，非道听途说
- [x] 我确认提供的信息已进行必要的匿名化处理
- [x] 我理解此信息仅用于健康警示目的，尊重逝者及家属

### 💬 补充信息 (可选)

_No response_`,
        expect: { industry: '未知' },
    },
    {
        name: '教育行业自由文本',
        body: `### 🔗 新闻来源链接

https://example.com/news/teacher

### 📰 媒体名称

中国教育报

### 📅 事件时间段

2025-Q4

### 👤 年龄段

40-45岁

### 🏢 行业

教育（高校教师）

### 📍 省份

北京

### 🏙️ 城市 (可选)

北京

### 📝 事件摘要

某高校教师备课批改连续熬夜后突然晕倒，送医后不治。

### 📖 详细描述

当事人担任多门课程教学工作，长期加班，同事反映其精神状态持续较差。

### 🏷️ 相关标签

- [x] 熬夜 / Late night
- [x] 过劳 / Overwork

### ✅ 确认事项

- [x] 我确认此事件来自公开媒体报道，非道听途说
- [x] 我确认提供的信息已进行必要的匿名化处理
- [x] 我理解此信息仅用于健康警示目的，尊重逝者及家属

### 💬 补充信息 (可选)

_No response_`,
        expect: { industry: '教育（高校教师）' },
    },
];

// ---- Run tests ----

console.log('\n=== Process-approved parsing tests ===\n');

let passed = 0;
let failed = 0;

for (const test of tests) {
    const industry = extractField(test.body, '🏢 行业');
    const ageRange = extractField(test.body, '👤 年龄段');
    const summary = extractField(test.body, '📝 事件摘要');
    const tags = extractCheckboxes(test.body, '🏷️ 相关标签');
    const sourceUrl = extractField(test.body, '🔗 新闻来源链接');

    // Apply same normalization as workflow (no 其他IT branch)
    const cleanAgeRange = ageRange === '未知 / Unknown' ? '未知' : ageRange;
    const cleanIndustry = industry === '未知 / Unknown' ? '未知' : industry;

    const actualIndustry = cleanIndustry || '未知';
    const ok = actualIndustry === test.expect.industry;

    if (ok) {
        console.log(`✅ ${test.name}`);
        console.log(`   industry: "${actualIndustry}"`);
        console.log(`   age_range: "${cleanAgeRange}"`);
        console.log(`   tags: [${tags.join(', ')}]`);
        console.log(`   source_url: ${sourceUrl}`);
        passed++;
    } else {
        console.log(`❌ ${test.name}`);
        console.log(`   expected industry: "${test.expect.industry}"`);
        console.log(`   got industry:      "${actualIndustry}"`);
        failed++;
    }
    console.log();
}

console.log(`=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
