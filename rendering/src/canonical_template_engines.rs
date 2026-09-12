//! Askama and Sailfish adapters for the canonical three-workload suite.
//!
//! The canonical data is constructed once by `representative_suite`. The small
//! presentation view models below are rebuilt inside each timed render because
//! formatting, branching, and attribute construction are part of rendering.

use askama::Template;
use sailfish::TemplateOnce;

use crate::{askama_page, data_table_page::Row, sailfish_page, topcoat_product_grid::Product};

#[derive(Debug)]
struct TableRowView<'a> {
    id: u32,
    name: &'a str,
    email: &'a str,
    status: &'static str,
    status_class: &'static str,
    zebra: &'static str,
    amount: String,
    tax: String,
    total: String,
    created: String,
    updated: String,
    score: String,
    country: &'a str,
    tags: &'static [&'static str],
}

#[derive(Debug)]
struct ProductView<'a> {
    href: String,
    name: &'a str,
    category: &'a str,
    price: String,
    rating: String,
    review_count: u32,
    filled_stars: u32,
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

fn format_currency(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let absolute = cents.unsigned_abs();
    format!(
        "{sign}${}.{:02}",
        format_count(absolute / 100),
        absolute % 100
    )
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

fn table_view(rows: &[Row]) -> Vec<TableRowView<'_>> {
    rows.iter()
        .enumerate()
        .map(|(index, row)| TableRowView {
            id: row.id,
            name: row.name,
            email: row.email,
            status: row.status.label(),
            status_class: row.status.badge_classes(),
            zebra: if index.is_multiple_of(2) {
                "bg-white"
            } else {
                "bg-gray-50"
            },
            amount: format_currency(row.amount_cents),
            tax: format_currency(row.tax_cents),
            total: format_currency(row.amount_cents + row.tax_cents),
            created: format_date(row.created_unix),
            updated: format_datetime(row.updated_unix),
            score: format!("{}.{}%", row.score_bps / 100, (row.score_bps % 100) / 10),
            country: row.country,
            tags: row.tags,
        })
        .collect()
}

fn product_view(products: &[Product]) -> Vec<ProductView<'_>> {
    products
        .iter()
        .map(|product| ProductView {
            href: format!("/products/{}", product.id),
            name: &product.name,
            category: &product.category,
            price: format!(
                "${}.{:02}",
                product.price_cents / 100,
                product.price_cents % 100
            ),
            rating: format!(
                "{}.{}",
                product.rating_tenths / 10,
                product.rating_tenths % 10
            ),
            review_count: product.review_count,
            filled_stars: (product.rating_tenths + 5) / 10,
        })
        .collect()
}

#[derive(Template)]
#[template(path = "canonical_table.html")]
struct AskamaTable<'a> {
    rows: &'a [TableRowView<'a>],
}

#[derive(TemplateOnce)]
#[template(path = "canonical_table.stpl")]
struct SailfishTable<'a> {
    rows: &'a [TableRowView<'a>],
}

#[derive(Template)]
#[template(path = "canonical_products.html")]
struct AskamaProducts<'a> {
    products: &'a [ProductView<'a>],
}

#[derive(TemplateOnce)]
#[template(path = "canonical_products.stpl")]
struct SailfishProducts<'a> {
    products: &'a [ProductView<'a>],
}

pub fn render_askama_cards() -> String {
    askama_page::render()
}

pub fn render_sailfish_cards() -> String {
    sailfish_page::render()
}

pub fn render_askama_table(rows: &[Row]) -> String {
    let rows = table_view(rows);
    AskamaTable { rows: &rows }
        .render()
        .expect("canonical Askama table should render")
}

pub fn render_sailfish_table(rows: &[Row]) -> String {
    let rows = table_view(rows);
    SailfishTable { rows: &rows }
        .render_once()
        .expect("canonical Sailfish table should render")
}

pub fn render_askama_products(products: &[Product]) -> String {
    let products = product_view(products);
    AskamaProducts {
        products: &products,
    }
    .render()
    .expect("canonical Askama products should render")
}

pub fn render_sailfish_products(products: &[Product]) -> String {
    let products = product_view(products);
    SailfishProducts {
        products: &products,
    }
    .render_once()
    .expect("canonical Sailfish products should render")
}
