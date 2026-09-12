// Amounts are GBP minor units. These keys are internal selection keys, not Stripe Price IDs.
export const packages = Object.freeze({
  essential: { name: 'Essential', base: 49500, seasonal: 29500 },
  signature: { name: 'Signature', base: 79500, seasonal: 49500 },
  'multi-property': { name: 'Multi-Property', base: 79500, additional: 39500, seasonal: 79500 },
});
export const money = amount => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount / 100);
export function selectPackage(key, seasonal = false, propertyCount = 1) {
  if (!Object.hasOwn(packages, key) || typeof seasonal !== 'boolean') throw new TypeError('Invalid package selection');
  if (!Number.isInteger(propertyCount) || propertyCount < 1 || propertyCount > 3 || (key !== 'multi-property' && propertyCount !== 1)) throw new TypeError('Invalid property count');
  const item = packages[key];
  const lineItems = [{ key, quantity: 1, amount: item.base + (propertyCount - 1) * (item.additional || 0) }];
  if (seasonal) lineItems.push({ key: `${key}-seasonal`, quantity: 1, amount: item.seasonal });
  return { packageKey: key, propertyCount, name: item.name, seasonal, currency: 'gbp', lineItems, total: lineItems.reduce((sum, line) => sum + line.amount * line.quantity, 0) };
}
