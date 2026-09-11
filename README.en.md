# content-review-workbench · AI Content Review Workbench

> **AI writes, you review.** A self-hosted, single-binary content pipeline with a human-review loop: AI draft → three-state editorial review → AI-flavor detection → export → metrics backfill → weekly retro.

[![CI](https://github.com/Eplayed/content-review-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.5-green)](package.json)

## Why

Most AI content tools chase full automation. This project goes the opposite way: **the human review loop is a first-class citizen** — which, after the 2025 AI-content labeling regulations, is compliance by design, not a bug.

- **Three-state review flow** (`pending → reviewed → published`) with a checklist gate enforced server-side: a draft cannot be approved until every checklist item is checked.
- **AI-flavor detection engine**: rules are plain JSON files (`rules/builtin/*.json`) — contrast-rhetoric abuse, textbook headings, filler words, absolute claims and more. Write your own rule in ~10 minutes, no code changes: see [docs/RULES.md](docs/RULES.md) (中文).
- **Pluggable exporters**: WeChat (inline-styled HTML), generic web page, raw Markdown — auto-selected per channel.
- **Metrics backfill + weekly retro** with KPI deltas.
- **Zero native dependencies**: Node ≥ 22.5 built-in `node:sqlite`, single-file database.
- **Auth built in**: `APP_PASSWORD` (HTTP Basic) / `AUTH_TOKEN` (Bearer for scripts).
- **Demo mode**: `AI_PROVIDER=fake` produces deterministic drafts — full e2e testing with zero API cost.
- Dark theme, PWA installable, WeChat-friendly exports, full JSON backup/restore (API key never included).

## Quick start

```bash
git clone https://github.com/Eplayed/content-review-workbench.git
cd content-review-workbench
npm install && npm start        # http://localhost:3000
```

Or with Docker: `docker compose up -d`.

Full documentation (Chinese): [README.md](README.md) · Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)

## License

MIT
