# Net Worth Calculator

List what you own and what you owe, grouped by category, and see your net
worth and its breakdown.

- Assets (cash & bank, investments, retirement, real estate, vehicles, other)
  vs. liabilities (mortgage, auto loan, student loan, credit card, other)
- Add/remove line items freely, each with a name, category and amount
- Per-category breakdown bars for both assets and liabilities
- 10 currencies, shareable link; nothing is uploaded, works offline

## Develop

```
npm install
npm run dev
npm run build      # tsc --noEmit && vite build
node --experimental-strip-types --test src/networth.test.mjs
```

The engine (`summarize`, `breakdownByGroup`, `netWorth`) is in
`src/networth.ts`. Item names are escaped for the two structural delimiters
(`~`/`|`) using non-'%' placeholder characters before being handed to
`URLSearchParams`, specifically to avoid double-percent-encoding (`%2526`-style
output) that a naive `encodeURIComponent`-then-`.set()` approach produces. 16
Node tests in `src/networth.test.mjs`, including regression tests for that
double-encoding pitfall.

## Deploy

Static assets on Cloudflare Workers (`wrangler.jsonc`). Live at
<https://net-worth-calculator.correia95.workers.dev/>.
