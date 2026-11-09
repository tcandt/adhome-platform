export function vnd(value: unknown, label = 'Số tiền'): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 100_000_000_000) {
    throw Object.assign(new Error(`${label} phải là số nguyên VND không âm.`), { statusCode: 422 });
  }
  return n;
}

export function availableDeposit(d: any): number {
  if (['TRANSFERRED', 'FORFEITED', 'REFUNDED'].includes(d.paymentStatus) ||
      ['APPLIED_TO_CONTRACT', 'FORFEITED', 'REFUNDED'].includes(d.status)) return 0;
  return Math.max(0, Number(d.paidAmountVnd || 0) - Number(d.refundedVnd || 0) -
    Number(d.deductedAmountVnd || 0) - Number(d.forfeitedAmountVnd || 0) - Number(d.transferredAmountVnd || 0));
}

export function rentalSettlement(B: number, C: number, R: number, action: string) {
  [B, C, R].forEach(n => vnd(n));
  if (!['RENT_CREDIT', 'REFUND'].includes(action)) throw Object.assign(new Error('Chọn cách xử lý tiền dư hợp lệ.'), { statusCode: 422 });
  const transferredDepositVnd = Math.min(B, C);
  const additionalDepositDue = Math.max(0, C - B);
  const surplusDepositVnd = Math.max(0, B - C);
  const appliedRentCreditVnd = action === 'RENT_CREDIT' ? Math.min(surplusDepositVnd, R) : 0;
  return { bookingDepositB: B, contractDepositRequiredC: C, rentFirstPeriodVnd: R,
    transferredDepositVnd, additionalDepositDue, surplusDepositVnd, appliedRentCreditVnd,
    remainingSurplusCreditVnd: action === 'RENT_CREDIT' ? Math.max(0, surplusDepositVnd - R) : 0,
    pendingRefundVnd: action === 'REFUND' ? surplusDepositVnd : 0,
    firstCycleRentDue: R - appliedRentCreditVnd,
    totalInitialInvoiceDue: additionalDepositDue + R - appliedRentCreditVnd };
}

// First invoice receipts pay the missing contract deposit first, then rent.
// The original transferred amount is never counted as a new receipt.
export async function allocateInitialReceipt(tx: any, invoice: any, totalPaid: number) {
  const snapshot = invoice.policySnapshot as any;
  if (snapshot?.type !== 'FIRST_COMBINED_INVOICE' || !invoice.contractId) return;
  const missing = vnd(snapshot.financialSummary?.additionalDepositDue || 0);
  const dep = await tx.deposit.findFirst({ where: { contractId: invoice.contractId, depositType: 'CONTRACT' } });
  if (!dep || ['REFUNDED', 'FORFEITED', 'APPLIED_TO_CONTRACT'].includes(dep.status) || Number(dep.refundedVnd || 0) + Number(dep.deductedAmountVnd || 0) + Number(dep.forfeitedAmountVnd || 0) + Number(dep.transferredAmountVnd || 0) > 0) return;
  await tx.$executeRaw`SELECT id FROM "deposits" WHERE id = ${dep.id} FOR UPDATE`;
  const required = Number(dep.amountVnd);
  const paid = Math.min(required, required - missing + Math.min(Math.max(0, totalPaid), missing));
  await tx.deposit.update({ where: { id: dep.id }, data: {
    paidAmountVnd: BigInt(paid), paymentStatus: paid >= required ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'PENDING',
    receivedAt: paid > 0 ? new Date() : null,
  } });
}
