const REPLIES = Object.freeze({
  VERIFIED: 'AdHome da xac minh thong tin cu dan thanh cong. Ban se nhan thong bao qua tai khoan Zalo nay.',
  ALREADY_VERIFIED: 'Tai khoan Zalo nay da duoc xac minh voi ho so cu dan.',
  CONFLICT: 'Thong tin nay da lien ket voi tai khoan Zalo khac hoac tai khoan nay da lien ket voi ho so khac. Vui long lien he AdHome de duoc kiem tra.',
  NO_MATCH: 'AdHome chua tim thay ho so hop le khop ma phong va so dien thoai. Vui long kiem tra lai hoac lien he AdHome.',
  AMBIGUOUS: 'AdHome can kiem tra them ho so cua ban. Vui long lien he bo phan quan ly.',
  UNAVAILABLE: 'He thong dang tam thoi khong the xac minh. Vui long thu lai sau.',
  INVALID_FORMAT: 'Vui long nhan DANGKY <ma phong> <so dien thoai>.',
});

async function queueRegistrationReply(client, { inboxId, oaId, zaloUid, status }) {
  const message = REPLIES[status];
  if (!message) throw new Error(`Unknown registration status: ${status}`);
  await client.query(
    `INSERT INTO zalo_reply_outbox (inbox_id, oa_id, zalo_uid, registration_status, message)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (inbox_id) DO NOTHING`,
    [inboxId, oaId, zaloUid, status, message],
  );
}

module.exports = { REPLIES, queueRegistrationReply };
