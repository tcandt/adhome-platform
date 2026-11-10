# AdHome Zalo webhook receiver

This is the small public receiver for `api.adhome.vn` on VPS 101. It binds only to
`127.0.0.1:8081`; Cloudflare Tunnel publishes HTTPS. PostgreSQL uses the local
Unix socket and peer authentication for the `adhome_app` system/database role.

`GET /healthz` checks the database. `POST /api/v1/zalo/webhook` validates App/OA
IDs, the five-minute timestamp window and `X-ZEvent-Signature` using Zalo's
`sha256(appId + raw JSON + timestamp + OA secret)` formula. Valid events enter
`zalo_webhook_inbox` once per App/OA/message key. `DANGKY <room> <phone>` is
checked against active contracts in the same PostgreSQL database. A successful
match creates one unique OA/UID and OA/tenant link in a transaction. Attempts
are recorded separately. Each registration result is also queued once in
`zalo_reply_outbox` in the same transaction. The sender is not implemented yet,
so a queued result must not be presented as delivered to the resident. When the authoritative
`contracts`, `tenants` and `console_rooms` tables are absent, registration is
recorded as `UNAVAILABLE` and no link is created. The server does not yet send
replies or ZBS templates or expose the existing console API.

`GET /api/v1/public/rooms` serves only the public room projection from the
PostgreSQL copy. The landing Worker can point `PUBLIC_API_ORIGIN` at
`https://api.adhome.vn`. The database copy is not yet synchronized with local
Console edits, so listings can become stale until synchronization is added.

Install `nodejs` and `node-pg` from Ubuntu packages. Create a matching Linux
system user and PostgreSQL role named `adhome_app`, then create the `adhome_prod`
database and apply `schema.sql`. Install `server.cjs`, `registration.cjs`, `registration-reply.cjs` and
`public-rooms.cjs` under `/opt/adhome-api/`,
the unit in `/etc/systemd/system/`, and set a root-owned mode-600
`/etc/adhome-zalo-webhook.env` with `ZALO_OA_SECRET_KEY`. Use **LF** line endings
for the environment file. Enable the unit with `systemctl enable --now
adhome-zalo-webhook`. Keep the PostgreSQL and Node ports off the public network.

`test-webhook.cjs` performs a local signed event, duplicate and bad-signature
check when run with the same environment as the service. Remove its test row from
`zalo_webhook_inbox` afterward.

## Zalo Bot (separate from OA)

The Bot API webhook is `POST /api/v1/zalo-bot/webhook`. Administrators configure
each organization's token in Console Settings. The server validates it with
`getMe`, generates a random webhook secret, encrypts both values in PostgreSQL,
and registers `https://api.adhome.vn/api/v1/zalo-bot/webhook` using `setWebhook`.
The receiver matches `X-Bot-Api-Secret-Token` against the stored hash. The VPS
needs only `ZALO_BOT_CONFIG_KEY` for encryption and `ZALO_BOT_ADMIN_API_KEY` for
the internal settings endpoint; neither bot token nor group ID is an env value.
Apply `schema.sql` before enabling the endpoint.

For private chats, `DANGKY <room> <phone>` is checked against an unambiguous
`DRAFT`, `ACTIVE`, `EXPIRING`, or `EXTENDED` contract in the same organization.
An update ID is stored once, and a one-to-one resident link is created only on
an exact eligible match. Contract and invoice lookup uses the authenticated
`127.0.0.1:8082` Console API, which owns the separate business database. Bot
PostgreSQL stores only chat links, templates, registration attempts and outboxes.
The result is queued and sent with `sendMessage`; the
outbox is marked `SENT` only after a successful Bot API response. A phone number
alone cannot be a Bot API destination: the resident must initiate a private
chat so the webhook captures a `chat_id`. Registration queues the configured
welcome message and the latest outstanding invoice. The Console polls a scoped
status endpoint and reports delivery only after Bot API `sendMessage` succeeds.
Periodic issued invoices queue rent and electricity/water charge notices; active
contracts within 30 days of expiry queue one reminder per end date. All event
keys are unique and delivery is retried from the outbox. The periodic sender
fetches candidates from Console API and matches them to local chat links.
Template text is
configured in Console Settings and stored in `zalo_bot_configs.message_templates`.
No payment-confirmation message is sent by this service.

Group messages are recorded as candidate chat IDs. To connect an admin group,
generate a one-time command in Console Settings, add the bot to the intended
group, and send `/setadmin <code>` there within 10 minutes. Only a group message with the matching code
sets `zalo_bot_admin_groups.chat_id`. A confirmation is sent through
`zalo_bot_admin_outbox`. Rotate the setup code after the group is connected.
The code is cleared after use. No payment confirmation is queued by this service.

Check `getWebhookInfo` before registering. A bot token can have one webhook
destination. Never redirect a bot already used by another application without
planning that application's migration.
