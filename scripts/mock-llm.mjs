import { createServer } from "node:http";
const body =
  "I help small teams keep outreach organized without adding more busywork. The approach is simple: start with a short list, write thoughtful messages, and leave room for a real conversation. If this sounds relevant to your team, I would be happy to share a brief overview and learn whether it could help. Would a short conversation be useful?";
createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/v1/models") {
    res.end(JSON.stringify({ data: [{ id: "test-model" }] }));
    return;
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    const request = JSON.parse(raw);
    const system = request.messages[0].content;
    const payload = JSON.parse(request.messages[1].content);
    let value;
    if (system.startsWith("Analyze"))
      value = {
        core_message: "Organize outreach",
        cta: "Short conversation",
        fixed_phrases: ["Would a short conversation be useful?"],
        variable_slots: [
          {
            name: "name",
            description: "Greeting",
            source_hints: ["name"],
            fallback: "there",
          },
        ],
      };
    else if (system.startsWith("Map")) {
      value = {
        mapping: Object.fromEntries(
          payload.headers.map((h) => [
            h,
            /mail/.test(h)
              ? "email"
              : /name|person/.test(h)
                ? "name"
                : /company|business/.test(h)
                  ? "company"
                  : `custom:${h}`,
          ]),
        ),
      };
    } else if (system.startsWith("Verify"))
      value = { claims: [], unsupported_claims: [] };
    else
      value = {
        subject: `A quick idea for ${payload.row.company || payload.row.name || "your team"}`,
        body: `Hi ${payload.row.name || "there"},\n\n${body}`,
        used_fields: ["name", "company"].filter((k) => payload.row[k]),
        confidence: 0.95,
        notes: "Grounded in supplied row",
      };
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(value) } }],
        usage: { total_tokens: 100 },
      }),
    );
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Bad test request" }));
  }
}).listen(Number(process.env.MOCK_PORT ?? 4319), "127.0.0.1", () =>
  console.log("Mock LLM ready"),
);
