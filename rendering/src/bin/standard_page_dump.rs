//! Emit one legacy standard-page implementation for the normalized-DOM parity
//! gate. This binary is deliberately outside the timed Criterion loop.

use std::io::{self, Write};

use proa_bench::{askama_page, dioxus_page, leptos_page, proa_page, sailfish_page, yew_page};
use proa_core::stack::ChainedBumpWriter;

fn main() {
    let framework = std::env::args().nth(1).unwrap_or_else(|| {
        eprintln!(
            "usage: standard_page_dump \
             <proa|proa-reused|proa-raw|askama|sailfish|leptos|dioxus|yew>"
        );
        std::process::exit(2);
    });

    if framework == "proa-reused" {
        let mut buffer = ChainedBumpWriter::<{ 32 * 1024 }>::new();
        buffer.render_into(proa_page::SafeTextBenchmarkPage);
        let mut stdout = io::stdout().lock();
        for slice in buffer.slices() {
            stdout
                .write_all(slice)
                .expect("write reused-buffer benchmark HTML");
        }
        return;
    }

    if framework == "proa-raw" {
        let mut backing = [0_u8; 32 * 1024];
        let len = proa_page::render_raw_to_cursor(&mut backing)
            .expect("raw benchmark fixture fits in its benchmark buffer");
        io::stdout()
            .lock()
            .write_all(&backing[..len])
            .expect("write raw-baseline benchmark HTML");
        return;
    }

    let html = match framework.as_str() {
        "proa" => proa_page::render_safetext_owned(),
        "askama" => askama_page::render(),
        "sailfish" => sailfish_page::render(),
        "leptos" => leptos_page::render(),
        "dioxus" => dioxus_page::render(),
        "yew" => yew_page::render(),
        unknown => {
            eprintln!("unknown standard-page framework `{unknown}`");
            std::process::exit(2);
        }
    };

    io::stdout()
        .write_all(html.as_bytes())
        .expect("write benchmark HTML");
}
