//! Count heap activity for the byte-parity integer serialization workload.
//!
//! Latency alone cannot distinguish direct integer writes from hidden
//! temporary `String` creation. This companion audit measures fresh-owned and
//! warmed reusable output policies without putting allocator instrumentation
//! in the timed Criterion binary.

use std::alloc::{GlobalAlloc, Layout, System};
use std::hint::black_box;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use proa_bench::integer_serialization::{
    assert_parity, build_rows, render_askama_fresh, render_askama_reused, render_proa_fresh,
    render_proa_reused, render_sailfish_fresh, render_sailfish_reused,
};
use proa_core::WebContext;
use serde::Serialize;

struct CountingAllocator;

static COUNTING: AtomicBool = AtomicBool::new(false);
static ALLOCATIONS: AtomicU64 = AtomicU64::new(0);
static REALLOCATIONS: AtomicU64 = AtomicU64::new(0);
static ALLOCATED_BYTES: AtomicU64 = AtomicU64::new(0);

#[global_allocator]
static GLOBAL_ALLOCATOR: CountingAllocator = CountingAllocator;

unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if COUNTING.load(Ordering::Relaxed) {
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
            ALLOCATED_BYTES.fetch_add(layout.size() as u64, Ordering::Relaxed);
        }
        unsafe { System.alloc(layout) }
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        if COUNTING.load(Ordering::Relaxed) {
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
            ALLOCATED_BYTES.fetch_add(layout.size() as u64, Ordering::Relaxed);
        }
        unsafe { System.alloc_zeroed(layout) }
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        unsafe { System.dealloc(pointer, layout) }
    }

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        if COUNTING.load(Ordering::Relaxed) {
            REALLOCATIONS.fetch_add(1, Ordering::Relaxed);
            ALLOCATED_BYTES.fetch_add(new_size as u64, Ordering::Relaxed);
        }
        unsafe { System.realloc(pointer, layout, new_size) }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
struct Counts {
    allocations: u64,
    reallocations: u64,
    allocated_bytes: u64,
}

#[derive(Serialize)]
struct AuditReport {
    schema_version: u32,
    rows: usize,
    output_bytes: usize,
    trials: usize,
    cells: Vec<CellReport>,
}

#[derive(Serialize)]
struct CellReport {
    engine: &'static str,
    ownership: &'static str,
    raw: Vec<Counts>,
    median: Counts,
    min: Counts,
    max: Counts,
}

fn measure<T>(operation: impl FnOnce() -> T) -> (T, Counts) {
    ALLOCATIONS.store(0, Ordering::Relaxed);
    REALLOCATIONS.store(0, Ordering::Relaxed);
    ALLOCATED_BYTES.store(0, Ordering::Relaxed);
    assert!(!COUNTING.swap(true, Ordering::SeqCst));
    let output = operation();
    COUNTING.store(false, Ordering::SeqCst);
    let counts = Counts {
        allocations: ALLOCATIONS.load(Ordering::Relaxed),
        reallocations: REALLOCATIONS.load(Ordering::Relaxed),
        allocated_bytes: ALLOCATED_BYTES.load(Ordering::Relaxed),
    };
    (output, counts)
}

fn summarize(engine: &'static str, ownership: &'static str, raw: Vec<Counts>) -> CellReport {
    let mut allocations: Vec<_> = raw.iter().map(|sample| sample.allocations).collect();
    let mut reallocations: Vec<_> = raw.iter().map(|sample| sample.reallocations).collect();
    let mut bytes: Vec<_> = raw.iter().map(|sample| sample.allocated_bytes).collect();
    allocations.sort_unstable();
    reallocations.sort_unstable();
    bytes.sort_unstable();
    let middle = raw.len() / 2;
    CellReport {
        engine,
        ownership,
        raw,
        median: Counts {
            allocations: allocations[middle],
            reallocations: reallocations[middle],
            allocated_bytes: bytes[middle],
        },
        min: Counts {
            allocations: allocations[0],
            reallocations: reallocations[0],
            allocated_bytes: bytes[0],
        },
        max: Counts {
            allocations: allocations[allocations.len() - 1],
            reallocations: reallocations[reallocations.len() - 1],
            allocated_bytes: bytes[bytes.len() - 1],
        },
    }
}

