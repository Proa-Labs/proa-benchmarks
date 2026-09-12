//! Render Proa's eBay listings inside the retained SRP capture shell so the
//! result can be opened in a browser.
//!
//! Run:
//!   cargo run --release -p proa_bench --bin ebay_srp_real_dump -- \
//!     --listings 60 --shell-dir /path/to/proa/proa_showcase/src/ebay/data \
//!     --out /tmp/srp-preview/proa-real.html

use std::env;
use std::fs;
use std::path::PathBuf;

use proa_bench::ebay_srp_real::{build_listings, render_listings_to_string};

fn main() {
    let mut listings_n: usize = 60;
    let mut out_path = PathBuf::from("/tmp/srp-preview/proa-real.html");
    let mut shell_dir: Option<PathBuf> = None;

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
            "--shell-dir" => {
                shell_dir = Some(PathBuf::from(
                    args.next().expect("--shell-dir requires value"),
                ))
            }
            other => panic!("unknown arg: {other}"),
        }
    }

    let shell_dir = shell_dir.unwrap_or_else(|| {
        eprintln!(
            "--shell-dir is required; point it at proa_showcase/src/ebay/data in a Proa checkout"
        );
        std::process::exit(2);
    });

    let pre = fs::read_to_string(shell_dir.join("shell_pre.html")).expect("read shell_pre.html");
    let post = fs::read_to_string(shell_dir.join("shell_post.html")).expect("read shell_post.html");
    let style =
        fs::read(shell_dir.join("srp_chrome_style.css")).expect("read srp_chrome_style.css");

    let listings = build_listings(listings_n);
    let listings_html = render_listings_to_string(&listings);
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).expect("create out dir");
        fs::write(parent.join("srp_chrome_style.css"), style).expect("write preview stylesheet");
    }

    let mut combined = String::with_capacity(pre.len() + listings_html.len() + post.len());
    combined.push_str(&pre);
    combined.push_str(&listings_html);
    combined.push_str(&post);

    fs::write(&out_path, &combined).expect("write html");
    println!("Wrote Proa eBay SRP to {}", out_path.display());
    println!("  cards rendered: {}", listings_n);
    println!("  listings bytes: {}", listings_html.len());
    println!("  total page bytes: {}", combined.len());
    println!();
    println!("Open with: open {}", out_path.display());
}
