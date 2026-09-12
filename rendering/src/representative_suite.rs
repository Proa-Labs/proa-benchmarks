//! Representative cross-framework SSR suite.
//!
//! Every framework in the core comparison renders the same three fixed
//! workloads. Data generation is outside the timed render path:
//! - `cards`: 4 sections, 32 cards, and 160 feature-list items.
//! - `table`: 1,000 rows with formatting, branching, and escaped text.
//! - `products`: 96 component-shaped product cards and 480 SVG stars.

use std::{env, sync::OnceLock};

use dioxus::prelude::*;
use leptos::prelude::{
    view as leptos_view, ClassAttribute, CollectView, CustomAttribute, ElementChild,
    GlobalAttributes, RenderHtml,
};
use topcoat::{
    context::Cx,
    view::{view as topcoat_view, View},
    Result as TopcoatResult,
};

use crate::{
    canonical_template_engines,
    data_table_page::{self, Row},
    dioxus_page, leptos_page, proa_page, topcoat_page,
    topcoat_product_grid::{self, Product, STAR_PATH},
};

pub const TABLE_ROW_COUNT: usize = 1_000;
pub const PRODUCT_COUNT: usize = 96;

static TABLE_ROWS: OnceLock<Vec<Row>> = OnceLock::new();
static PRODUCTS: OnceLock<Vec<Product>> = OnceLock::new();
static PRODUCT_CARDINALITY: OnceLock<usize> = OnceLock::new();

pub fn table_rows() -> &'static [Row] {
    TABLE_ROWS
        .get_or_init(|| data_table_page::build_dataset(TABLE_ROW_COUNT))
        .as_slice()
}

pub fn products() -> &'static [Product] {
    PRODUCTS
        .get_or_init(|| topcoat_product_grid::make_products(product_count()))
        .as_slice()
}

/// Product-grid cardinality for the canonical fixture. The environment override
/// is used by the dedicated scaling capture; the public scoreboard stays at 96.
pub fn product_count() -> usize {
    *PRODUCT_CARDINALITY.get_or_init(|| match env::var("PROA_BENCH_PRODUCT_COUNT") {
        Ok(value) => value
            .parse::<usize>()
            .ok()
            .filter(|count| *count > 0)
            .expect("PROA_BENCH_PRODUCT_COUNT must be a positive integer"),
        Err(_) => PRODUCT_COUNT,
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Workload {
    Cards,
    Table,
    Products,
}

impl Workload {
    pub const fn id(self) -> &'static str {
        match self {
            Self::Cards => "cards",
            Self::Table => "table",
            Self::Products => "products",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "cards" => Some(Self::Cards),
            "table" => Some(Self::Table),
            "products" => Some(Self::Products),
            _ => None,
        }
    }
}

pub fn render_proa(workload: Workload) -> String {
    match workload {
        Workload::Cards => proa_page::render_safetext_owned(),
        Workload::Table => data_table_page::render_to_string(table_rows()),
        Workload::Products => topcoat_product_grid::render_proa(products()),
    }
}

pub fn render_leptos(workload: Workload) -> String {
    match workload {
        Workload::Cards => leptos_page::render(),
        Workload::Table => render_leptos_table(),
        Workload::Products => render_leptos_products(),
    }
}

pub fn render_dioxus(workload: Workload) -> String {
    match workload {
        Workload::Cards => dioxus_page::render(),
        Workload::Table => render_dioxus_document(DioxusTablePage),
        Workload::Products => render_dioxus_fragment(DioxusProductGrid),
    }
}

pub fn render_topcoat(cx: &Cx, workload: Workload) -> String {
    match workload {
        Workload::Cards => topcoat_page::render(cx),
        Workload::Table => futures::executor::block_on(topcoat_table(cx))
            .expect("Topcoat table view should build")
            .render(cx),
        Workload::Products => topcoat_product_grid::render_topcoat(cx, products()),
    }
}

pub fn render_askama(workload: Workload) -> String {
    match workload {
        Workload::Cards => canonical_template_engines::render_askama_cards(),
        Workload::Table => canonical_template_engines::render_askama_table(table_rows()),
        Workload::Products => canonical_template_engines::render_askama_products(products()),
    }
}

pub fn render_sailfish(workload: Workload) -> String {
    match workload {
        Workload::Cards => canonical_template_engines::render_sailfish_cards(),
        Workload::Table => canonical_template_engines::render_sailfish_table(table_rows()),
        Workload::Products => canonical_template_engines::render_sailfish_products(products()),
    }
}

fn format_currency(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let absolute = cents.unsigned_abs();
    format!(
        "{sign}${}.{:02}",
        format_count(absolute / 100),
        absolute % 100
    )
}

fn format_count(value: u64) -> String {
    let digits = value.to_string();
    let mut output = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, byte) in digits.bytes().enumerate() {
        if index != 0 && (digits.len() - index).is_multiple_of(3) {
            output.push(',');
        }
        output.push(char::from(byte));
    }
    output
}

fn format_percent(basis_points: u32) -> String {
    format!("{}.{}%", basis_points / 100, (basis_points % 100) / 10)
}

fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe as i64 + era * 400;
    let day_of_year = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_prime + 2) / 5 + 1) as u32;
    let month = if month_prime < 10 {
        month_prime + 3
    } else {
        month_prime - 9
    } as u32;
    let year = if month <= 2 { year + 1 } else { year };
    (year as i32, month, day)
}

