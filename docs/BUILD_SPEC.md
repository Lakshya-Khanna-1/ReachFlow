# REACHFLOW — Master Build Prompt for Codex (v2)

You are a senior full-stack engineer and product designer. Build **ReachFlow**: a local-first web app that cold-emails a small list of prospects each day, personalized per person, from one dedicated Gmail account.

**In one line:** User uploads a messy lead spreadsheet plus one sample email. AI personalizes it per recipient. App sends 15–20 per day through Gmail, remembers who was contacted, tracks replies, alerts the user and friends, catches up automatically whenever the PC is on, and goes idle when the sheet is done.

---

## HOW YOU MUST WORK (READ FIRST)

1. **Do NOT build everything at once.** Work through the tasks below in order, **one task at a time**.
2. Before starting, create `AGENTS.md` (project rules, stack, conventions, "Decisions" log) and `TASKS.md` (checklist of all tasks with status). Keep both updated.
3. For each task: brief plan → implement → run lint, typecheck, tests → verify acceptance criteria → commit (`task-XX: summary`) → update `TASKS.md` → **STOP and print a short report** (built, how to verify, known gaps). Wait for me to say "continue".
4. If a requirement is ambiguous, choose the simplest sensible default, log it in `AGENTS.md` → "Decisions", and move on. Ask only if truly blocked.
5. Never add features outside the current task. Never leave stubs that pretend to work.
6. Keep a running list in `AGENTS.md` → "Needs from user" of every credential, account, or manual step required to go live. The final task turns this into a handoff checklist.

## SKILLS TO APPLY (use installed skills with these names; if one is missing, follow the principle)

- **tasteskill** — Editorial, dark-first UI (Linear/Raycast/Vercel feel). Geist or Inter. Zinc neutrals, thin `border-white/10` borders, muted accents (emerald = sent, amber = pending/limited, rose = error). No decorative gradients, no bubbly buttons, no template look. Tactile micro-interactions, sticky grid headers, purposeful empty states.
- **frontend-design** — For every screen. Strong hierarchy, deliberate spacing, accessible contrast, keyboard navigation.
- **ponytail** — Ruthless simplicity. No Docker, no Redis, no microservices, one way to do each thing. Boring proven libraries. Delete code that isn't earning its place.
- **impeccable** — Defensive correctness. TypeScript `strict`, no `any` in data paths, Zod at every boundary, atomic DB transactions, idempotent jobs, exponential backoff, typed errors shown in UI, no silent failures.
- **xlsx / spreadsheet handling** — Multi-sheet parsing, hygiene, export.
- **cold-deliverability** (doctrine) — Low caps, jitter, business hours, unique wording, plain text, opt-out line, suppression list, bounce handling.
- **webapp-testing / Playwright** — E2E smoke test in the final task.
- **security-review** (doctrine) — Secrets encrypted at rest, never sent to browser, no tokens or full email bodies in logs, CSRF protection on mutating routes, bind server to `127.0.0.1` only.

## FIXED DECISIONS (do not debate)

- **Sender:** one dedicated plain `@gmail.com` account. No custom domain. Gmail API with OAuth2. Scopes: `gmail.send` and `gmail.readonly` only.
- **Volume:** default **20 emails/day**, user-adjustable between 1 and a hard ceiling of **50**. Warm-up: start at 5/day, +3/day until reaching the user's cap, reset warm-up if sending pauses for more than 14 days.
- **Pacing:** random jitter 60–180 s between sends. Send only inside configurable local business hours (default 10:00–17:00, system timezone), no weekends by default.
- **First email only.** No follow-up sequences in v1.
- **Stack:** Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui + Lucide + TanStack Table (virtualized). SQLite via Drizzle + better-sqlite3 (`./data/reachflow.db`). SheetJS (`xlsx`), Zod, `googleapis`. LLM calls via one `LLMProvider` interface using plain `fetch`.
- **Process model:** web server and a separate background worker (scheduler + sender + reply poller) started together by one command. All job state lives in SQLite so a crash or closed window never loses or duplicates work.
- **LLM providers:** local OpenAI-compatible endpoint (Ollama/LM Studio/vLLM, default `http://localhost:11434/v1`), OpenRouter, Gemini. Must work well with 7–8B local models.
- **Port:** fixed `3000` (configurable in `.env`). OAuth redirect URI depends on it.

