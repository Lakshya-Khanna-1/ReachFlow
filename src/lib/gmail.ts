import { google } from "googleapis";
import { z } from "zod";
import { config, secret, saveSecret, getSetting, putSetting } from "./settings";
import { emailSchema } from "./contracts";
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];
const tokenSchema = z.object({
  refresh_token: z.string().min(1),
  access_token: z.string().nullable().optional(),
  expiry_date: z.number().nullable().optional(),
  scope: z.string().optional(),
  token_type: z.string().nullable().optional(),
});
export function oauth() {
  const c = config();
  if (!c.googleClientId || !secret("googleSecret"))
    throw new Error("Save Google Client ID and Secret first");
  return new google.auth.OAuth2(
    c.googleClientId,
    secret("googleSecret"),
    `http://localhost:${process.env.PORT ?? 3000}/api/auth/google/callback`,
  );
}
export class GmailError extends Error {
  constructor(public status: number) {
    super(
      status === 401 || status === 403
        ? "Google authorization failed. Reconnect Google in Settings."
        : `Gmail request failed (HTTP ${status}). Delivery may need reconciliation.`,
    );
  }
}
export function gmailFailure(error: unknown): never {
  if (error instanceof GmailError) {
    if (error.status === 401 || error.status === 403)
      putSetting("pauseReason", error.message);
    throw error;
  }
  const parsed = z
    .object({
      code: z.union([z.number(), z.string()]).optional(),
      response: z.object({ status: z.number() }).optional(),
    })
    .safeParse(error);
  const code = parsed.success
    ? Number(parsed.data.response?.status ?? parsed.data.code ?? 0)
    : 0;
  const status = Number.isFinite(code) ? code : 0;
  if (status === 401 || status === 403 || status === 400)
    putSetting(
      "pauseReason",
      "Google authorization failed. Reconnect Google in Settings.",
    );
  throw new GmailError(status || 503);
}
export function gmail() {
  const auth = oauth();
  let tokens: ReturnType<typeof tokenSchema.parse>;
  try {
    tokens = tokenSchema.parse(JSON.parse(secret("googleToken") || "{}"));
  } catch {
    throw new GmailError(401);
  }
  auth.setCredentials(tokens);
  auth.on("tokens", (fresh) => {
    const old = JSON.parse(secret("googleToken") || "{}");
    saveSecret(
      "googleToken",
      JSON.stringify({
        ...old,
        ...fresh,
        refresh_token: fresh.refresh_token ?? old.refresh_token,
      }),
    );
  });
  return google.gmail({ version: "v1", auth });
}
export async function connectGoogle(code: string) {
  try {
    const auth = oauth();
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token)
      throw new Error(
        "Refresh token missing. Reconnect and allow both permissions.",
      );
    if (
      !GOOGLE_SCOPES.every((scope) => tokens.scope?.split(" ").includes(scope))
    )
      throw new Error("Both Gmail send and readonly permissions are required");
    auth.setCredentials(tokens);
    const profile = await google
      .gmail({ version: "v1", auth })
      .users.getProfile({ userId: "me" });
    const address = emailSchema.parse(profile.data.emailAddress);
    saveSecret("googleToken", JSON.stringify(tokens));
    putSetting("googleAddress", address);
    putSetting("googleScopes", tokens.scope ?? "");
    putSetting("pauseReason", "");
    return address;
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.startsWith("Refresh token") ||
        e.message.startsWith("Both Gmail"))
    )
      throw e;
    throw new Error(
      "Google connection failed. Check credentials, redirect URI, consent and test-user access.",
    );
  }
}
export function mime({
  to,
  subject,
  body,
  key,
  fromName,
  from,
}: {
  to: string;
  subject: string;
  body: string;
  key: string;
  fromName: string;
  from: string;
}) {
  emailSchema.parse(to);
  emailSchema.parse(from);
  if (/[\r\n]/.test(subject + fromName) || !/^[-a-zA-Z0-9]+$/.test(key))
    throw new Error("Invalid message headers");
  const encode = (s: string) =>
    `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`;
  return Buffer.from(
    [
      `From: ${encode(fromName || from)} <${from}>`,
      `To: ${to}`,
      `Reply-To: ${from}`,
      `Subject: ${encode(subject)}`,
      `Message-ID: <${key}@reachflow.local>`,
      `X-ReachFlow-Key: ${key}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(body)
        .toString("base64")
        .match(/.{1,76}/g)
        ?.join("\r\n") ?? "",
    ].join("\r\n"),
  ).toString("base64url");
}
export async function sendRaw(raw: string) {
  try {
    const response = await gmail().users.messages.send(
      { userId: "me", requestBody: { raw } },
      { retry: false, timeout: 30000 },
    );
    if (!response.data.id || !response.data.threadId) throw new GmailError(503);
    return { messageId: response.data.id, threadId: response.data.threadId };
  } catch (e) {
    if (e instanceof GmailError) throw e;
    return gmailFailure(e);
  }
}
type SentMessage = { id: string; threadId: string };
type SentMailbox = {
  search: (
    query: string,
    pageToken?: string,
  ) => Promise<{
    messages: SentMessage[];
    nextPageToken?: string;
  }>;
  keyHeader: (id: string) => Promise<string>;
};

export async function locateSentMessage(key: string, mailbox: SentMailbox) {
  const original = await mailbox.search(
    `in:sent rfc822msgid:${key}@reachflow.local`,
  );
  if (original.messages.length) {
    return original.messages.length === 1 ? original.messages[0] : null;
  }
  const matches: SentMessage[] = [];
  let pageToken: string | undefined;
  // shortcut: scan at most 200 recent Sent headers; older unconfirmed sends stay uncertain.
  for (let page = 0; page < 2; page++) {
    const result = await mailbox.search("in:sent newer_than:30d", pageToken);
    for (let start = 0; start < result.messages.length; start += 10) {
      const batch = result.messages.slice(start, start + 10);
      const keys = await Promise.all(batch.map((m) => mailbox.keyHeader(m.id)));
      matches.push(...batch.filter((_, i) => keys[i] === key));
    }
    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }
  return matches.length === 1 ? matches[0] : null;
}

export async function findSent(key: string) {
  try {
    const api = gmail();
    return await locateSentMessage(key, {
      async search(q, pageToken) {
        const response = await api.users.messages.list(
          { userId: "me", q, pageToken, maxResults: 100 },
          { retry: false, timeout: 15000 },
        );
        return {
          messages: (response.data.messages ?? [])
            .filter((m) => m.id && m.threadId)
            .map((m) => ({ id: m.id!, threadId: m.threadId! })),
          nextPageToken: response.data.nextPageToken ?? undefined,
        };
      },
      async keyHeader(id) {
        const response = await api.users.messages.get(
          {
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["X-ReachFlow-Key"],
          },
          { retry: false, timeout: 15000 },
        );
        return (
          response.data.payload?.headers?.find(
            (h) => h.name?.toLowerCase() === "x-reachflow-key",
          )?.value ?? ""
        );
      },
    });
  } catch (e) {
    return gmailFailure(e);
  }
}
export function connectedAddress() {
  return emailSchema.parse(getSetting("googleAddress") ?? "");
}
