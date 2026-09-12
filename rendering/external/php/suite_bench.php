#!/usr/bin/env php
<?php
declare(strict_types=1);

const TABLE_ROW_COUNT = 1000;
$productCountRaw = getenv('PROA_BENCH_PRODUCT_COUNT');
$productCount = filter_var($productCountRaw === false ? '96' : $productCountRaw, FILTER_VALIDATE_INT);
if ($productCount === false || $productCount < 1) {
    throw new InvalidArgumentException('PROA_BENCH_PRODUCT_COUNT must be a positive integer');
}
define('PRODUCT_COUNT', $productCount);
unset($productCountRaw, $productCount);
const STAR_PATH = 'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.363-1.118l-2.8-2.034c-.784-.57-.381-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z';

const STATUS_CLASSES = [
    'Active' => 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-green-100 text-green-800 border-green-300',
    'Pending' => 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-yellow-100 text-yellow-800 border-yellow-300',
    'Disabled' => 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-gray-100 text-gray-700 border-gray-300',
    'Cancelled' => 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-red-100 text-red-800 border-red-300',
    'Refunded' => 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-purple-100 text-purple-800 border-purple-300',
];

function escaped(string|int $value): string
{
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function build_sections(): array
{
    $sectionTitles = ['Performance Metrics', 'Rendering Speed', 'Memory Efficiency', 'Framework Comparison'];
    $cardTitles = ['Latency Analysis', 'Throughput Metrics', 'Memory Usage', 'CPU Utilization'];
    $features = ['Sub-millisecond response times', 'Zero-copy rendering pipeline', 'SIMD-accelerated escaping', 'Pre-allocated buffers', 'Minimal heap allocations'];
    $sections = [];
    for ($sectionIndex = 0; $sectionIndex < 4; $sectionIndex++) {
        $cards = [];
        for ($cardIndex = 0; $cardIndex < 8; $cardIndex++) {
            $cards[] = [
                'data_card_id' => $cardIndex % 2 === 0 ? 'even' : 'odd',
                'title' => $cardTitles[$cardIndex % count($cardTitles)],
                'features' => $features,
            ];
        }
        $sections[] = [
            'data_section' => $sectionIndex % 2 === 0 ? 'even' : 'odd',
            'title' => $sectionTitles[$sectionIndex],
            'cards' => $cards,
        ];
    }
    return $sections;
}

function build_rows(): array
{
    $names = ['Alice <admin>', 'Bob & Charlie', 'Dana "the boss" Lin', "Eve O'Brien", 'Frank > Smith', 'Grace Hopper & Co.', 'Heidi <script>', 'Ivan & Sons', 'Judy Q. "Public"', 'Karl <tag>', 'Liu & Wang', 'Mallory >&<', 'Niaj <user>', 'Olivia & Co.', "Peggy 'Quote'", 'Quinn & Sons'];
    $emails = ['alice+filter@example.com', 'bob&charlie@example.com', 'dana@example.org', 'eve@example.io', 'frank>smith@example.net', 'grace@hopper.dev', 'heidi@example.com', 'ivan&sons@example.co', 'judy@public.gov', 'karl@example.com', 'liu@wang.cn', 'mallory@evil.example', 'niaj@example.bd', 'olivia@co.example', 'peggy@quoted.example', 'quinn@example.io'];
    $statuses = ['Active', 'Pending', 'Disabled', 'Cancelled', 'Refunded'];
    $countries = ['USA', 'CAN', 'GBR', 'DEU', 'FRA', 'JPN', 'AUS', 'BRA'];
    $tagSets = [['new', 'priority'], ['enterprise', 'vip'], ['trial'], ['enterprise', 'vip', 'priority'], ['churn-risk'], ['new'], ['priority', 'review'], ['vip']];
    $rows = [];
    for ($index = 0; $index < TABLE_ROW_COUNT; $index++) {
        $amount = 12345 + ($index * 137) % 99999;
        $rows[] = [
            'id' => 100000 + $index,
            'name' => $names[$index % count($names)],
            'email' => $emails[$index % count($emails)],
            'status' => $statuses[$index % count($statuses)],
            'amount_cents' => $amount,
            'tax_cents' => intdiv($amount * 8, 100),
            'created_unix' => 1700000000 + $index * 86400,
            'updated_unix' => 1710000000 + $index * 3600,
            'score_bps' => 5000 + ($index * 31) % 5000,
            'country' => $countries[$index % count($countries)],
            'tags' => $tagSets[$index % count($tagSets)],
        ];
    }
    return $rows;
}

function build_products(): array
{
    $categories = ['Audio', 'Displays', 'Wearables'];
    $products = [];
    for ($index = 0; $index < PRODUCT_COUNT; $index++) {
        $products[] = [
            'id' => 1000 + $index,
            'name' => 'Meridian "Model ' . $index . '" & Co.',
            'category' => $categories[$index % count($categories)],
            'price_cents' => 1999 + ($index % 40) * 500,
            'rating_tenths' => 30 + $index % 20,
            'review_count' => 3 + ($index * 7) % 400,
        ];
    }
    return $products;
}

function currency(int $cents): string
{
    $sign = $cents < 0 ? '-' : '';
    $absolute = abs($cents);
    return sprintf('%s$%s.%02d', $sign, number_format(intdiv($absolute, 100), 0, '.', ','), $absolute % 100);
}

function render_cards(array $sections): string
{
    $out = '<html lang="en"><head><title>SSR Benchmark Page</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><header class="hero-section"><h1 class="title">SSR Framework Benchmark</h1><p class="subtitle">Comparing Proa, Leptos, Dioxus, and Yew</p></header><main class="main-content">';
    foreach ($sections as $section) {
        $out .= '<section class="card-section" data-section="' . escaped($section['data_section']) . '"><h2 class="section-title">' . escaped($section['title']) . '</h2><div class="card-grid">';
        foreach ($section['cards'] as $card) {
            $out .= '<article class="card" data-card-id="' . escaped($card['data_card_id']) . '"><div class="card-header"><img src="/images/benchmark.png" alt="Benchmark chart" class="card-image"></div><div class="card-body"><h3 class="card-title">' . escaped($card['title']) . '</h3><p class="card-description">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p><ul class="feature-list">';
            foreach ($card['features'] as $feature) {
                $out .= '<li class="feature-item">' . escaped($feature) . '</li>';
            }
            $out .= '</ul><button class="btn-primary" type="button">View Details</button></div></article>';
        }
        $out .= '</div></section>';
    }
    return $out . '</main><footer class="footer"><p>Rendered by the SSR benchmark fixture</p></footer></body></html>';
}

function render_table(array $rows): string
{
    $out = '<html lang="en"><head><title>Customer Data Table</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="bg-gray-50 text-gray-900"><header class="px-6 py-4 border-b"><h1 class="text-xl font-semibold">Customer Accounts</h1><p class="text-sm text-gray-600">Live revenue and account status across all regions.</p></header><main class="p-6"><table class="min-w-full text-sm border-collapse"><thead class="bg-gray-100"><tr><th class="px-3 py-2 text-left">ID</th><th class="px-3 py-2 text-left">Name</th><th class="px-3 py-2 text-left">Email</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-right">Amount</th><th class="px-3 py-2 text-right">Tax</th><th class="px-3 py-2 text-right">Total</th><th class="px-3 py-2 text-left">Created</th><th class="px-3 py-2 text-left">Updated</th><th class="px-3 py-2 text-right">Score</th><th class="px-3 py-2 text-left">Country</th><th class="px-3 py-2 text-left">Tags</th></tr></thead><tbody>';
    foreach ($rows as $index => $row) {
        $out .= '<tr class="' . ($index % 2 === 0 ? 'bg-white' : 'bg-gray-50') . '" data-row-id="' . $row['id'] . '"><td class="px-3 py-2 font-mono text-gray-500">' . $row['id'] . '</td><td class="px-3 py-2">' . escaped($row['name']) . '</td><td class="px-3 py-2 text-blue-700">' . escaped($row['email']) . '</td><td class="px-3 py-2"><span class="' . STATUS_CLASSES[$row['status']] . '">' . $row['status'] . '</span></td><td class="px-3 py-2 text-right font-mono">' . currency($row['amount_cents']) . '</td><td class="px-3 py-2 text-right font-mono text-gray-500">' . currency($row['tax_cents']) . '</td><td class="px-3 py-2 text-right font-mono font-semibold">' . currency($row['amount_cents'] + $row['tax_cents']) . '</td><td class="px-3 py-2 text-gray-600">' . gmdate('Y-m-d', $row['created_unix']) . '</td><td class="px-3 py-2 text-gray-600">' . gmdate('Y-m-d H:i', $row['updated_unix']) . '</td><td class="px-3 py-2 text-right font-mono">' . intdiv($row['score_bps'], 100) . '.' . intdiv($row['score_bps'] % 100, 10) . '%</td><td class="px-3 py-2">' . $row['country'] . '</td><td class="px-3 py-2">';
        foreach ($row['tags'] as $tag) {
            $out .= '<span class="inline-block px-2 py-0.5 mr-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">' . escaped($tag) . '</span>';
        }
        $out .= '</td></tr>';
    }
    return $out . '</tbody></table></main></body></html>';
}

function render_products(array $products): string
{
    $out = '<main class="mx-auto w-full max-w-6xl px-4 py-10"><h1 class="text-2xl font-bold tracking-tight">All products</h1><div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">';
    foreach ($products as $product) {
        $out .= '<a href="/products/' . $product['id'] . '" class="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"><div class="mb-4 flex h-32 items-center justify-center rounded-lg bg-slate-100 text-3xl font-bold text-slate-300">' . escaped($product['category']) . '</div><p class="text-xs font-medium uppercase tracking-wide text-slate-400">' . escaped($product['category']) . '</p><h3 class="mt-1 text-sm font-semibold text-slate-900 group-hover:text-indigo-600">' . escaped($product['name']) . '</h3><div class="mt-2 flex items-center gap-1"><div class="flex">';
        $filled = intdiv($product['rating_tenths'] + 5, 10);
        for ($index = 0; $index < 5; $index++) {
            $className = $index < $filled ? 'h-4 w-4 text-amber-400' : 'h-4 w-4 text-slate-200';
            $out .= '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="' . $className . '"><path d="' . STAR_PATH . '"></path></svg>';
        }
        $out .= '</div><span class="text-xs text-slate-500">' . intdiv($product['rating_tenths'], 10) . '.' . ($product['rating_tenths'] % 10) . ' (' . $product['review_count'] . ')</span></div><p class="mt-3 text-lg font-bold">$' . intdiv($product['price_cents'], 100) . '.' . sprintf('%02d', $product['price_cents'] % 100) . '</p></a>';
    }
    return $out . '</div></main>';
}

function percentile(array $sorted, float $percent): float
{
    $rank = $percent / 100 * (count($sorted) - 1);
    $lower = (int)floor($rank);
    $upper = (int)ceil($rank);
    if ($lower === $upper) {
        return $sorted[$lower];
    }
    return $sorted[$lower] + ($sorted[$upper] - $sorted[$lower]) * ($rank - $lower);
}

$options = getopt('', ['workload:', 'iterations:', 'warmup:', 'out:', 'dump:', 'dump-only']);
$workload = $options['workload'] ?? '';
$defaults = ['cards' => [2000, 200, 32], 'table' => [200, 20, TABLE_ROW_COUNT], 'products' => [500, 50, PRODUCT_COUNT]];
if (!array_key_exists($workload, $defaults)) {
    fwrite(STDERR, "--workload must be cards, table, or products\n");
    exit(2);
}
[$defaultIterations, $defaultWarmup, $cardinality] = $defaults[$workload];
$iterations = isset($options['iterations']) ? (int)$options['iterations'] : $defaultIterations;
$warmup = isset($options['warmup']) ? (int)$options['warmup'] : $defaultWarmup;
if ($iterations < 1 || $warmup < 0) {
    fwrite(STDERR, "iterations must be positive and warmup non-negative\n");
    exit(2);
}

$input = match ($workload) {
    'cards' => build_sections(),
    'table' => build_rows(),
    'products' => build_products(),
};
$render = match ($workload) {
    'cards' => fn(): string => render_cards($input),
    'table' => fn(): string => render_table($input),
    'products' => fn(): string => render_products($input),
};

$html = $render();
if (isset($options['dump'])) {
    $directory = dirname($options['dump']);
    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }
    file_put_contents($options['dump'], $html);
}
if (isset($options['dump-only'])) {
    printf("PHP %s: %d bytes\n", $workload, strlen($html));
    exit(0);
}
for ($index = 0; $index < $warmup; $index++) {
    $html = $render();
}
$samples = [];
for ($index = 0; $index < $iterations; $index++) {
    $started = hrtime(true);
    $html = $render();
    $samples[] = (hrtime(true) - $started) / 1000;
}
sort($samples, SORT_NUMERIC);
$result = [
    'schema_version' => 1,
    'framework' => 'PHP',
    'framework_id' => 'php',
    'language' => 'PHP',
    'language_version' => PHP_VERSION,
    'workload' => $workload,
    'workload_cardinality' => $cardinality,
    'allocation_policy' => 'fresh owned PHP string',
    'iterations' => $iterations,
    'warmup' => $warmup,
    'output_bytes' => strlen($html),
    'min_us' => $samples[0],
    'mean_us' => array_sum($samples) / count($samples),
    'p50_us' => percentile($samples, 50),
    'p95_us' => percentile($samples, 95),
    'p99_us' => percentile($samples, 99),
    'max_us' => $samples[array_key_last($samples)],
    'timestamp' => gmdate(DATE_ATOM),
];
printf("%-20s %-8s %9.2f µs p50  %9.2f µs p95  %8d bytes\n", $result['framework'], $workload, $result['p50_us'], $result['p95_us'], $result['output_bytes']);
$encoded = json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
if (isset($options['out'])) {
    $directory = dirname($options['out']);
    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }
    file_put_contents($options['out'], $encoded);
} else {
    echo $encoded;
}
