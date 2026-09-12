//! Byte-parity integer serialization workload shared by the Rust renderers.
//!
//! Unlike the application-shaped data-table benchmark, this fixture performs
//! no hand-written number formatting. Every signed and unsigned value passes
//! through the renderer's native interpolation path. That makes the workload
//! sensitive to intermediate formatting allocations and integer-to-ASCII
//! implementation quality, including Proa's direct `itoa_lut` writer.

use askama::Template as AskamaTemplateTrait;
use proa_core::{WebContext, WebRenderSync, WriteBuf, WriteError};
use proa_macros::html_sync;
use sailfish::Template as SailfishTemplateTrait;

#[derive(Clone, Copy, Debug)]
pub struct IntegerRow {
    pub id: u64,
    pub signed_delta: i64,
    pub quantity: u32,
    pub inventory: i32,
    pub epoch_seconds: i64,
    pub shard: u16,
    pub attempts: u8,
    pub checksum: u128,
}

/// Build deterministic inputs outside every timed render.
pub fn build_rows(count: usize) -> Vec<IntegerRow> {
    (0..count)
        .map(|index| {
            let index = index as u64;
            IntegerRow {
                id: 9_000_000_000_000_000_000_u64.wrapping_add(index * 97),
                signed_delta: if index.is_multiple_of(2) {
                    -9_223_372_036_854_000_000_i64 + index as i64
                } else {
                    8_000_000_000_000_000_000_i64 - index as i64
                },
                quantity: ((index * 65_537) % u32::MAX as u64) as u32,
                inventory: ((index as i64 * 7_919) % 2_000_001 - 1_000_000) as i32,
                epoch_seconds: 1_700_000_000 + index as i64 * 3_601,
                shard: ((index * 257) % u16::MAX as u64) as u16,
                attempts: ((index * 17) % u8::MAX as u64) as u8,
                checksum: (index as u128 + 1) * 10_000_000_000_000_000_019_u128,
            }
        })
        .collect()
}

#[derive(Clone, Copy)]
pub struct ProaIntegerTable<'a> {
    pub rows: &'a [IntegerRow],
}

impl<B: WriteBuf, L: proa_core::DataLoader> WebRenderSync<L, B> for ProaIntegerTable<'_> {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        html_sync! {
            <html lang="en"><head><title>"Integer serialization"</title></head><body><table><thead><tr><th>"id"</th><th>"delta"</th><th>"quantity"</th><th>"inventory"</th><th>"epoch"</th><th>"shard"</th><th>"attempts"</th><th>"checksum"</th></tr></thead><tbody>{ProaIntegerRows { rows: self.rows }}</tbody></table></body></html>
        }
        .render(cx)
    }
}

struct ProaIntegerRows<'a> {
    rows: &'a [IntegerRow],
}

impl<B: WriteBuf, L: proa_core::DataLoader> WebRenderSync<L, B> for ProaIntegerRows<'_> {
    #[inline]
    fn render(self, cx: &mut WebContext<L, B>) -> Result<(), WriteError> {
        for row in self.rows {
            html_sync! {
                <tr data-id={row.id} data-shard={row.shard}><td>{row.id}</td><td>{row.signed_delta}</td><td>{row.quantity}</td><td>{row.inventory}</td><td>{row.epoch_seconds}</td><td>{row.shard}</td><td>{row.attempts}</td><td>{row.checksum}</td></tr>
            }
            .render(cx)?;
        }
        Ok(())
    }
}

#[derive(askama::Template)]
#[template(path = "integer_serialization.html")]
pub struct AskamaIntegerTable<'a> {
    pub rows: &'a [IntegerRow],
}

#[derive(sailfish::Template)]
#[template(path = "integer_serialization.stpl")]
pub struct SailfishIntegerTable<'a> {
    pub rows: &'a [IntegerRow],
}

pub fn render_proa_fresh(rows: &[IntegerRow]) -> String {
    proa_core::render_to_string(ProaIntegerTable { rows })
}

pub fn render_proa_reused(
    rows: &[IntegerRow],
    context: &mut WebContext<proa_core::NoLoader, Vec<u8>>,
) {
    context.out.clear();
    ProaIntegerTable { rows }
        .render(context)
        .expect("Proa integer table should render into a reused context");
}

pub fn render_askama_fresh(rows: &[IntegerRow]) -> String {
    AskamaIntegerTable { rows }
        .render()
        .expect("Askama integer table should render")
}

pub fn render_askama_reused(rows: &[IntegerRow], output: &mut String) {
    output.clear();
    AskamaIntegerTable { rows }
        .render_into(output)
        .expect("Askama integer table should render into a reused String");
}

pub fn render_sailfish_fresh(rows: &[IntegerRow]) -> String {
    SailfishIntegerTable { rows }
        .render()
        .expect("Sailfish integer table should render")
}

pub fn render_sailfish_reused(rows: &[IntegerRow], output: &mut sailfish::runtime::Buffer) {
    output.clear();
    SailfishIntegerTable { rows }
        .render_to(output)
        .expect("Sailfish integer table should render into a reused Buffer");
}

pub fn assert_parity(rows: &[IntegerRow]) -> usize {
    let proa = render_proa_fresh(rows);
    let askama = render_askama_fresh(rows);
    let sailfish = render_sailfish_fresh(rows);
    assert_eq!(proa.as_bytes(), askama.as_bytes(), "Proa/Askama byte drift");
    assert_eq!(
        proa.as_bytes(),
        sailfish.as_bytes(),
        "Proa/Sailfish byte drift"
    );
    proa.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_renderers_are_byte_identical_across_scales() {
        for count in [0, 1, 10, 100, 1_000] {
            let rows = build_rows(count);
            let bytes = assert_parity(&rows);
            assert_eq!(bytes, render_proa_fresh(&rows).len());
        }
    }

    #[test]
    fn fixture_exercises_signed_unsigned_and_wide_values() {
        let html = render_proa_fresh(&build_rows(2));
        assert!(html.contains("-9223372036854000000"));
        assert!(html.contains("7999999999999999999"));
        assert!(html.contains("10000000000000000019"));
        assert!(html.contains("data-id=\"9000000000000000000\""));
    }
}
