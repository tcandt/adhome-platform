import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { splitSharedCharge, sharedWaterCharge } from './sharedRoomBilling.ts';

test('electricity is split by resident count without losing rounding remainder', () => {
  const shares = splitSharedCharge(100001, [1, 2, 1]);
  assert.deepEqual(shares, [25000, 50000, 25001]);
  assert.equal(shares.reduce((sum, value) => sum + value, 0), 100001);
});

test('water per person uses configured rate; room and meter methods split total', () => {
  const weights = [1, 2];
  assert.deepEqual(weights.map((count, index) => sharedWaterCharge('PER_PERSON', 100000, count, index, weights)), [100000, 200000]);
  assert.deepEqual(weights.map((count, index) => sharedWaterCharge('FIXED_PER_ROOM', 100001, count, index, weights)), [33333, 66668]);
  assert.deepEqual(weights.map((count, index) => sharedWaterCharge('PER_M3', 15001, count, index, weights)), [25001, 50004]);
});
