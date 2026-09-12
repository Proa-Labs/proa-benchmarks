# JavaScript payload diagnostic

This is one instrumented, fresh-browser workflow on the same 8-vCPU AMD EPYC Milan
VPS as the primary travel benchmark, with 100 Mbps throughput and 40 ms request
latency. Coverage instrumentation adds overhead, so its wall time is not a headline
performance result. Transfer and execution coverage are the useful outputs.

## Overview

| Surface | Script transfer | Requests | Hosts | V8-covered source | Source entered |
|---|---:|---:|---:|---:|---:|
| Google Flights | 0.83 MiB | 23 | 1 | 3.03M chars | 47.6% |
| Airbnb | 6.36 MiB | 239 | 7 | 16.96M chars | 49.8% |
| Google Hotels | 1.59 MiB | 88 | 3 | 6.21M chars | 50.3% |
| Grand Wailea | 5.62 MiB | 252 | 48 | 25.30M chars | 28.9% |
| Enterprise | 4.38 MiB | 170 | 21 | 24.87M chars | 46.4% |

`Source entered` is Chrome precise function coverage during the complete scripted
interaction, not a claim that the entered code was useful or on the critical path.
It also is not directly convertible to compressed response bytes.

## Category transfer

The categories are transparent URL/host rules in `analyze_javascript_payloads.py`;
they are intended to explain payload ownership, not to declare every third-party
byte removable.

| Surface | Product/UI | Maps | Measurement/ads | Consent/observability | Security | Embedded services | Other |
|---|---:|---:|---:|---:|---:|---:|---:|
| Google Flights | 0.83 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| Airbnb | 5.03 MiB | 0.47 MiB | 0.86 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.01 MiB |
| Google Hotels | 0.99 MiB | 0.44 MiB | 0.17 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB | 0.00 MiB |
| Grand Wailea | 0.23 MiB | 0.00 MiB | 4.43 MiB | 0.28 MiB | 0.01 MiB | 0.68 MiB | 0.00 MiB |
| Enterprise | 1.32 MiB | 0.21 MiB | 1.89 MiB | 0.28 MiB | 0.67 MiB | 0.00 MiB | 0.00 MiB |

## Google Flights

### Largest hosts

| Host | Transfer | Requests |
|---|---:|---:|
| `www.gstatic.com` | 0.83 MiB | 23 |

### Largest completed script responses

| Script | Category | Transfer |
|---|---|---:|
| `www.gstatic.com/Google module batch (105 modules)` | Product and site UI | 223.5 KiB |
| `www.gstatic.com/Google module batch (9 modules)` | Product and site UI | 172.0 KiB |
| `www.gstatic.com/Google module batch (2 modules)` | Product and site UI | 118.3 KiB |
| `www.gstatic.com/Google module batch (1 modules)` | Product and site UI | 79.2 KiB |
| `www.gstatic.com/rs=AA2YrTvdvpGucaAMR4eK0e9r7UJAmiUgKQ` | Product and site UI | 72.0 KiB |
| `www.gstatic.com/Google module batch (58 modules)` | Product and site UI | 68.7 KiB |
| `www.gstatic.com/Google module batch (6 modules)` | Product and site UI | 38.3 KiB |
| `www.gstatic.com/Google module batch (3 modules)` | Product and site UI | 25.3 KiB |
| `www.gstatic.com/Google module batch (3 modules)` | Product and site UI | 17.1 KiB |
| `www.gstatic.com/Google module batch (3 modules)` | Product and site UI | 8.6 KiB |
| `www.gstatic.com/Google module batch (1 modules)` | Product and site UI | 5.4 KiB |
| `www.gstatic.com/Google module batch (1 modules)` | Product and site UI | 5.0 KiB |

### Largest source ranges not entered

| Script | Source | Not entered | Entered |
|---|---:|---:|---:|
| `www.gstatic.com/Google module batch (105 modules)` | 0.69M | 0.36M | 47.0% |
| `www.gstatic.com/Google module batch (9 modules)` | 0.59M | 0.36M | 39.4% |
| `www.gstatic.com/Google module batch (1 modules)` | 0.27M | 0.25M | 6.8% |
| `www.gstatic.com/rs=AA2YrTvdvpGucaAMR4eK0e9r7UJAmiUgKQ` | 0.20M | 0.15M | 23.9% |
| `www.gstatic.com/Google module batch (58 modules)` | 0.23M | 0.14M | 37.2% |
| `www.gstatic.com/Google module batch (2 modules)` | 0.34M | 0.11M | 67.5% |
| `www.gstatic.com/Google module batch (6 modules)` | 0.16M | 0.07M | 57.9% |
| `www.google.com/flights` | 0.05M | 0.03M | 37.7% |
| `www.gstatic.com/Google module batch (3 modules)` | 0.07M | 0.03M | 63.2% |
| `www.gstatic.com/Google module batch (3 modules)` | 0.05M | 0.03M | 48.1% |

