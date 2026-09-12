//! Heavy data-table page benchmark.
//!
//! Renders a 1000-row × ~12-column dashboard table with realistic per-cell work:
//!   - Currency formatting (cents → "$1,234.56")
//!   - Date formatting (unix → "2026-04-19")
//!   - Datetime formatting (unix → "2026-04-19 14:32")
//!   - Percentage formatting (basis points → "92.4%")
//!   - Status badges with conditional class merging
//!   - HTML-escaped user content (names with `<`, `>`, `&`, `"`)
//!   - Inline tag chips
//!
//! All formatting happens inside the render path — this is the work that
//! per-cell template engines pay for on every render.
//!
//! Mirror template lives in `rendering/external/marko/page_table.marko`.

use core::fmt;
use proa_core::{WebContext, WebRenderSync, WriteBuf, WriteError};
use proa_macros::{html_sync, text};

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Active,
    Pending,
    Disabled,
    Cancelled,
    Refunded,
}

impl Status {
    #[inline]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Active => "Active",
            Self::Pending => "Pending",
            Self::Disabled => "Disabled",
            Self::Cancelled => "Cancelled",
            Self::Refunded => "Refunded",
        }
    }

    #[inline]
    pub const fn badge_classes(self) -> &'static str {
        match self {
            Self::Active => {
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-300"
            }
            Self::Pending => {
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300"
            }
            Self::Disabled => {
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300"
            }
            Self::Cancelled => {
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-300"
            }
            Self::Refunded => {
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-300"
            }
        }
    }
}

#[derive(Clone, Copy)]
pub struct Row {
    pub id: u32,
    pub name: &'static str,
    pub email: &'static str,
    pub status: Status,
    pub amount_cents: i64,
    pub tax_cents: i64,
    pub created_unix: i64,
    pub updated_unix: i64,
    pub score_bps: u32,
    pub country: &'static str,
    pub tags: &'static [&'static str],
}

const NAMES: &[&str] = &[
    "Alice <admin>",
    "Bob & Charlie",
    "Dana \"the boss\" Lin",
    "Eve O'Brien",
    "Frank > Smith",
    "Grace Hopper & Co.",
    "Heidi <script>",
    "Ivan & Sons",
    "Judy Q. \"Public\"",
    "Karl <tag>",
    "Liu & Wang",
    "Mallory >&<",
    "Niaj <user>",
    "Olivia & Co.",
    "Peggy 'Quote'",
    "Quinn & Sons",
];

const EMAILS: &[&str] = &[
    "alice+filter@example.com",
    "bob&charlie@example.com",
    "dana@example.org",
    "eve@example.io",
    "frank>smith@example.net",
    "grace@hopper.dev",
    "heidi@example.com",
    "ivan&sons@example.co",
    "judy@public.gov",
    "karl@example.com",
    "liu@wang.cn",
    "mallory@evil.example",
    "niaj@example.bd",
    "olivia@co.example",
    "peggy@quoted.example",
    "quinn@example.io",
];

const COUNTRIES: &[&str] = &["USA", "CAN", "GBR", "DEU", "FRA", "JPN", "AUS", "BRA"];

const TAG_SETS: &[&[&str]] = &[
    &["new", "priority"],
    &["enterprise", "vip"],
    &["trial"],
    &["enterprise", "vip", "priority"],
    &["churn-risk"],
    &["new"],
    &["priority", "review"],
    &["vip"],
];

