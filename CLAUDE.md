# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**cusi** (程序员猝死提醒) - A health reminder tool for programmers to prevent overwork and late-night coding. Uses real, verified news events about programmer sudden deaths as impactful reminders during late-night work sessions.

Core principle: "注意力在哪里，提醒就在哪里" (Reminders appear where attention is focused).

## Architecture

Three independent components sharing a common event database:

### 1. Claude Code Hook
- Uses `stop` type hook (triggers after Claude completes response)
- Night hours: 22:00-05:00 (configurable)
- User controls: pause 1h/2h, pause tonight, adjust time range
- Non-blocking, concise reminders

### 2. Chrome Extension
- Manifest V3 + TypeScript + Vite
- Triggers: night hours + user activity detected + 45-90 min interval
- Location priority: Geolocation API → IP API → manual → nationwide fallback
- Graduated reminder system (gentle → warning → strong)

### 3. VS Code Extension
- TypeScript + VS Code Extension API
- Triggers: night hours + file save frequency (≥5 saves in 2 hours)
- Reminder levels: showInformationMessage → showWarningMessage → Webview

### Event Database
JSON array with privacy-focused fields:
- `id`, `date` (fuzzy: "2024-Q4"), `age_range` ("30-35岁")
- `industry`, `province`, `city` (optional)
- `summary` (≤100 chars), `details` (≤200 chars)
- `source`, `source_archive` (archive.org backup)
- `verified`, `verified_by`, `verified_at`, `tags`

Privacy principle: Never expose precise date + precise city + specific company + specific age together.

### Event Management Flow
```
External collection → GitHub Issue → Manual review → AI-assisted verification → Manual approval → JSON merge
```

## Reminder Strategy

Three-tier progressive reminders:
1. **Gentle**: "You've been working for X hours, consider a break"
2. **Warning**: Event summary (after ignoring gentle for 30 min)
3. **Strong**: Full event details + forced reading (after ignoring warning)

Positive reinforcement: Early sleep streaks, weekly health reports.

## Key Constraints

- **Privacy**: No data collection/upload; IP for local geolocation only; stats stored locally
- **Performance**: Extension size <1MB
- **Compatibility**: Chrome/Edge latest; VS Code 1.80+; Claude Code latest
- **Offline**: Built-in base event data for offline use
- **Legal**: All events from public media with sources; include disclaimer
- **Ethics**: Strict anonymization; respect for deceased and families
