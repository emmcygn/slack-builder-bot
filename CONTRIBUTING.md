# Contributing

Thanks for your interest in dispatch.

## Getting started

1. Fork the repo and clone locally
2. `npm install` to get peer dependencies for type checking
3. Make your changes
4. Open a PR with a clear description of what changed and why

## What to work on

- Issues tagged `good-first-issue` are a good starting point
- Bug fixes and documentation improvements are always welcome
- For new features, open an issue first to discuss the approach

## Testing

The handler integrates with Slack and GitHub APIs, so full end-to-end testing requires a test Slack workspace. For unit testing the pure helpers (`stripMention`, `extractBranchOverride`, `sanitizeForIssueBody`), no external services are needed.

## Code style

- TypeScript strict mode
- No comments unless the WHY is non-obvious
- Follow existing patterns in the codebase
