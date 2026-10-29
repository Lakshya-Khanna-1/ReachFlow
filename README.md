# ReachFlow

Local-first, carefully paced outreach from a dedicated Gmail account.
**Task 0 scaffold:** styled navigation, SQLite foundation and web/worker launchers.
Uploading, AI generation, Google connection and sending are not implemented yet.
See [TASKS.md](TASKS.md) for the staged build.

## Quick start

1. Install [Node.js LTS](https://nodejs.org/) with npm (Node 24 recommended; minimum 20.19).
2. Clone this repository.
3. Windows: double-click `run.bat`. macOS/Linux: `sh run.sh`.
4. The launcher installs dependencies, creates `.env`, builds and opens the browser
   after `/api/health` responds. Keep the terminal open; use Ctrl+C to stop.

The server binds to `127.0.0.1` only. Default port is 3000; override `PORT` in `.env`
and update the eventual Google OAuth redirect accordingly. A busy port is an error;
the launcher prints process information and never silently changes ports.

## Development

```sh
npm ci
# Copy .env.example to .env if needed
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

Both dev and start run a separate worker. In this scaffold the worker opens SQLite
in WAL mode and waits; it does not contact Gmail or an LLM. Parent disconnection
closes its database. Later tasks add persisted jobs and safe-send reconciliation.
Force-closing a Windows console may prevent signal handlers from completing;
SQLite WAL provides crash recovery, and Task 10 must verify send recovery before
real sends are enabled.

`better-sqlite3` uses native prebuilt binaries on supported Windows/Node LTS
combinations. If installation falls back to compilation, install Python 3 and
Visual Studio Build Tools with **Desktop development with C++**, then rerun
`npm ci`. Prefer current Node LTS and a supported x64/arm64 architecture.
Dependency lock changes or a changed Node ABI trigger a reinstall. Source/config
changes trigger a new production build. Runtime data and `.env` are Git-ignored.
Back up `data/` with the app stopped; later this includes the secret encryption key.

## Verification and current limits

Lint, strict typecheck, SQLite rollback and occupied-port tests, and the production
build are checked on Windows with Node 24. Browser rendering and Setup navigation
were checked against the production server. The Windows launcher is checked in
this workspace using a temporary npm shim because the agent runtime bundles Node
without npm on PATH; standard Node installers include npm. A fresh Windows PC and
macOS/Linux have not been tested. Task 12 repeats clean-checkout verification.

`npm audit --omit=dev` reports zero known vulnerabilities. Four moderate advisory
entries remain in drizzle-kit's legacy esbuild-loader dependency chain. Do not run
its development server against untrusted sites; this app does not start it.

## Google setup (needed in Task 8)

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

The steps above reproduce the product brief; Google's account policies determine
actual consent and verification requirements. Settings and OAuth are future work.
