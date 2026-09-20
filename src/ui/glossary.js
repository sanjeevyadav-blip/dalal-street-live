// The ~95-term glossary and the tooltips that attach it to the page.
//
// Entries warn about misreadings rather than only defining terms (CLAUDE.md invariant 5):
// a t-stat entry says that between -2 and 2 it is noise however large it looks, because
// that is the mistake a reader actually makes.
//
// annotateGlossary walks rendered text and attaches an info marker wherever a known term
// appears. It is driven by a MutationObserver in app.js because blocks render
// asynchronously and at staggered delays — there is no single point at which the page is
// "done" and can be annotated once.
//
// GLOSSARY is extended in place from app.js as later sections mount; that is why it is a
// mutable object rather than a frozen one.

export const GLOSSARY = {
  'rsi (14)': ['RSI \u2014 Relative Strength Index', 'A speed gauge for price, from 0 to 100. Above 70 means the stock has risen fast recently and may be due a pause ("overbought"). Below 30 means it has fallen fast ("oversold"). It measures <em>pace</em>, not direction \u2014 a stock can stay overbought for months while still climbing.'],
  'rsi': ['RSI \u2014 Relative Strength Index', 'A 0\u2013100 speed gauge. Above 70 = risen quickly, below 30 = fallen quickly. It tells you how stretched a move is, not whether it will reverse.'],
  'macd (12,26,9)': ['MACD', 'Compares a short-term average price to a longer-term one. When the short average is above the long one, recent buying is stronger than the older trend, and the histogram turns positive. Traders read a flip from negative to positive as momentum turning up.'],
  'bollinger %b (20,2)': ['Bollinger %B', 'Where the price sits inside its normal trading band. 100% means it is at the top of its usual range, 0% at the bottom, 50% in the middle. Prices near the edges are unusually far from their recent average.'],
  'atr (14)': ['ATR \u2014 Average True Range', 'How much the price typically moves in a single day, in rupees. A \u20b920 ATR on a \u20b91,000 stock means roughly 2% daily swings are normal. Used to size positions and set sensible stop levels \u2014 a stop tighter than one ATR will usually get hit by noise.'],
  'historical volatility': ['Historical volatility', 'How jumpy the stock has been over the past year, annualised. 20% is calm for an Indian large cap; 50%+ is a wild ride. Higher volatility means a wider range of outcomes \u2014 both good and bad.'],
  'annualised volatility': ['Annualised volatility', 'How much the price bounces around over a year, expressed as a percentage. Low means steady, high means unpredictable. It says nothing about direction \u2014 only about the size of the swings.'],
  'beta vs nifty 50': ['Beta', 'How much the stock moves when the market moves. Beta 1.0 means it tracks the Nifty. Beta 1.5 means it typically swings 50% harder in both directions. Beta 0.5 means it is calmer than the market.'],
  'beta vs nifty 50 (1yr)': ['Beta', 'How much this stock moves when the Nifty moves. 1.0 = moves in step. Above 1 = amplifies market moves. Below 1 = cushions them. Measured from the last year of daily moves.'],
  'beta (yahoo)': ['Beta (vendor figure)', 'Same idea as beta above, but as calculated by Yahoo over their own window. It often differs from ours because the time period and index differ.'],
  '20 / 50 dma': ['Moving averages (20 and 50 day)', 'The average closing price over the last 20 and 50 trading days. They smooth out daily noise so the underlying trend is visible. Price above both usually means a short-term uptrend.'],
  '100 / 200 dma': ['Moving averages (100 and 200 day)', 'Longer-term average prices. The 200-day average is the most watched line in the market \u2014 many investors treat price above it as a bull market and below it as a bear market for that stock.'],
  '50-dma / 200-dma': ['50-day and 200-day moving averages', 'Average closing price over the last 50 and 200 trading days. Price above both is generally read as an uptrend; below both as a downtrend. The 200-day line is the most widely watched trend marker.'],
  'cagr (1y)': ['CAGR', 'Compound annual growth rate \u2014 the smoothed yearly return, as if the stock grew at one steady rate instead of bouncing around.'],
  'max drawdown (1y)': ['Maximum drawdown', 'The worst peak-to-trough fall over the period. If you had bought at the very top, this is how much you would have been down at the worst moment. A good gut-check on whether you could actually hold the position.'],
  'sharpe-style ratio': ['Sharpe ratio', 'Return earned per unit of risk taken. Higher is better. Below 0 means you would have done better in a fixed deposit for the risk you carried. Roughly: is the bumpy ride paying you enough?'],
  'stochastic %k / %d': ['Stochastic oscillator', 'Where today\u2019s close sits within the recent high-low range, 0 to 100. Near 100 means closing at the top of its recent range (strength); near 0 means closing at the bottom (weakness).'],
  'on-balance volume': ['On-balance volume (OBV)', 'Adds volume on up days and subtracts it on down days. If OBV rises while price stalls, buyers are quietly accumulating. If OBV falls while price holds, the rally may lack real support.'],
  'pivot levels (classic, prev. session)': ['Pivot levels', 'Reference prices calculated from yesterday\u2019s high, low and close. S1/S2 are potential floors, R1/R2 potential ceilings, P is the midpoint. Widely watched by intraday traders, which is partly why they sometimes work.'],
  'intraday vwap': ['VWAP', 'Volume-weighted average price \u2014 the average price paid by everyone who traded today, weighted by size. Institutions use it as a benchmark: buying below VWAP is considered a good fill.'],
  'volume': ['Volume', 'Number of shares traded. High volume on a price move means conviction behind it; a big move on thin volume is easier to reverse.'],
  'avg vol (20d)': ['Average volume (20 day)', 'Typical daily share turnover over the last month. Compare today\u2019s volume to this to see whether activity is unusual.'],
  'prev close': ['Previous close', 'Yesterday\u2019s final traded price. Today\u2019s percentage change is measured from here.'],
  '52-week range': ['52-week range', 'The lowest and highest price over the past year. Where the current price sits in that range tells you whether the stock is near its highs or its lows.'],
  'market cap': ['Market capitalisation', 'The whole company\u2019s value on the market: share price \u00d7 number of shares. This is what it would notionally cost to buy the entire business at today\u2019s price.'],
  'p/e (ttm)': ['P/E ratio', 'Price divided by last twelve months\u2019 earnings per share. Roughly: how many years of current profit you are paying for one share. High P/E means the market expects growth; low P/E means it expects trouble, or the market has overlooked it.'],
  'forward p/e': ['Forward P/E', 'Same as P/E but using analysts\u2019 forecast earnings instead of past ones. Useful when profits are expected to change sharply \u2014 but it depends on forecasts being right.'],
  'p/b': ['P/B \u2014 price to book', 'Share price compared to the company\u2019s accounting net worth per share. Below 1 means the market values the business at less than its book value. Most meaningful for banks; misleading for asset-light companies.'],
  'eps (ttm)': ['EPS \u2014 earnings per share', 'Profit earned per share over the last twelve months. The building block of the P/E ratio.'],
  'eps (ttm) \u2192 trailing p/e': ['EPS and trailing P/E', 'EPS is profit per share over the past year. Trailing P/E is the share price divided by that figure \u2014 how many years of current profit you are paying for.'],
  'dividend yield': ['Dividend yield', 'Annual dividend as a percentage of the share price \u2014 the cash return you receive just for holding, before any price change.'],
  'peg ratio': ['PEG ratio', 'P/E divided by the growth rate. Around 1 is often considered fair: you are paying a multiple roughly matching how fast profits grow. It punishes expensive slow-growers.'],
  'roe': ['ROE \u2014 return on equity', 'Profit generated per rupee of shareholder money. Consistently above ~15% suggests a business that compounds well. Very high ROE can also come from heavy borrowing, so read it with debt-to-equity.'],
  'roa': ['ROA \u2014 return on assets', 'Profit generated per rupee of everything the company owns. Unlike ROE, borrowing does not flatter it.'],
  'debt / equity': ['Debt-to-equity', 'Borrowed money compared to shareholder money. Higher means more leverage \u2014 which magnifies both profits and losses, and makes the company fragile if earnings dip.'],
  'current ratio': ['Current ratio', 'Short-term assets divided by short-term bills. Above 1 means the company can cover what it owes this year. Below 1 can signal a cash squeeze.'],
  'profit margin': ['Profit margin', 'What percentage of every rupee of sales ends up as net profit after all costs and taxes.'],
  'operating margin': ['Operating margin', 'Profit from core operations as a share of sales, before interest and tax. A cleaner read on whether the actual business is efficient.'],
  'revenue growth (yoy)': ['Revenue growth', 'How much sales grew compared with the same period last year.'],
  'earnings growth (yoy)': ['Earnings growth', 'How much profit grew versus a year ago. Watch for profit growing much faster than revenue \u2014 that often comes from one-offs rather than the business improving.'],
  'analyst mean target': ['Analyst target price', 'The average price professional analysts expect within roughly a year. Treat with caution: as a group, sell-side targets skew optimistic.'],
  'analyst recommendation': ['Analyst recommendation', 'The consensus call from analysts covering the stock. Genuine "sell" ratings are rare, so a "hold" often carries more negative weight than it sounds.'],
  'analyst consensus': ['Analyst consensus', 'The average view and target price of professional analysts covering the stock. Useful as a reference point, not as an instruction \u2014 the group is structurally biased toward optimism.'],
  'intrinsic value / share': ['Intrinsic value', 'What the business appears to be worth per share based on the cash it is expected to generate, rather than what the market is currently paying. A model output, highly sensitive to its assumptions.'],
  'our dcf fair value': ['DCF fair value', 'Our own estimate of what a share is worth, based on projected future cash flows discounted back to today. Treat it as a range, not a number \u2014 small changes in assumptions move it a lot.'],
  'forward dcf value': ['DCF value', 'Estimated worth per share from projected future cash flows. The standard valuation method for profitable, cash-generating businesses.'],
  'base free cash flow': ['Free cash flow', 'Cash left after running the business and paying for equipment and expansion. This is the money genuinely available to owners \u2014 harder to manipulate than reported profit.'],
  'assumed fcf growth': ['Assumed growth rate', 'How fast we assume that spare cash grows each year. Taken from the company\u2019s own history, then faded down over time because nothing grows fast forever.'],
  'discount rate': ['Discount rate', 'The annual return demanded for taking this risk. Future cash is worth less than cash today, and this is the rate used to shrink it. A higher rate means a lower valuation.'],
  'net debt': ['Net debt', 'Total borrowings minus cash on hand. Subtracted from the company value because a buyer would inherit those loans.'],
  'terminal share of value': ['Terminal value share', 'How much of the valuation comes from assumptions about the distant future rather than the next decade. Above ~70% means the number rests mostly on guesswork.'],
  'enterprise value': ['Enterprise value', 'The value of the whole business including debt \u2014 what it would cost to buy the company outright and settle its loans.'],
  'reverse dcf \u2014 implied growth': ['Reverse DCF', 'Flips the usual question. Instead of asking what the stock is worth, it asks: what growth rate would justify today\u2019s price? Then you judge whether that expectation is realistic \u2014 often more useful than a fair-value estimate.'],
  'expectation gap': ['Expectation gap', 'The difference between the growth the market is pricing in and the growth the company has actually delivered. A large positive gap means the price needs the business to improve markedly.'],
  'cash flow / net profit': ['Cash flow to profit ratio', 'Compares actual cash collected with reported accounting profit. Above 1.0 means profits are backed by real money. Persistently below 1.0 is a classic warning sign that profits exist mainly on paper.'],
  'accruals ratio': ['Accruals ratio', 'How much of reported profit is accounting entries rather than cash. Low is clean. High accruals are one of the most reliable predictors of disappointing future earnings.'],
  'free cash flow margin': ['Free cash flow margin', 'Spare cash as a percentage of sales. Negative means the business consumes more cash than it produces, and must keep raising money to survive.'],
  'capex intensity': ['Capex intensity', 'What share of operating cash is ploughed back into plant, equipment and expansion. High figures can mean growth investment \u2014 or simply a business that needs constant spending to stand still.'],
  'revenue vs cash growth': ['Revenue versus cash growth', 'Sales growth compared with cash-flow growth. If sales race ahead of cash, the company may be booking sales it has not yet been paid for.'],
  'nearest support': ['Support', 'A price level where buyers previously stepped in and stopped the fall. It often holds \u2014 until it does not, and levels break more often than chart books suggest.'],
  'nearest resistance': ['Resistance', 'A price level where sellers previously appeared and capped the rise. Breaking above it on strong volume is read as a bullish signal.'],
  'support': ['Support', 'A price where buying previously halted a decline \u2014 a possible floor. Descriptive, not guaranteed.'],
  'resistance': ['Resistance', 'A price where selling previously halted a rise \u2014 a possible ceiling.'],
  'structure': ['Market structure', 'Whether the stock is making higher highs and higher lows (uptrend), lower highs and lower lows (downtrend), or moving sideways in a range.'],
  'p(above spot) at expiry': ['Options-implied probability', 'The odds the options market itself is pricing that the share will finish above today\u2019s price on expiry day. Derived from live option prices, so it reflects real money at stake rather than anyone\u2019s model.'],
  'options-implied p(up) by expiry': ['Options-implied probability of a rise', 'What the options market is charging for, expressed as odds the stock ends above today\u2019s price at expiry. It is "risk-neutral" \u2014 it includes a premium for fear, so downside odds look slightly overstated.'],
  'atm implied volatility': ['Implied volatility', 'How much movement option sellers expect from here, expressed as an annual percentage. It is the market\u2019s forecast of turbulence, not direction. High IV means options are expensive.'],
  'implied move by expiry': ['Implied move', 'The size of the swing the options market expects by expiry, up or down. Roughly a two-in-three chance the price stays inside this band.'],
  'put-call ratio (oi)': ['Put-call ratio', 'Open put contracts divided by open call contracts. Above ~1.2 means heavy put positioning, often read as bearish hedging or contrarian bullishness. Below ~0.7 means call-heavy positioning.'],
  'put-call ratio (volume)': ['Put-call ratio by volume', 'Same ratio but from today\u2019s trading rather than total positions \u2014 it shows today\u2019s mood rather than accumulated bets.'],
  'max pain': ['Max pain', 'The price at which the largest number of options expire worthless, causing maximum loss to option buyers. Prices sometimes drift toward it near expiry, though the effect is debated.'],
  'volatility skew': ['Volatility skew', 'The extra price investors pay for downside protection versus upside bets. A large positive skew means the market is paying up for crash insurance \u2014 a fear gauge.'],
  'heaviest call oi': ['Heaviest call open interest', 'The strike with the most outstanding call contracts. Often acts as a ceiling, because sellers of those calls hedge in ways that resist the price moving above it.'],
  'heaviest put oi': ['Heaviest put open interest', 'The strike with the most outstanding put contracts, which often behaves as a floor for similar hedging reasons.'],
  'open interest': ['Open interest', 'The number of option contracts currently open and unsettled. High open interest at a strike means a lot of money is positioned around that price.'],
  'annualised alpha': ['Alpha', 'The return left over after stripping out everything explained by market, size and momentum exposure. Positive alpha suggests genuine outperformance \u2014 but only if it is statistically significant. Usually it is not.'],
  'market beta': ['Market beta (regression)', 'How strongly the stock responds to overall market moves, measured within the factor model.'],
  'size loading': ['Size factor loading', 'Whether the stock behaves like a small company or a large one, regardless of its actual size. Positive means it trades with small caps.'],
  'momentum loading': ['Momentum factor loading', 'Whether the stock moves with recent winners (positive) or with recent losers (negative).'],
  'r\u00b2': ['R-squared', 'How much of the stock\u2019s movement is explained by broad market factors. 80% means it mostly moves with the market; 10% means it moves mainly for company-specific reasons.'],
  'idiosyncratic': ['Idiosyncratic risk', 'The share of movement unique to this company \u2014 driven by its own news, not the market. This is the portion diversification can reduce.'],
  't-stat': ['t-statistic', 'A significance test. Above 2 (or below \u22122) means the figure is probably real rather than chance. Between \u22122 and 2, treat it as noise no matter how large it looks.'],
  'score': ['Composite score', 'A 0\u2013100 blend of indicators, relative strength, candlestick patterns and volume. It ranks recent technical momentum \u2014 not business quality or value.'],
  'indicators': ['Indicators score', 'A 0\u2013100 sub-score combining RSI, MACD and whether price sits above its 50 and 200-day averages.'],
  'rs vs nifty (3m)': ['Relative strength', 'How much the stock has beaten or lagged the Nifty over three months. Positive means it is outperforming the index.'],
  'pattern': ['Candlestick pattern', 'A recognisable shape in recent daily price bars that traders associate with hesitation or reversal. Suggestive at best \u2014 patterns fail often.'],
  'amount at risk': ['Amount at risk', 'The rupees you would lose if the price hit your stop \u2014 not the amount invested. Most risk frameworks keep this to 1\u20132% of capital per position.'],
  'risk per share': ['Risk per share', 'The gap between your entry price and your stop, in rupees. Dividing your total acceptable loss by this gives the number of shares to buy.'],
  'position value': ['Position value', 'Total rupees invested. Note a tight stop produces a large position for the same rupee risk \u2014 controlling trade risk while quietly concentrating your portfolio.'],
  '2\u00d7atr risk level': ['Volatility-based stop level', 'A price two average daily ranges below the current price. Stops closer than this tend to be triggered by ordinary noise rather than a genuine change of trend.'],
  'risk-free rate (10y g-sec)': ['Risk-free rate', 'The return available from Indian government bonds \u2014 what you could earn with essentially no risk. Every risky investment is judged against this baseline, and it feeds both CAPM and the DCF.'],
  'ytd performance': ['Year-to-date performance', 'Price change since 1 January, shown alongside the Nifty so you can see whether the stock is leading or lagging the broader market.'],
  'overall': ['Earnings quality grade', 'A summary of whether reported profits are backed by real cash. Strong means the cash and the accounting agree; weak means they do not.'],
  'next earnings': ['Earnings date', 'When the company next reports results. Prices often move sharply around this date, and options become expensive beforehand.'],
  'last quarter eps: actual vs est.': ['Earnings surprise', 'Reported profit per share versus what analysts expected. Beating expectations tends to support the price; missing tends to hurt it.'],
  'earnings surprise record': ['Earnings surprise record', 'How often the company beat analyst forecasts in recent quarters. A consistent record suggests either a well-run business or conservative guidance.'],
  'current price': ['Current price', 'The most recent traded price. When the market is closed this is the previous session\u2019s closing price, not a live quote.']
};

