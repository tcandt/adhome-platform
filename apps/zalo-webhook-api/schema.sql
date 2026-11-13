CREATE TABLE IF NOT EXISTS zalo_webhook_inbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  app_id text NOT NULL,
  oa_id text NOT NULL,
  event_key text NOT NULL,
  event_name text NOT NULL,
  sender_id text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, oa_id, event_key)
);

GRANT INSERT, SELECT ON zalo_webhook_inbox TO adhome_app;
GRANT USAGE, SELECT ON SEQUENCE zalo_webhook_inbox_id_seq TO adhome_app;

CREATE TABLE IF NOT EXISTS zalo_resident_links (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  oa_id text NOT NULL,
  zalo_uid text NOT NULL,
  tenant_id text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (oa_id, zalo_uid),
  UNIQUE (oa_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS zalo_registration_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inbox_id bigint NOT NULL UNIQUE REFERENCES zalo_webhook_inbox(id),
  status text NOT NULL CHECK (status IN ('VERIFIED', 'ALREADY_VERIFIED', 'CONFLICT', 'NO_MATCH', 'AMBIGUOUS', 'UNAVAILABLE', 'INVALID_FORMAT')),
  tenant_id text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT, SELECT ON zalo_resident_links, zalo_registration_attempts TO adhome_app;
GRANT USAGE, SELECT ON SEQUENCE zalo_resident_links_id_seq, zalo_registration_attempts_id_seq TO adhome_app;

CREATE TABLE IF NOT EXISTS zalo_reply_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inbox_id bigint NOT NULL UNIQUE REFERENCES zalo_webhook_inbox(id),
  oa_id text NOT NULL,
  zalo_uid text NOT NULL,
  registration_status text NOT NULL,
  message text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING', 'SENT', 'FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

GRANT INSERT, SELECT ON zalo_reply_outbox TO adhome_app;
GRANT USAGE, SELECT ON SEQUENCE zalo_reply_outbox_id_seq TO adhome_app;

CREATE TABLE IF NOT EXISTS zalo_bot_inbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bot_id text NOT NULL,
  update_id text NOT NULL,
  chat_id text NOT NULL,
  user_id text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, update_id)
);

CREATE TABLE IF NOT EXISTS zalo_bot_resident_links (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bot_id text NOT NULL,
  chat_id text NOT NULL,
  user_id text NOT NULL,
  tenant_id text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, chat_id),
  UNIQUE (bot_id, user_id),
  UNIQUE (bot_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS zalo_bot_registration_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inbox_id bigint NOT NULL UNIQUE REFERENCES zalo_bot_inbox(id),
  status text NOT NULL CHECK (status IN ('VERIFIED', 'ALREADY_VERIFIED', 'CONFLICT', 'NO_MATCH', 'AMBIGUOUS', 'UNAVAILABLE', 'INVALID_FORMAT')),
  tenant_id text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zalo_bot_reply_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inbox_id bigint NOT NULL UNIQUE REFERENCES zalo_bot_inbox(id),
  bot_id text NOT NULL,
  chat_id text NOT NULL,
  message text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING', 'SENT')),
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

GRANT INSERT, SELECT ON zalo_bot_inbox, zalo_bot_registration_attempts, zalo_bot_reply_outbox TO adhome_app;
-- SELECT ... FOR UPDATE in resident registration requires UPDATE privilege.
GRANT INSERT, SELECT, UPDATE, DELETE ON zalo_bot_resident_links TO adhome_app;
GRANT UPDATE ON zalo_bot_reply_outbox TO adhome_app;
GRANT USAGE, SELECT ON SEQUENCE zalo_bot_inbox_id_seq, zalo_bot_resident_links_id_seq, zalo_bot_registration_attempts_id_seq, zalo_bot_reply_outbox_id_seq TO adhome_app;

CREATE TABLE IF NOT EXISTS zalo_bot_admin_groups (
  bot_id text PRIMARY KEY,
  chat_id text NOT NULL UNIQUE,
  connected_by text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zalo_bot_group_candidates (
  bot_id text NOT NULL,
  chat_id text NOT NULL,
  last_sender_id text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bot_id, chat_id)
);

CREATE TABLE IF NOT EXISTS zalo_bot_admin_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bot_id text NOT NULL,
  chat_id text NOT NULL,
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  message text NOT NULL,
  media_url text,
  media_caption text,
  delivery_status text NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING', 'SENT')),
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON zalo_bot_admin_groups, zalo_bot_group_candidates, zalo_bot_admin_outbox TO adhome_app;
GRANT USAGE, SELECT ON SEQUENCE zalo_bot_admin_outbox_id_seq TO adhome_app;

CREATE TABLE IF NOT EXISTS zalo_bot_configs (
  org_id text PRIMARY KEY,
  bot_id text NOT NULL UNIQUE,
  token_ciphertext text NOT NULL,
  webhook_secret_ciphertext text NOT NULL,
  webhook_secret_hash text UNIQUE,
  setup_code_hash text,
  setup_expires_at timestamptz,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON zalo_bot_configs TO adhome_app;
ALTER TABLE zalo_bot_configs ADD COLUMN IF NOT EXISTS webhook_secret_hash text UNIQUE;
ALTER TABLE zalo_bot_configs ADD COLUMN IF NOT EXISTS message_templates jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS zalo_bot_resident_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bot_id text NOT NULL,
  chat_id text NOT NULL,
  tenant_id text NOT NULL,
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  message text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING', 'SENT')),
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON zalo_bot_resident_outbox TO adhome_app;
GRANT USAGE, SELECT ON SEQUENCE zalo_bot_resident_outbox_id_seq TO adhome_app;
ALTER TABLE zalo_bot_resident_outbox ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE zalo_bot_resident_outbox ADD COLUMN IF NOT EXISTS media_caption text;
