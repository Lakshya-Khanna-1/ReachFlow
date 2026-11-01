import { test, expect } from "vitest";
import { mime, GOOGLE_SCOPES, locateSentMessage } from "./gmail";
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

test("rewritten Gmail Message-IDs reconcile by the retained key header", async () => {
  const queries: string[] = [];
  const found = await locateSentMessage("stable-key", {
    async search(q) {
      queries.push(q);
      return {
        messages: q.includes("rfc822msgid")
          ? []
          : [
              { id: "other", threadId: "t1" },
              { id: "match", threadId: "t2" },
            ],
      };
    },
    async keyHeader(id) {
      return id === "match" ? "stable-key" : "another-key";
    },
  });
  expect(found).toEqual({ id: "match", threadId: "t2" });
  expect(queries).toEqual([
    "in:sent rfc822msgid:stable-key@reachflow.local",
    "in:sent newer_than:30d",
  ]);
});

test("ambiguous or missing key matches remain unconfirmed and scans are bounded", async () => {
  let pages = 0;
  const found = await locateSentMessage("key", {
    async search(q) {
      if (q.includes("rfc822msgid")) return { messages: [] };
      pages++;
      return {
        messages: [{ id: String(pages), threadId: "t" }],
        nextPageToken: "more",
      };
    },
    async keyHeader() {
      return "key";
    },
  });
  expect(found).toBeNull();
  expect(pages).toBe(2);
  expect(
    await locateSentMessage("key", {
      async search() {
        return { messages: [] };
      },
      async keyHeader() {
        throw new Error("No messages should be read");
      },
    }),
  ).toBeNull();
});
