# ReachFlow

Local-first, carefully paced, personalized first-contact email from one dedicated Gmail account.

## Five-minute app setup

1. Install [Node.js LTS](https://nodejs.org/) with npm. Node 24 LTS is recommended; minimum Node 20.19.
2. Clone this repository and double-click `run.bat` on Windows. On macOS/Linux run `sh run.sh`.
3. Open **Settings**, choose a provider and model, save, then test the connection.
4. Complete the Google guide below, save the OAuth Client ID and Secret, connect Google and send a test email to yourself.
5. Set your real sender name, alert addresses, daily cap, business hours and timezone. Review the personal-Gmail notice.
6. Create a campaign, upload a sheet, choose tabs and confirm each tab's column mapping. Paste CSV/TSV/JSON is also supported.
7. Add a brief and sample email, analyze and edit the template, run the three-recipient test, and approve the tested template. Generate drafts, review exceptions and the spot-check, then approve for sending.

**Dry run is on by default.** It simulates delivery without calling Gmail, contacting leads or consuming real sending quota. Change to real delivery in Settings and explicitly approve that campaign for real sending. Changing delivery mode pauses a previously approved queue until it is approved again. Dry-run history remains visible separately.

The launcher installs locked dependencies, copies `.env.example` to `.env`, rebuilds when inputs change, checks the configured port, starts web and worker, and opens the browser after its health check passes. Keep the terminal open. Use Ctrl+C to stop. The server binds only to `127.0.0.1`; default browser URL is `http://localhost:3000`.

## What the app does

- Multi-tab XLSX/XLS/CSV/TSV and JSON import, 20 MB / 50,000-row limits, normalization, global contact deduplication and a cleaning report. Original rows and tab segments are retained.
- Per-sheet heuristic or AI mapping, editable template analysis and versioned approval.
- Resumable generation, per-row errors and tokens, independent grounding checks, spam/length/wording checks, MX validation and a virtualized review grid.
- Daily cap of 1–50, warm-up from 5/day, local business hours, optional weekends, 60–180-second jitter, no missed-day compensation and idle behavior when the queue is done.
- Gmail thread polling on startup and every five minutes, reply/bounce/auto-reply/unsubscribe classification, global suppression, once-per-reply alerts, funnel counts and CSV/XLSX results.

## Local model settings

For Ollama, install it separately, pull a 7–8B instruction model such as `llama3.1:8b`, and run its local server. In ReachFlow choose Local, base URL `http://localhost:11434/v1` and the model's exact installed name. LM Studio and vLLM can use their OpenAI-compatible base URL. Keep structured output enabled where supported, use at least an 8K context, and start with the three-row test. The app limits concurrent LLM calls to three and repairs/retries malformed JSON twice.

OpenRouter and Gemini use their provider endpoints; enter the exact available model identifier and your API key. Keys are write-only in the UI. Save changes before connection tests. Hosted model availability and quotas depend on your account. No local model weights or Google credentials are bundled.

## Safety and recovery

Secrets use AES-256-GCM with a generated `data/.key`. Tokens never go to the browser. SQLite uses WAL, foreign keys and transactions. Mutations require a same-origin request; all API data remains local unless a configured provider or Gmail operation needs it. File parsing runs on a separate thread.

Before each real send, ReachFlow rechecks contact history, suppression, MX, footer/link rules and approvals, then reserves quota and marks the draft `sending` in SQLite. Messages have stable RFC Message-ID and ReachFlow key headers. The Gmail client disables automatic transport retries for sending.

A crash or timeout during delivery can leave its outcome unknown: Gmail and SQLite cannot commit together. On restart ReachFlow searches Sent by the stable message identifier. A confirmed message is recorded once. An unconfirmed message stays **uncertain** and is never automatically resent; it reserves quota for its original day. Pause sending and use **Reconcile uncertain sends** to check again. This conservatively prevents duplicate sends, but may leave an email unsent until you inspect Gmail. Gmail search indexing can lag.

Auth failures pause sending and require reconnection. More than one bounce in the last 20 completed real sends triggers the 5% bounce guard. Pause/Resume controls are available on the dashboard. A request already accepted by Gmail cannot be recalled by pausing. Alerts and sends only run while ReachFlow is open; first-email only, no follow-up sequences. Personal Gmail may throttle or suspend cold outreach, even at low volume.

**Back up with the app stopped:** copy the entire `data/` directory, including hidden `.key`. Restore the database and key together. Do not commit this folder or `.env`. On Windows restrict this project/data folder to your own Windows account; POSIX file modes do not replace Windows ACLs.

## Development and tests

```sh
npm ci
# Copy .env.example to .env
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm start
# One-time browser download, then isolated headless smoke tests:
npx playwright install chromium
npm run test:e2e
```

The E2E runner uses ports 3100 and 4319, a temporary database and a local mock LLM. It does not use your normal data or send real mail. Tests cover the campaign workflow, CSRF, secret-response checks, reply/alert fixtures, export and a 5,000-draft virtualized review. Unit tests also cover crash reconciliation, quotas, warm-up, timezone rules, grounding, mapping, JSON recovery and a 50,000-row parser fixture.

`PORT` and `DATABASE_PATH` can be configured in `.env`. Changing the port requires updating the Google redirect URI; OAuth connection is started from the `localhost` URL. A busy port is reported with process information and never changed silently. `better-sqlite3` uses native prebuilt binaries for supported LTS combinations; if compilation is needed, install Python 3 and Visual Studio Build Tools with **Desktop development with C++**, then rerun `npm ci`.

Four moderate advisory entries remain in the stable Drizzle migration CLI's legacy esbuild-loader dependency chain. Production dependencies audit clean. ReachFlow never starts that tooling's development server. The migration CLI is kept compatible with the Drizzle schema instead of forcing an unrelated downgrade.

## Google setup guide

1. Use a dedicated Gmail account. Turn on 2-step verification.
2. Open Google Cloud Console → create a new project.
3. APIs & Services → Library → enable **Gmail API**.
4. Configure the OAuth consent screen: user type **External**, add app name and support email.
5. Add scopes: `gmail.send` and `gmail.readonly`.
6. Add the dedicated Gmail as a **test user**.
7. For testing, keep the app in **Testing** and use the dedicated test user. Gmail refresh tokens for external apps in Testing normally expire after seven days, requiring reconnection. Production publishing and verification requirements depend on Google's policies and your use case; publishing alone does not guarantee approval. See [Google's OAuth token-expiration documentation](https://developers.google.com/identity/protocols/oauth2#expiration).
8. Credentials → Create OAuth client ID → **Web application**. Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`.
9. Copy Client ID and Client Secret into ReachFlow → Settings → Google.
10. Click **Connect Google account**. On the "Google hasn't verified this app" screen click **Advanced → Continue**. Allow both permissions.
11. Done. ReachFlow stores the refresh token encrypted. Note: Google's menu names change occasionally.

Google controls actual consent, test-user and verification requirements; account and policy restrictions may differ.

Human-reviewed writing examples can be saved locally in the `writingExamples` setting (up to 15 category/subject/body examples). Generation selects the two closest categories to keep small local models within their context budget. Examples guide wording; they do not fine-tune the model or replace grounding and review. They stay in the ignored local database. Imported workbooks with a `ReachFlow_Status` column skip recipients marked Sent, Sending, Uncertain, Replied, Bounced or Suppressed, in addition to the database's existing duplicate protection.

Local providers receive the required JSON schema as well as the writing prompt. Providers that reject schema mode or return an empty result fall back to JSON-object mode, then plain output with the same Zod validation. Retries identify invalid fields without copying email content into diagnostics or inventing missing confidence. Generated subjects are limited to 70 characters; short/long bodies still require review.

## What I need from you

- [ ] Install Node LTS if it is missing.
- [ ] Create or choose the dedicated Gmail, complete the Google Cloud setup above, and paste Client ID/Secret into Settings.
- [ ] Choose an LLM: pull a local model in Ollama or paste a provider API key.
- [ ] Set forward-to email addresses for yourself and friends.
- [ ] Confirm daily cap, business hours and timezone.
- [ ] Double-click `run.bat` (or use `sh run.sh`).
- [ ] Upload the first sheet, run Test Run, approve the template and approve for sending.

Real Google OAuth/revocation, real local-model quality and delivery to 2–3 addresses you own require your accounts. Clean Windows installation and macOS/Linux launcher checks remain manual. Automated exports are parsed back as XLSX; Microsoft Excel itself is not installed in this test environment.

## Verified build

On Windows with Node 24.22.1: lint, strict typecheck, 30 unit tests, production build and 2 headless E2E tests passed. A fresh source snapshot with no dependencies, environment, build or data completed the run.bat install/build/start flow, including healthy worker heartbeat, dry-run defaults, a custom-port OAuth redirect and a loopback-only listener. Node/npm were supplied by the agent runtime and a temporary npm shim; a separate clean Windows installation remains untested. The in-app dashboard was visually checked after startup.

An alert with an uncertain network result is also checked in Sent without automatic resend, to avoid duplicate alerts.

Gmail can rewrite the submitted RFC Message-ID. Reconciliation first searches that identifier, then checks the retained `X-ReachFlow-Key` header on up to 200 Sent messages from the last 30 days. Multiple matches or an older missing match remain uncertain and are never automatically resent. This fallback was verified against a real sent message.
