//! Shared plumbing for the HTTP load-benchmark servers: process metrics and
//! the per-core runtime configuration every Proa server under test reports.

use serde_json::json;

/// Number of Tokio worker threads selected through `PROA_WORKER_THREADS`.
///
/// The load benchmarks compare engines per core, so the default is one
/// worker thread; the runner records the value each server reports.
pub fn worker_threads() -> Result<usize, String> {
    let value = std::env::var("PROA_WORKER_THREADS")
        .ok()
        .map(|value| value.parse::<usize>())
        .transpose()
        .map_err(|error| format!("invalid PROA_WORKER_THREADS: {error}"))?
        .unwrap_or(1);
    if value == 0 {
        return Err("PROA_WORKER_THREADS must be at least 1".to_owned());
    }
    Ok(value)
}

/// Exact process CPU time and peak RSS, read from `getrusage`.
pub fn process_metrics() -> serde_json::Value {
    let mut usage = std::mem::MaybeUninit::<libc::rusage>::uninit();
    // SAFETY: getrusage initializes the provided rusage on success. On
    // failure, the function returns a zeroed metric object instead of reading
    // the uninitialized value.
    let status = unsafe { libc::getrusage(libc::RUSAGE_SELF, usage.as_mut_ptr()) };
    if status != 0 {
        return json!({ "cpuTimeMicros": 0, "peakRssBytes": 0 });
    }
    // SAFETY: status == 0 means getrusage initialized the value.
    let usage = unsafe { usage.assume_init() };
    let user_micros = usage.ru_utime.tv_sec as u64 * 1_000_000 + usage.ru_utime.tv_usec as u64;
    let system_micros = usage.ru_stime.tv_sec as u64 * 1_000_000 + usage.ru_stime.tv_usec as u64;
    #[cfg(target_os = "macos")]
    let peak_rss_bytes = usage.ru_maxrss as u64;
    #[cfg(not(target_os = "macos"))]
    let peak_rss_bytes = usage.ru_maxrss as u64 * 1_024;
    json!({
        "cpuTimeMicros": user_micros + system_micros,
        "peakRssBytes": peak_rss_bytes,
    })
}

/// Bind address selected through `PROA_HOST`/`PORT` with the given default port.
pub fn bind_address(default_port: u16) -> Result<(String, u16), Box<dyn std::error::Error>> {
    let host = std::env::var("SUSPENSE_HOST")
        .or_else(|_| std::env::var("PROA_HOST"))
        .unwrap_or_else(|_| "127.0.0.1".to_owned());
    let port = std::env::var("PORT")
        .ok()
        .map(|value| value.parse::<u16>())
        .transpose()?
        .unwrap_or(default_port);
    Ok((host, port))
}
