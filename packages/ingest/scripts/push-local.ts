// Runs a source adapter on this machine and pushes each page to the deployed Worker's /ingest endpoint.
// For sources that block Cloudflare egress. Usage: ADMIN_TOKEN=... bun scripts/push-local.ts se_vinnova [cursor]
import { SourceId } from "@grantledger/schema";
import { sources } from "../src/sources";

const id = SourceId.parse(process.argv[2]);
const source = sources[id];
const base = process.env.INGEST_URL;
const token = process.env.ADMIN_TOKEN;
if (!token || !base) throw new Error("ADMIN_TOKEN and INGEST_URL required");
let cursor: string | null = process.argv[3] ?? source.start();
let pages = 0;
let upserted = 0;
while (cursor) {
  const page = await source.fetchPage(cursor);
  // Push in slices so one request stays small.
  for (let i = 0; i < page.grants.length; i += 200) {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ source: id, grants: page.grants.slice(i, i + 200), raws: page.raws.slice(i, i + 200) }),
    });
    const out = (await res.json()) as { upserted?: number; error?: string };
    if (!res.ok) throw new Error(`ingest failed: ${res.status} ${out.error ?? ""}`);
    upserted += out.upserted ?? 0;
  }
  pages++;
  console.log(`page ${pages} cursor=${cursor.slice(0, 40)} records=${page.grants.length} total=${upserted}`);
  cursor = page.next;
}
console.log("done", { pages, upserted });
