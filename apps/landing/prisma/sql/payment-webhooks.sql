-- Apply after integration-hub.sql, once per environment.
BEGIN;
ALTER TABLE payment_provider_connections
  ADD COLUMN webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN webhook_auth TEXT NOT NULL DEFAULT 'HMAC_SHA256' CHECK (webhook_auth IN ('HMAC_SHA256','HMAC_SHA512','API_KEY')),
  ADD COLUMN webhook_last_received_at TIMESTAMP(3),
  ADD COLUMN webhook_registered_at TIMESTAMP(3);
CREATE TABLE payment_webhook_events (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES payment_provider_connections(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  identity_hash TEXT NOT NULL,
  payload_encrypted JSONB NOT NULL,
  amount_vnd BIGINT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(connection_id,event_key)
);
CREATE INDEX payment_webhook_events_connection_id_received_at_idx ON payment_webhook_events(connection_id,received_at);
COMMIT;
