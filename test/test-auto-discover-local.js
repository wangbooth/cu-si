/**
 * Local test for auto-discover-events workflow logic.
 * Calls Grok with the updated search terms, runs post-processing,
 * and prints what candidates would be submitted as issues.
 *
 * Skips: GitHub API (open issues dedup), actual issue creation.
 * Does run: Grok x_search + response parsing + validation loop.
 */

const https = require('https');
const http = require('http');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.resolve(__dirname, '../.env');
const env = Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
        .split('\n')
        .filter(l => l && !l.startsWith('#'))
        .map(l => l.split('=').map((p, i) => i === 0 ? p : l.slice(l.indexOf('=') + 1)))
);

const GROK_API_KEY = env.GROK_API_KEY;
const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = env.OPENROUTER_MODEL || 'minimax/minimax-m2.5:free';
const SEARCH_DAYS = parseInt(process.env.SEARCH_DAYS || '30', 10);

// ============================================================
// Constants (copied from workflow — VALID_INDUSTRIES removed)
// ============================================================

const VALID_TAGS = ['加班', '熬夜', '连续工作', '忽视身体信号', '猝死', '过劳'];
const VALID_AGE_RANGES = ['20-25岁', '25-30岁', '30-35岁', '35-40岁', '40-45岁', '45岁以上', '未知'];
const MAX_ISSUES_PER_RUN = 5;

// ============================================================
// Helper: HTTPS POST (with HTTP proxy tunnel support)
// ============================================================

