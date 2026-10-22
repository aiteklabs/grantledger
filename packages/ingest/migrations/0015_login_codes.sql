-- Sign-in codes: the email that carries a magic link also carries a six-digit code for the same login row, so either
-- one spends both. Mail scanners cannot spend a code, and it works when the email is read on another device. Every
-- wrong guess counts against every open code of the email; five lock them.
ALTER TABLE logins ADD COLUMN code TEXT;
ALTER TABLE logins ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
