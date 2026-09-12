//! Dump the Proa SRP render to an HTML file with Tailwind CDN injected
//! so it's viewable in a browser.
//!
//! Run:
//!   cargo run --release -p proa_bench --bin ebay_srp_dump -- --out /tmp/srp-preview/proa.html

use std::env;
use std::fs;
use std::path::PathBuf;

use proa_bench::ebay_srp_page::{build_listings, render_to_string};

const NOW_UNIX: i64 = 1_730_100_000;

fn main() {
    let mut listings_n: usize = 60;
    let mut out_path = PathBuf::from("/tmp/srp-preview/proa.html");
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--listings" => {
                listings_n = args
                    .next()
                    .expect("--listings requires value")
                    .parse()
                    .unwrap()
            }
            "--out" => out_path = PathBuf::from(args.next().expect("--out requires value")),
            other => panic!("unknown arg: {other}"),
        }
    }

    let listings = build_listings(listings_n);
    let body_html = render_to_string("iphone", 32_062, &listings, NOW_UNIX);

    // Inject Tailwind CDN + a CSS shim that turns img src=numeric_id into a
    // visible placeholder block (real eBay images live behind /images/...).
    let with_styles = body_html.replacen(
        "<head>",
        r#"<head>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  /* Fall back to a colored block for the synthetic image-id "src" values. */
  img[src][src*="1"], img[src][src*="2"], img[src][src*="3"], img[src][src*="4"], img[src][src*="5"], img[src][src*="6"], img[src][src*="7"], img[src][src*="8"], img[src][src*="9"], img[src][src*="0"] {
    background: linear-gradient(135deg, #e5e7eb 25%, #d1d5db 25%, #d1d5db 50%, #e5e7eb 50%, #e5e7eb 75%, #d1d5db 75%);
    background-size: 24px 24px;
  }
  .line-clamp-2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
</style>"#,
        1,
    );

    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).expect("create dir");
    }
    fs::write(&out_path, with_styles).expect("write html");
    println!("Wrote Proa SRP preview to {}", out_path.display());
    println!("Open with: open {}", out_path.display());
}
