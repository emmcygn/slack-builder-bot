/**
 * Example: Integrating Builder Bot into your Slack Events API route.
 *
 * This shows the minimal integration pattern. Your events route probably
 * already handles other event types (messages, reactions, etc.) — just
 * add the app_mention block before your existing handlers.
 */

import type { NextRequest } from 'next/server';
import { after } from 'next/server';
import { handleBuildFollowUp, handleBuildRequest } from '@/lib/slack/builder-bot';
// import { verifySlackSignature } from '@/lib/slack/verify';

export async function POST(request: NextRequest) {
  // Verify the request signature (implement your own or use a library)
  // const { valid, rawBody } = await verifySlackSignature(request);
  const rawBody = await request.text();
  const valid = true; // Replace with actual verification

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
      // ── Builder Bot: handle @mentions ──
      if (event.type === 'app_mention') {
        const mentionEvent = event as unknown as {
          type: string;
          text: string;
          user: string;
          channel: string;
          ts: string;
          thread_ts?: string;
          files?: { url_private_download?: string; mimetype?: string; name?: string }[];
        };

        if (mentionEvent.thread_ts) {
          await handleBuildFollowUp(mentionEvent);
        } else {
          await handleBuildRequest(mentionEvent);
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
