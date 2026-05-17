# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Slack Workspace                         │
│                                                                 │
│  #build-requests channel                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ @BuilderBot add a CSV export to the dashboard            │  │
│  │                                                          │  │
│  │ ┌─ thread ──────────────────────────────────────────┐    │  │
│  │ │ BuilderBot: Got it — I'm building this now...     │    │  │
│  │ │ BuilderBot: PR ready for review — [link]          │    │  │
│  │ └──────────────────────────────────────────────────-─┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────┬─────────────────────────────────────▲───────────────┘
            │ app_mention event                   │ chat.postMessage
            ▼                                     │
┌───────────────────────────────┐                 │
│     Your Next.js App          │                 │
│     (Railway/Vercel/etc.)     │                 │
│                               │                 │
│  /api/slack/events            │                 │
│  ├─ Verify signature          │                 │
│  ├─ Haiku 4.5 classifier     │─── $0.002 ──────┘
│  │  ALLOW → create issue      │
│  │  REJECT → reply in thread  │
│  │  NEEDS_HUMAN → tag human   │
│  └─ Channel gate              │
└───────────┬───────────────────┘
            │ GitHub API: create issue
            ▼
┌───────────────────────────────────────────────────────────────┐
│                        GitHub                                  │
│                                                                │
│  Issue #42 [builder-bot]                                       │
│  ├── <!-- builder-bot-meta channel/thread_ts/requester -->     │
│  └── Feature Request: "add CSV export to dashboard"            │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ GitHub Actions: builder-bot.yml                          │  │
│  │                                                          │  │
│  │  build-feature job:                                      │  │
│  │  ├─ Extract Slack metadata from issue body               │  │
│  │  ├─ Checkout target branch                               │  │
│  │  ├─ npm ci                                               │  │
│  │  └─ claude-code-action@v1                                │  │
│  │     ├─ Reads CLAUDE.md (scope rules)                     │  │
│  │     ├─ Reads issue body (feature request)                │  │
│  │     ├─ Implements feature (Sonnet 4.6)  ─── $0.30-1.50  │  │
│  │     ├─ Runs lint:fix / build / typecheck                 │  │
│  │     └─ Opens draft PR                                    │  │
│  │                                                          │  │
│  │  notify-success job:                                     │  │
│  │  ├─ Finds PR via GitHub API (5x retry, 10s delay)       │  │
│  │  └─ Posts PR link to Slack thread                        │  │
│  │                                                          │  │
│  │  notify-failure job:                                     │  │
│  │  └─ Posts failure message to Slack thread                │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  PR #43 [BuilderBot] Add CSV export to dashboard               │
│  └── Draft, targets main/staging, human reviews and merges     │
└────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Slack Event Handler (`builder-bot.ts`)

**Runs on:** Your app server (Railway, Vercel, etc.)
**Triggered by:** `app_mention` events in the designated channel

Responsibilities:
- Channel gating (ignore mentions outside #build-requests)
- Request classification via Haiku 4.5
- GitHub Issue creation with metadata
- Screenshot upload to GitHub
- Thread reply → issue comment forwarding

The handler creates a new `WebClient` per call using `SLACK_BUILDER_BOT_TOKEN` — it does NOT share a client singleton with your main app's Slack integration.

### 2. GitHub Actions Workflow (`builder-bot.yml`)

**Runs on:** GitHub-hosted runner (ubuntu-latest)
**Triggered by:** Issue created/labelled with `builder-bot`

Three jobs:
1. **build-feature** — runs claude-code-action to implement the feature
2. **notify-success** — posts PR link back to Slack (runs after successful build)
3. **notify-failure** — posts failure message to Slack (runs on failure/cancel)

Key configuration:
- `--permission-mode bypassPermissions` — no tool approval friction
- `--max-turns 40` — enough for most UI features
- `show_full_output: true` — full agent logs visible in Actions
- Branch override via `[branch:xxx]` in the Slack message

### 3. CLAUDE.md Scope Rules

The primary safety mechanism. The agent reads `CLAUDE.md` before making any changes and follows the scope rules behaviorally. Define:
- **Allowed paths** — where the agent can create/edit files
- **Forbidden paths** — core infrastructure the agent must not touch
- **Verification commands** — build/lint/typecheck the agent must run

### 4. Haiku Classifier

A cheap (~$0.002/call) pre-filter that classifies requests before creating issues. Three outcomes:
- **ALLOW** — UI changes, exports, styling → creates issue → agent builds it
- **REJECT** — database, auth, scoring → replies in thread, no issue
- **NEEDS_HUMAN** — ambiguous → tags a human for review

The classifier uses the `system` parameter for instructions and puts the user's raw message in the `user` role to reduce prompt injection surface.

## Security Model

| Layer | What it protects |
|-------|-----------------|
| Haiku classifier | Prevents infrastructure-touching requests from reaching the agent |
| CLAUDE.md scope rules | Behavioral guardrails — agent reads and follows forbidden paths |
| Branch prefix | Agent can only push to `builder-bot/` branches |
| Draft PRs | Nothing auto-merges — human reviews every change |
| GitHub Actions sandbox | Isolated runner, no access to production systems |
| `bypassPermissions` | Safe in CI because the sandbox IS the security boundary |
| HTML comment sanitization | Prevents meta-block injection in user messages |
| Filename sanitization | Prevents path traversal in screenshot uploads |

## Data Flow

### Issue Metadata

The Slack handler embeds metadata in the issue body as an HTML comment:

```html
<!-- builder-bot-meta
channel: C07XXXXXX
thread_ts: 1234567890.123456
requester: U07XXXXXX
branch: main
-->
```

This is machine-readable but invisible when viewing the issue on GitHub. The workflow extracts these values to:
- Check out the correct branch
- Post notifications back to the correct Slack thread
- @mention the original requester

### Thread Reply Tracking

The handler includes a hidden marker in the Slack ack message:

```
<!-- builder-bot-issue:42 -->
```

When a follow-up `@BuilderBot` message arrives in the same thread, the handler reads the thread history, finds this marker, and appends the follow-up as a comment on the existing GitHub Issue.
