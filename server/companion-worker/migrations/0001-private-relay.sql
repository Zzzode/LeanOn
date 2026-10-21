PRAGMA foreign_keys = ON;
CREATE TABLE meta (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL);
INSERT INTO meta VALUES (1, 0);
CREATE TABLE maintenance (id INTEGER PRIMARY KEY CHECK(id = 1), token TEXT NOT NULL, next_batch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE mutation_guard (id INTEGER PRIMARY KEY CHECK(id = 1), value INTEGER NOT NULL CHECK(value = 1));
CREATE TABLE admission_slots (
  slot TEXT PRIMARY KEY CHECK(slot IN ('owner', 'partner')),
  token_hash TEXT NOT NULL UNIQUE, login TEXT NOT NULL, expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open', 'claimed', 'retired')), account_id TEXT UNIQUE
);
CREATE TABLE accounts (
  id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE,
  slot TEXT NOT NULL UNIQUE REFERENCES admission_slots(slot),
  salt TEXT NOT NULL, password_hash TEXT NOT NULL, password_p INTEGER NOT NULL CHECK(password_p IN (1, 5)),
  vault_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('active', 'deleting'))
);
CREATE TABLE devices (
  account_id TEXT NOT NULL REFERENCES accounts(id), id TEXT NOT NULL, proof_hash TEXT NOT NULL,
  PRIMARY KEY(account_id, id)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), device_id TEXT NOT NULL,
  proof_hash TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_account ON sessions(account_id, expires_at);
CREATE TABLE hash_lease (id INTEGER PRIMARY KEY CHECK(id = 1), token TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE auth_budgets (scope TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL);
CREATE TABLE groups (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('vault', 'family')),
  epoch INTEGER NOT NULL, sequence INTEGER NOT NULL DEFAULT 0,
  grants TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL CHECK(status IN ('active', 'revoked'))
);
CREATE TABLE memberships (
  group_id TEXT NOT NULL REFERENCES groups(id), account_id TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL CHECK(kind IN ('vault', 'family')), PRIMARY KEY(group_id, account_id)
);
CREATE UNIQUE INDEX one_family ON memberships(account_id) WHERE kind = 'family';
CREATE UNIQUE INDEX one_vault ON memberships(account_id) WHERE kind = 'vault';
CREATE TABLE invites (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('device', 'family')),
  creator_id TEXT NOT NULL, creator_device_id TEXT NOT NULL, recipient_id TEXT, recipient_device_id TEXT,
  recipient_proof_hash TEXT, status TEXT NOT NULL CHECK(status IN ('open', 'pending', 'accepted', 'cancelled')),
  expires_at INTEGER NOT NULL, proof_hash TEXT NOT NULL, wrapped_key TEXT NOT NULL, group_id TEXT NOT NULL
);
CREATE INDEX invites_creator ON invites(creator_id, status, expires_at);
CREATE INDEX invites_recipient ON invites(recipient_id);
CREATE TABLE records (
  group_id TEXT NOT NULL REFERENCES groups(id), owner_id TEXT NOT NULL, record_id TEXT NOT NULL,
  change_id TEXT NOT NULL, device_id TEXT NOT NULL, category TEXT NOT NULL, kind TEXT NOT NULL,
  updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL CHECK(deleted IN (0, 1)), sequence INTEGER NOT NULL,
  payload TEXT NOT NULL, objects TEXT NOT NULL DEFAULT '[]', PRIMARY KEY(group_id, owner_id, record_id)
);
CREATE UNIQUE INDEX record_change ON records(group_id, change_id);
CREATE INDEX record_sequence ON records(group_id, sequence);
CREATE TABLE seen (
  group_id TEXT NOT NULL REFERENCES groups(id), change_id TEXT NOT NULL, owner_id TEXT NOT NULL, digest TEXT NOT NULL,
  PRIMARY KEY(group_id, change_id)
);
CREATE TABLE nonces (
  group_id TEXT NOT NULL REFERENCES groups(id), epoch INTEGER NOT NULL, nonce TEXT NOT NULL, change_id TEXT NOT NULL,
  PRIMARY KEY(group_id, epoch, nonce)
);
CREATE TABLE delivered (
  group_id TEXT NOT NULL REFERENCES groups(id), change_id TEXT NOT NULL, account_id TEXT NOT NULL, device_id TEXT NOT NULL,
  PRIMARY KEY(group_id, change_id, account_id, device_id)
);
CREATE TABLE receipts (
  group_id TEXT NOT NULL REFERENCES groups(id), change_id TEXT NOT NULL, recipient_id TEXT NOT NULL, acknowledged_at INTEGER NOT NULL,
  PRIMARY KEY(group_id, change_id, recipient_id)
);
CREATE TABLE photo_objects (
  id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), epoch INTEGER NOT NULL,
  owner_id TEXT NOT NULL, device_id TEXT NOT NULL, digest TEXT NOT NULL, size INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved', 'ready', 'fence-pending', 'fenced')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX photo_cleanup ON photo_objects(status, expires_at);
CREATE INDEX photo_group ON photo_objects(group_id, status);
CREATE TABLE object_refs (
  group_id TEXT NOT NULL, owner_id TEXT NOT NULL, record_id TEXT NOT NULL,
  object_id TEXT NOT NULL REFERENCES photo_objects(id), PRIMARY KEY(group_id, owner_id, record_id, object_id)
);
CREATE INDEX object_references ON object_refs(object_id);
CREATE TABLE deletion_jobs (
  operation_id TEXT PRIMARY KEY, account_id TEXT NOT NULL UNIQUE, proof_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('deleting', 'deleted')), created_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE deletion_history (
  account_id TEXT PRIMARY KEY, deleted_at INTEGER NOT NULL, revision INTEGER NOT NULL
);
CREATE TABLE deletion_objects (
  operation_id TEXT NOT NULL, object_id TEXT NOT NULL, PRIMARY KEY(operation_id, object_id)
);
CREATE TABLE revocation_history (
  group_id TEXT PRIMARY KEY, epoch INTEGER NOT NULL, revoked_at INTEGER NOT NULL, revision INTEGER NOT NULL
);

CREATE TABLE migration_jobs (account_id TEXT PRIMARY KEY REFERENCES accounts(id), operation_id TEXT NOT NULL, source_digest TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending', 'complete')));

CREATE TABLE service_identity (id INTEGER PRIMARY KEY CHECK(id = 1), identifier TEXT NOT NULL);
INSERT INTO service_identity VALUES (1, lower(hex(randomblob(32))));
