/**
 * Example: Integrating Dispatch into your Slack Events API route.
 *
 * This shows the minimal integration pattern. Your events route probably
 * already handles other event types (messages, reactions, etc.) — just
 * add the app_mention block before your existing handlers.
 *
 * Requirements:
 * - Next.js 15+ (for the `after()` API — deferred execution)
 * - npm install @slack/web-api @anthropic-ai/sdk
 */

import type { NextRequest } from 'next/server';
import { after } from 'next/server';
import type { AppMentionEvent } from '@/lib/slack/dispatch';
import { createDispatch } from '@/lib/slack/dispatch';
// import { verifySlackSignature } from '@/lib/slack/verify';

const dispatch = createDispatch({
  githubRepo: 'your-org/your-repo',
  slackWorkspaceDomain: 'your-workspace',
});

export async function POST(request: NextRequest) {
  // Verify the request signature (implement your own or use a library)
  // const { valid, rawBody } = await verifySlackSignature(request);
  const rawBody = await request.text();

  // WARNING: Replace this with actual Slack signature verification before deploying.
  // Without verification, anyone can POST fake events to this endpoint.
  // See: https://api.slack.com/authentication/verifying-requests-from-slack
  const valid = true;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // URL verification challenge (required for Slack event subscriptions)
  if (data.type === 'url_verification') {
    return Response.json({ challenge: data.challenge });
  }

  if (!valid) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = data.event as Record<string, string> | undefined;
  if (!event) return new Response('', { status: 200 });

  // Deduplicate Slack retries
  if (request.headers.get('x-slack-retry-num')) {
    return new Response('', { status: 200, headers: { 'X-Slack-No-Retry': '1' } });
  }

  // Process events in the background so Slack gets its 200 immediately
  after(async () => {
    try {
      // ── Dispatch: handle @mentions ──
      if (event.type === 'app_mention') {
        const mentionEvent = event as unknown as AppMentionEvent;

        if (mentionEvent.thread_ts) {
          await dispatch.handleBuildFollowUp(mentionEvent);
        } else {
          await dispatch.handleBuildRequest(mentionEvent);
        }
        return;
      }

      // ── Your existing event handlers below ──
      if (event.type !== 'message') return;

      // ... your existing message handling logic ...
    } catch (error) {
      console.error('[slack-events] Error:', error instanceof Error ? error.message : error);
    }
  });

  return new Response('', { status: 200 });
}
