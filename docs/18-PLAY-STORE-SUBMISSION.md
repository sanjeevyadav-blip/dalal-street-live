# 18. Play Store submission — EPIC-6 E6-3

Everything needed to put Dalal Street Live on Google Play. The build side is done and in the
repo; the rest is account work only you can do.

**Read §6 first.** There is a real chance of rejection for a reason that has nothing to do
with code quality, and it is better to know that before spending an evening on screenshots.

---

## 1. What is already built

| Piece | Where | State |
|---|---|---|
| Release signing config | `android/app/build.gradle` | reads `keystore.properties` or `ANDROID_KEYSTORE_*` env; unsigned when neither exists |
| Signed AAB build | `.github/workflows/android-release.yml` | manual dispatch, refuses early if secrets are missing, destroys the key afterwards |
| Store icon, 512×512 | `npm run app:playassets` → `play/icon-512.png` | opaque, square, no pre-rounding |
| Feature graphic, 1024×500 | `npm run app:playassets` → `play/feature-graphic-1024x500.png` | opaque |
| Listing copy | §5 below | within Play's character limits |
| Privacy policy | §5.4 below | needs hosting at a public URL |

`play/` is gitignored, like `assets/` — regenerate rather than commit.

---

## 2. The account

- A Play Console developer account, **US$25 once**. Register at
  <https://play.google.com/console/signup>.
- Choose **personal** or **organisation** carefully. An organisation account needs a D-U-N-S
  number and takes longer, but a **personal account created after 13 November 2023 must run
  a closed test with at least 12 testers, opted in continuously for 14 days**, before Play
  will let you promote to production. There is no way around it and it cannot start until
  the app is uploaded, so start it early.
- Identity verification takes a few days. Do this first; it blocks everything else.

---

## 3. The upload key

**Generate it yourself. Do not paste the password into a chat window, this file, or any
file in this repository.** `keytool` works on this machine even though Gradle does not.

```bash
"C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot/bin/keytool.exe" -genkeypair -v -keystore upload-keystore.jks -keyalg RSA -keysize 4096 -validity 10000 -alias upload
```

It prompts for a password and for your name and organisation. The certificate details are
cosmetic — Play shows none of them to users — but the password is not.

Then create `android/keystore.properties`, which is gitignored:

```properties
storeFile=../upload-keystore.jks
storePassword=<the password you chose>
keyAlias=upload
keyPassword=<the key password you chose>
```

**Back the `.jks` file up somewhere that is not this laptop.** Without Play App Signing,
losing it means you can never update the app again — the only remedy is a new listing under
a new package name and asking every user to reinstall. Enrol in **Play App Signing** during
your first upload (it is the default) so Google holds the real signing key and this one is
only your upload key; then a lost upload key can be reset by support instead of ending the
app.

### Building the bundle

Locally, once IT has excluded `java.exe`:

```bash
npm run app:bundle
```

Until then, in CI. Add four repository secrets — Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the `.jks`, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | your store password |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | your key password |

To encode the keystore on Windows:

```bash
certutil -encode upload-keystore.jks keystore.b64
```

Paste the body of `keystore.b64` **without** the `-----BEGIN/END CERTIFICATE-----` lines.

Then run the **Android release bundle** workflow from the Actions tab, give it a version
name, and download `app-release.aab` from the run. The workflow checks the bundle is
actually signed before uploading it, because an unsigned AAB is rejected by Play with a
message about the upload certificate that never mentions the real cause.

---

## 4. Version numbers

`versionCode` must increase on every upload Play accepts; CI passes the run number, so this
is automatic. `versionName` is what people see and is the workflow's input.

---

## 5. The listing

### 5.1 App name (30 characters max)

```
Dalal Street Live
```

### 5.2 Short description (80 characters max)

```
Live NSE & BSE data with every model's assumptions and failure modes shown.
```

74 characters. It deliberately does not promise returns, tips or recommendations.

### 5.3 Full description (4,000 characters max)

```
Dalal Street Live is an equity research dashboard for the Indian market. It shows
live NSE and BSE prices, and it shows the working behind every number it derives.

WHAT IT DOES

• Live quotes, indices and a watchlist you can edit
• Technical ranking across a 55-stock universe: indicators, relative strength,
  candlestick patterns and volume, each as a visible sub-score
• A screener with valuation, momentum, quality and participation columns
• Full detail on any stock: price action, candlestick patterns, a discounted cash
  flow with a sensitivity grid, a reverse DCF, earnings-quality grading, factor
  decomposition with an alpha t-statistic, and the live NSE option chain
• A probability lab: GBM Monte Carlo, GARCH volatility, a two-state regime model,
  a walk-forward classifier and a Bayesian blend — each stating what it assumes
  and how it fails
• IPO watch, market news, and a glossary of about 100 terms that warns about the
  common misreadings rather than just defining the word

WHAT IT DELIBERATELY DOES NOT DO

There is no BUY, HOLD or AVOID verdict. There are no target prices and no
"probability of reaching ₹X by date Y".

Three reasons. A discounted cash flow swings more than 40% across assumptions that
are all defensible, so a single intrinsic value presented as fact is misleading.
Any synthesis depends on your horizon, your existing holdings and your tax
position, none of which this app knows. And in India, publishing buy and sell
recommendations is restricted to Research Analysts registered with SEBI.

Instead the verdict panel reports five pillars separately and explains why it stops
there. Probabilities are labelled as model output. Risk-neutral probabilities from
the option chain are flagged as not real-world. The self-built size and momentum
factors are flagged as not canonical Fama-French. The 7% risk-free rate is labelled
an assumption, not data.

A missing number renders as a dash with a reason, never as a plausible-looking
figure. A filled cell is a real cell.

DATA AND PRIVACY

No account, no sign-in, no advertising, no analytics and no tracking. Your
watchlist lives in memory for the session and is never uploaded anywhere. Market
data is fetched live and never cached, so a figure on screen is a figure just
retrieved — the app needs a network connection to be useful.

Prices and fundamentals come from public Yahoo Finance endpoints, the option chain
and IPO list from NSE's public APIs, and headlines from a news search. These are
unofficial sources and can change or break without notice.

NOT INVESTMENT ADVICE

This is a research tool, not advice. Nothing in it is a recommendation to buy or
sell any security. It is not operated by a SEBI-registered Research Analyst or
Investment Adviser. Verify every figure against your broker's own feed before
acting on it. You are responsible for your own decisions.
```

