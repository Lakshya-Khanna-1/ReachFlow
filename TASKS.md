# ReachFlow build checklist

- [x] Task 0 — Scaffold, rules and launchers
- [x] Task 1 — Data model and core types
- [x] Task 2 — Settings, secrets and setup
- [x] Task 3 — LLM providers
- [x] Task 4 — Ingestion
- [x] Task 5 — Column mapping
- [x] Task 6 — Campaign brief and template analysis
- [x] Task 7 — Personalization and test run
- [ ] Task 8 — Gmail connection
- [ ] Task 9 — Template approval and review
- [ ] Task 10 — Scheduler and dispatcher
- [ ] Task 11 — Replies, alerts and dashboard
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
