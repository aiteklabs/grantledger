import type { GeminiEnv } from "./gemini";
import type { AuthEnv } from "./auth";

export interface CloudflareEnvLike extends GeminiEnv, AuthEnv {
  DB: D1Database;
  RAW: R2Bucket;
  SITE_URL: string;
}
