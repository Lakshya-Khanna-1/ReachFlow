import { randomUUID } from "node:crypto";
import { z } from "zod";
import { guard, jsonInput, failure } from "@/lib/http";
import {
  gmail,
  connectedAddress,
  mime,
  sendRaw,
  gmailFailure,
} from "@/lib/gmail";
import { config, getSetting, putSetting } from "@/lib/settings";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    guard(request);
    const response = await gmail().users.getProfile(
      { userId: "me" },
      { retry: false, timeout: 15000 },
    );
    return Response.json({
      address: response.data.emailAddress,
      scopes: getSetting("googleScopes") ?? "",
      pauseReason: getSetting("pauseReason") ?? "",
    });
  } catch (e) {
    try {
      gmailFailure(e);
    } catch (safe) {
      return failure(safe);
    }
  }
}
export async function POST(request: Request) {
  try {
    guard(request);
    z.object({ action: z.literal("test") }).parse(await jsonInput(request));
    const address = connectedAddress();
    const sent = await sendRaw(
      mime({
        to: address,
        from: address,
        fromName: config().senderName,
        subject: "ReachFlow connection test",
        body: "Your dedicated Gmail account is connected to ReachFlow. This is a setup test.",
        key: randomUUID(),
      }),
    );
    putSetting("testEmailSent", String(Date.now()));
    return Response.json({ ok: true, messageId: sent.messageId });
  } catch (e) {
    return failure(e);
  }
}
