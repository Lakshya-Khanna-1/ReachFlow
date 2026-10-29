import { readFileSync } from "node:fs";
export function GoogleGuide() {
  return (
    <details className="panel">
      <summary className="cursor-pointer text-lg">Google setup guide</summary>
      <pre className="mt-5 whitespace-pre-wrap font-sans text-sm leading-7 text-zinc-400">
        {readFileSync("docs/google-setup.md", "utf8")}
      </pre>
    </details>
  );
}
