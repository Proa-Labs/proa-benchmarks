#!/usr/bin/env ruby
# frozen_string_literal: true

require "bundler/setup"
require "action_view"
require "fileutils"
require "json"
require "optparse"
require "rails"
require "time"

require_relative "suite_data"

options = {
  iterations: nil,
  warmup: nil,
  out: nil,
  dump: nil,
  dump_only: false
}
OptionParser.new do |parser|
  parser.on("--workload NAME") { |value| options[:workload] = value }
  parser.on("--iterations COUNT", Integer) { |value| options[:iterations] = value }
  parser.on("--warmup COUNT", Integer) { |value| options[:warmup] = value }
  parser.on("--out PATH") { |value| options[:out] = value }
  parser.on("--dump PATH") { |value| options[:dump] = value }
  parser.on("--dump-only") { options[:dump_only] = true }
end.parse!

workload = options.fetch(:workload, nil)
abort "--workload must be cards, table, or products" unless %w[cards table products].include?(workload)

defaults = {
  "cards" => {iterations: 2_000, warmup: 200, cardinality: 32},
  "table" => {
    iterations: 200,
    warmup: 20,
    cardinality: RepresentativeSuiteData::TABLE_ROW_COUNT
  },
  "products" => {
    iterations: 500,
    warmup: 50,
    cardinality: RepresentativeSuiteData::PRODUCT_COUNT
  }
}.freeze
iterations = options[:iterations] || defaults.fetch(workload).fetch(:iterations)
warmup = options[:warmup] || defaults.fetch(workload).fetch(:warmup)
abort "--iterations must be greater than zero" unless iterations.positive?

assigns = case workload
when "cards"
  {sections: RepresentativeSuiteData.build_card_sections}
when "table"
  {rows: RepresentativeSuiteData.build_table_rows}
when "products"
  {products: RepresentativeSuiteData.build_products}
end

view_class = ActionView::Base.with_empty_template_cache
view_class.include(RepresentativeSuiteHelpers)
lookup = ActionView::LookupContext.new([File.join(__dir__, "views")])
render = lambda do
  view_class.new(lookup, assigns, nil).render(template: workload)
end

html = render.call
if options[:dump]
  FileUtils.mkdir_p(File.dirname(options[:dump]))
  File.write(options[:dump], html)
end
if options[:dump_only]
  puts "Rails #{workload}: #{html.bytesize} bytes"
  exit 0
end

warmup.times { html = render.call }
samples = Array.new(iterations) do
  started = Process.clock_gettime(Process::CLOCK_MONOTONIC, :nanosecond)
  html = render.call
  Process.clock_gettime(Process::CLOCK_MONOTONIC, :nanosecond) - started
end.sort

percentile = lambda do |percent|
  rank = (percent / 100.0) * (samples.length - 1)
  lower = rank.floor
  upper = rank.ceil
  nanoseconds = if lower == upper
    samples.fetch(lower)
  else
    samples.fetch(lower) + ((samples.fetch(upper) - samples.fetch(lower)) * (rank - lower))
  end
  nanoseconds / 1_000.0
end
summary = {
  schema_version: 1,
  framework: "Rails #{Rails.version} Action View",
  framework_id: "rails",
  language: "Ruby",
  language_version: RUBY_DESCRIPTION,
  workload: workload,
  workload_cardinality: defaults.fetch(workload).fetch(:cardinality),
  allocation_policy: "cached Rails template; fresh ActionView context and output buffer",
  iterations: iterations,
  warmup: warmup,
  output_bytes: html.bytesize,
  min_us: samples.first / 1_000.0,
  mean_us: samples.sum.fdiv(samples.length * 1_000),
  p50_us: percentile.call(50),
  p95_us: percentile.call(95),
  p99_us: percentile.call(99),
  max_us: samples.last / 1_000.0,
  timestamp: Time.now.utc.iso8601
}

puts format(
  "%-24s %-8s %9.2f µs p50  %9.2f µs p95  %8d bytes",
  summary[:framework], workload, summary[:p50_us], summary[:p95_us],
  summary[:output_bytes]
)
if options[:out]
  FileUtils.mkdir_p(File.dirname(options[:out]))
  File.write(options[:out], "#{JSON.pretty_generate(summary)}\n")
  puts "Result written to #{options[:out]}"
else
  puts JSON.pretty_generate(summary)
end
