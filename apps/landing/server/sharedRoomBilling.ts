export function splitSharedCharge(totalVnd: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(totalVnd) || totalVnd < 0 || weights.some(weight => !Number.isSafeInteger(weight) || weight < 0)) throw new Error('Invalid shared charge');
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!totalWeight) throw new Error('Shared room has no residents');
  let allocated = 0;
  let cumulativeWeight = 0;
  return weights.map(weight => {
    cumulativeWeight += weight;
    const next = Math.floor(totalVnd * cumulativeWeight / totalWeight) - allocated;
    allocated += next;
    return next;
  });
}

export function sharedWaterCharge(method: string, rateVnd: number, residents: number, index: number, weights: number[]): number {
  if (method === 'PER_PERSON') return residents * rateVnd;
  const roomCharge = (method === 'FIXED_PER_ROOM' || method === 'FIXED_ROOM' ? 1 : 5) * rateVnd;
  return splitSharedCharge(roomCharge, weights)[index];
}
