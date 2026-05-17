# Slack Builder Bot

A Slack bot that lets non-technical team members request small features by posting in a dedicated channel. The bot classifies the request, creates a GitHub Issue, and triggers a Claude Code agent (via GitHub Actions) that autonomously implements the change and opens a draft PR for human review.

```
Slack #build-requests
  │ @BuilderBot "add a CSV export to the dashboard"
  ▼
Your Next.js app (Slack event handler)
  │ 1. Channel gate: only #build-requests
  │ 2. Haiku classifier → ALLOW / REJECT / NEEDS_HUMAN
  │ 3. If ALLOW → create GitHub Issue (label: builder-bot)
  ▼
GitHub Actions (builder-bot.yml)
  │ triggers on: issues [opened] with builder-bot label
  │ runs: anthropics/claude-code-action@v1
  │   - reads your CLAUDE.md for codebase context
  │   - Sonnet 4.6, 40 turns, bypassPermissions
  │   - builds, lints, typechecks
  │   - opens draft PR
  │   - posts PR link back to Slack thread
  ▼
You review the PR and merge
```

## What's included

```
├── README.md                          # This file
├── SETUP.md                           # Step-by-step setup guide
├── LEARNINGS.md                       # Hard-won debugging lessons
├── src/
│   └── lib/
│       └── slack/
│           └── builder-bot.ts         # Core handler (drop into your Next.js app)
├── workflows/
│   └── builder-bot.yml                # GitHub Actions workflow (copy to .github/workflows/)
├── examples/
│   ├── CLAUDE.md.example              # Example scope rules section
│   └── events-route.example.ts        # Example Slack events route integration
└── docs/
    └── architecture.md                # Detailed architecture doc
```

## Quick Start

1. **Create a Slack app** → 4 scopes, 1 event subscription
2. **Copy `builder-bot.ts`** into your Next.js app
3. **Wire it** into your Slack events route
4. **Copy `builder-bot.yml`** to `.github/workflows/`
5. **Add scope rules** to your `CLAUDE.md`
6. **Set env vars** on your hosting platform + GitHub Actions secrets

Full walkthrough in [SETUP.md](SETUP.md).

## How it works

### 1. Slack Event Handler (`builder-bot.ts`)

When someone `@BuilderBot` in `#build-requests`:

- **Channel gate** — ignores mentions outside the designated channel
- **Haiku classifier** — calls Claude Haiku 4.5 (~$0.002/call) to classify as:
  - `ALLOW` — UI changes, data display, exports, styling, etc.
  - `REJECT` — database schema, auth, scoring engines, etc.
  - `NEEDS_HUMAN` — ambiguous or complex scope
- **Issue creation** — creates a GitHub Issue with metadata embedded as an HTML comment
- **Thread replies** — follow-up `@BuilderBot` messages in the same thread get appended as issue comments
- **Screenshots** — attached images are uploaded to GitHub and embedded in the issue body

### 2. GitHub Actions Workflow (`builder-bot.yml`)

When an issue with `builder-bot` label is created:

- Checks out the target branch (configurable via `[branch:xxx]` in the Slack message)
- Installs dependencies
- Runs `claude-code-action@v1` with `--permission-mode bypassPermissions`
- Agent reads `CLAUDE.md`, implements the feature, runs build/lint/typecheck
- Opens a draft PR
- Posts the PR link back to the Slack thread (with retry for race conditions)
- On failure, posts a "couldn't complete this one" message

### 3. Scope Rules (CLAUDE.md)

You define allowed/forbidden paths in your `CLAUDE.md`. The agent reads these before making any changes. This is the primary safety mechanism — the agent respects these rules behaviorally.

## Cost

| Component | Per-request | Monthly (20 req/week) |
|-----------|-------------|----------------------|
| Haiku classifier | ~$0.002 | ~$0.16 |
| Sonnet coding pass | $0.30–1.50 | $24–120 |
| GitHub Actions | ~5 min | ~400 min (free tier: 2,000) |

## What works well

- "Add a loading spinner to the dashboard" — 15 turns, ~$0.30
- "Add a CSV export button to the users table" — 20 turns, ~$0.50
- "Show a welcome message on empty state" — 15 turns, ~$0.40
- "Add a date range filter to the report page" — 25 turns, ~$0.80

## What doesn't work well

- Complex drag-and-drop interactions — too many turns
- Multi-file refactors touching 10+ files — exceeds turn limit
- Features requiring new API endpoints that write data — classifier should reject these
- Anything touching files over 1000 lines — agent spends too many turns reading

## Requirements

- Next.js app with a Slack Events API endpoint
- GitHub repo with `CLAUDE.md`
- Anthropic API key (Haiku for classifier, Sonnet for coding)
- Slack workspace with a bot app

## License

MIT
