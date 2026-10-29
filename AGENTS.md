# ReachFlow project rules

Build the tasks in TASKS.md in order. Finish one task, verify it, commit using
`task-XX: summary`, and update the checklist. The user authorized continuous
implementation of all remaining tasks on October 30, 2026; stop only when the
whole app is built or user input is required.

## Stack and conventions

Next.js App Router, strict TypeScript, Tailwind, shadcn-style components,
Lucide, SQLite via Drizzle and better-sqlite3. Use Zod at input boundaries.
Run lint, typecheck and tests for each task. Bind only to 127.0.0.1.
Keep secrets and runtime data out of Git. Never log tokens or full email bodies.
No real sending until template and sending approval are implemented.
No Docker, Redis, fabricated working controls, or extra features.

## Decisions

- Task 0 is the empty navigation shell and process/SQLite foundation only.
- Share a Node launcher across Windows and Unix to keep behavior consistent.
- Require Node >=20.19 (current build/test toolchain); recommend Node 24 LTS for native prebuilds.
- Use system sans fonts with Inter first; no build-time font downloads.
- One worker owns the database; independent loops run generation, dispatch and reply polling.
- Split Task 0 into reviewable documentation, application, and launcher commits.
- Unavailable named design/security skills are followed as principles from the brief.
- Keep the stable Drizzle migration CLI; its four moderate development-only
  advisory entries are documented in README. Production dependencies audit clean.
- The launcher invokes the same production entry point as npm start directly so
  the web process owns the worker without an extra shell in the shutdown path.
- Warm-up increases by calendar day, resets after more than 14 days without a send, and uses separate dry-run history.
- Gmail/SQLite delivery cannot be atomic. Unknown delivery is reconciled using RFC Message-ID and held uncertain rather than resent.
- Delivery mode is recorded when a campaign is approved; changing modes requires renewed campaign approval.
- Automated acceptance uses isolated data and a mock LLM. Real OAuth, model quality and real delivery require the user's accounts.

## Needs from user

- Install Node LTS if missing.
- Choose a dedicated Gmail, configure Google Cloud and supply OAuth Client ID/Secret.
- Choose a local LLM/model or supply a provider API key.
- Set alert forwarding addresses.
- Confirm cap, business hours and timezone.
- Double-click run.bat.
- Upload the first sheet, run Test Run, approve the template and approve for sending.
