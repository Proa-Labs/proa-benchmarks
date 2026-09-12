# Why the travel sites ship so much JavaScript

The five surfaces do not have one shared bundle problem. There are three
different pathologies:

1. **Grand Wailea and Enterprise are mostly paying for non-product code.**
   Measurement, advertising, consent, anti-bot, feedback, chat, and booking
   vendors account for 96% of Grand Wailea's script transfer and 65% of
   Enterprise's.
2. **Airbnb has a product-graph overfetch problem.** Its browse-only search and
   listing path loads payment, checkout, login-modal, animation, review, and map
   code well before the workflow needs most of it.
3. **Google Flights and Hotels mostly ship their actual applications.** They
   still enter only about half of the V8-covered source in this workflow, but
   their payload is not dominated by a sprawling third-party stack.

This was one diagnostic run of the complete 24-interaction workflow on the same
8-vCPU AMD EPYC Milan VPS as the primary benchmark, at 100 Mbps and 40 ms
request latency. It records all completed script response bodies and starts
Chrome precise function coverage before each surface. Coverage adds overhead,
so the run's wall time is not a replacement for the benchmark p50.

| Surface | Script transfer | Requests | Hosts | Product + maps | Other systems | V8 source entered |
|---|---:|---:|---:|---:|---:|---:|
| Google Flights | 0.83 MiB | 23 | 1 | 100.0% | 0.0% | 47.6% |
| Airbnb | 6.36 MiB | 239 | 7 | 86.4% | 13.6% | 49.8% |
| Google Hotels | 1.59 MiB | 88 | 3 | 89.6% | 10.4% | 50.3% |
| Grand Wailea | 5.62 MiB | 252 | 48 | 4.1% | 95.9% | 28.9% |
| Enterprise | 4.38 MiB | 170 | 21 | 35.0% | 65.0% | 46.4% |

These are complete surface totals, not all single-document bundle sizes. Airbnb
crosses search and listing-detail documents; Grand Wailea crosses its home,
catalog, and room-detail pages. That is intentional because the agent has to
pay the whole trajectory. The initial page nevertheless accounts for 4.94 MiB
on Grand Wailea and 3.61 MiB on Enterprise, so their result is not an artifact
of summing later navigations.

## Grand Wailea: a marketing dependency explosion

Grand Wailea's own site and UI libraries transferred only **234 KiB**. The
surface instead transferred:

- **4.43 MiB / 78.7%** of measurement and advertising scripts;
- **0.68 MiB / 12.2%** of chat, FareHarbor booking, and other embedded services;
- **0.28 MiB / 4.9%** of consent, feedback, replay, and observability code; and
- 9.5 KiB of Cloudflare challenge code.

The most conspicuous duplication is Google tagging. The browser requested one
`gtm.js` container plus **22 `gtag/js` responses across 18 destination IDs**—19
Google IDs in total. The 22 query variants transferred **3,226,352 bytes**. If
they had shared the largest
observed response, the corresponding path group would have been 3,037,929
bytes smaller. That is a duplication diagnostic, not a claim that every
configuration byte can be deleted, but it shows that nearly three megabytes
belong to repeated copies of the same runtime family.

