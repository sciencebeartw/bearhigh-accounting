function money(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export function calculateWithdrawalRefund(input = {}) {
  const paidTotal = Math.max(0, money(input.paidTotal));
  const sessionsTaken = Math.max(0, money(input.sessionsTaken));
  const unitPrice = Math.max(0, money(input.unitPrice) || 1000);
  const remainingTuition = Math.max(0, money(input.remainingTuition));
  const attendedCharge = sessionsTaken * unitPrice;
  const computedRefund = Math.max(0, paidTotal - remainingTuition - attendedCharge);
  const override = String(input.refundAmount ?? '').trim();
  const refundAmount = override === '' ? computedRefund : Math.max(0, money(override));
  return {
    paidTotal,
    sessionsTaken,
    unitPrice,
    remainingTuition,
    attendedCharge,
    computedRefund,
    refundAmount
  };
}

export function distributeRemainingTuition(total, rows = []) {
  const amount = Math.max(0, money(total));
  const validRows = rows.filter(Boolean);
  if (!validRows.length) return [];
  const base = Math.floor(amount / validRows.length);
  let remainder = amount - base * validRows.length;
  return validRows.map((row) => ({
    row,
    amount: base + (remainder-- > 0 ? 1 : 0)
  }));
}
