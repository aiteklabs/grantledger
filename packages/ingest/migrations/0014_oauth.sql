-- OAuth for the assistants: authorization codes and refresh tokens work once (first insert of the jti wins),
-- and "disconnect all assistants" kills every token issued before the instant.
CREATE TABLE oauth_uses (
  jti TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);
ALTER TABLE accounts ADD COLUMN mcp_revoked_at TEXT;
