-- Additive deployment only. Apply with psql -v ON_ERROR_STOP=1 -f ...
-- Existing integration_connections and Hunonic data remain intact.
BEGIN;
CREATE TABLE payment_provider_connections (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL CHECK (provider_id IN ('SEPAY','PAYOS','MOMO','ZALOPAY','TINGEE')),
  name TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'LIVE' CHECK (environment IN ('LIVE','SANDBOX')),
  building_id TEXT REFERENCES buildings(id) ON DELETE RESTRICT,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'UNCONFIGURED' CHECK (status IN ('UNCONFIGURED','VERIFIED','ERROR')),
  credentials_encrypted JSONB NOT NULL,
  credential_fields JSONB NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  last_tested_at TIMESTAMP(3),
  last_test_message TEXT,
  verification_scope TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL,
  CHECK (NOT is_enabled OR (status = 'VERIFIED' AND environment = 'LIVE'))
);
CREATE INDEX payment_provider_connections_org_id_provider_id_idx ON payment_provider_connections(org_id,provider_id);
CREATE TABLE payment_receiving_accounts (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES payment_provider_connections(id) ON DELETE CASCADE,
  bank_code TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  UNIQUE(connection_id,bank_code,account_number)
);
COMMIT;
