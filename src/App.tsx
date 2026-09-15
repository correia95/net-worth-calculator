import { useEffect, useMemo, useState } from 'react';
import {
  decodeState,
  encodeState,
  groupsFor,
  summarize,
  type Item,
  type ItemType,
  type State,
} from './networth';
import { CURRENCIES, currencySymbol, guessCurrency, money } from './intl';

const STARTER_ITEMS: Item[] = [
  { name: 'Checking & savings', group: 'Cash & bank accounts', amount: 8000, type: 'asset' },
  { name: 'Retirement account', group: 'Retirement accounts', amount: 45000, type: 'asset' },
  { name: 'Home value', group: 'Real estate', amount: 420000, type: 'asset' },
  { name: 'Mortgage balance', group: 'Mortgage', amount: 310000, type: 'liability' },
  { name: 'Credit card balance', group: 'Credit card debt', amount: 2500, type: 'liability' },
];

function readState(): State {
  const fallback: State = { items: STARTER_ITEMS, currency: guessCurrency() };
  try {
    return decodeState(new URLSearchParams(window.location.search), fallback);
  } catch {
    return fallback;
  }
}

let nextId = 0;
function withId<T>(item: T): T & { id: number } {
  return { ...item, id: nextId++ };
}

export default function App() {
  const [state, setState] = useState<State>(readState);
  const [rows, setRows] = useState(() => state.items.map(withId));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const items: Item[] = rows.map((row) => ({ name: row.name, group: row.group, amount: row.amount, type: row.type }));
      const params = encodeState({ items, currency: state.currency });
      const url = new URL(window.location.href);
      url.search = params.toString();
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* ignore */
    }
  }, [rows, state.currency]);

  const summary = useMemo(() => summarize(rows), [rows]);
  const currency = state.currency;

  const addItem = (type: ItemType) => {
    setRows((r) => [...r, withId({ name: '', group: groupsFor(type)[0], amount: 0, type })]);
  };

  const updateRow = (id: number, patch: Partial<Item>) => {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: number) => setRows((r) => r.filter((row) => row.id !== id));

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const assetRows = rows.filter((r) => r.type === 'asset');
  const liabilityRows = rows.filter((r) => r.type === 'liability');
  const maxGroupAmount = Math.max(1, ...summary.assetBreakdown.map((b) => b.amount), ...summary.liabilityBreakdown.map((b) => b.amount));

  return (
    <div className="app">
      <header>
        <h1>Net Worth Calculator</h1>
        <p className="tag">
          List what you own and what you owe, grouped by category, and see your net worth and how
          it breaks down. Everything is calculated in your browser.
        </p>
      </header>

      <label className="f currency-picker">
        <span>Currency</span>
        <select value={currency} onChange={(e) => setState((s) => ({ ...s, currency: e.target.value }))}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c} ({currencySymbol(c)})
            </option>
          ))}
        </select>
      </label>

      <div className="result">
        <p className="big">{money(summary.netWorth, currency)}</p>
        <p className="sub">net worth</p>
        <div className="grid">
          <div>
            <b>{money(summary.totalAssets, currency)}</b>
            <span>total assets</span>
          </div>
          <div>
            <b>{money(summary.totalLiabilities, currency)}</b>
            <span>total liabilities</span>
          </div>
        </div>
        <button className="share" onClick={share}>{copied ? 'Link copied' : 'Copy shareable link'}</button>
      </div>

      <ItemList
        title="Assets"
        singular="asset"
        type="asset"
        rows={assetRows}
        currency={currency}
        onAdd={() => addItem('asset')}
        onUpdate={updateRow}
        onRemove={removeRow}
      />
      <ItemList
        title="Liabilities"
        singular="liability"
        type="liability"
        rows={liabilityRows}
        currency={currency}
        onAdd={() => addItem('liability')}
        onUpdate={updateRow}
        onRemove={removeRow}
      />

      {(summary.assetBreakdown.length > 0 || summary.liabilityBreakdown.length > 0) && (
        <section className="group">
          <h2>Breakdown by category</h2>
          <BreakdownBars entries={summary.assetBreakdown} max={maxGroupAmount} currency={currency} tone="asset" />
          <BreakdownBars entries={summary.liabilityBreakdown} max={maxGroupAmount} currency={currency} tone="liability" />
        </section>
      )}

      <section className="explainer">
        <h2>How net worth is calculated</h2>
        <p>
          Net worth is simply everything you own (assets) minus everything you owe (liabilities).
          Add a line for each account, property, loan or balance you want to include, pick a
          category for the breakdown, and the total updates as you type.
        </p>
        <h3>What counts as an asset or a liability?</h3>
        <p>
          Assets are things with value you could convert to cash: bank balances, investments,
          retirement accounts, property, vehicles. Liabilities are debts you owe: a mortgage, loans,
          credit card balances. Only enter the current balance owed for a liability, not the
          original loan amount.
        </p>
        <h3>Is anything sent to a server?</h3>
        <p>No. Every item is calculated in your browser and only stored in the page's own link.</p>
        <footer>Net Worth Calculator · no sign-up · works offline once loaded</footer>
      </section>
    </div>
  );
}

function ItemList({
  title,
  singular,
  type,
  rows,
  currency,
  onAdd,
  onUpdate,
  onRemove,
}: {
  title: string;
  singular: string;
  type: ItemType;
  rows: (Item & { id: number })[];
  currency: string;
  onAdd: () => void;
  onUpdate: (id: number, patch: Partial<Item>) => void;
  onRemove: (id: number) => void;
}) {
  const groups = groupsFor(type);
  return (
    <section className="group">
      <h2>{title}</h2>
      {rows.length === 0 && <p className="hint">No {title.toLowerCase()} yet.</p>}
      {rows.map((row) => (
        <div key={row.id} className="item-row">
          <input
            className="item-name"
            type="text"
            placeholder="Name"
            value={row.name}
            onChange={(e) => onUpdate(row.id, { name: e.target.value })}
          />
          <select value={row.group} onChange={(e) => onUpdate(row.id, { group: e.target.value as Item['group'] })}>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <input
            className="item-amount"
            type="number"
            min={0}
            value={row.amount}
            onChange={(e) => onUpdate(row.id, { amount: Number(e.target.value) })}
          />
          <button className="remove" onClick={() => onRemove(row.id)} aria-label={`Remove ${row.name || singular}`}>
            ×
          </button>
        </div>
      ))}
      <button className="ghost" onClick={onAdd}>+ Add {singular}</button>
      <p className="sub currency-hint">Amounts in {currencySymbol(currency)}</p>
    </section>
  );
}

function BreakdownBars({
  entries,
  max,
  currency,
  tone,
}: {
  entries: { group: string; amount: number; pctOfType: number }[];
  max: number;
  currency: string;
  tone: 'asset' | 'liability';
}) {
  if (entries.length === 0) return null;
  return (
    <div className="breakdown">
      {entries.map((entry) => (
        <div key={entry.group} className="breakdown-row">
          <span className="breakdown-label">{entry.group}</span>
          <div className="breakdown-track">
            <div className={`breakdown-fill ${tone}`} style={{ width: `${Math.max(2, (entry.amount / max) * 100)}%` }} />
          </div>
          <span className="breakdown-value">{money(entry.amount, currency)}</span>
        </div>
      ))}
    </div>
  );
}
