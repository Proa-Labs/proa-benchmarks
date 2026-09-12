use proa_core::{RenderBuffer, WebContext, WriteBuf, WriteError};
use proa_showcase::{airbnb, nike, sentry_otel};
use sha2::{Digest, Sha256};
use std::{hint::black_box, time::Instant};

include!(env!("CANONICAL_JSON_HELPER"));
#[path = "../../fixtures/airbnb-parity-dump/src/memcpy.rs"]
mod memcpy;

struct InlineWriter<B>(B);
impl<B: WriteBuf> WriteBuf for InlineWriter<B> {
    #[inline(always)]
    fn capacity(&self) -> usize {
        self.0.capacity()
    }
    #[inline(always)]
    fn len(&self) -> usize {
        self.0.len()
    }
    #[inline(always)]
    fn reserve(&mut self, n: usize) -> Result<(), WriteError> {
        self.0.reserve(n)
    }
    #[inline(always)]
    fn extend(&mut self, bytes: &[u8]) -> Result<(), WriteError> {
        self.0.extend(bytes)
    }
    #[inline(always)]
    fn extend_static(&mut self, bytes: &'static [u8]) -> Result<(), WriteError> {
        self.0.extend(bytes)
    }
    #[inline(always)]
    fn push(&mut self, byte: u8) -> Result<(), WriteError> {
        self.0.push(byte)
    }
    #[inline(always)]
    fn extend_with<F: FnOnce(&mut [u8]) -> usize>(
        &mut self,
        n: usize,
        f: F,
    ) -> Result<(), WriteError> {
        self.0.extend_with(n, f)
    }
    #[inline(always)]
    fn as_slice(&self) -> &[u8] {
        self.0.as_slice()
    }
    fn to_vec(&self) -> Vec<u8> {
        self.0.to_vec()
    }
    fn clear(&mut self) {
        self.0.clear();
    }
}

fn baseline(page: &str) -> String {
    match page {
        "airbnb-listing" => airbnb::listing::render(),
        "nike-catalog" => nike::catalog::render(),
        "sentry-otel" => sentry_otel::render(),
        _ => panic!("unknown page"),
    }
}

fn body<B: WriteBuf>(page: &str, output: &mut B) -> Vec<u8> {
    let mut cx = WebContext::with_buffer(output);
    match page {
        "airbnb-listing" => {
            let data = airbnb::listing::ListingData::malibu();
            let islands = airbnb::listing::build_islands(&data);
            airbnb::listing::render_into(&mut cx, &data, Some(&islands)).unwrap();
        }
        "nike-catalog" => nike::catalog::render_into(&mut cx, &nike::catalog::default_data()),
        "sentry-otel" => sentry_otel::render_into(&mut cx, sentry_otel::DEFAULT_ROW_COUNT).unwrap(),
        _ => panic!("unknown page"),
    }
    let mut tags = Vec::new();
    if page == "sentry-otel" {
        let artifacts = cx.rsjs_artifacts_snapshot();
        let nonce = cx.csp_nonce_cloned();
        rsjs::manifest()
            .page_runtime_plan(artifacts.rendered_islands())
            .unwrap()
            .write_html(&mut tags, nonce.as_ref())
            .unwrap();
    }
    tags
}

fn typed_string(output: Vec<u8>) -> String {
    debug_assert!(std::str::from_utf8(&output).is_ok());
    // SAFETY: the same typed HTML renderers used by the response owners only
    // emit UTF-8 strings and ASCII markup, matching RenderBuffer::into_string.
    unsafe { String::from_utf8_unchecked(output) }
}

fn render(page: &str, mode: &str, size: usize) -> String {
    let (mut html, tags) = match mode {
        "default" => return baseline(page),
        "full" => {
            let mut out = Vec::with_capacity(size);
            let tags = body(page, &mut out);
            (typed_string(out), tags)
        }
        "inline-full" => {
            let mut out = InlineWriter(Vec::with_capacity(size));
            let tags = body(page, &mut out);
            (typed_string(out.0), tags)
        }
        "inline-chunks" => {
            let mut out = InlineWriter(RenderBuffer::new());
            let tags = body(page, &mut out);
            (out.0.into_string(), tags)
        }
        _ => panic!("unknown mode"),
    };
    if !tags.is_empty() {
        const END: &str = "</body></html>";
        html.truncate(html.strip_suffix(END).unwrap().len());
        html.push_str(std::str::from_utf8(&tags).unwrap());
        html.push_str(END);
    }
    html
}

fn main() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    assert_eq!(args.len(), 4, "PAGE MODE WARMUP ITERATIONS");
    let (page, mode) = (&args[0], &args[1]);
    let warmup: usize = args[2].parse().unwrap();
    let iterations: usize = args[3].parse().unwrap();
    let reference = baseline(page);
    let output_bytes = reference.len();
    let canonical_output_sha256 = canonical_document_sha256(&reference);
    let (operations_per_sample, raw_ns) = if mode == "memcpy" {
        memcpy::samples(reference.as_bytes(), warmup, iterations)
    } else {
        let probe = render(page, mode, output_bytes);
        assert_eq!(canonical_document_sha256(&probe), canonical_output_sha256);
        assert_eq!(probe.len(), output_bytes);
        if mode.ends_with("full") {
            assert_eq!(probe.capacity(), output_bytes);
        }
        drop(probe);
        drop(reference);
        for _ in 0..warmup {
            black_box(render(page, mode, black_box(output_bytes)));
        }
        let mut samples = Vec::with_capacity(iterations);
        for _ in 0..iterations {
            let start = Instant::now();
            let html = render(page, mode, black_box(output_bytes));
            black_box(&html);
            let elapsed = start.elapsed().as_nanos() as u64;
            assert_eq!(html.len(), output_bytes);
            if mode.ends_with("full") {
                assert_eq!(html.capacity(), output_bytes);
            }
            samples.push(elapsed);
            drop(html);
        }
        (1, samples)
    };
    let mut sorted = raw_ns.clone();
    sorted.sort_unstable();
    let p50_us = sorted[iterations.div_ceil(2) - 1] as f64 / 1000.0 / operations_per_sample as f64;
    println!(
        "{}",
        serde_json::json!({"page":page,"mode":mode,"warmup":warmup,"iterations":iterations,
        "output_bytes":output_bytes,"canonical_output_sha256":canonical_output_sha256,
        "parity_pass":true,"exact_capacity_pass":mode.ends_with("full").then_some(true),
        "operations_per_sample":operations_per_sample,"p50_us":p50_us,"raw_ns":raw_ns})
    );
}