## Airbnb

### Largest hosts

| Host | Transfer | Requests |
|---|---:|---:|
| `a0.muscache.com` | 4.99 MiB | 223 |
| `www.airbnb.com` | 0.84 MiB | 2 |
| `maps.googleapis.com` | 0.47 MiB | 10 |
| `d0a7e.airbnb.com` | 0.04 MiB | 1 |
| `js.adsrvr.org` | 0.01 MiB | 1 |
| `d34r8q7sht0t9k.cloudfront.net` | 0.01 MiB | 1 |
| `www.googletagmanager.com` | 0.00 MiB | 1 |

### Largest completed script responses

| Script | Category | Transfer |
|---|---|---:|
| `www.airbnb.com/gtm.js` | Measurement and advertising | 697.8 KiB |
| `a0.muscache.com/66cd.cf1f983327.js` | Product and site UI | 334.2 KiB |
| `maps.googleapis.com/webgl.js` | Maps | 180.2 KiB |
| `www.airbnb.com/k1-RPHeiJcOxrWHta7FxZUE6n9H5Lj7crr3d8V-0BxXTQ8ZkMS0` | Measurement and advertising | 165.7 KiB |
| `a0.muscache.com/asyncRequire.036993d501.js` | Product and site UI | 141.9 KiB |
| `a0.muscache.com/ReviewsSection.a9df6f31d2.js` | Product and site UI | 129.2 KiB |
| `a0.muscache.com/client.15e649effb.js` | Product and site UI | 118.6 KiB |
| `a0.muscache.com/5950.a37198e86e.js` | Product and site UI | 107.5 KiB |
| `maps.googleapis.com/js` | Maps | 102.6 KiB |
| `a0.muscache.com/511c.8cec8382d8.js` | Product and site UI | 100.2 KiB |
| `a0.muscache.com/TermsAndConditionsSbuiWrapper.a48be23a94.js` | Product and site UI | 89.1 KiB |
| `a0.muscache.com/modalRenderer.ec0463af3b.js` | Product and site UI | 87.4 KiB |

### Largest source ranges not entered

| Script | Source | Not entered | Entered |
|---|---:|---:|---:|
| `a0.muscache.com/66cd.cf1f983327.js` | 1.20M | 0.74M | 38.0% |
| `maps.googleapis.com/webgl.js` | 0.65M | 0.56M | 12.7% |
| `a0.muscache.com/lottie_worker.74c5ab1762.js` | 0.32M | 0.32M | 0.8% |
| `www.airbnb.com/k1-RPHeiJcOxrWHta7FxZUE6n9H5Lj7crr3d8V-0BxXTQ8ZkMS0` | 0.58M | 0.28M | 51.3% |
| `www.airbnb.com/gtm.js` | 0.71M | 0.27M | 62.0% |
| `a0.muscache.com/modalRenderer.ec0463af3b.js` | 0.30M | 0.26M | 14.0% |
| `a0.muscache.com/ReviewsSection.a9df6f31d2.js` | 0.38M | 0.26M | 32.7% |
| `a0.muscache.com/a3fe.862511ea66.js` | 0.31M | 0.21M | 31.2% |
| `maps.googleapis.com/js` | 0.36M | 0.15M | 58.2% |
| `a0.muscache.com/032f.5eed230714.js` | 0.24M | 0.14M | 43.9% |

## Google Hotels

### Largest hosts

| Host | Transfer | Requests |
|---|---:|---:|
| `www.gstatic.com` | 0.99 MiB | 80 |
| `maps.googleapis.com` | 0.44 MiB | 7 |
| `www.googletagmanager.com` | 0.17 MiB | 1 |

### Largest completed script responses

