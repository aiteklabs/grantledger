import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { GrantSchema } from "../src/index";

const json = z.toJSONSchema(GrantSchema, { target: "draft-2020-12" });
await writeFile(new URL("../grant.schema.json", import.meta.url), JSON.stringify(json, null, 2) + "\n");
console.log("wrote grant.schema.json");
