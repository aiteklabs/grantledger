-- Personal key of a Pro account for the assistants (MCP endpoint and JSON API). Created on first visit of the
-- account page, rotated from there. Null until then.
ALTER TABLE accounts ADD COLUMN api_key TEXT;
CREATE UNIQUE INDEX accounts_api_key ON accounts(api_key);