export function glossaryLookup(label){
  const k = label.toLowerCase().replace(/\s+/g,' ').trim().replace(/[:\u2014-]+$/,'').trim();
  if (GLOSSARY[k]) return GLOSSARY[k];
  const keys = Object.keys(GLOSSARY);
  for (let i=0;i<keys.length;i++){
    if (k.indexOf(keys[i]) === 0 || keys[i].indexOf(k) === 0) return GLOSSARY[keys[i]];
  }
  return null;
}

export function injectGlossaryStyles(){
  if (document.getElementById('glossStyle')) return;
  const st = document.createElement('style');
  st.id = 'glossStyle';
  st.textContent =
    '.gloss{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;border-radius:50%;' +
    'border:1px solid var(--cream-dim);color:var(--cream-dim);font-size:9px;font-weight:700;margin-left:5px;' +
    'cursor:help;position:relative;top:-1px;font-family:var(--sans);opacity:.65;flex:none}' +
    '.gloss:hover{opacity:1;border-color:var(--gold);color:var(--gold)}' +
    '.gloss-pop{position:fixed;z-index:9999;max-width:330px;background:#0F1D2C;border:1px solid var(--hair);' +
    'border-radius:9px;padding:12px 14px;box-shadow:0 14px 36px rgba(0,0,0,.55);display:none;' +
    'font-family:var(--sans);font-size:12.5px;line-height:1.6;color:var(--cream-dim)}' +
    '.gloss-pop.show{display:block}' +
    '.gloss-pop b.gt{display:block;color:var(--cream);font-size:13px;margin-bottom:5px;font-family:var(--serif)}' +
    '.gloss-pop em{color:var(--cream);font-style:italic}';
  document.head.appendChild(st);
  const pop = document.createElement('div');
  pop.className = 'gloss-pop';
  pop.id = 'glossPop';
  document.body.appendChild(pop);
}

