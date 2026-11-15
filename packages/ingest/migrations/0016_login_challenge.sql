-- A sign-in code is checked against the challenge of the browser that asked for it (the gl_login cookie, set after the
-- captcha of /api/login or by /pro/thanks after payment), not against the address. Tries count per challenge, so a
-- stranger who knows an address cannot lock its owner's codes.
ALTER TABLE logins ADD COLUMN challenge TEXT;
CREATE INDEX logins_challenge ON logins (challenge);