| Script | Category | Transfer |
|---|---|---:|
| `maps.googleapis.com/js` | Maps | 383.5 KiB |
| `www.gstatic.com/Google module batch (109 modules)` | Product and site UI | 261.7 KiB |
| `www.gstatic.com/Google module batch (23 modules)` | Product and site UI | 169.8 KiB |
| `www.googletagmanager.com/js (G-KV2RHHN0WJ)` | Measurement and advertising | 169.7 KiB |
| `www.gstatic.com/Google module batch (2 modules)` | Product and site UI | 147.8 KiB |
| `www.gstatic.com/Google module batch (45 modules)` | Product and site UI | 57.2 KiB |
| `www.gstatic.com/Google module batch (8 modules)` | Product and site UI | 51.2 KiB |
| `www.gstatic.com/Google module batch (14 modules)` | Product and site UI | 47.3 KiB |
| `www.gstatic.com/Google module batch (1 modules)` | Product and site UI | 34.1 KiB |
| `maps.googleapis.com/map.js` | Maps | 25.2 KiB |
| `www.gstatic.com/Google module batch (1 modules)` | Product and site UI | 21.2 KiB |
| `www.gstatic.com/Google module batch (1 modules)` | Product and site UI | 21.1 KiB |

### Largest source ranges not entered

| Script | Source | Not entered | Entered |
|---|---:|---:|---:|
| `maps.googleapis.com/js` | 1.47M | 0.66M | 54.6% |
| `www.gstatic.com/Google module batch (109 modules)` | 0.90M | 0.47M | 48.2% |
| `www.gstatic.com/Google module batch (23 modules)` | 0.55M | 0.38M | 31.5% |
| `www.googletagmanager.com/js (G-KV2RHHN0WJ)` | 0.52M | 0.27M | 47.7% |
| `www.gstatic.com/rs=AA2YrTvdvpGucaAMR4eK0e9r7UJAmiUgKQ` | 0.20M | 0.15M | 24.0% |
| `www.gstatic.com/Google module batch (2 modules)` | 0.44M | 0.15M | 67.1% |
| `www.gstatic.com/Google module batch (14 modules)` | 0.15M | 0.13M | 8.5% |
| `www.gstatic.com/Google module batch (45 modules)` | 0.18M | 0.11M | 37.5% |
| `www.gstatic.com/Google module batch (1 modules)` | 0.11M | 0.09M | 17.2% |
| `www.gstatic.com/Google module batch (8 modules)` | 0.32M | 0.08M | 74.0% |

## Grand Wailea

### Largest hosts

| Host | Transfer | Requests |
|---|---:|---:|
| `www.googletagmanager.com` | 3.26 MiB | 23 |
| `messenger.myma.ai` | 0.48 MiB | 5 |
| `assets.adobedtm.com` | 0.20 MiB | 30 |
| `connect.facebook.net` | 0.19 MiB | 3 |
| `fareharbor.com` | 0.19 MiB | 5 |
| `analytics.tiktok.com` | 0.16 MiB | 5 |
| `www.grandwailea.com` | 0.15 MiB | 49 |
| `edge.marker.io` | 0.14 MiB | 3 |
| `googleads.g.doubleclick.net` | 0.10 MiB | 47 |
| `cdn.jsdelivr.net` | 0.08 MiB | 6 |
| `cdn.pagesense.io` | 0.07 MiB | 3 |
| `sc-static.net` | 0.05 MiB | 2 |

### Largest completed script responses

| Script | Category | Transfer |
|---|---|---:|
| `messenger.myma.ai/main.e77280a2.js` | Chat, booking, and embedded services | 201.8 KiB |
| `www.googletagmanager.com/gtm.js (GTM-PWDV33TS)` | Measurement and advertising | 189.7 KiB |
| `www.googletagmanager.com/js (G-Z22D1YK0ZG)` | Measurement and advertising | 184.0 KiB |
| `assets.adobedtm.com/launch-EN02272261e0b845508227acf3ca0c37de.min.js` | Measurement and advertising | 177.8 KiB |
| `www.googletagmanager.com/js (AW-971189347)` | Measurement and advertising | 161.7 KiB |
| `www.googletagmanager.com/js (AW-747444397)` | Measurement and advertising | 158.6 KiB |
| `www.googletagmanager.com/js (AW-1005930085)` | Measurement and advertising | 158.4 KiB |
| `www.googletagmanager.com/js (AW-16749997262)` | Measurement and advertising | 158.2 KiB |
| `www.googletagmanager.com/js (AW-740042986)` | Measurement and advertising | 156.4 KiB |
| `www.googletagmanager.com/js (AW-10820650235)` | Measurement and advertising | 153.2 KiB |
| `www.googletagmanager.com/js (G-6WXE90X597)` | Measurement and advertising | 152.5 KiB |
| `www.googletagmanager.com/js (G-FE79Y90F38)` | Measurement and advertising | 150.9 KiB |