fn format_date(unix: i64) -> String {
    let (year, month, day) = civil_from_days(unix.div_euclid(86_400));
    format!("{year:04}-{month:02}-{day:02}")
}

fn format_datetime(unix: i64) -> String {
    let (year, month, day) = civil_from_days(unix.div_euclid(86_400));
    let seconds = unix.rem_euclid(86_400) as u32;
    let hour = seconds / 3_600;
    let minute = (seconds % 3_600) / 60;
    format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}")
}

fn render_leptos_table() -> String {
    let owner = leptos::prelude::Owner::new();
    owner.with(|| {
        leptos_view! {
            <html lang="en">
                <head>
                    <title>"Customer Data Table"</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1"/>
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
                            <tbody>
                                {table_rows().iter().enumerate().map(|(index, row)| {
                                    let zebra = if index.is_multiple_of(2) { "bg-white" } else { "bg-gray-50" };
                                    let row_id = row.id.to_string();
                                    let amount = format_currency(row.amount_cents);
                                    let tax = format_currency(row.tax_cents);
                                    let total = format_currency(row.amount_cents + row.tax_cents);
                                    let created = format_date(row.created_unix);
                                    let updated = format_datetime(row.updated_unix);
                                    let score = format_percent(row.score_bps);
                                    leptos_view! {
                                        <tr class=zebra data-row-id=row_id>
                                            <td class="px-3 py-2 font-mono text-gray-500">{row.id}</td>
                                            <td class="px-3 py-2">{row.name}</td>
                                            <td class="px-3 py-2 text-blue-700">{row.email}</td>
                                            <td class="px-3 py-2">
                                                <span class=row.status.badge_classes()>{row.status.label()}</span>
                                            </td>
                                            <td class="px-3 py-2 text-right font-mono">{amount}</td>
                                            <td class="px-3 py-2 text-right font-mono text-gray-500">{tax}</td>
                                            <td class="px-3 py-2 text-right font-mono font-semibold">{total}</td>
                                            <td class="px-3 py-2 text-gray-600">{created}</td>
                                            <td class="px-3 py-2 text-gray-600">{updated}</td>
                                            <td class="px-3 py-2 text-right font-mono">{score}</td>
                                            <td class="px-3 py-2">{row.country}</td>
                                            <td class="px-3 py-2">
                                                {row.tags.iter().map(|tag| leptos_view! {
                                                    <span class="inline-block px-2 py-0.5 mr-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">{*tag}</span>
                                                }).collect_view()}
                                            </td>
                                        </tr>
                                    }
                                }).collect_view()}
                            </tbody>
                        </table>
                    </main>
                </body>
            </html>
        }
        .to_html()
    })
}

