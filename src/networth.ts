export type ItemType = 'asset' | 'liability';

export const ASSET_GROUPS = [
  'Cash & bank accounts',
  'Investments',
  'Retirement accounts',
  'Real estate',
  'Vehicles',
  'Other assets',
] as const;

export const LIABILITY_GROUPS = [
  'Mortgage',
  'Auto loan',
  'Student loan',
  'Credit card debt',
  'Other liabilities',
] as const;

export type AssetGroup = (typeof ASSET_GROUPS)[number];
export type LiabilityGroup = (typeof LIABILITY_GROUPS)[number];
export type Group = AssetGroup | LiabilityGroup;

export interface Item {
  name: string;
  group: Group;
  amount: number; // always entered as a positive number, regardless of type
  type: ItemType;
}

export function defaultGroupFor(type: ItemType): Group {
  return type === 'asset' ? ASSET_GROUPS[0] : LIABILITY_GROUPS[0];
}

export function groupsFor(type: ItemType): readonly Group[] {
  return type === 'asset' ? ASSET_GROUPS : LIABILITY_GROUPS;
}

function normalizedAmount(item: Item): number {
  return Number.isFinite(item.amount) ? Math.abs(item.amount) : 0;
}

export function totalByType(items: Item[], type: ItemType): number {
  return items.filter((i) => i.type === type).reduce((sum, i) => sum + normalizedAmount(i), 0);
}

export function netWorth(items: Item[]): number {
  return totalByType(items, 'asset') - totalByType(items, 'liability');
}

export interface GroupBreakdownEntry {
  group: Group;
  amount: number;
  pctOfType: number; // percent of the total for that item's type (0-100), 0 if the type total is 0
}

export function breakdownByGroup(items: Item[], type: ItemType): GroupBreakdownEntry[] {
  const groups = groupsFor(type);
  const total = totalByType(items, type);
  return groups
    .map((group) => {
      const amount = items
        .filter((i) => i.type === type && i.group === group)
        .reduce((sum, i) => sum + normalizedAmount(i), 0);
      return { group, amount, pctOfType: total > 0 ? (amount / total) * 100 : 0 };
    })
    .filter((entry) => entry.amount > 0);
}

export interface Summary {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  assetBreakdown: GroupBreakdownEntry[];
  liabilityBreakdown: GroupBreakdownEntry[];
}

export function summarize(items: Item[]): Summary {
  return {
    totalAssets: totalByType(items, 'asset'),
    totalLiabilities: totalByType(items, 'liability'),
    netWorth: netWorth(items),
    assetBreakdown: breakdownByGroup(items, 'asset'),
    liabilityBreakdown: breakdownByGroup(items, 'liability'),
  };
}

// --- URL state -----------------------------------------------------------

export interface State {
  items: Item[];
  currency: string;
}

const TYPE_CODE: Record<ItemType, string> = { asset: 'a', liability: 'l' };
const CODE_TYPE: Record<string, ItemType> = { a: 'asset', l: 'liability' };

// Groups are referenced by index within their type's fixed list, so the encoding stays short
// and is immune to punctuation in group names.
function groupIndex(item: Item): number {
  return groupsFor(item.type).indexOf(item.group);
}

function groupFromIndex(type: ItemType, index: number): Group {
  const groups = groupsFor(type);
  return groups[index] ?? groups[0];
}

// Only the two structural delimiters need escaping here, with placeholders that contain no '%'
// of their own — URLSearchParams already percent-encodes everything else exactly once when the
// params are serialized, so an escape scheme built out of '%' sequences (e.g. "%7E") would itself
// get re-encoded into "%257E" during that pass. Private-use characters sidestep that entirely.
const TILDE_PLACEHOLDER = '';
const PIPE_PLACEHOLDER = '';

function escapeName(name: string): string {
  return name.replace(/~/g, TILDE_PLACEHOLDER).replace(/\|/g, PIPE_PLACEHOLDER);
}

function unescapeName(name: string): string {
  return name.split(TILDE_PLACEHOLDER).join('~').split(PIPE_PLACEHOLDER).join('|');
}

export function encodeState(state: State): URLSearchParams {
  const p = new URLSearchParams();
  p.set('c', state.currency);
  p.set(
    'i',
    state.items
      .map((item) => `${escapeName(item.name)}~${item.amount}~${TYPE_CODE[item.type]}~${groupIndex(item)}`)
      .join('|'),
  );
  return p;
}

export function decodeState(params: URLSearchParams, fallback: State): State {
  const currency = params.get('c') ?? fallback.currency;
  const raw = params.get('i');
  if (raw === null) return { ...fallback, currency };

  const items: Item[] = [];
  if (raw.length > 0) {
    for (const part of raw.split('|')) {
      const [nameRaw, amountRaw, typeRaw, groupRaw] = part.split('~');
      if (nameRaw === undefined) continue;
      const type: ItemType = CODE_TYPE[typeRaw] ?? 'asset';
      const amount = Number(amountRaw);
      const groupIdx = Number(groupRaw);
      items.push({
        name: unescapeName(nameRaw) || 'Item',
        amount: Number.isFinite(amount) ? amount : 0,
        type,
        group: groupFromIndex(type, Number.isFinite(groupIdx) ? groupIdx : 0),
      });
    }
  }
  return { items, currency };
}