export function showGloss(el, entry){
  const pop = document.getElementById('glossPop');
  if (!pop) return;
  pop.innerHTML = '<b class="gt">' + entry[0] + '</b>' + entry[1];
  pop.classList.add('show');
  const r = el.getBoundingClientRect();
  const w = Math.min(330, window.innerWidth - 24);
  let left = r.left - w/2 + r.width/2;
  left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
  let top = r.bottom + 8;
  if (top + pop.offsetHeight > window.innerHeight - 12) top = Math.max(12, r.top - pop.offsetHeight - 8);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  pop.style.maxWidth = w + 'px';
}

export function hideGloss(){
  const pop = document.getElementById('glossPop');
  if (pop) pop.classList.remove('show');
}

export function annotateGlossary(root){
  injectGlossaryStyles();
  const scope = root || document;
  const sels = ['.metric .k', '.stat .k', 'table.book thead th', '.section-label span:first-child', '.subplot-label'];
  sels.forEach(function(sel){
    scope.querySelectorAll(sel).forEach(function(el){
      if (el.querySelector('.gloss') || el.dataset.glossDone) return;
      const entry = glossaryLookup(el.textContent);
      el.dataset.glossDone = '1';
      if (!entry) return;
      const b = document.createElement('span');
      b.className = 'gloss';
      b.textContent = 'i';
      b.setAttribute('aria-label', entry[0]);
      b.addEventListener('mouseenter', function(){ showGloss(b, entry); });
      b.addEventListener('mouseleave', hideGloss);
      b.addEventListener('click', function(ev){
        ev.stopPropagation();
        const pop = document.getElementById('glossPop');
        if (pop && pop.classList.contains('show')) hideGloss(); else showGloss(b, entry);
      });
      el.appendChild(b);
    });
  });
}
