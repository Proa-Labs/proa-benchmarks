#!/usr/bin/env hhvm
<?hh // strict
/**
 * Hack/XHP SSR Benchmark
 *
 * Renders the same page structure as the Rust benchmarks:
 * 4 sections × 8 cards × 5 list items ≈ 25KB HTML
 *
 * Requires HHVM with XHP support.
 * Install: https://docs.hhvm.com/hhvm/installation/introduction
 *
 * NOTE: This benchmark requires HHVM runtime. If HHVM is not available,
 * you can use the PHP fallback (bench.php) which runs on standard PHP 8.x.
 */

const int NUM_SECTIONS = 4;
const int CARDS_PER_SECTION = 8;
const int ITEMS_PER_CARD = 5;

function get_section_title(int $idx): string {
  switch ($idx) {
    case 0: return "Performance Metrics";
    case 1: return "Rendering Speed";
    case 2: return "Memory Efficiency";
    default: return "Framework Comparison";
  }
}

function get_card_title(int $idx): string {
  switch ($idx % 4) {
    case 0: return "Latency Analysis";
    case 1: return "Throughput Metrics";
    case 2: return "Memory Usage";
    default: return "CPU Utilization";
  }
}

function get_feature(int $idx): string {
  switch ($idx) {
    case 0: return "Sub-millisecond response times";
    case 1: return "Zero-copy rendering pipeline";
    case 2: return "SIMD-accelerated escaping";
    case 3: return "Pre-allocated buffers";
    default: return "Minimal heap allocations";
  }
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
    $out .= '<section class="card-section" data-section="'.$section_class.'">';
    $out .= '<h2 class="section-title">'.htmlspecialchars($title).'</h2>';
    $out .= '<div class="card-grid">';

    for ($c = 0; $c < CARDS_PER_SECTION; $c++) {
      $card_class = $c % 2 === 0 ? 'even' : 'odd';
      $card_title = get_card_title($c);
      $out .= '<article class="card" data-card-id="'.$card_class.'">';
      $out .= '<div class="card-header">';
      $out .= '<img src="/images/benchmark.png" alt="Benchmark chart" class="card-image">';
      $out .= '</div>';
      $out .= '<div class="card-body">';
      $out .= '<h3 class="card-title">'.htmlspecialchars($card_title).'</h3>';
      $out .= '<p class="card-description">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>';
      $out .= '<ul class="feature-list">';

      for ($i = 0; $i < ITEMS_PER_CARD; $i++) {
        $feature = get_feature($i);
        $out .= '<li class="feature-item">'.htmlspecialchars($feature).'</li>';
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
  $out .= '<footer class="footer"><p>Rendered with Hack</p></footer>';
  $out .= '</body></html>';
  return $out;
}

<<__EntryPoint>>
function main(): void {
  // Warmup
  $html = render_page();
  echo "Output size: ".strlen($html)." bytes\n";
  echo "First 200 chars: ".substr($html, 0, 200)."\n\n";

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

  echo "=== Hack/HHVM Latency ===\n";
  echo "  Iterations: $iterations\n";
  echo "  Total: ".round($elapsed_ns / 1000000, 2)." ms\n";
  echo "  Average: ".round($avg_us, 2)." µs/render\n\n";

  // JSON output
  $result = dict[
    'framework' => 'Hack (HHVM)',
    'language' => 'Hack',
    'latency_us' => round($avg_us, 2),
    'output_bytes' => strlen($html),
    'iterations' => $iterations,
    'timestamp' => date('c'),
  ];

  $results_dir = __DIR__.'/../../results';
  file_put_contents($results_dir.'/hack.json', json_encode($result, JSON_PRETTY_PRINT));
  echo "Results written to results/hack.json\n";
}
