use std::hint::black_box;
use std::time::Instant;

const BYTES_PER_SAMPLE: usize = 16 * 1024 * 1024;

fn operations(output_bytes: usize) -> usize {
    assert!(output_bytes > 0, "memcpy source must not be empty");
    BYTES_PER_SAMPLE.div_ceil(output_bytes)
}

#[inline(always)]
fn copy_once(source: &[u8], destination: &mut [u8]) {
    assert_eq!(source.len(), destination.len());
    // SAFETY: the slices occupy distinct live allocations of the same length.
    // Black-box barriers make every copy observable, including repeated copies
    // within a timing batch. Allocation and verification are outside timing.
    unsafe {
        std::ptr::copy_nonoverlapping(
            black_box(source.as_ptr()),
            black_box(destination.as_mut_ptr()),
            source.len(),
        );
    }
    black_box(&mut *destination);
}

pub fn samples(source: &[u8], warmup: usize, iterations: usize) -> (usize, Vec<u64>) {
    let count = operations(source.len());
    let mut destination = vec![0_u8; source.len()];
    let mut raw_ns = Vec::with_capacity(iterations);
    for _ in 0..warmup {
        for _ in 0..count {
            copy_once(source, &mut destination);
        }
    }
    for _ in 0..iterations {
        let started = Instant::now();
        for _ in 0..count {
            copy_once(source, &mut destination);
        }
        raw_ns.push(started.elapsed().as_nanos() as u64);
    }
    assert_eq!(source, destination, "memcpy changed the response bytes");
    (count, raw_ns)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batches_cover_at_least_sixteen_mib() {
        for size in [1, 8_193, 33_618, 149_339, 875_334, BYTES_PER_SAMPLE + 1] {
            let count = operations(size);
            assert!(count * size >= BYTES_PER_SAMPLE);
            assert!((count - 1) * size < BYTES_PER_SAMPLE);
        }
    }

    #[test]
    fn copy_preserves_every_byte_including_the_tail() {
        let source: Vec<u8> = (0..=255).cycle().take(8_193).collect();
        let mut destination = vec![0; source.len()];
        copy_once(&source, &mut destination);
        assert_eq!(source, destination);
    }

    #[test]
    fn samples_retain_elapsed_batch_times() {
        let (count, times) = samples(&vec![17; 8_193], 1, 2);
        assert_eq!(count, operations(8_193));
        assert_eq!(times.len(), 2);
        assert!(times.iter().all(|&ns| ns > 0));
    }
}
