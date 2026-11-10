const crypto = require('node:crypto');

async function run() {
  const appId = process.env.ZALO_APP_ID;
  const oaId = process.env.ZALO_OA_ID;
  const secret = process.env.ZALO_OA_SECRET_KEY;
  if (!appId || !oaId || !secret) throw new Error('Missing webhook configuration');
  const event = {
    app_id: appId,
    sender: { id: 'adhome-integration-test' },
    recipient: { id: oaId },
    event_name: 'user_send_text',
    message: { text: 'test', msg_id: 'adhome-integration-test' },
    timestamp: String(Date.now()),
  };
  const body = JSON.stringify(event);
  const signature = crypto.createHash('sha256').update(appId + body + event.timestamp + secret).digest('hex');
  const url = 'http://127.0.0.1:8081/api/v1/zalo/webhook';
  const request = (sig) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-zevent-signature': `mac=${sig}` }, body });
  const accepted = await request(signature);
  const duplicate = await request(signature);
  const rejected = await request('0'.repeat(64));
  console.log(JSON.stringify({ accepted: accepted.status, duplicate: duplicate.status, rejected: rejected.status }));
  if (accepted.status !== 200 || duplicate.status !== 200 || rejected.status !== 401) process.exitCode = 1;
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
