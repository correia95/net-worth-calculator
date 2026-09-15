import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSET_GROUPS,
  LIABILITY_GROUPS,
  totalByType,
  netWorth,
  breakdownByGroup,
  summarize,
  encodeState,
  decodeState,
  defaultGroupFor,
  groupsFor,
} from './networth.ts';

const items = [
  { name: 'Checking account', group: 'Cash & bank accounts', amount: 5000, type: 'asset' },
  { name: 'Brokerage', group: 'Investments', amount: 25000, type: 'asset' },
  { name: '401k', group: 'Retirement accounts', amount: 60000, type: 'asset' },
  { name: 'House', group: 'Real estate', amount: 400000, type: 'asset' },
  { name: 'Mortgage balance', group: 'Mortgage', amount: 300000, type: 'liability' },
  { name: 'Car loan', group: 'Auto loan', amount: 12000, type: 'liability' },
];

test('totalByType sums only the matching type', () => {
  assert.equal(totalByType(items, 'asset'), 5000 + 25000 + 60000 + 400000);
  assert.equal(totalByType(items, 'liability'), 300000 + 12000);
});

test('netWorth is assets minus liabilities', () => {
  const expected = 5000 + 25000 + 60000 + 400000 - (300000 + 12000);
  assert.equal(netWorth(items), expected);
});

test('netWorth is negative when liabilities exceed assets', () => {
  const upsideDown = [
    { name: 'Savings', group: 'Cash & bank accounts', amount: 1000, type: 'asset' },
    { name: 'Credit card', group: 'Credit card debt', amount: 5000, type: 'liability' },
  ];
  assert.equal(netWorth(upsideDown), -4000);
});

test('an item amount is treated as its absolute value regardless of sign entered', () => {
  const withNegative = [{ name: 'Oops', group: 'Cash & bank accounts', amount: -1000, type: 'asset' }];
  assert.equal(totalByType(withNegative, 'asset'), 1000);
});

test('a non-finite amount contributes zero rather than NaN', () => {
  const bad = [{ name: 'Bad', group: 'Cash & bank accounts', amount: NaN, type: 'asset' }];
  assert.equal(totalByType(bad, 'asset'), 0);
});

test('breakdownByGroup groups and sums correctly, omitting empty groups', () => {
  const breakdown = breakdownByGroup(items, 'asset');
  const byGroup = Object.fromEntries(breakdown.map((b) => [b.group, b.amount]));
  assert.equal(byGroup['Cash & bank accounts'], 5000);
  assert.equal(byGroup['Investments'], 25000);
  assert.equal(byGroup['Vehicles'], undefined); // no vehicle items -> omitted entirely
  assert.equal(breakdown.length, 4); // only the 4 groups with a nonzero total
});

test('breakdownByGroup percentages sum to 100 across populated groups', () => {
  const breakdown = breakdownByGroup(items, 'liability');
  const total = breakdown.reduce((s, b) => s + b.pctOfType, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

test('breakdownByGroup returns 0% for every entry when the type total is zero', () => {
  const noAssets = [{ name: 'Loan', group: 'Auto loan', amount: 5000, type: 'liability' }];
  const breakdown = breakdownByGroup(noAssets, 'asset');
  assert.equal(breakdown.length, 0);
});

test('summarize bundles totals, net worth and both breakdowns', () => {
  const s = summarize(items);
  assert.equal(s.totalAssets, 490000);
  assert.equal(s.totalLiabilities, 312000);
  assert.equal(s.netWorth, 178000);
  assert.equal(s.assetBreakdown.length, 4);
  assert.equal(s.liabilityBreakdown.length, 2);
});

test('defaultGroupFor and groupsFor pick the right list per type', () => {
  assert.equal(defaultGroupFor('asset'), ASSET_GROUPS[0]);
  assert.equal(defaultGroupFor('liability'), LIABILITY_GROUPS[0]);
  assert.deepEqual(groupsFor('asset'), ASSET_GROUPS);
  assert.deepEqual(groupsFor('liability'), LIABILITY_GROUPS);
});

test('encodeState/decodeState round-trips a full item list', () => {
  const state = { items, currency: 'USD' };
  const decoded = decodeState(encodeState(state), { items: [], currency: 'AUD' });
  assert.equal(decoded.currency, 'USD');
  assert.equal(decoded.items.length, items.length);
  for (let i = 0; i < items.length; i++) {
    assert.equal(decoded.items[i].name, items[i].name);
    assert.equal(decoded.items[i].amount, items[i].amount);
    assert.equal(decoded.items[i].type, items[i].type);
    assert.equal(decoded.items[i].group, items[i].group);
  }
});

test('encodeState/decodeState preserves special characters in item names', () => {
  const tricky = [{ name: 'Savings ~ "main" | joint', group: 'Cash & bank accounts', amount: 100, type: 'asset' }];
  const decoded = decodeState(encodeState({ items: tricky, currency: 'USD' }), { items: [], currency: 'USD' });
  assert.equal(decoded.items[0].name, tricky[0].name);
});

test('decodeState with no items param falls back to the given default items', () => {
  const fallback = { items, currency: 'GBP' };
  const decoded = decodeState(new URLSearchParams('c=USD'), fallback);
  assert.equal(decoded.currency, 'USD');
  assert.deepEqual(decoded.items, items); // no "i" param present -> keep fallback items
});

test('decodeState with an empty items param yields an empty list, not the fallback', () => {
  const fallback = { items, currency: 'GBP' };
  const decoded = decodeState(new URLSearchParams('i=&c=USD'), fallback);
  assert.deepEqual(decoded.items, []);
});

test('encodeState produces a single layer of percent-encoding, not double-encoded', () => {
  const withSpaceAndAmpersand = [{ name: 'Checking & savings', group: 'Cash & bank accounts', amount: 8000, type: 'asset' }];
  const qs = encodeState({ items: withSpaceAndAmpersand, currency: 'USD' }).toString();
  // A single encoding pass turns a space into %20 (or +) and & into %26; double-encoding would
  // additionally escape the '%' itself as %25, producing %2520/%2526 instead.
  assert.ok(qs.includes('%20') || qs.includes('+'));
  assert.ok(!qs.includes('%2520'));
  assert.ok(!qs.includes('%2526'));
});

test('a name containing a literal delimiter character round-trips without double-encoding', () => {
  const withPipeAndTilde = [{ name: 'Boat | trailer ~ 2019', group: 'Vehicles', amount: 1, type: 'asset' }];
  const qs = encodeState({ items: withPipeAndTilde, currency: 'USD' }).toString();
  // The delimiter escape must not introduce a literal '%' that gets re-encoded as %25.
  assert.ok(!qs.includes('%25'));
  const decoded = decodeState(new URLSearchParams(qs), { items: [], currency: 'USD' });
  assert.equal(decoded.items[0].name, 'Boat | trailer ~ 2019');
});
