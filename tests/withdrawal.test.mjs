import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateWithdrawalRefund, distributeRemainingTuition } from '../public/js/withdrawal.mjs';

test('three to two subjects reprices package before refunding attended sessions', () => {
  const result = calculateWithdrawalRefund({
    paidTotal: 61800,
    remainingTuition: 42200,
    sessionsTaken: 6,
    unitPrice: 1000
  });

  assert.equal(result.attendedCharge, 6000);
  assert.equal(result.refundAmount, 13600);
});

test('two to one subject uses the confirmed single-subject price', () => {
  const result = calculateWithdrawalRefund({
    paidTotal: 42200,
    remainingTuition: 21600,
    sessionsTaken: 6,
    unitPrice: 1000
  });

  assert.equal(result.refundAmount, 14600);
});

test('remaining package tuition is distributed without losing rounding remainder', () => {
  const rows = distributeRemainingTuition(42200, [{ id: 'a' }, { id: 'b' }]);
  assert.deepEqual(rows.map((row) => row.amount), [21100, 21100]);
});