fn render_leptos_products() -> String {
    let owner = leptos::prelude::Owner::new();
    owner.with(|| {
        leptos_view! {
            <main class="mx-auto w-full max-w-6xl px-4 py-10">
                <h1 class="text-2xl font-bold tracking-tight">"All products"</h1>
                <div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                    {products().iter().map(|product| {
                        let href = format!("/products/{}", product.id);
                        let filled = (product.rating_tenths + 5) / 10;
                        let rating = topcoat_product_grid::format_rating(product.rating_tenths);
                        let price = topcoat_product_grid::format_price(product.price_cents);
                        leptos_view! {
                            <a href=href class="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                                <div class="mb-4 flex h-32 items-center justify-center rounded-lg bg-slate-100 text-3xl font-bold text-slate-300">{product.category.as_str()}</div>
                                <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{product.category.as_str()}</p>
                                <h3 class="mt-1 text-sm font-semibold text-slate-900 group-hover:text-indigo-600">{product.name.as_str()}</h3>
                                <div class="mt-2 flex items-center gap-1">
                                    <div class="flex">
                                        {(0..5u32).map(|index| {
                                            let class = if index < filled { "h-4 w-4 text-amber-400" } else { "h-4 w-4 text-slate-200" };
                                            leptos_view! {
                                                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class=class>
                                                    <path d=STAR_PATH></path>
                                                </svg>
                                            }
                                        }).collect_view()}
                                    </div>
                                    <span class="text-xs text-slate-500">{rating}" ("{product.review_count}")"</span>
                                </div>
                                <p class="mt-3 text-lg font-bold">{price}</p>
                            </a>
                        }
                    }).collect_view()}
                </div>
            </main>
        }
        .to_html()
    })
}

// proa-perf-ok(scope): Dioxus 0.6 cannot emit the document-level html element;
// this adapter writes only the trusted static shell around its normal renderer.
fn render_dioxus_document(root: fn() -> Element) -> String {
    let mut vdom = VirtualDom::new(root);
    vdom.rebuild_in_place();
    let mut output = String::new();
    output.push_str("<html lang=\"en\">");
    dioxus_ssr::Renderer::new()
        .render_to(&mut output, &vdom)
        .expect("Dioxus representative-suite document should render");
    output.push_str("</html>");
    output
}

fn render_dioxus_fragment(root: fn() -> Element) -> String {
    let mut vdom = VirtualDom::new(root);
    vdom.rebuild_in_place();
    let mut output = String::new();
    dioxus_ssr::Renderer::new()
        .render_to(&mut output, &vdom)
        .expect("Dioxus representative-suite fragment should render");
    output
}

