CREATE TABLE IF NOT EXISTS accounts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL
);
CREATE TABLE IF NOT EXISTS characters (
  account_id bigint PRIMARY KEY REFERENCES accounts(id),
  name text NOT NULL,
  state jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS characters_unique_name ON characters (lower(name));
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiration ON sessions (expires_at);
CREATE TABLE IF NOT EXISTS workshop (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  crates integer NOT NULL DEFAULT 0 CHECK (crates >= 0),
  opened_at timestamptz
);
INSERT INTO workshop (id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS expeditions (
  id uuid PRIMARY KEY,
  eligible bigint[] NOT NULL,
  delivered_at timestamptz
);
