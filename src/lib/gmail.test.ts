import { test, expect } from "vitest";
import { mime, GOOGLE_SCOPES } from "./gmail";
test("plain-text MIME encodes UTF-8 and stable reconciliation identifiers safely", () => {
  const raw = mime({
    to: "ada@example.com",
    from: "sender@gmail.com",
    fromName: "Sender",
    subject: "Hello ✨",
    body: "Plain text only",
    key: "draft-123",
  });
  const text = Buffer.from(raw, "base64url").toString();
  expect(text).toContain("Message-ID: <draft-123@reachflow.local>");
  expect(text).toContain("Reply-To: sender@gmail.com");
  expect(text).toContain("Content-Type: text/plain");
  expect(() =>
    mime({
      to: "ada@example.com",
      from: "sender@gmail.com",
      fromName: "Sender",
      subject: "Hello\r\nBcc: bad@example.com",
      body: "x",
      key: "k",
    }),
  ).toThrow();
  expect(GOOGLE_SCOPES).toHaveLength(2);
});
