# ReachFlow build checklist

- [x] Task 0 — Scaffold, rules and launchers
- [x] Task 1 — Data model and core types
- [x] Task 2 — Settings, secrets and setup
- [x] Task 3 — LLM providers
- [x] Task 4 — Ingestion
- [x] Task 5 — Column mapping
- [x] Task 6 — Campaign brief and template analysis
- [x] Task 7 — Personalization and test run
- [x] Task 8 — Gmail connection
- [x] Task 9 — Template approval and review
- [x] Task 10 — Scheduler and dispatcher
- [x] Task 11 — Replies, alerts and dashboard
- [x] Task 12 — Hardening, E2E, docs and handoff

## Task 0 verification

- Passed: ESLint (zero warnings), strict typecheck, two Vitest tests, production build.
- Passed: run.bat dependency reinstall → build → web + worker → healthy endpoint;
  listener verified on 127.0.0.1:3000; browser rendering and navigation checked.
- Production dependency audit: zero known vulnerabilities. Four moderate development
  advisory entries remain in Drizzle CLI's dependency chain; see README.
- Not checked: fresh Windows installation, macOS/Linux launcher, future email jobs.
- Continued through Task 12 under the user's authorization.

Task 2: settings, AES-GCM authentication, limits and CSRF tests pass. Real Ollama reachability needs a running local model server.

Task 7: restart/grounding tests pass. Live local-model output remains a user-side integration check.

Task 8: MIME/header and scope tests pass. OAuth round trip, revocation and real test delivery require user Google credentials.

Task 10: 25 tests cover reservations, crash reconciliation, dry-run isolation, hours, warm-up, jitter and idle state. Real Gmail delivery is pending user credentials. Ambiguous sends stay uncertain if Sent lookup cannot confirm delivery; they are never automatically retried.

## Final verification — October 30, 2026

All implementation tasks are complete. Account-dependent acceptance checks remain explicitly pending below.

- Passed: ESLint with zero warnings, strict TypeScript, 30 unit tests in 17 files, production build.
- Passed: 2 headless Playwright tests: full upload/mapping/analysis/test/generation/approval/dry-run/reply/export workflow; 5,000-draft virtualization and keyboard dismissal.
- Passed: 50,000-row parser fixture and concurrent fresh web/worker migrations.
- Passed: fresh Git-index source snapshot with no node_modules, .env, build or data. run.bat installed via npm ci, created .env, built, opened the browser and started web + worker. Verified health, empty campaign list, dry-run default, worker heartbeat, port-specific OAuth redirect and 127.0.0.1 binding on port 3200.
- Windows verification used Node 24.22.1 and npm 11.6.2 supplied through the agent runtime plus a temporary npm shim. A separate fresh Windows installation and macOS/Linux execution were not tested.
- Production dependency audit: zero known vulnerabilities. Four moderate development-only advisory entries remain documented in README.
- No real messages sent. Real Google OAuth/revocation, real local model quality, and 2–3 real deliveries to user-owned addresses need user credentials and account setup.
- Handoff: follow README → What I need from you. Never paste tokens or API keys into Git or chat; enter them in Settings.

## Setup repair — October 30, 2026

- Rebuilt better-sqlite3 for the user's installed Node v26.13.0 (ABI 147); verified a real SQLite connection, worker health, lint, strict typecheck, all 30 unit tests and production build.
- Added a startup binary-load check with an explicit SQLite rebuild fallback, covering an ABI mismatch even when install stamps appear current.
- OAuth now uses a locally saved sender login hint. Personal sender/alert settings remain in the ignored database, not source control.
- Installed Ollama and a small local model for the 8 GB machine; connection and real JSON inference passed. Real Gmail authorization/delivery still awaits the user's Google Cloud credentials.