/// Build a deterministic dataset for the benchmark.
pub fn build_dataset(n: usize) -> Vec<Row> {
    (0..n)
        .map(|i| {
            let amount = 12_345 + ((i as i64) * 137) % 99_999;
            Row {
                id: 100_000 + i as u32,
                name: NAMES[i % NAMES.len()],
                email: EMAILS[i % EMAILS.len()],
                status: match i % 5 {
                    0 => Status::Active,
                    1 => Status::Pending,
                    2 => Status::Disabled,
                    3 => Status::Cancelled,
                    _ => Status::Refunded,
                },
                amount_cents: amount,
                tax_cents: (amount * 8) / 100,
                created_unix: 1_700_000_000 + (i as i64) * 86_400,
                updated_unix: 1_710_000_000 + (i as i64) * 3_600,
                score_bps: 5_000 + ((i as u32) * 31) % 5_000,
                country: COUNTRIES[i % COUNTRIES.len()],
                tags: TAG_SETS[i % TAG_SETS.len()],
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Semantic formatters. `text!` streams primitive values and Rust format specs
// directly into Proa's output buffer, so these do not build intermediate Strings.
// ---------------------------------------------------------------------------

/// Decimal integer with thousands separators for the currency display.
#[derive(Clone, Copy)]
struct GroupedDecimal(u64);

impl fmt::Display for GroupedDecimal {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        fn write_grouped(value: u64, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            if value < 1_000 {
                return write!(formatter, "{value}");
            }

            write_grouped(value / 1_000, formatter)?;
            write!(formatter, ",{:03}", value % 1_000)
        }

        write_grouped(self.0, formatter)
    }
}

/// Currency formatter: cents → `$1,234.56` written directly to buffer.
#[derive(Clone, Copy)]
struct Currency(i64);

impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for Currency {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let cents = self.0;
        let sign = if cents < 0 { "-" } else { "" };
        let abs = cents.unsigned_abs();
        let dollars = abs / 100;
        let pennies = abs % 100;
        text!("{}${:}.{:02}", sign, GroupedDecimal(dollars), pennies).render(cx)
    }
}

/// Percentage formatter: basis points → `92.4%`.
#[derive(Clone, Copy)]
struct Percent(u32);

impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for Percent {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let bps = self.0;
        let whole = bps / 100;
        let tenth = (bps % 100) / 10;
        text!("{}.{}%", whole, tenth).render(cx)
    }
}

/// Date formatter: unix seconds → `YYYY-MM-DD`.
#[derive(Clone, Copy)]
struct Date(i64);

impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for Date {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let (y, m, d) = civil_from_days(self.0.div_euclid(86_400));
        text!("{}-{:02}-{:02}", y, m, d).render(cx)
    }
}

/// Datetime formatter: unix seconds → `YYYY-MM-DD HH:MM`.
#[derive(Clone, Copy)]
struct DateTime(i64);

impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for DateTime {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let days = self.0.div_euclid(86_400);
        let secs_of_day = self.0.rem_euclid(86_400) as u32;
        let (y, m, d) = civil_from_days(days);
        let h = secs_of_day / 3_600;
        let min = (secs_of_day % 3_600) / 60;
        text!("{}-{:02}-{:02} {:02}:{:02}", y, m, d, h, min).render(cx)
    }
}

/// Howard Hinnant's civil_from_days algorithm.
/// Converts days-since-epoch (1970-01-01) to (year, month, day).
#[inline]
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m, d)
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------

pub struct DataTablePage<'a> {
    pub rows: &'a [Row],
}

impl<'a, B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for DataTablePage<'a> {
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        html_sync! {
            <html lang="en">
                <head>
                    <title>"Customer Data Table"</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                </head>
                <body class="bg-gray-50 text-gray-900">
                    <header class="px-6 py-4 border-b">
                        <h1 class="text-xl font-semibold">"Customer Accounts"</h1>
                        <p class="text-sm text-gray-600">
                            "Live revenue and account status across all regions."
                        </p>
                    </header>
                    <main class="p-6">
                        <table class="min-w-full text-sm border-collapse">
                            <thead class="bg-gray-100">
                                <tr>
                                    <th class="px-3 py-2 text-left">"ID"</th>
                                    <th class="px-3 py-2 text-left">"Name"</th>
                                    <th class="px-3 py-2 text-left">"Email"</th>
                                    <th class="px-3 py-2 text-left">"Status"</th>
                                    <th class="px-3 py-2 text-right">"Amount"</th>
                                    <th class="px-3 py-2 text-right">"Tax"</th>
                                    <th class="px-3 py-2 text-right">"Total"</th>
                                    <th class="px-3 py-2 text-left">"Created"</th>
                                    <th class="px-3 py-2 text-left">"Updated"</th>
                                    <th class="px-3 py-2 text-right">"Score"</th>
                                    <th class="px-3 py-2 text-left">"Country"</th>
                                    <th class="px-3 py-2 text-left">"Tags"</th>
                                </tr>
                            </thead>
                            <tbody>{Rows { rows: self.rows }}</tbody>
                        </table>
                    </main>
                </body>
            </html>
        }
        .render(cx)
    }
}

struct Rows<'a> {
    rows: &'a [Row],
}

impl<'a, B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for Rows<'a> {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        for (idx, row) in self.rows.iter().enumerate() {
            RowView { idx, row }.render(cx)?;
        }
        Ok(())
    }
}

struct RowView<'a> {
    idx: usize,
    row: &'a Row,
}

impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for RowView<'_> {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        let zebra = if self.idx.is_multiple_of(2) {
            "bg-white"
        } else {
            "bg-gray-50"
        };
        let row = self.row;
        let total = row.amount_cents + row.tax_cents;
        let status_classes = row.status.badge_classes();
        let status_label = row.status.label();
        let row_id = row.id;
        html_sync! {
            <tr class={text!("{}", zebra)} data-row-id={text!("{}", row_id)}>
                <td class="px-3 py-2 font-mono text-gray-500">{text!("{}", row.id)}</td>
                <td class="px-3 py-2">{text!("{}", row.name)}</td>
                <td class="px-3 py-2 text-blue-700">{text!("{}", row.email)}</td>
                <td class="px-3 py-2">
                    <span class={text!("{}", status_classes)}>{text!("{}", status_label)}</span>
                </td>
                <td class="px-3 py-2 text-right font-mono">{Currency(row.amount_cents)}</td>
                <td class="px-3 py-2 text-right font-mono text-gray-500">
                    {Currency(row.tax_cents)}
                </td>
                <td class="px-3 py-2 text-right font-mono font-semibold">{Currency(total)}</td>
                <td class="px-3 py-2 text-gray-600">{Date(row.created_unix)}</td>
                <td class="px-3 py-2 text-gray-600">{DateTime(row.updated_unix)}</td>
                <td class="px-3 py-2 text-right font-mono">{Percent(row.score_bps)}</td>
                <td class="px-3 py-2">{text!("{}", row.country)}</td>
                <td class="px-3 py-2">{Tags { tags: row.tags }}</td>
            </tr>
        }
        .render(cx)
    }
}

struct Tags {
    tags: &'static [&'static str],
}

impl<B: WriteBuf, L: ::proa_core::DataLoader> WebRenderSync<L, B> for Tags {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        for tag in self.tags {
            html_sync! {
                <span class="inline-block px-2 py-0.5 mr-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">
                    {text!("{}", *tag)}
                </span>
            }
            .render(cx)?;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Public render entry points
// ---------------------------------------------------------------------------

pub fn render_into(rows: &[Row], buffer: &mut Vec<u8>) {
    crate::render_into_vec(buffer, DataTablePage { rows });
}

pub fn render_to_string(rows: &[Row]) -> String {
    proa_core::render_to_string(DataTablePage { rows })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_with_expected_chunks() {
        let rows = build_dataset(3);
        let html = render_to_string(&rows);
        // Currency formatting present
        assert!(html.contains("$"));
        // Status badge classes present
        assert!(html.contains("bg-green-100") || html.contains("bg-yellow-100"));
        // Escaped user content
        assert!(html.contains("&lt;admin&gt;") || html.contains("&amp;"));
        // Date format
        assert!(html.contains("2023-") || html.contains("2024-") || html.contains("2026-"));
    }

    #[test]
    fn currency_formatting() {
        let mut buf: Vec<u8> = Vec::new();
        let mut cx = WebContext::with_buffer(&mut buf);
        Currency(1_234_567).render(&mut cx).unwrap();
        assert_eq!(std::str::from_utf8(&buf).unwrap(), "$12,345.67");

        let mut buf: Vec<u8> = Vec::new();
        let mut cx = WebContext::with_buffer(&mut buf);
        Currency(99).render(&mut cx).unwrap();
        assert_eq!(std::str::from_utf8(&buf).unwrap(), "$0.99");

        let mut buf: Vec<u8> = Vec::new();
        let mut cx = WebContext::with_buffer(&mut buf);
        Currency(100).render(&mut cx).unwrap();
        assert_eq!(std::str::from_utf8(&buf).unwrap(), "$1.00");

        let mut buf: Vec<u8> = Vec::new();
        let mut cx = WebContext::with_buffer(&mut buf);
        Currency(i64::MIN).render(&mut cx).unwrap();
        assert_eq!(
            std::str::from_utf8(&buf).unwrap(),
            "-$92,233,720,368,547,758.08"
        );
    }

    #[test]
    fn date_formatting() {
        // 1700000000 = 2023-11-14 22:13:20 UTC
        let mut buf: Vec<u8> = Vec::new();
        let mut cx = WebContext::with_buffer(&mut buf);
        Date(1_700_000_000).render(&mut cx).unwrap();
        assert_eq!(std::str::from_utf8(&buf).unwrap(), "2023-11-14");
    }
}
