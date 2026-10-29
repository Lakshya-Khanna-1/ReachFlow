import { Resolver } from "node:dns/promises";
import { emailSchema } from "./contracts";
const cache = new Map<string, { valid: boolean; expires: number }>();
export async function mxValid(email: string) {
  const valid = emailSchema.safeParse(email);
  if (!valid.success) return false;
  const domain = valid.data.split("@")[1];
  const hit = cache.get(domain);
  if (hit && hit.expires > Date.now()) return hit.valid;
  let ok = false;
  try {
    const resolver = new Resolver({ timeout: 3000, tries: 1 });
    const records = await resolver.resolveMx(domain);
    ok = records.some((r) => !!r.exchange && r.exchange !== ".");
  } catch {}
  if (cache.size > 4096) cache.clear();
  cache.set(domain, { valid: ok, expires: Date.now() + 3600000 });
  return ok;
}
