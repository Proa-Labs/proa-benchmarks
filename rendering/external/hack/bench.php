#!/usr/bin/env php
<?php
/**
 * PHP fallback for the Hack/XHP benchmark.
 *
 * Renders the same page structure as the Rust benchmarks:
 * 4 sections × 8 cards × 5 list items ≈ 25KB HTML
 *
 * Run with: php bench.php
 *
 * This serves as a proxy for Hack/HHVM performance. HHVM's JIT compiler
 * typically runs 2-5x faster than PHP 8 on template rendering workloads.
 */

const NUM_SECTIONS = 4;
const CARDS_PER_SECTION = 8;
const ITEMS_PER_CARD = 5;

function get_section_title(int $idx): string {
    return match ($idx) {
        0 => "Performance Metrics",
        1 => "Rendering Speed",
        2 => "Memory Efficiency",
        default => "Framework Comparison",
    };
}

function get_card_title(int $idx): string {
    return match ($idx % 4) {
        0 => "Latency Analysis",
        1 => "Throughput Metrics",
        2 => "Memory Usage",
        default => "CPU Utilization",
    };
}

function get_feature(int $idx): string {
    return match ($idx) {
        0 => "Sub-millisecond response times",
        1 => "Zero-copy rendering pipeline",
        2 => "SIMD-accelerated escaping",
        3 => "Pre-allocated buffers",
        default => "Minimal heap allocations",
    };
}

function render_page(): string {
    $out = '<html lang="en">';
    $out .= '<head>';
    $out .= '<title>SSR Benchmark Page</title>';
    $out .= '<meta name="viewport" content="width=device-width, initial-scale=1">';
    $out .= '</head>';
    $out .= '<body>';
    $out .= '<header class="hero-section">';
    $out .= '<h1 class="title">SSR Framework Benchmark</h1>';
    $out .= '<p class="subtitle">Comparing SSR frameworks</p>';
    $out .= '</header>';
    $out .= '<main class="main-content">';

    for ($s = 0; $s < NUM_SECTIONS; $s++) {
        $section_class = $s % 2 === 0 ? 'even' : 'odd';
        $title = get_section_title($s);
        $out .= '<section class="card-section" data-section="' . $section_class . '">';
        $out .= '<h2 class="section-title">' . htmlspecialchars($title) . '</h2>';
        $out .= '<div class="card-grid">';

        for ($c = 0; $c < CARDS_PER_SECTION; $c++) {
            $card_class = $c % 2 === 0 ? 'even' : 'odd';
            $card_title = get_card_title($c);
            $out .= '<article class="card" data-card-id="' . $card_class . '">';
            $out .= '<div class="card-header">';
            $out .= '<img src="/images/benchmark.png" alt="Benchmark chart" class="card-image">';
            $out .= '</div>';
            $out .= '<div class="card-body">';
            $out .= '<h3 class="card-title">' . htmlspecialchars($card_title) . '</h3>';
            $out .= '<p class="card-description">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>';
            $out .= '<ul class="feature-list">';

            for ($i = 0; $i < ITEMS_PER_CARD; $i++) {
                $feature = get_feature($i);
                $out .= '<li class="feature-item">' . htmlspecialchars($feature) . '</li>';
            }

            $out .= '</ul>';
            $out .= '<button class="btn-primary" type="button">View Details</button>';
            $out .= '</div>';
            $out .= '</article>';
        }

        $out .= '</div>';
        $out .= '</section>';
    }

    $out .= '</main>';
    $out .= '<footer class="footer"><p>Rendered with PHP</p></footer>';
    $out .= '</body></html>';
    return $out;
}

// Warmup
$html = render_page();
echo "Output size: " . strlen($html) . " bytes\n";
echo "First 200 chars: " . substr($html, 0, 200) . "\n\n";

// Precise latency measurement
$iterations = 10000;

// Warmup
for ($i = 0; $i < 100; $i++) {
    render_page();
}

$start = hrtime(true);
for ($i = 0; $i < $iterations; $i++) {
    render_page();
}
$elapsed_ns = hrtime(true) - $start;
$avg_us = $elapsed_ns / $iterations / 1000.0;

echo "=== PHP Latency ===\n";
echo "  Iterations: $iterations\n";
echo "  Total: " . round($elapsed_ns / 1000000, 2) . " ms\n";
echo "  Average: " . round($avg_us, 2) . " µs/render\n\n";

// JSON output
$result = [
    'framework' => 'PHP',
    'language' => 'PHP',
    'latency_us' => round($avg_us, 2),
    'output_bytes' => strlen($html),
    'iterations' => $iterations,
    'timestamp' => date('c'),
];

$results_dir = __DIR__ . '/../../results';
file_put_contents($results_dir . '/php.json', json_encode($result, JSON_PRETTY_PRINT));
echo "Results written to results/php.json\n";
