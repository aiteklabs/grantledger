// Fetch one page from a source, validate every record, print a summary. Usage: bun scripts/sample.ts eu_ft [cursor]
import { GrantSchema, SourceId } from "@grantledger/schema";
import { sources } from "../src/sources";

const id = SourceId.parse(process.argv[2]);
const source = sources[id];
const cursor = process.argv[3] ?? source.start(process.argv[4]);
const started = Date.now();
const page = await source.fetchPage(cursor);
let invalid = 0;
for (const g of page.grants) {
  const r = GrantSchema.safeParse(g);
  if (!r.success) {
    invalid++;
    if (invalid <= 3) console.error(g.id, r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
}
const statuses = page.grants.reduce<Record<string, number>>((acc, g) => ((acc[g.status] = (acc[g.status] ?? 0) + 1), acc), {});
console.log(JSON.stringify({ source: id, cursor, records: page.grants.length, invalid, statuses, next: page.next, ms: Date.now() - started }, null, 2));
console.log(JSON.stringify(page.grants[0], null, 2));
