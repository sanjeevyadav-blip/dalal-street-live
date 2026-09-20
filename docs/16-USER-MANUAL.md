# 16. User Manual

For the person using the dashboard. No finance background assumed.
(Also available in-product under "How to use this dashboard".)

**Live:** https://sanjeevyadav-blip.github.io/dalal-street-live/

## Getting started

1. **Read the market first.** The scrolling tape and three index cards show the whole
   market. A stock down 2% on a day the Nifty is down 2% has told you nothing about that
   company. Always read a move against the index.
2. **Open a stock.** Type 3+ letters in the search box ("tata", "hdfc", "wip") and pick a
   suggestion, or click any row in the watchlist, screener or ranking tables.
3. **Tap any ⓘ.** Every metric label has one. It explains the metric in plain English and,
   where the metric is commonly misread, says so.

## Reading a stock page, in order

**Snapshot** — read this first. Every row names its source.
`Computed here` means it was calculated in your browser from live prices, so it cannot be
stale. `Yahoo Finance` means vendor data, which can lag a quarter on fundamentals.
`Not sourced — fixed input` means an assumption (the 7% risk-free rate), which is a dial you
are entitled to disagree with.

**Charts and technicals** — describe what price *has been doing* and where it has previously
paused. They are descriptive, not predictive, and they fail regularly. That is why they carry
only part of the weight in any score here.

**Valuation (DCF)** — read the **range, not the point**. The sensitivity grid beneath the
fair value shows it swinging 40% or more across perfectly defensible assumptions. The
**reverse DCF** is usually more useful: instead of asking what the stock is worth, it tells
you what growth rate today's price already assumes — then you judge whether that is
believable.

**Earnings quality** — the fraud-and-fragility check. A company can report rising profits
for years while generating no cash. Cash flow vs profit, accruals, and whether cash growth
keeps pace with revenue are where that shows up. This matters more than any indicator.

**Options-implied probability** — where a stock has listed options, the market itself is
pricing the odds of it finishing above today's price, with real money at stake. That beats
any model on the page. Two caveats printed beside it: these are *risk-neutral* probabilities
(they embed a fear premium), and thin open interest makes far strikes unreliable.

**Factor decomposition** — tells you what you actually own. High R² means you mostly own
market risk. If alpha looks large but its t-statistic sits between −2 and 2, it is noise —
the single most common misreading in retail analysis.

**Thesis walkthrough** — six numbered steps ending in the verdict panel.

## The verdict panel does not give a verdict

It reports valuation, earnings quality, momentum, risk and the street view **separately**,
and stops there deliberately.

Where the pillars agree, you do not need a label. Where they conflict, **that conflict is
the finding** — collapsing it into one BUY/HOLD/AVOID word would hide the most useful thing
on the page. The synthesis also depends on your holding period, your existing positions and
your tax situation, none of which this page knows.

## Position sizing

Enter your total capital, the percentage you are willing to risk on one position, and a stop
price. It returns the number of shares that caps your loss at that amount.

Watch the concentration warning. A tight stop produces a *large* position for the same rupee
risk — your trade risk is controlled while your portfolio concentration quietly is not.

## The screener and ranking tables

Each has its own row-count selector (10/15/20/30/50) and they are independent. Scroll
sideways for all columns.

In the ranking, the **whole 55-stock universe is scored first**, then the top N is shown —
ranking only the first 10 names would not be a ranking. The first run takes 25–40 seconds;
changing the count afterwards is instant.

**The probability columns are model output, not forecasts.** They come from each stock's own
past-year drift and volatility. Expect most values between 45% and 60%. That narrow band is
the honest answer — one week of stock movement is close to a coin flip, and any tool showing
you 85% confidence on a one-week move is selling you something.

## Installing on your phone

**Android/Chrome:** tap Install when the banner appears, or menu → Add to Home Screen.
**iPhone/Safari:** Share → Add to Home Screen.
You get an icon and a fullscreen app with no browser bar.

## What this is not

Not investment advice. Nothing here is a recommendation to buy or sell. Publishing buy/sell
calls and target prices in India is restricted to SEBI-registered Research Analysts.

Data comes from unofficial Yahoo endpoints and NSE's public APIs — reliable enough to think
with, not something to trade on without checking your broker's own feed.

Every model here is shown with its assumptions and failure modes visible, because a number
without its caveats is worse than no number at all.
