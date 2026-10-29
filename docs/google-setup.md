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