### Repeated URL paths

This groups query variants by host and path. `Extra-like` is the observed
total minus the largest response, a diagnostic for duplicated runtimes—not
a guaranteed removable-byte estimate.

| Path | Requests | Transfer | Extra-like |
|---|---:|---:|---:|
| `www.googletagmanager.com/gtag/js` | 22 | 3.08 MiB | 2.90 MiB |
| `messenger.myma.ai/msgplugin.js` | 3 | 0.27 MiB | 0.18 MiB |
| `fareharbor.com/embeds/api/integration-kit-with-ssr/v1/` | 5 | 0.19 MiB | 0.15 MiB |
| `prvsz4pe.micpn.com/p/js/1.js` | 3 | 0.04 MiB | 0.03 MiB |
| `sc-static.net/scevent.min.js` | 2 | 0.05 MiB | 0.02 MiB |
| `googleads.g.doubleclick.net/pagead/viewthroughconversion/747444397/` | 7 | 0.02 MiB | 0.02 MiB |
| `dx.mountain.com/spx` | 3 | 0.02 MiB | 0.01 MiB |
| `secure.quantserve.com/quant.js` | 2 | 0.02 MiB | 0.01 MiB |
| `googleads.g.doubleclick.net/pagead/viewthroughconversion/1005930085/` | 4 | 0.01 MiB | 0.01 MiB |
| `googleads.g.doubleclick.net/pagead/viewthroughconversion/971189347/` | 4 | 0.01 MiB | 0.01 MiB |

### Largest source ranges not entered

| Script | Source | Not entered | Entered |
|---|---:|---:|---:|
| `www.googletagmanager.com/gtm.js (GTM-PWDV33TS)` | 0.63M | 0.60M | 5.5% |
| `messenger.myma.ai/main.e77280a2.js` | 0.66M | 0.56M | 15.0% |
| `www.googletagmanager.com/js (G-Z22D1YK0ZG)` | 0.59M | 0.49M | 16.7% |
| `analytics.tiktok.com/main.MWFiZGNkNWVmMQ.js` | 0.50M | 0.49M | 1.5% |
| `www.googletagmanager.com/js (AW-971189347)` | 0.52M | 0.49M | 5.6% |
| `www.googletagmanager.com/js (AW-10820650235)` | 0.47M | 0.45M | 5.9% |
| `www.googletagmanager.com/js (AW-747444397)` | 0.48M | 0.45M | 6.1% |
| `www.googletagmanager.com/js (AW-1005930085)` | 0.47M | 0.44M | 6.5% |
| `www.googletagmanager.com/js (AW-740042986)` | 0.47M | 0.44M | 5.4% |
| `www.googletagmanager.com/js (AW-16749997262)` | 0.47M | 0.43M | 8.4% |

## Enterprise

### Largest hosts

| Host | Transfer | Requests |
|---|---:|---:|
| `www.enterprise.com` | 1.61 MiB | 105 |
| `www.googletagmanager.com` | 0.98 MiB | 6 |
| `www.gstatic.com` | 0.67 MiB | 2 |
| `connect.facebook.net` | 0.25 MiB | 3 |
| `maps.googleapis.com` | 0.21 MiB | 6 |
| `analytics.tiktok.com` | 0.15 MiB | 4 |
| `cdn.cookielaw.org` | 0.13 MiB | 2 |
| `siteintercept.qualtrics.com` | 0.09 MiB | 7 |
| `s.go-mpulse.net` | 0.06 MiB | 1 |
| `www.googleadservices.com` | 0.04 MiB | 8 |
| `snap.licdn.com` | 0.04 MiB | 2 |
| `s.pinimg.com` | 0.04 MiB | 2 |

### Largest completed script responses

