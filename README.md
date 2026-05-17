# dispatch

A Slack-to-PR coding agent. Non-technical users describe features in Slack -- Claude Code implements them autonomously and opens draft PRs for review.

## Architecture

```
Slack #build-requests          Your App (Next.js)              GitHub Actions
---------------------          ------------------              --------------

@dispatch "add CSV               +---------------+
 export to dashboard"  --------> | Haiku 4.5     |
                                 | classifier    |
                                 |               |
                                 | ALLOW --------+--> Create Issue --> claude-code-action
                                 | REJECT -------+--> Reply: "needs       |
                                 | NEEDS_HUMAN --+--> manual impl"        |
                                 +---------------+                        |
                                                                          v
                                                                     Sonnet 4.6
                                                                     reads CLAUDE.md
                                                                     implements feature
                                                                     runs build/lint/typecheck
                                                                     opens draft PR
                                                                          |
  PR link posted <--------------------------------------------------------+
  to Slack thread
```

## How it works

1. Someone posts `@dispatch add a date filter to the CSV export` in a dedicated Slack channel
2. A Haiku classifier ($0.002/call) determines if the request is in scope -- UI changes and small features pass, infrastructure changes get rejected
3. If allowed, a GitHub Issue is created with the request + any attached screenshots
4. A GitHub Actions workflow triggers Claude Code (Sonnet 4.6), which reads your `CLAUDE.md` scope rules, implements the feature, verifies the build passes, and opens a draft PR
5. The PR link is posted back to the Slack thread. A human reviews and merges.

Follow-up messages in the thread (with `@dispatch`) are appended as issue comments -- the agent picks up additional context if it's still running.

## What's in this repo

```
src/lib/slack/dispatch.ts        Core handler -- factory pattern, Haiku classifier, GitHub API, Slack thread tracking
workflows/dispatch.yml           GitHub Actions workflow -- claude-code-action + Slack notifications
config/
  default-prompt.md              Default classifier prompt (reference doc -- override via config)
  slack-app-manifest.json        Slack app manifest for one-click setup
examples/
  events-route.example.ts        How to wire into your Next.js Slack events route
  CLAUDE.md.example              Template scope rules (allowed/forbidden paths)
docs/architecture.md             Detailed architecture and data flow
SETUP.md                         Step-by-step setup (Slack app, env vars, GitHub secrets)
LEARNINGS.md                     Production debugging lessons (read this before modifying anything)
CONTRIBUTING.md                  How to contribute
SECURITY.md                      Threat model and security considerations
```

## Quick start

```typescript
import { createDispatch } from '@/lib/slack/dispatch';

const dispatch = createDispatch({
  githubRepo: 'your-org/your-repo',
  slackWorkspaceDomain: 'your-workspace',
});

// In your Slack events route:
if (event.thread_ts) {
  await dispatch.handleBuildFollowUp(event);
} else {
  await dispatch.handleBuildRequest(event);
}
```

## Setup

Full walkthrough in [SETUP.md](SETUP.md). The short version:

1. Create a Slack app with 4 scopes (`app_mentions:read`, `channels:history`, `chat:write`, `files:read`) -- or use `config/slack-app-manifest.json` for one-click setup
2. `npm install @slack/web-api @anthropic-ai/sdk`
3. Drop `dispatch.ts` into your Next.js app, call `createDispatch()` with your config, wire into your Slack events route
4. Copy `dispatch.yml` to `.github/workflows/` on your default branch
5. Add scope rules to your `CLAUDE.md`
6. Set env vars (Slack token, GitHub PAT, Anthropic key, channel ID)
7. Create a `#build-requests` channel, invite the bot, post a request

## Configuration

`createDispatch()` accepts:

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `githubRepo` | Yes | -- | `owner/repo` format |
| `slackWorkspaceDomain` | Yes | -- | e.g. `acme` for `acme.slack.com` |
| `label` | No | `dispatch` | GitHub issue label |
| `classifierModel` | No | `claude-haiku-4-5-20251001` | Anthropic model for classification |
| `classifierPrompt` | No | `DEFAULT_CLASSIFIER_PROMPT` | Override the system prompt |
| `imageUploadBranch` | No | `dispatch-uploads` | Orphan branch for screenshot storage |
| `maxClassifierRetries` | No | `3` | Retry count for 529 errors |

## Scope and safety

The agent runs with `--permission-mode bypassPermissions` inside a GitHub Actions sandbox. Safety comes from four layers, not tool-level restrictions:

- **CLAUDE.md scope rules** -- you define allowed/forbidden paths; the agent reads and follows them
- **Branch isolation** -- agent pushes to `dispatch/*` branches only
- **Draft PRs** -- nothing auto-merges; a human reviews every change
- **Haiku pre-filter** -- infrastructure-touching requests never reach the agent

See [SECURITY.md](SECURITY.md) for the full threat model.

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

~$0.30-1.50 per feature in API tokens (Sonnet for coding, Haiku for classification). GitHub Actions minutes are within the free tier for typical usage. At 20 requests/week, expect $30-120/month.

## Branch targeting

Default target is `main`. Override per-request:

```
@dispatch [branch:develop] add a welcome message to the empty state
```

## Production learnings

[LEARNINGS.md](LEARNINGS.md) documents every gotcha encountered shipping this in production -- permission model pitfalls, GitHub Actions trigger semantics, Haiku response parsing, race conditions, and turn budget management. Read it before modifying the workflow or handler.

## Requirements

- Next.js 15+ (for `after()` deferred execution)
- GitHub repo with `CLAUDE.md`
- Anthropic API key (Haiku + Sonnet)

## License

MIT