This is precisely the consolidation model Google documents: configure one
Google tag and add other products as destinations, rather than installing each
product independently. Google also recommends removing unused tags, combining
similar tags, conditionally splitting large containers, and considering
server-side tagging to reduce third-party browser code. See Google's
[multi-destination setup](https://support.google.com/tagmanager/answer/12002338),
[container-efficiency guidance](https://support.google.com/tagmanager/answer/2772488),
and [tag gateway documentation](https://developers.google.com/tag-platform/tag-manager/gateway).

Grand Wailea simultaneously loads an Adobe Tags library. Direct inspection of
the captured `launch-EN02272261e0b845508227acf3ca0c37de.min.js` found explicit
integration references for Google Tag Manager, DoubleClick, Facebook, TikTok,
Pinterest, LinkedIn, Bing, Quantcast, Taboola, Teads, Sojern, Branch, Treasure
Data, Clarity, Amazon Ads, Reddit, Rakuten, and other systems. Adobe's own model
allows one rule to trigger many extensions, scripts, and third-party tags, so a
small number of global page rules can create a large dynamic fan-out. See
[Adobe's rule documentation](https://experienceleague.adobe.com/en/docs/experience-platform/tags/ui/rules).

That explains the 48 hosts and why JavaScript continues to arrive long after
the resort page's own UI is available. Examples from precise coverage include:

- the main GTM container: 0.63M source characters, **5.5% entered**;
- a Google Analytics destination: 0.59M, **16.7% entered**;
- several Google Ads destinations: roughly 0.43–0.52M each, **0.1–8.4%
  entered**;
- TikTok's main runtime: 0.50M, **1.5% entered**; and
- Myma's chat application: 0.66M, **15.0% entered**.

The best fixes are organizational more than algorithmic:

1. Inventory the 19 Google IDs and the Adobe rules that create them. Remove
   expired campaigns and consolidate destinations into one Google tag.
2. Move eligible measurement to a server-side tag gateway. A first-party
   proxy alone changes the hostname; it does not make the client library small.
3. Do not initialize chat, FareHarbor, Marker.io, PageSense, social widgets, or
   replay tooling on every document. Load the feature when the visitor opens it
   or after the primary task is idle, subject to consent and business needs.
4. Confirm that production really intends to ship Marker.io and overlapping
   replay/feedback products. Their presence may be deliberate, but it deserves
   an explicit owner and budget.

## Enterprise: full datasets plus a second marketing stack

Enterprise is less extreme, but only **30.2%** of its 4.38 MiB is classified as
product UI. Its other large categories are:

- **1.89 MiB / 43.2%** measurement and advertising;
- **0.67 MiB / 15.4%** security and anti-bot;
- **0.28 MiB / 6.4%** consent, feedback, and observability; and
- **0.21 MiB / 4.8%** maps.

### An entire time-zone database in the entry graph

The largest product response is a 355,915-byte compressed Webpack chunk named
`vendors-node_modules_ehi_global-marketing-interface_lib_utils_index_js`. Its
uncompressed source is 4,373,976 bytes. Direct module-boundary inspection found
that **4,198,016 bytes / 96.0% of that source is
`dayjs-timezone-iana-plugin/iana-db.json`**.

A local gzip diagnostic puts the database module at 602,996 of the full
658,858 gzip bytes, or 91.5%. The live response used a more effective transfer
encoding, so those gzip values are not the observed wire bytes; they establish
that the database remains dominant after compression. This is why the chunk is
both very large in source and 98% “entered”: importing it executes a giant data
initialization even though the current reservation only needs Maui's time
zone.

The actionable fix is to stop putting the complete IANA database in the global
utility barrel. Use the platform's `Intl` time-zone support where it satisfies
the product contract, ship a constrained data set, or fetch a location's time
zone data after the location is known.

### Duplicate security and broad route chunks

Enterprise downloaded the exact 344 KiB `recaptcha__en.js` URL twice: once in
the Enterprise document and once in the reCAPTCHA anchor frame. Together they
cost **704,969 bytes**, and each execution entered about 31% of its 0.84M source
characters. Later page states reused it from cache. This is partly a security
tradeoff, not automatically waste: Google's guidance says reCAPTCHA benefits
from early page context, although it should load asynchronously. The right
questions are whether the location page needs protection before reservation
intent and why the main document and anchor frame both transfer the identical
body. See [Google's loading guidance](https://developers.google.com/recaptcha/docs/loading).

The same-origin application is also fragmented across 105 script responses.
Filenames show the initial graph includes confirmation printing, confirmed
reservation selectors, check-in, rental-ticket, mileage-calculator, login, and
verification modules while this workflow is still selecting a vehicle. Those
obviously post-selection/account-looking files alone total about 102 KiB by a
conservative filename match. They may share state with the live route, but they
are strong candidates for route-boundary review.

Enterprise also loads an Adobe library, seven Google measurement destinations,
Facebook, TikTok, OneTrust, Qualtrics, Pinterest, LinkedIn, Bing, Demandbase,
and Akamai Boomerang. Consolidating tags and making the reservation route own
its exact code graph should precede micro-optimizing React.

## Airbnb: real application complexity, loaded too early

Airbnb's 6.36 MiB is mostly its own application rather than vendor sprawl:

- **5.03 MiB** product code;
- **0.47 MiB** Google Maps; and
- **0.86 MiB** measurement/advertising, mostly two scripts served through
  Airbnb's first-party `/gtg/` route.

The first-party route is consistent with Google tag gateway's documented model
of serving Google measurement scripts from the site's own infrastructure. It
improves first-party delivery and privacy controls, but the two captured tag
payloads still total 864 KiB. The larger 698 KiB container contains a large
published tag configuration and references to analytics, DoubleClick, and
Facebook integrations.

The product graph has clear cold-path overfetch:

- Six explicitly checkout/payment-named chunks transfer **314,527 bytes**,
  including terms, confirm-and-pay, payment-plan, payment-options, product
  detail, and checkout-route code.
- A separate mixed `66cd.cf1f983327.js` response is 342,197 transfer bytes and
  1.20M source characters. Source inspection found dense Adyen, 3-D Secure,
  PayPal, Klarna, Fastlane, Apple Pay, Google Pay, checkout, and payment code.
  Only **38.0%** of the chunk's source was entered in the browse workflow.
- The 78.9 KiB Lottie worker entered **0.8%** of its 0.32M source characters.
- The 87.4 KiB signup/login modal renderer entered **14.0%** of 0.30M.
- Google Maps' 180 KiB WebGL script entered **12.7%** of 0.65M.

The workflow does open a listing detail, so reviews, location, and listing
sections are real route dependencies. It never begins checkout or payment. The
fix is not “remove Airbnb's application”; it is to stop prefetching the next
business funnel before intent. Payment and checkout should begin loading when
the visitor engages the reservation control, and animation, authentication,
and map subsystems should be gated on the UI that uses them.

There is also a granularity problem: 239 completed script responses across the
search/detail surface is enough fragmentation that discovery and scheduling
become material even under HTTP/2. A useful code-splitting policy minimizes
bytes on the current route without turning every small component into another
network dependency.

## Google Flights and Hotels: mostly product code

Google Flights is the counterexample to “every travel site has eight megabytes
of junk.” It transferred **0.83 MiB in 23 responses, all from one `gstatic`
host**. The largest Closure/Boq request batches 105 modules. Chrome entered
47.6% of the covered source, so there is still cold code, but no comparable
marketing-host explosion appeared in the positive completed responses.

Google Hotels transferred **1.59 MiB**: 0.99 MiB of its application, 0.44 MiB
of Maps, and 0.17 MiB of one Google measurement tag. Its largest application
batch contains 109 modules, and Chrome entered 50.3% of the covered source.
Because the interface is map-heavy, some of that dependency is a direct product
choice. A list-first or agent-specific surface could defer the map, but that is
a UX/API decision rather than merely a bundler correction.

For both Google surfaces, the optimization question is conventional route and
module trimming. For Grand Wailea and Enterprise, the highest-leverage work is
tag governance. For Airbnb, it is intent-based product-graph loading.

## A practical prevention policy

These failures accumulate because performance ownership stops at the app
bundle. A stable policy should cover the complete dependency graph:

1. Put separate budgets on first-party product code, tag-manager code, and
   interaction-triggered vendor code. A total-only budget lets one team hide
   another team's growth.
2. Require an owner, expiry date, trigger condition, and byte/CPU measurement
   for every analytics or advertising destination. Automatically fail when a
   production page introduces an unapproved script host.
3. Run a fresh-profile critical workflow in CI and retain script transfer,
   request count, host count, long tasks, and precise coverage. Page-load-only
   tests miss chunks discovered by filters, modals, and detail transitions.
4. Diff normalized URL paths as well as full URLs. Query-specific tag IDs made
   22 copies of `gtag/js` look unique in a normal waterfall.
5. Flag large JSON/data modules inside JavaScript. Tree shaking cannot remove a
   database imported for global initialization.
6. Treat coverage as a lead, not proof of waste. Chrome's own documentation
   describes it as used versus unused source for the recorded interaction;
   entering a function does not prove it was necessary or critical. See the
   [Chrome Coverage documentation](https://developer.chrome.com/docs/devtools/coverage).

## Evidence and limitations

The complete URL/category inventory is in
[`javascript-payload-analysis-2026-08-28.md`](javascript-payload-analysis-2026-08-28.md),
with a machine-readable twin in
[`javascript-payload-analysis-2026-08-28.json`](javascript-payload-analysis-2026-08-28.json).
The 543 KiB compressed raw capture is
`javascript-coverage-raw-current-2026-08-28.json.gz`.

`responseBodySize` is Playwright's completed response-body transfer measure.
Coverage uses V8 source offsets in the primary renderer; it does not include
every cross-origin iframe or worker. Source characters and compressed transfer
bytes are therefore intentionally reported as separate units. The profiler
records whether a function range was entered during this exact workflow, not
whether it contributed to the visible result or critical path.

The category split uses explicit host and path rules in
`analyze_javascript_payloads.py`. It reattributes 78 KiB of late Airbnb work
and 205 KiB of late Grand Wailea work whose requests began after the harness
advanced its label but whose recorded frame still belonged to the outgoing
page. Sites, campaigns, bundles, and bot behavior are mutable; these findings
describe the public assets fetched on August 28, 2026.