## CORE DESIGN IDEAS (these make the product good — honor them)

1. **Two-stage personalization.**
   - _Stage 1 — Template Analysis (once per campaign):_ LLM reads brief + sample email and returns JSON: `core_message`, `cta`, `fixed_phrases[]` (must stay verbatim), `variable_slots[]` (each: `name`, `description`, `source_hints`, `fallback`). Explicit `{{placeholders}}` become slots; if none exist, infer slots (greeting, business reference, relevant observation…). User can edit the analysis.
   - _Stage 2 — Per-recipient generation:_ LLM gets analysis + sample + that recipient's cleaned row, returns JSON `{subject, body, used_fields[], confidence, notes}`.
2. **Grounding check.** Verifier flags any claim about the recipient not supported by their row data. Flagged drafts are never auto-approved. Thin data → fall back to the sample's neutral wording. Never invent facts.
3. **Small-model friendly.** Short structured prompts, JSON mode when available, JSON-repair step, up to 2 retries with stricter reminder, per-row failure capture without crashing the batch.
4. **Dirty data assumed.** Tabs may have different columns. Column mapping is **per sheet**, AI-assisted (LLM sees headers + 5 sample rows), heuristic fallback, user-confirmable. Tab name kept as `segment`.
5. **Approve the template once, review by exception.** User approves ONE master template after a "Test Run (3 random recipients)". System generates all drafts. Drafts passing every check (grounding, spam scan, confidence, word range, near-duplicate check, valid email) are **auto-approved**; others go to a "Needs attention" queue. A random spot-check sample (default 10) is shown for a quick read. Nothing sends before template approval.
6. **Never contact twice.** A global `contacts` table keyed by normalized email persists across all sheets and campaigns. Statuses: `pending`, `sent`, `replied`, `bounced`, `suppressed`. New sheets automatically skip anyone already contacted. Sends are idempotent (idempotency key per draft; mark `sending` in a transaction before the API call, reconcile on restart by checking the Gmail Sent folder for that draft's key header).
7. **Catch-up scheduler (PC is not always on).** A per-calendar-day counter (local date) is stored in the DB. Whenever the app starts, or the clock enters business hours, the worker computes `remaining_today = daily_cap_today − sent_today` and sends up to that many, with jitter. **Missed days are never made up** (no sending 40 to compensate). If the app starts outside business hours it waits and shows the next send time. Queued campaigns run in order. When no approved drafts remain, the app enters an **Idle** state: "Waiting for a new sheet," no sending, no polling of the LLM. Uploading a new sheet and approving it resumes work automatically.
8. **Replies dashboard + alerts.** Store Gmail `threadId` and `messageId` for every send. While the app runs, poll every 5 minutes (and on startup, to catch what arrived while it was off): a new message in the thread from the recipient → `replied`. Also classify: bounce (mailer-daemon/Delivery Status Notification → `bounced`, auto-suppress), auto-reply/out-of-office (log but don't mark as real reply), unsubscribe intent ("remove me", "unsubscribe", "stop emailing") → `suppressed`. On a real reply, send an **alert email** (via Gmail API from the dedicated account) to a configurable list of forward-to addresses (the user and friends), containing recipient name/company, a short snippet, and a link to the thread. Alert only once per reply. Dashboard shows funnel and a replies inbox view.
9. **Deliverability guard (plain Gmail mode).** Plain text by default, no tracking pixels, no link shorteners, max 1 link (prefer none), no attachments, spam-trigger scanner, short subjects, batch-level near-duplicate detector (flag drafts >85% similar), recipient syntax + MX check, suppression list, editable opt-out line (on by default), real sender name, Reply-To = sending account. Auto-pause sending if bounce rate exceeds 5% of the last 20 sends or auth fails. Show a one-time notice: cold emailing from personal Gmail can lead to throttling or suspension; keep volume low; use a dedicated account.
10. **Setup checklist in-app.** A "Setup" page with live green/red ticks: LLM reachable, Google connected (scopes granted), forward-to addresses set, test email sent, sheet uploaded, template approved. Embed the Google setup steps below.

### GOOGLE SETUP STEPS (embed verbatim in the in-app guide and README)

1. Use a dedicated Gmail account. Turn on 2-step verification.
2. Open Google Cloud Console → create a new project.
3. APIs & Services → Library → enable **Gmail API**.
4. Configure the OAuth consent screen: user type **External**, add app name and support email.
5. Add scopes: `gmail.send` and `gmail.readonly`.
6. Add the dedicated Gmail as a **test user**.
7. **Publish the app to "In production"** (no verification needed for personal use). This prevents refresh tokens expiring every 7 days.
8. Credentials → Create OAuth client ID → **Web application**. Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`.
9. Copy Client ID and Client Secret into ReachFlow → Settings → Google.
10. Click **Connect Google account**. On the "Google hasn't verified this app" screen click **Advanced → Continue**. Allow both permissions.
11. Done. ReachFlow stores the refresh token encrypted. Note: Google's menu names change occasionally.

---

## TASKS

### TASK 0 — Scaffold, Rules & run.bat

**Build:** Next.js project, Tailwind, shadcn, Drizzle+SQLite, ESLint, Prettier, Vitest, `.env.example`, `AGENTS.md`, `TASKS.md`, dark base layout with sidebar (Campaigns, Replies, Setup, Settings), design tokens per tasteskill. Scripts: `npm run dev` (web + worker), `npm run start` (production web + worker).
**`run.bat` (Windows, project root) — must work on any PC with double-click:**

- `cd /d "%~dp0"`.
- Check Node.js (>= 20 LTS) via `where node`/`node -v`. If missing: print a clear message with the nodejs.org LTS link and offer `winget install OpenJS.NodeJS.LTS`, then pause.
- If `node_modules` is missing or `package-lock.json` changed since last install → run `npm ci` (fallback `npm install`).
- If `.env` missing → copy from `.env.example`.
- If no production build exists or sources are newer → `npm run build`.
- Check port 3000 is free; if busy, print which process holds it and exit with instructions (do not silently change port, OAuth depends on it).
- Start web + worker with `npm run start`, open `http://localhost:3000` in the default browser after the server is ready (poll health endpoint, don't just sleep).
- Keep the window open, show live logs, handle Ctrl+C / window close gracefully (worker must finish or safely abort the current send and persist state).
- Also provide `run.sh` for macOS/Linux with equivalent behavior.
- Ensure `better-sqlite3` installs via prebuilt binaries on Windows; document the fallback if it must compile.
  **Done when:** double-clicking `run.bat` on a clean Windows machine with Node installed takes the user to the styled empty shell; typecheck, lint and one sample test pass.

### TASK 1 — Data Model & Core Types

**Build:** Drizzle schema + migrations: `settings`, `campaigns`, `sheets`, `column_mappings`, `contacts` (global, unique normalized email, status, first_contacted_at), `leads` (raw JSON, cleaned fields, segment, campaign_id, contact_id), `template_analyses`, `template_versions` (approved flag), `drafts` (subject, body, status, flags, edited flag, idempotency_key), `send_log` (timestamps, Gmail messageId/threadId, status), `daily_counters` (local_date, sent_count, cap_applied), `reply_events`, `alerts_sent`, `suppression`, `worker_state`. Zod schemas and typed repository helpers.
**Done when:** Migration runs from scratch; repository tests pass; every state change is a single transaction; unique constraint prevents duplicate contacts.

### TASK 2 — Settings, Secrets & Setup Page

**Build:** Settings sections: LLM (provider, model, base URL, API keys), Sending (daily cap, warm-up toggle, jitter min/max, business hours, weekend toggle, timezone), Notifications (forward-to email list), Footer/opt-out text. Secrets encrypted at rest (AES-256-GCM, key auto-generated at `./data/.key`), write-only in UI. "Test connection" per LLM provider. Setup page skeleton with live checklist ticks (items fill in as later tasks land).
**Done when:** Saved secrets never appear in API responses or logs; Ollama test-connection works; bad key gives clear error.

### TASK 3 — LLM Provider Layer

**Build:** `LLMProvider` interface + adapters (OpenAI-compatible/Ollama, OpenRouter, Gemini). JSON mode where available, timeout, exponential backoff on 429/5xx, concurrency limiter (default 3), token tracking, JSON-repair + retry helper. Mock provider for tests.
**Done when:** Same prompt works across adapters; tests cover retry, malformed JSON recovery, rate-limit backoff.

### TASK 4 — Ingestion Engine

**Build:** Upload + parsing for `.xlsx/.xls/.csv/.tsv/.json` and a paste box. Multi-sheet Sheet Selector (pick some/all, row counts, preview). Hygiene: trim, drop blank rows, normalize headers (keep originals), mixed types, header-row detection, email validation/normalization, dedupe within upload, **skip anyone already in `contacts`** (report how many), cleaning report listing what was removed and why. 50k-row files must not freeze the UI.
**Done when:** A messy multi-tab fixture workbook (create in `/fixtures`) ingests correctly; tests cover bad emails, duplicates, empty tabs, odd headers, already-contacted skipping.

### TASK 5 — Column Mapping (AI-assisted, per sheet)

**Build:** LLM proposes mapping (email, name, company, role, website, notes, custom variables) from headers + 5 sample rows; heuristic fallback (regex + fuzzy) when no LLM; UI to override/ignore columns with live preview; persist mappings.
**Done when:** Fixture maps correctly with LLM off and with mock LLM on; edits persist across reload.

### TASK 6 — Campaign Brief & Template Analysis

**Build:** Campaign wizard: name, brief (offer, audience, CTA), sample email editor, tone selector, word range, banned phrases. "Analyze template" runs Stage 1 and shows editable `core_message`, `cta`, fixed phrases, variable slots. Works for samples with and without placeholders.
**Done when:** Fixture samples (both kinds) produce sensible editable analyses; edits are saved and used downstream.

### TASK 7 — Personalization Engine, Grounding, Spam Scan, Test Run

**Build:** Stage 2 generator; batch generation as a persisted resumable job (progress, pause/resume/cancel, per-row errors, token usage); grounding verifier; spam scanner (trigger phrases, caps, punctuation, links, length); near-duplicate detector; footer injection; subject rules. **Test Run (3 random leads)** with side-by-side original vs generated, highlighted changes, used fields, flags.
**Done when:** Test Run works with mock and a real local model; fabricated-fact cases in tests are flagged; batch survives restart mid-run and resumes.

### TASK 8 — Gmail Connection

**Build:** Settings → Google: Client ID/Secret/redirect inputs, "Connect Google account", OAuth with scopes `gmail.send` + `gmail.readonly`, encrypted refresh token, automatic token refresh. Show connected address, scope status, today's sent count. "Send test email to myself". Embed the Google setup steps above as an in-app guide. Expired/revoked token → clear "Reconnect" prompt and worker pauses sending (no crash). Detect non-`gmail.com` account and show a neutral note (plain-Gmail limits still apply).
**Done when:** OAuth round trip works locally; test email arrives; revoked token handled gracefully; Setup checklist ticks update.

### TASK 9 — Template Approval & Review by Exception

**Build:** Template approval screen (versioned, approve after test run). Auto-approve engine; **Needs attention** queue as default view; random spot-check panel (default 10); optional full virtualized grid (recipient, segment, subject, body preview, flags, status; inline edit, drawer, filters, bulk approve/reject, "regenerate this row" with optional instruction). Edited rows never overwritten without confirmation. Final "Approve for sending" modal showing counts, schedule estimate (e.g., "~N days at 20/day"), and deliverability notes.
**Done when:** With 1,000 mock drafts the user reaches send-ready by reviewing only flagged rows + spot-checks; grid smooth at 5,000 rows.

### TASK 10 — Scheduler & Safe Dispatcher

**Build:** Worker implementing design idea 7 and 9: per-day counter, warm-up ramp, business hours/weekend rules, catch-up on startup without backlog compensation, jitter between sends, queued campaigns in order, Idle state with "Waiting for new sheet," suppression + contacts check before every send, idempotent send with `sending` marker and restart reconciliation, RFC 2822 MIME (plain text, From name, Reply-To), backoff on 429/5xx, hard stop on auth failure, auto-pause on bounce-rate threshold. Pause/Resume always responsive. Dashboard widget: sent today / today's cap, next send time, worker state. **Dry-run mode** (no real send) for tests.
**Done when:** Dry-run tests prove: jitter bounds, cap enforcement, no double-send after kill -9 mid-send, startup catch-up sends only the remaining quota, no weekend/off-hours sends, idle state reached when queue empty and resumes on new approved sheet. Real send of 2–3 emails to the user's own addresses works.

### TASK 11 — Replies Tracking, Alerts & Dashboard

**Build:** Reply poller (startup catch-up + every 5 min) using stored threadIds; classification (real reply, bounce, auto-reply, unsubscribe); status updates and auto-suppression; alert emails to forward-to list (once per reply, logged in `alerts_sent`); Replies page (inbox-style list with snippet, recipient, original email, Gmail link); main dashboard funnel (uploaded → cleaned → generated → approved → sent → replied/bounced), live send console with next-send countdown, suppression list manager, CSV/XLSX export of full results.
**Done when:** Simulated reply/bounce/out-of-office/unsubscribe fixtures classify correctly; alert sent exactly once; dashboard numbers match DB; export opens in Excel.

### TASK 12 — Hardening, E2E, Docs & Handoff

**Build:** Playwright E2E (upload fixture → map → analyze → test run → generate → approve template → dry-run dispatch → simulated reply). Security pass (secrets, logs, CSRF, bind to 127.0.0.1, input limits). Empty/error/loading-state and accessibility audit. Verify `run.bat` flow on a clean checkout (document results). README with 5-minute quickstart, Google setup steps, recommended local model settings, and backup tip (copy `./data`).
**Final handoff report (required):** Print a plain-language **"What I need from you"** checklist, derived from `AGENTS.md` → "Needs from user", covering exactly: (1) install Node LTS if missing; (2) create/choose the dedicated Gmail and complete the Google Cloud setup steps, then paste Client ID/Secret; (3) choose LLM (pull a local model in Ollama or paste an API key); (4) set forward-to email addresses (user + friends); (5) confirm daily cap, business hours, timezone; (6) double-click `run.bat`; (7) upload first sheet, run Test Run, approve template, approve for sending. Also list known limitations (alerts and sending only while the app is running; first-email only; Gmail volume risks).
**Done when:** E2E passes headless; README quickstart works from a clean clone; `TASKS.md` all complete; handoff checklist printed.

---

## GLOBAL ACCEPTANCE RULES

- Typecheck, lint, tests green at the end of every task.
- No secret in client bundle, API responses, or logs. Server bound to localhost.
- Every long operation is resumable after restart. No email is ever sent twice to the same address.
- Missed days are never compensated. Daily cap is never exceeded.
- UI follows tasteskill throughout.

**Start now with TASK 0 only. Stop after its report.**
