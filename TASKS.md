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
- [ ] Task 12 — Hardening, E2E, docs and handoff

## Task 0 verification

- Passed: ESLint (zero warnings), strict typecheck, two Vitest tests, production build.
- Passed: run.bat dependency reinstall → build → web + worker → healthy endpoint;
  listener verified on 127.0.0.1:3000; browser rendering and navigation checked.
- Production dependency audit: zero known vulnerabilities. Four moderate development
  advisory entries remain in Drizzle CLI's dependency chain; see README.
- Not checked: fresh Windows installation, macOS/Linux launcher, future email jobs.
- Next: Task 1, after the user's next continue instruction.

Task 2: settings, AES-GCM authentication, limits and CSRF tests pass. Real Ollama reachability needs a running local model server.

Task 7: restart/grounding tests pass. Live local-model output remains a user-side integration check.

Task 8: MIME/header and scope tests pass. OAuth round trip, revocation and real test delivery require user Google credentials.

Task 10: 25 tests cover reservations, crash reconciliation, dry-run isolation, hours, warm-up, jitter and idle state. Real Gmail delivery is pending user credentials. Ambiguous sends stay uncertain if Sent lookup cannot confirm delivery; they are never automatically retried.