| Script | Category | Transfer |
|---|---|---:|
| `www.enterprise.com/vendors-node_modules_ehi_global-marketing-interface_lib_utils_index_js.c0015cc0.js` | Product and site UI | 347.6 KiB |
| `www.gstatic.com/recaptcha__en.js` | Security and anti-bot | 344.6 KiB |
| `www.gstatic.com/recaptcha__en.js` | Security and anti-bot | 343.9 KiB |
| `www.enterprise.com/launch-15f40e295df1.min.js` | Measurement and advertising | 274.9 KiB |
| `www.googletagmanager.com/gtm.js (GTM-N9JQM5L)` | Measurement and advertising | 220.3 KiB |
| `www.googletagmanager.com/js (G-BEMPZFZ04Z)` | Measurement and advertising | 187.4 KiB |
| `www.googletagmanager.com/js (G-DZ2565JF8B)` | Measurement and advertising | 169.6 KiB |
| `www.googletagmanager.com/destination (AW-1003647064)` | Measurement and advertising | 145.4 KiB |
| `www.googletagmanager.com/destination (AW-864957667)` | Measurement and advertising | 144.3 KiB |
| `www.googletagmanager.com/js (DC-8163242)` | Measurement and advertising | 136.3 KiB |
| `cdn.cookielaw.org/otBannerSdk.js` | Consent, feedback, and observability | 127.0 KiB |
| `connect.facebook.net/1707870039515690` | Measurement and advertising | 120.5 KiB |

### Repeated URL paths

This groups query variants by host and path. `Extra-like` is the observed
total minus the largest response, a diagnostic for duplicated runtimes—not
a guaranteed removable-byte estimate.

| Path | Requests | Transfer | Extra-like |
|---|---:|---:|---:|
| `www.gstatic.com/recaptcha/releases/ox8dsmiqR62P1bqhciWOn7Fg/recaptcha__en.js` | 2 | 0.67 MiB | 0.34 MiB |
| `www.googletagmanager.com/gtag/js` | 3 | 0.48 MiB | 0.30 MiB |
| `www.googletagmanager.com/gtag/destination` | 2 | 0.28 MiB | 0.14 MiB |
| `www.googleadservices.com/pagead/conversion/10783401032/` | 4 | 0.01 MiB | 0.01 MiB |
| `googleads.g.doubleclick.net/pagead/viewthroughconversion/864957667/` | 4 | 0.01 MiB | 0.01 MiB |
| `www.googleadservices.com/pagead/conversion/16474711280/` | 3 | 0.01 MiB | 0.01 MiB |
| `analytics.tiktok.com/i18n/pixel/events.js` | 2 | 0.01 MiB | 0.00 MiB |
| `bat.bing.com/p/conversions/t/5947341` | 3 | 0.00 MiB | 0.00 MiB |
| `znaw9zsytgvyddb6l-ehi.siteintercept.qualtrics.com/SIE/` | 3 | 0.01 MiB | 0.00 MiB |

### Largest source ranges not entered

| Script | Source | Not entered | Entered |
|---|---:|---:|---:|
| `www.enterprise.com/launch-15f40e295df1.min.js` | 1.53M | 1.52M | 0.1% |
| `www.googletagmanager.com/gtm.js (GTM-N9JQM5L)` | 0.90M | 0.90M | 0.1% |
| `www.gstatic.com/recaptcha__en.js` | 0.84M | 0.58M | 30.8% |
| `www.gstatic.com/recaptcha__en.js` | 0.84M | 0.57M | 31.9% |
| `www.enterprise.com/launch-15f40e295df1.min.js` | 1.53M | 0.55M | 64.2% |
| `www.googletagmanager.com/js (G-BEMPZFZ04Z)` | 0.59M | 0.51M | 13.9% |
| `analytics.tiktok.com/main.MWFiZGNkNWVmMA.js` | 0.49M | 0.48M | 0.3% |
| `www.googletagmanager.com/js (G-DZ2565JF8B)` | 0.52M | 0.44M | 15.7% |
| `www.googletagmanager.com/destination (AW-1003647064)` | 0.43M | 0.42M | 1.1% |
| `www.googletagmanager.com/destination (AW-864957667)` | 0.42M | 0.42M | 0.1% |

## Carry-over correction

The harness reuses one tab. These requests were labeled after the next surface had
started but their recorded frame still belonged to the outgoing page:

| Recorded as | Reattributed to | Transfer |
|---|---|---:|
| Enterprise | Grand Wailea | 0.20 MiB |
| Google Hotels | Airbnb | 0.08 MiB |
