# 4. Design System, Mobile & App Spec

## 4.1 Visual language

Dark, editorial, print-inspired — closer to a financial broadsheet than a trading terminal.

```css
--ink:      #0B1520   /* page background */
--panel:    #101F2F   /* cards */
--panel-2:  #0D1927   /* nested cards */
--gold:     #C9A24B   /* accent, primary buttons */
--gold-dim: #8a7038
--cream:    #EDE6D6   /* primary text */
--cream-dim:#9DA8B4   /* secondary text */
--gain:     #4CAF6D   /* up */
--loss:     #C1533E   /* down */
--info:     #6E9BC9   /* neutral emphasis */
--hair:     rgba(237,230,214,0.10)  /* borders */
```

**Type:** Fraunces (serif, headings) · Inter (sans, UI) · IBM Plex Mono (all numbers).
Every numeric value uses the mono face so columns align — non-negotiable for a data table.

**Semantic colour rule:** green/red mean up/down only. Never use them for good/bad
judgement on a metric, except where a threshold is genuinely objective (ROE ≥15% green,
debt/equity >100 red).

## 4.2 Components

| Class | Use |
|---|---|
| `.metric` / `.metric-grid` | Label + value + sub-caption card; auto-fit grid |
| `.stat` / `.stat-row` | Compact stat strip under the price hero |
| `table.book` | All data tables |
| `.rank-scroll` | Horizontal-scroll wrapper for wide tables |
| `.note-inline` | Dashed-border caveat block — used heavily, on purpose |
| `.section-label` | Heading with trailing rule line |
| `.gloss` / `.gloss-pop` | ⓘ marker and its tooltip |
| `#mnav` | Mobile bottom navigation |

## 4.3 Mobile spec (≤760px)

| Element | Behaviour |
|---|---|
| Header | Sticky, blurred backdrop, subtitle hidden |
| Indices | Horizontal swipe strip, 78% card width, scroll-snap |
| Metric grids | 2 columns; 1 column below 380px |
| Inputs | **16px font** — anything smaller triggers iOS auto-zoom |
| Wide tables | Keep horizontal scroll; the global rule that stacks tables into blocks is explicitly overridden inside `.rank-scroll` |
| Bottom nav | Fixed: Market · Watchlist · Screener · Top · Help |
| Safe areas | `env(safe-area-inset-*)` on header and nav |
| Charts | 230px main, 78px subplots |
| Touch targets | Min 40px; ⓘ markers grow to 18px on `hover:none` |

## 4.4 PWA spec

`manifest.json`: `display: standalone`, `theme_color` and `background_color` `#0B1520`,
`start_url: ./index.html`, `scope: ./`, two inline SVG icons (192 + 512, one maskable).

`sw.js` — **network-first for the shell, never cache market data**:
```js
if (url.hostname.includes('workers.dev') || url.hostname.includes('yahoo')) return;
if (url.origin !== self.location.origin) return;
```
A dashboard serving stale prices offline is worse than one that admits it is offline.

Install: Android/Chrome fires `beforeinstallprompt` → custom install bar. iOS/Safari has no
such event; Share → Add to Home Screen, which the `apple-mobile-web-app-*` meta tags support.

## 4.5 Native app — what it would take

Not built, and not buildable from a browser-only workflow. Options in order of effort:

1. **Capacitor wrapper** (~1 day) — wraps the existing PWA, gives a real Play Store /
   App Store binary, push notifications, native splash. Almost no code change.
2. **React Native / Expo rewrite** (~3–4 weeks) — genuine native feel, but every canvas
   chart must be rebuilt (react-native-svg or Victory Native).
3. **Flutter rewrite** — same cost, no reuse of existing JS.

Recommended: **Capacitor**. The dashboard is already responsive and installable; a wrapper
gets 90% of native value for ~5% of the effort.

```bash
npm i @capacitor/core @capacitor/cli
npx cap init "Dalal Street Live" com.sanjeev.dalalstreet
npx cap add android && npx cap add ios
# point webDir at the build output, then:
npx cap sync && npx cap open android
```

## 4.6 Accessibility / writing rules

- Glossary entries **warn about misreadings**, not just define terms.
  e.g. t-stat: *"Between −2 and 2, treat it as noise no matter how large it looks."*
- Every model output states its assumption and its failure mode next to it.
- Never use a red/green colour alone to carry meaning — always pair with a number or word.
