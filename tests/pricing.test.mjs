import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateTuitionAllocation } from '../public/js/pricing.mjs';

test('current three-subject package splits to 20600 each', () => {
  const result = calculateTuitionAllocation({
    pricingVersion: 'current_21600_24',
    courses: ['physics', 'chemistry', 'biology'],
    paidAmount: 61800
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.totals.listPrice, 64800);
  assert.equal(result.totals.base, 61800);
  assert.equal(result.totals.builtInPackageDiscount, 3000);
  assert.deepEqual(
    Object.fromEntries(result.rows.map((row) => [row.courseId, row.revenueAmount])),
    { biology: 20600, chemistry: 20600, physics: 20600 }
  );
  assert.equal(result.rows.reduce((sum, row) => sum + row.builtInPackageDiscount, 0), 3000);
});

test('legacy two-subject package splits to 16300 each', () => {
  const result = calculateTuitionAllocation({
    pricingVersion: 'legacy_16800_24',
    courses: ['physics', 'chemistry'],
    paidAmount: 32600
  });

  assert.equal(result.totals.base, 32600);
  assert.equal(result.totals.listPrice, 33600);
  assert.equal(result.totals.builtInPackageDiscount, 1000);
  assert.deepEqual(
    Object.fromEntries(result.rows.map((row) => [row.courseId, row.revenueAmount])),
    { chemistry: 16300, physics: 16300 }
  );
});

test('biology-earth special package matches golden sample', () => {
  const result = calculateTuitionAllocation({
    packageId: 'biology_earth_12000',
    courses: ['biology', 'earth_science'],
    paidAmount: 12000
  });

  assert.deepEqual(
    Object.fromEntries(result.rows.map((row) => [row.courseId, row.revenueAmount])),
    { biology: 5140, earth_science: 6860 }
  );
});

test('no course is an error and produces no allocation rows', () => {
  const result = calculateTuitionAllocation({
    pricingVersion: 'current_21600_24',
    courses: [],
    paidAmount: 21600
  });

  assert.deepEqual(result.rows, []);
  assert.match(result.errors.join('\n'), /請至少選擇一門課/);
});

test('special package requires matching selected courses', () => {
  const result = calculateTuitionAllocation({
    packageId: 'biology_earth_12000',
    courses: ['biology'],
    paidAmount: 12000
  });

  assert.match(result.errors.join('\n'), /特殊套餐需要勾選：地科/);
});

test('invalid and negative money fields are errors', () => {
  const result = calculateTuitionAllocation({
    pricingVersion: 'current_21600_24',
    courses: ['physics'],
    paidAmount: 'abc',
    voucher: '-100'
  });

  assert.match(result.errors.join('\n'), /學費抵用券 必須是 0 或正數/);
  assert.match(result.errors.join('\n'), /實收金額 必須是 0 或正數/);
});

test('voucher is tracked separately while revenue sums to paid amount', () => {
  const result = calculateTuitionAllocation({
    pricingVersion: 'current_21600_24',
    courses: ['physics', 'chemistry'],
    voucher: 3000,
    paidAmount: 39200
  });

  assert.equal(result.totals.base, 42200);
  assert.equal(result.totals.voucher, 3000);
  assert.equal(result.totals.paid, 39200);
  assert.equal(result.rows.reduce((sum, row) => sum + row.voucher, 0), 3000);
  assert.equal(result.rows.reduce((sum, row) => sum + row.revenueAmount, 0), 39200);
});

test('custom paid amount keeps warning and allocates by paid total', () => {
  const result = calculateTuitionAllocation({
    pricingVersion: 'current_21600_24',
    courses: ['physics'],
    paidAmount: 20000
  });

  assert.equal(result.rows[0].revenueAmount, 20000);
  assert.match(result.warnings.join('\n'), /實收 20000 與規則推算 21600 不同/);
});

test('explicit zero paid amount is kept as zero', () => {
  const result = calculateTuitionAllocation({
    pricingVersion: 'current_21600_24',
    courses: ['physics'],
    paidAmount: 0
  });

  assert.equal(result.totals.paid, 0);
  assert.equal(result.rows[0].revenueAmount, 0);
  assert.match(result.warnings.join('\n'), /實收 0 與規則推算 21600 不同/);
});