fn main() {
    let mut rows = 1_000;
    let mut trials = 25;
    let mut output_path = None;
    let args: Vec<_> = std::env::args().skip(1).collect();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--rows" => rows = parse_value(&args, &mut index, "--rows"),
            "--trials" => trials = parse_value(&args, &mut index, "--trials"),
            "--out" => {
                index += 1;
                output_path = Some(PathBuf::from(
                    args.get(index)
                        .unwrap_or_else(|| usage("--out requires a path")),
                ));
            }
            argument => usage(&format!("unknown argument: {argument}")),
        }
        index += 1;
    }
    if trials == 0 {
        usage("--trials must be greater than zero");
    }

    let dataset = build_rows(rows);
    let output_bytes = assert_parity(&dataset);
    let mut cells = Vec::new();

    let mut raw = Vec::with_capacity(trials);
    for _ in 0..trials {
        let (output, counts) = measure(|| render_proa_fresh(black_box(&dataset)));
        assert_eq!(output.len(), output_bytes);
        raw.push(counts);
    }
    cells.push(summarize("proa", "fresh-owned", raw));

    let mut raw = Vec::with_capacity(trials);
    for _ in 0..trials {
        let (output, counts) = measure(|| render_askama_fresh(black_box(&dataset)));
        assert_eq!(output.len(), output_bytes);
        raw.push(counts);
    }
    cells.push(summarize("askama", "fresh-owned", raw));

    let mut raw = Vec::with_capacity(trials);
    for _ in 0..trials {
        let (output, counts) = measure(|| render_sailfish_fresh(black_box(&dataset)));
        assert_eq!(output.len(), output_bytes);
        raw.push(counts);
    }
    cells.push(summarize("sailfish", "fresh-owned", raw));

    let mut proa_context = WebContext::with_buffer(Vec::with_capacity(output_bytes));
    render_proa_reused(&dataset, &mut proa_context);
    let mut raw = Vec::with_capacity(trials);
    for _ in 0..trials {
        let (_, counts) = measure(|| render_proa_reused(black_box(&dataset), &mut proa_context));
        assert_eq!(proa_context.out.len(), output_bytes);
        raw.push(counts);
    }
    cells.push(summarize("proa", "reused-contiguous", raw));

    let mut askama_output = String::with_capacity(output_bytes);
    render_askama_reused(&dataset, &mut askama_output);
    let mut raw = Vec::with_capacity(trials);
    for _ in 0..trials {
        let (_, counts) = measure(|| render_askama_reused(black_box(&dataset), &mut askama_output));
        assert_eq!(askama_output.len(), output_bytes);
        raw.push(counts);
    }
    cells.push(summarize("askama", "reused-contiguous", raw));

    let mut sailfish_output = sailfish::runtime::Buffer::with_capacity(output_bytes);
    render_sailfish_reused(&dataset, &mut sailfish_output);
    let mut raw = Vec::with_capacity(trials);
    for _ in 0..trials {
        let (_, counts) =
            measure(|| render_sailfish_reused(black_box(&dataset), &mut sailfish_output));
        assert_eq!(sailfish_output.len(), output_bytes);
        raw.push(counts);
    }
    cells.push(summarize("sailfish", "reused-contiguous", raw));

    let report = AuditReport {
        schema_version: 1,
        rows,
        output_bytes,
        trials,
        cells,
    };
    let json = serde_json::to_string_pretty(&report).expect("allocation report should serialize");
    if let Some(path) = output_path {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create allocation report directory");
        }
        std::fs::write(&path, format!("{json}\n")).expect("write allocation report");
        println!("{}", path.display());
    } else {
        println!("{json}");
    }
}

fn parse_value(args: &[String], index: &mut usize, name: &str) -> usize {
    *index += 1;
    args.get(*index)
        .unwrap_or_else(|| usage(&format!("{name} requires a value")))
        .parse()
        .unwrap_or_else(|_| usage(&format!("{name} requires a non-negative integer")))
}

fn usage(message: &str) -> ! {
    eprintln!("{message}");
    eprintln!("usage: integer_allocation_audit [--rows N] [--trials N] [--out PATH]");
    std::process::exit(2);
}
