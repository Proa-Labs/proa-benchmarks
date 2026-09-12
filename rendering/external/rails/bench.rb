#!/usr/bin/env ruby
# frozen_string_literal: true

# Standalone Erubi benchmark (not the Rails Action View matrix)
#
# Renders the same page structure as the Rust benchmarks:
# 4 sections × 8 cards × 5 list items ≈ 25KB HTML
#
# Uses Erubi directly. The representative suite's `suite_bench.rb` is the
# actual Rails Action View path and should be used for Rails comparisons.

require "erubi"
require "benchmark/ips"
require "json"

NUM_SECTIONS = 4
CARDS_PER_SECTION = 8
ITEMS_PER_CARD = 5

TEMPLATE = <<~ERB
<html lang="en">
<head>
    <title>SSR Benchmark Page</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
    <header class="hero-section">
        <h1 class="title">SSR Framework Benchmark</h1>
        <p class="subtitle">Comparing SSR frameworks</p>
    </header>
    <main class="main-content">
        <% NUM_SECTIONS.times do |section_idx| %>
        <section class="card-section" data-section="<%= section_idx.even? ? 'even' : 'odd' %>">
            <h2 class="section-title"><%= case section_idx
                when 0 then "Performance Metrics"
                when 1 then "Rendering Speed"
                when 2 then "Memory Efficiency"
                else "Framework Comparison"
            end %></h2>
            <div class="card-grid">
                <% CARDS_PER_SECTION.times do |card_idx| %>
                <article class="card" data-card-id="<%= card_idx.even? ? 'even' : 'odd' %>">
                    <div class="card-header">
                        <img src="/images/benchmark.png" alt="Benchmark chart" class="card-image">
                    </div>
                    <div class="card-body">
                        <h3 class="card-title"><%= case card_idx % 4
                            when 0 then "Latency Analysis"
                            when 1 then "Throughput Metrics"
                            when 2 then "Memory Usage"
                            else "CPU Utilization"
                        end %></h3>
                        <p class="card-description">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                        <ul class="feature-list">
                            <% ITEMS_PER_CARD.times do |item_idx| %>
                            <li class="feature-item"><%= case item_idx
                                when 0 then "Sub-millisecond response times"
                                when 1 then "Zero-copy rendering pipeline"
                                when 2 then "SIMD-accelerated escaping"
                                when 3 then "Pre-allocated buffers"
                                else "Minimal heap allocations"
                            end %></li>
                            <% end %>
                        </ul>
                        <button class="btn-primary" type="button">View Details</button>
                    </div>
                </article>
                <% end %>
            </div>
        </section>
        <% end %>
    </main>
    <footer class="footer">
        <p>Rendered with ERB</p>
    </footer>
</body>
</html>
ERB

# Compile the template once (like Rails does in production)
compiled = Erubi::Engine.new(TEMPLATE).src
render_proc = eval("proc { #{compiled} }")

# Warmup and verify output
html = render_proc.call
puts "Output size: #{html.bytesize} bytes"
puts "First 200 chars: #{html[0..200]}"
puts

# --- Precise latency measurement ---
iterations = 10_000
start = Process.clock_gettime(Process::CLOCK_MONOTONIC, :nanosecond)
iterations.times { render_proc.call }
elapsed_ns = Process.clock_gettime(Process::CLOCK_MONOTONIC, :nanosecond) - start
avg_us = elapsed_ns.to_f / iterations / 1000.0

puts "=== ERB (Erubi) Latency ==="
puts "  Iterations: #{iterations}"
puts "  Total: #{(elapsed_ns / 1_000_000.0).round(2)} ms"
puts "  Average: #{avg_us.round(2)} µs/render"
puts

# --- benchmark-ips for throughput ---
Benchmark.ips do |x|
  x.config(warmup: 2, time: 5)
  x.report("erb_erubi") { render_proc.call }
end

# --- JSON output for runner ---
result = {
  framework: "ERB (Erubi)",
  language: "Ruby",
  latency_us: avg_us.round(2),
  output_bytes: html.bytesize,
  iterations: iterations,
  timestamp: Time.now.strftime("%Y-%m-%dT%H:%M:%S%z")
}

File.write(File.join(__dir__, "..", "..", "results", "erb.json"), JSON.pretty_generate(result))
puts "\nResults written to results/erb.json"
