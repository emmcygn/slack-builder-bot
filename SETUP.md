# Setup Guide

## 1. Create a Slack App

Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.

**Name:** BuilderBot (or whatever you prefer)

### Bot Token Scopes (OAuth & Permissions)

Add these 4 scopes:

- `app_mentions:read` — receive @mentions
- `channels:history` — read thread messages for follow-up context
- `chat:write` — reply in threads
- `files:read` — download attached screenshots

### Install to Workspace

Click **Install to Workspace** → copy the **Bot User OAuth Token** (`xoxb-...`).

### Event Subscriptions

- Toggle **ON**
- **Request URL:** `https://your-app.com/api/slack/events`
  - Your app must respond to Slack's `url_verification` challenge (see `events-route.example.ts`)
- **Subscribe to bot events:** Add `app_mention`
- **Save Changes**

### Note the Signing Secret

Go to **Basic Information** → **App Credentials** → copy **Signing Secret**.

## 2. Copy the Handler

Copy `src/lib/slack/builder-bot.ts` into your Next.js app at the same path (or adjust imports).

### Wire into your Events Route

Your Slack Events API route needs to dispatch `app_mention` events to the handler. See `examples/events-route.example.ts` for the integration pattern.

Key points:
- The `app_mention` handler runs inside `after()` (Next.js deferred execution) so Slack gets its 200 response immediately
- Thread replies (has `thread_ts`) go to `handleBuildFollowUp`
- Top-level mentions go to `handleBuildRequest`

## 3. Copy the Workflow

Copy `workflows/builder-bot.yml` to `.github/workflows/builder-bot.yml` in your repo.

**Important:** This file must be on your repo's **default branch** (usually `main`). GitHub only triggers issue-based workflows from the default branch.

## 4. Add Scope Rules to CLAUDE.md

Add a scope section to your `CLAUDE.md` defining what the agent can and cannot touch. See `examples/CLAUDE.md.example` for the template.

## 5. Environment Variables

### Your Hosting Platform (Railway, Vercel, etc.)

| Variable | Description |
|----------|-------------|
| `SLACK_BUILDER_BOT_TOKEN` | Bot User OAuth Token (`xoxb-...`) from step 1 |
| `SLACK_BUILD_CHANNEL_ID` | Channel ID of #build-requests (right-click channel → View details → scroll to bottom) |
| `GITHUB_TOKEN_BUILDER_BOT` | Fine-grained PAT with `issues:write` + `contents:write` on your repo |
| `SLACK_HUMAN_USER_ID` | Your Slack member ID for @mentions on NEEDS_HUMAN (click profile → ⋯ → Copy member ID) |
| `ANTHROPIC_API_KEY` | For the Haiku classifier |

If your app has a shared Slack events endpoint with another bot, also set:
| `SLACK_BUILDER_BOT_SIGNING_SECRET` | Signing Secret from the BuilderBot app (Basic Information → App Credentials) |

### GitHub Actions Secrets (repo → Settings → Secrets → Actions)

| Secret | Description |
|--------|-------------|
| `ANTHROPIC_API_KEY` | Same key, for Claude Code Action (Sonnet coding pass) |
| `SLACK_BUILDER_BOT_TOKEN` | Same bot token, for posting PR links back to Slack |

### GitHub Fine-Grained PAT

Go to [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):

- **Resource owner:** Your org (not your personal account)
- **Repository access:** Select your repo only
- **Permissions:** Issues (Read and write) + Contents (Read and write)
- Generate → copy → set as `GITHUB_TOKEN_BUILDER_BOT` on your hosting platform

## 6. GitHub Repo Setup

### Create the label

Go to your repo → Labels → New label:
- **Name:** `builder-bot`
- **Color:** yellow
- **Description:** "BuilderBot automated build request"

### Create the uploads branch (for screenshots)

```bash
git checkout --orphan builder-bot-uploads
git rm -rf .
git commit --allow-empty -m "init: builder bot image uploads branch"
git push origin builder-bot-uploads
git checkout main
```

## 7. Create the Slack Channel

1. Create `#build-requests` in Slack
2. Invite BuilderBot: `/invite @BuilderBot`
3. Test: `@BuilderBot add a loading spinner to the dashboard`

## 8. Verify End-to-End

Expected flow after posting:

1. ✅ Bot replies in-thread: "Got it — I'm building this now..."
2. ✅ GitHub Issue created with `builder-bot` label
3. ✅ GitHub Actions workflow triggers (check Actions tab)
4. ✅ Claude Code reads codebase, implements feature, opens draft PR
5. ✅ Bot posts PR link back to the Slack thread

## Troubleshooting

### Bot doesn't reply at all
- Check Railway/Vercel logs for `[builder-bot]` entries
- Verify the Events URL is verified (green checkmark on api.slack.com)
- Verify `SLACK_BUILD_CHANNEL_ID` matches the channel you're posting in
- If sharing events endpoint with another bot, check signing secret

### Bot replies "This might be more complex..."
- The Haiku classifier returned `NEEDS_HUMAN` — either the request is ambiguous or `ANTHROPIC_API_KEY` is missing/invalid
- Check logs for `[builder-bot] classifyRequest error:`

### Issue created but workflow doesn't trigger
- The workflow file must be on the **default branch** (main)
- Check that the `builder-bot` label exists on the repo

### Workflow runs but agent fails
- Check the Actions log for `permission_denials_count` — should be 0 with `bypassPermissions`
- If the build fails on `SLACK_BOT_TOKEN is not set`, add it as `xoxb-ci-placeholder` env var in the workflow

### PR created but no Slack notification
- The notify job searches for PRs matching the issue number — check Actions log for "No matching PR found"
- There's a 5-attempt retry with 10s delay to handle race conditions
