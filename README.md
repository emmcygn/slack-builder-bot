# dispatch

A Slack-to-PR coding agent. Non-technical users describe features in Slack — Claude Code implements them autonomously and opens draft PRs for review.

## Architecture

```
Slack #build-requests          Your App (Next.js)              GitHub Actions
─────────────────────          ──────────────────              ──────────────

@dispatch "add CSV               ┌─────────────┐
 export to dashboard"  ────────▶ │ Haiku 4.5    │
                                 │ classifier   │
                                 │              │
                                 │ ALLOW ───────┼──▶ Create Issue ──▶ claude-code-action
                                 │ REJECT ──────┼──▶ Reply: "needs       │
                                 │ NEEDS_HUMAN ─┼──▶  manual impl"       │
                                 └─────────────┘                         │
                                                                         ▼
                                                                    Sonnet 4.6
                                                                    reads CLAUDE.md
                                                                    implements feature
                                                                    runs build/lint/typecheck
                                                                    opens draft PR
                                                                         │
  PR link posted ◀──────────────────────────────────────────────────────┘
  to Slack thread
```

## How it works

1. Someone posts `@dispatch add a date filter to the CSV export` in a dedicated Slack channel
2. A Haiku classifier ($0.002/call) determines if the request is in scope — UI changes and small features pass, infrastructure changes get rejected
3. If allowed, a GitHub Issue is created with the request + any attached screenshots
4. A GitHub Actions workflow triggers Claude Code (Sonnet 4.6), which reads your `CLAUDE.md` scope rules, implements the feature, verifies the build passes, and opens a draft PR
5. The PR link is posted back to the Slack thread. A human reviews and merges.

Follow-up messages in the thread (with `@dispatch`) are appended as issue comments — the agent picks up additional context if it's still running.

## What's in this repo

```
src/lib/slack/builder-bot.ts      Core handler — Haiku classifier, GitHub API, Slack thread tracking
workflows/builder-bot.yml         GitHub Actions workflow — claude-code-action + Slack notifications
examples/
  events-route.example.ts         How to wire into your Next.js Slack events route
  CLAUDE.md.example               Template scope rules (allowed/forbidden paths)
docs/architecture.md              Detailed architecture and data flow
SETUP.md                          Step-by-step setup (Slack app, env vars, GitHub secrets)
LEARNINGS.md                      Production debugging lessons (read this before modifying anything)
```

## Setup

Full walkthrough in [SETUP.md](SETUP.md). The short version:

1. Create a Slack app with 4 scopes (`app_mentions:read`, `channels:history`, `chat:write`, `files:read`)
2. Drop `builder-bot.ts` into your Next.js app, wire into your Slack events route
3. Copy `builder-bot.yml` to `.github/workflows/` on your default branch
4. Add scope rules to your `CLAUDE.md`
5. Set env vars (Slack token, GitHub PAT, Anthropic key, channel ID)
6. Create a `#build-requests` channel, invite the bot, post a request

## Scope and safety

The agent runs with `--permission-mode bypassPermissions` inside a GitHub Actions sandbox. Safety comes from four layers, not tool-level restrictions:

- **CLAUDE.md scope rules** — you define allowed/forbidden paths; the agent reads and follows them
- **Branch isolation** — agent pushes to `builder-bot/*` branches only
- **Draft PRs** — nothing auto-merges; a human reviews every change
- **Haiku pre-filter** — infrastructure-touching requests never reach the agent

## What it handles well

Simple, focused UI work with clear scope:

- Add a loading spinner, empty state, or toast notification
- Add CSV/PDF export to an existing page
- Add filters, sorting, or search to a table
- Display new data from existing API endpoints
- Styling changes, layout adjustments

## What it doesn't

Complex multi-file features, drag-and-drop interactions, anything touching auth or database schema, or requests that need more than ~30 turns of agent reasoning. The classifier routes these to a human.

## Cost

~$0.30–1.50 per feature in API tokens (Sonnet for coding, Haiku for classification). GitHub Actions minutes are within the free tier for typical usage. At 20 requests/week, expect $30–120/month.

## Branch targeting

Default target is `main`. Override per-request:

```
@dispatch [branch:develop] add a welcome message to the empty state
```

## Production learnings

[LEARNINGS.md](LEARNINGS.md) documents every gotcha encountered shipping this in production — permission model pitfalls, GitHub Actions trigger semantics, Haiku response parsing, race conditions, and turn budget management. Read it before modifying the workflow or handler.

## Requirements

- Next.js app with a Slack Events API endpoint
- GitHub repo with `CLAUDE.md`
- Anthropic API key (Haiku + Sonnet)

## License

MIT