### 5.4 Privacy policy

Play requires a **publicly reachable URL**. The obvious home is the live site, but adding a
page there means pushing to `main`, which is off limits — so publish this as a public
GitHub Gist, or add it to the site yourself in a separate change.

```markdown
# Privacy Policy — Dalal Street Live

Last updated: 22 September 2026

## Summary

Dalal Street Live does not collect, store or share any personal information. There
is no account, no sign-in, no advertising and no analytics.

## What the app stores

Your watchlist is held in the app's memory for as long as it is open and is lost
when you close it. It is never transmitted anywhere. The app has no database, no
backend account system and no server-side storage of anything you do.

## What the app sends

To show prices the app requests market data through a proxy server operated by the
developer at dalal-proxy.sanjeev-yadav.workers.dev, which forwards the request to
the upstream source. As with any internet request, the proxy and its hosting
provider (Cloudflare) necessarily see the originating IP address in order to
deliver a response, and an in-memory counter uses it to enforce a rate limit.
Neither is written to durable storage, associated with an identity, or used for any
other purpose.

The app sends no other information. It does not transmit the stocks you look at to
the developer, and no record is kept of what any user searched for.

## Third-party sources

Market data and content are retrieved from:

- Yahoo Finance (prices, fundamentals, history)
- National Stock Exchange of India (option chain, IPO listings)
- Bing News search (headlines)

Opening a news headline leaves the app and opens the publisher's own site in your
browser, where that publisher's privacy policy applies.

## Permissions

The app requests internet access only. It does not request location, contacts,
camera, microphone, storage or any other sensitive permission.

## Children

The app is not directed at children and collects no data from anyone.

## Changes

Any change to this policy will be published at this URL with an updated date.

## Contact

sanjeev.yadav@apollo247.org
```

### 5.5 Screenshots

Two minimum, eight maximum, 16:9 or 9:16, long edge between 320 and 3,840 px.

**Take these on the phone**, not in an emulator or a resized browser. People decide whether
to install from these, and a real device is the only honest source. Good candidates now that
the app has tabs: the Top 20 list, a stock detail panel showing the DCF, the ranking table,
and the probability lab.

---

## 6. Three real risks, in order of likelihood

### 6.1 The "minimum functionality" policy — the big one

Play's Spam and Minimum Functionality policy rejects apps that are essentially a website in a
WebView with nothing added. **Dalal Street Live is technically a WebView wrapper**, and a
reviewer who opens it and sees a web page may reject it on exactly that ground.

The defensible position, and it is a genuine one:

- All the analysis runs **on the device**, not on a server — the indicators, the DCF and
  reverse DCF, the factor regression, the Monte Carlo, the GARCH and regime models are
  client-side computation, not a rendered remote page.
- The app adds native behaviour: a themed status bar, a splash screen, external links routed
  to a Chrome Custom Tab, and a tab-based phone layout distinct from the desktop site.
- It works as an installed app rather than a bookmark.

If it is rejected on this ground, the appeal should say those three things plainly. Consider
also adding something the web version cannot do — a price alert with a local notification is
the usual answer and is a genuinely useful feature rather than a box-tick.

### 6.2 Financial-services declarations

Play's financial services policy is strict in India, but the strict parts target **lending**
and **brokerage or trading** apps, which require licence documentation. This app neither
lends nor executes trades, so the declaration is that it is an information and research
tool only. Answer the App content → Financial features questionnaire honestly: no personal
loans, no trading or brokerage, no crypto exchange. The "not investment advice" wording in
§5.3 matters here.

### 6.3 Unofficial data sources

Yahoo's endpoints are undocumented and NSE actively blocks unfamiliar clients — the cookie
handshake in this codebase exists because of that. These are already the app's known
fragility (see `docs/12`), but publishing changes the stakes: today a broken feed is an
inconvenience to you, and after publishing it is a one-star review and a support burden from
strangers. Consider whether you want that before promoting past the closed test.

---

## 7. Order of operations

1. Register and complete identity verification — days, so start now
2. Generate the upload key, back it up off this machine
3. Add the four repository secrets
4. Run the **Android release bundle** workflow, download the AAB
5. Create the app in Play Console; enrol in Play App Signing
6. Publish the privacy policy at a public URL
7. Fill in the store listing from §5, upload the icon and feature graphic
8. Take screenshots on the phone
9. Complete Data safety (**no data collected**), the content rating questionnaire, the
   target audience, and the financial features declaration
10. Upload the AAB to a **closed test**, recruit 12 testers, and let it run 14 days
11. Promote to production

Steps 1 to 3 are yours alone. From step 4 on, ask and I will do the parts that are
mechanical.