#[component]
fn DioxusTablePage() -> Element {
    rsx! {
        head {
            title { "Customer Data Table" }
            meta { name: "viewport", content: "width=device-width, initial-scale=1" }
        }
        body { class: "bg-gray-50 text-gray-900",
            header { class: "px-6 py-4 border-b",
                h1 { class: "text-xl font-semibold", "Customer Accounts" }
                p { class: "text-sm text-gray-600", "Live revenue and account status across all regions." }
            }
            main { class: "p-6",
                table { class: "min-w-full text-sm border-collapse",
                    thead { class: "bg-gray-100",
                        tr {
                            th { class: "px-3 py-2 text-left", "ID" }
                            th { class: "px-3 py-2 text-left", "Name" }
                            th { class: "px-3 py-2 text-left", "Email" }
                            th { class: "px-3 py-2 text-left", "Status" }
                            th { class: "px-3 py-2 text-right", "Amount" }
                            th { class: "px-3 py-2 text-right", "Tax" }
                            th { class: "px-3 py-2 text-right", "Total" }
                            th { class: "px-3 py-2 text-left", "Created" }
                            th { class: "px-3 py-2 text-left", "Updated" }
                            th { class: "px-3 py-2 text-right", "Score" }
                            th { class: "px-3 py-2 text-left", "Country" }
                            th { class: "px-3 py-2 text-left", "Tags" }
                        }
                    }
                    tbody {
                        for (index, row) in table_rows().iter().enumerate() {
                            tr {
                                class: if index % 2 == 0 { "bg-white" } else { "bg-gray-50" },
                                "data-row-id": "{row.id}",
                                td { class: "px-3 py-2 font-mono text-gray-500", "{row.id}" }
                                td { class: "px-3 py-2", "{row.name}" }
                                td { class: "px-3 py-2 text-blue-700", "{row.email}" }
                                td { class: "px-3 py-2",
                                    span { class: row.status.badge_classes(), "{row.status.label()}" }
                                }
                                td { class: "px-3 py-2 text-right font-mono", {format_currency(row.amount_cents)} }
                                td { class: "px-3 py-2 text-right font-mono text-gray-500", {format_currency(row.tax_cents)} }
                                td { class: "px-3 py-2 text-right font-mono font-semibold", {format_currency(row.amount_cents + row.tax_cents)} }
                                td { class: "px-3 py-2 text-gray-600", {format_date(row.created_unix)} }
                                td { class: "px-3 py-2 text-gray-600", {format_datetime(row.updated_unix)} }
                                td { class: "px-3 py-2 text-right font-mono", {format_percent(row.score_bps)} }
                                td { class: "px-3 py-2", "{row.country}" }
                                td { class: "px-3 py-2",
                                    for tag in row.tags {
                                        span { class: "inline-block px-2 py-0.5 mr-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200", "{tag}" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn DioxusProductGrid() -> Element {
    rsx! {
        main { class: "mx-auto w-full max-w-6xl px-4 py-10",
            h1 { class: "text-2xl font-bold tracking-tight", "All products" }
            div { class: "mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4",
                for product in products() {
                    a {
                        href: "/products/{product.id}",
                        class: "group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md",
                        div { class: "mb-4 flex h-32 items-center justify-center rounded-lg bg-slate-100 text-3xl font-bold text-slate-300", "{product.category}" }
                        p { class: "text-xs font-medium uppercase tracking-wide text-slate-400", "{product.category}" }
                        h3 { class: "mt-1 text-sm font-semibold text-slate-900 group-hover:text-indigo-600", "{product.name}" }
                        div { class: "mt-2 flex items-center gap-1",
                            div { class: "flex",
                                for index in 0..5u32 {
                                    svg {
                                        view_box: "0 0 20 20",
                                        fill: "currentColor",
                                        "aria-hidden": "true",
                                        class: if index < (product.rating_tenths + 5) / 10 { "h-4 w-4 text-amber-400" } else { "h-4 w-4 text-slate-200" },
                                        path { d: STAR_PATH }
                                    }
                                }
                            }
                            span { class: "text-xs text-slate-500",
                                {topcoat_product_grid::format_rating(product.rating_tenths)}
                                " ("
                                "{product.review_count}"
                                ")"
                            }
                        }
                        p { class: "mt-3 text-lg font-bold", {topcoat_product_grid::format_price(product.price_cents)} }
                    }
                }
            }
        }
    }
}

async fn topcoat_table(cx: &Cx) -> TopcoatResult {
    topcoat_view! {
        cx =>
        <html lang="en">
            <head>
                <title>"Customer Data Table"</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
            </head>
            <body class="bg-gray-50 text-gray-900">
                <header class="px-6 py-4 border-b">
                    <h1 class="text-xl font-semibold">"Customer Accounts"</h1>
                    <p class="text-sm text-gray-600">"Live revenue and account status across all regions."</p>
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
                        <tbody>
                            for (index, row) in table_rows().iter().enumerate() {
                                <tr
                                    class=(if index.is_multiple_of(2) { "bg-white" } else { "bg-gray-50" })
                                    data-row-id=(row.id)
                                >
                                    <td class="px-3 py-2 font-mono text-gray-500">(row.id)</td>
                                    <td class="px-3 py-2">(row.name)</td>
                                    <td class="px-3 py-2 text-blue-700">(row.email)</td>
                                    <td class="px-3 py-2"><span class=(row.status.badge_classes())>(row.status.label())</span></td>
                                    <td class="px-3 py-2 text-right font-mono">(format_currency(row.amount_cents))</td>
                                    <td class="px-3 py-2 text-right font-mono text-gray-500">(format_currency(row.tax_cents))</td>
                                    <td class="px-3 py-2 text-right font-mono font-semibold">(format_currency(row.amount_cents + row.tax_cents))</td>
                                    <td class="px-3 py-2 text-gray-600">(format_date(row.created_unix))</td>
                                    <td class="px-3 py-2 text-gray-600">(format_datetime(row.updated_unix))</td>
                                    <td class="px-3 py-2 text-right font-mono">(format_percent(row.score_bps))</td>
                                    <td class="px-3 py-2">(row.country)</td>
                                    <td class="px-3 py-2">
                                        for tag in row.tags {
                                            <span class="inline-block px-2 py-0.5 mr-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">(tag)</span>
                                        }
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </main>
            </body>
        </html>
    }
}

pub fn build_topcoat_table_view(cx: &Cx) -> View {
    futures::executor::block_on(topcoat_table(cx)).expect("Topcoat table view should build")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_workload_cardinalities_are_stable() {
        assert_eq!(table_rows().len(), TABLE_ROW_COUNT);
        assert_eq!(products().len(), product_count());
    }

    #[test]
    fn every_rust_peer_renders_each_workload() {
        let cx = Cx::default();
        for workload in [Workload::Cards, Workload::Table, Workload::Products] {
            for output in [
                render_proa(workload),
                render_leptos(workload),
                render_dioxus(workload),
                render_topcoat(&cx, workload),
            ] {
                assert!(
                    !output.is_empty(),
                    "{} output must not be empty",
                    workload.id()
                );
            }
        }
    }
}