function httpsPost(url, headers, body, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
        const payload = JSON.stringify(body);

        const makeRequest = (socket) => {
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    ...headers,
                },
                timeout: timeoutMs,
                ...(socket ? { socket, createConnection: () => socket } : {}),
            };
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try { resolve(JSON.parse(data)); }
                        catch (e) { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
                    }
                });
            });
            req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout`)); });
            req.on('error', reject);
            req.write(payload);
            req.end();
        };

        if (proxyUrl) {
            const proxy = new URL(proxyUrl);
            const conn = net.connect(parseInt(proxy.port), proxy.hostname, () => {
                conn.write(`CONNECT ${urlObj.hostname}:443 HTTP/1.1\r\nHost: ${urlObj.hostname}:443\r\n\r\n`);
                conn.once('data', (data) => {
                    if (!data.toString().includes('200')) {
                        return reject(new Error(`Proxy CONNECT failed: ${data.toString().slice(0, 100)}`));
                    }
                    const tlsSocket = tls.connect({ socket: conn, servername: urlObj.hostname }, () => {
                        makeRequest(tlsSocket);
                    });
                    tlsSocket.on('error', reject);
                });
            });
            conn.on('error', reject);
        } else {
            makeRequest(null);
        }
    });
}

// ============================================================
// Main
// ============================================================

(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - SEARCH_DAYS * 86400000).toISOString().slice(0, 10);

    console.log(`\n=== Auto-discover local test ===`);
    console.log(`Search range: ${fromDate} → ${today} (${SEARCH_DAYS} days)\n`);

    // ---- Step 1: Grok x_search ----

    const systemPrompt = [
        'You are an event researcher for a workplace health awareness project.',
        'Search X broadly for reports of people who died suddenly (猝死/突然去世) where there is',
        'evidence — explicit or circumstantial — that work contributed to the death.',
        'Qualifying signals include: heavy workload, long hours, overtime, late-night work,',
        'ignoring body warning signs, or work-related stress. The word "过劳" does NOT need to',
        'appear. A public figure dying of cardiac arrest (心源性猝死) after intense work periods',
        'qualifies. Any profession qualifies — tech, medical, education, finance, entertainment, etc.',
        '',
        'Use multiple search strategies: search for 猝死, 心源性猝死, 突发去世, sudden death,',
        'and also search for specific recent high-profile cases you are aware of.',
        '',
        'For each event found, assess its credibility on a scale of 1-10 based on:',
        '- Is it from a credible news source or verified account?',
        '- Are there corroborating posts?',
        '- Does it contain specific details (industry, location, circumstances)?',
        '- Is it a real incident report (not opinion/commentary/satire)?',
        '',
        'Only include events with credibility >= 7.',
        '',
        'For each qualifying event, extract:',
        '- date_period: fuzzy time period (e.g. "2026-Q1")',
        '- age_range: one of "20-25岁","25-30岁","30-35岁","35-40岁","40-45岁","45岁以上","未知"',
        '- industry: free-form string describing the person\'s industry, e.g. "互联网", "医疗", "教育", "金融", "制造业", "传媒", "政府", "未知"',
        '- province: Chinese province or country name for international events',
        '- city: major city only, optional',
        '- summary: event summary in Chinese, ≤100 chars, single line (no newlines)',
        '- details: event details in Chinese, ≤200 chars, single line (no newlines)',
        '- source_url: original X post URL or news URL',
        '- source_name: media or account name',
        '- tags: from ["加班","熬夜","连续工作","忽视身体信号","猝死","过劳"] (use Chinese value only, must be exact match)',
        '- credibility: 1-10 score',
        '- language: "zh" or "en" (language of original source)',
        '',
        'Respond ONLY with a JSON array. If no events found, respond with [].',
        'Do NOT include commentary, only the JSON array.',
    ].join('\n');

    const userPrompt = [
        `Search X for work-related sudden death events from the past ${SEARCH_DAYS} days.`,
        '',
        'Cast a wide net — search for 猝死, 心源性猝死, 突然去世, sudden death, died suddenly,',
        'and any high-profile cases of people dying unexpectedly where work stress may be a factor.',
        'Do NOT limit yourself to posts that use "过劳" or "加班" explicitly.',
        '',
        `Today's date: ${today}`,
    ].join('\n');

    console.log('Calling Grok x_search...');
    let grokResponse;
    try {
        grokResponse = await httpsPost(
            'https://api.x.ai/v1/responses',
            { 'Authorization': `Bearer ${GROK_API_KEY}` },
            {
                model: 'grok-4-1-fast-reasoning',
                input: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                tools: [{ type: 'x_search', from_date: fromDate, to_date: today }],
            }
        );
    } catch (err) {
        console.error('Grok API failed:', err.message);
        process.exit(1);
    }

    // Parse assistant text
    let rawText = '';
    for (const item of (grokResponse.output || [])) {
        if (item.type === 'message' && item.role === 'assistant') {
            for (const content of (item.content || [])) {
                if (content.type === 'text' || content.type === 'output_text') rawText += content.text;
            }
        }
    }

    if (!rawText.trim()) {
        console.log('Grok returned empty response. Output items:');
        for (const item of (grokResponse.output || [])) {
            console.log(' -', item.type, item.role || '', item.status || '');
            if (item.content) {
                for (const c of item.content) console.log('   content type:', c.type, c.text ? c.text.slice(0, 200) : '');
            }
        }
        process.exit(0);
    }

    let jsonText = rawText.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonText = jsonMatch[1].trim();

    let candidates;
    try {
        candidates = JSON.parse(jsonText);
    } catch (err) {
        console.error('Failed to parse Grok response as JSON:', err.message);
        console.error('Raw:', rawText.slice(0, 500));
        process.exit(1);
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
        console.log('No events found by Grok.');
        process.exit(0);
    }

    console.log(`Grok found ${candidates.length} candidate(s).\n`);

    // ---- Step 2: Post-processing (no VALID_INDUSTRIES filter) ----

    candidates = candidates.filter(c => {
        if (!c.source_url || !c.source_url.startsWith('https://')) {
            console.log(`  [REJECTED] invalid source_url: "${c.source_url}"`);
            return false;
        }
        return true;
    });

    for (const c of candidates) {
        if (c.summary) c.summary = c.summary.replace(/[\r\n]+/g, ' ').slice(0, 100);
        if (c.details) c.details = c.details.replace(/[\r\n]+/g, ' ').slice(0, 200);
        c.tags = (c.tags || []).filter(t => VALID_TAGS.includes(t));
        if (c.tags.length === 0) c.tags = ['过劳'];
        if (!VALID_AGE_RANGES.includes(c.age_range)) c.age_range = '未知';
        // NOTE: no industry coercion — industry is free-text now
    }

    if (candidates.length === 0) {
        console.log('All candidates rejected during validation.');
        process.exit(0);
    }

    // ---- Step 3: Dedup check (local only, no GitHub API) ----
    const eventsData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/events.json'), 'utf8'));
    const existingSummaries = eventsData.events.map(e => e.summary);
    console.log(`Dedup context: ${existingSummaries.length} existing events in DB (skipping open Issues check)\n`);

    // ---- Print results ----
    console.log('=== Candidates that would be submitted as Issues ===\n');
    candidates.sort((a, b) => (b.credibility || 0) - (a.credibility || 0));
    const toCreate = candidates.slice(0, MAX_ISSUES_PER_RUN);

    for (const [i, c] of toCreate.entries()) {
        console.log(`--- Candidate ${i + 1} ---`);
        console.log(`  industry:    ${c.industry}  ← free-text, not filtered`);
        console.log(`  age_range:   ${c.age_range}`);
        console.log(`  credibility: ${c.credibility}/10`);
        console.log(`  summary:     ${c.summary}`);
        console.log(`  tags:        ${(c.tags || []).join(', ')}`);
        console.log(`  source:      ${c.source_url}`);
        console.log();
    }

    console.log(`✅ ${toCreate.length} candidate(s) would be created as GitHub Issues.`);
    console.log('(Skipping actual issue creation in local test)\n');
})();
