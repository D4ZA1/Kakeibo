CREATE TABLE saved_payees (
  phone TEXT PRIMARY KEY NOT NULL,
  vpa TEXT NOT NULL,
  name TEXT,
  raw_uri TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX saved_payees_vpa_idx ON saved_payees (vpa);
