# frozen_string_literal: true

module RepresentativeSuiteData
  TABLE_ROW_COUNT = 1_000
  PRODUCT_COUNT = Integer(ENV.fetch("PROA_BENCH_PRODUCT_COUNT", "96"), 10)
  raise "PROA_BENCH_PRODUCT_COUNT must be positive" unless PRODUCT_COUNT.positive?

  SECTION_TITLES = [
    "Performance Metrics",
    "Rendering Speed",
    "Memory Efficiency",
    "Framework Comparison"
  ].freeze
  CARD_TITLES = [
    "Latency Analysis",
    "Throughput Metrics",
    "Memory Usage",
    "CPU Utilization"
  ].freeze
  FEATURES = [
    "Sub-millisecond response times",
    "Zero-copy rendering pipeline",
    "SIMD-accelerated escaping",
    "Pre-allocated buffers",
    "Minimal heap allocations"
  ].freeze

  NAMES = [
    "Alice <admin>", "Bob & Charlie", 'Dana "the boss" Lin', "Eve O'Brien",
    "Frank > Smith", "Grace Hopper & Co.", "Heidi <script>", "Ivan & Sons",
    'Judy Q. "Public"', "Karl <tag>", "Liu & Wang", "Mallory >&<",
    "Niaj <user>", "Olivia & Co.", "Peggy 'Quote'", "Quinn & Sons"
  ].freeze
  EMAILS = [
    "alice+filter@example.com", "bob&charlie@example.com", "dana@example.org",
    "eve@example.io", "frank>smith@example.net", "grace@hopper.dev",
    "heidi@example.com", "ivan&sons@example.co", "judy@public.gov",
    "karl@example.com", "liu@wang.cn", "mallory@evil.example",
    "niaj@example.bd", "olivia@co.example", "peggy@quoted.example",
    "quinn@example.io"
  ].freeze
  COUNTRIES = %w[USA CAN GBR DEU FRA JPN AUS BRA].freeze
  TAG_SETS = [
    %w[new priority], %w[enterprise vip], %w[trial],
    %w[enterprise vip priority], %w[churn-risk], %w[new],
    %w[priority review], %w[vip]
  ].freeze
  STATUSES = %w[Active Pending Disabled Cancelled Refunded].freeze
  STATUS_BADGE =
    "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border"
  STATUS_CLASSES = {
    "Active" => "#{STATUS_BADGE} bg-green-100 text-green-800 border-green-300",
    "Pending" => "#{STATUS_BADGE} bg-yellow-100 text-yellow-800 border-yellow-300",
    "Disabled" => "#{STATUS_BADGE} bg-gray-100 text-gray-700 border-gray-300",
    "Cancelled" => "#{STATUS_BADGE} bg-red-100 text-red-800 border-red-300",
    "Refunded" => "#{STATUS_BADGE} bg-purple-100 text-purple-800 border-purple-300"
  }.freeze
  PRODUCT_CATEGORIES = %w[Audio Displays Wearables].freeze
  STAR_PATH =
    "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.363-1.118l-2.8-2.034c-.784-.57-.381-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"

  module_function

  def build_card_sections
    Array.new(4) do |section_index|
      {
        data_section: section_index.even? ? "even" : "odd",
        title: SECTION_TITLES.fetch(section_index),
        cards: Array.new(8) do |card_index|
          {
            data_card_id: card_index.even? ? "even" : "odd",
            title: CARD_TITLES.fetch(card_index % CARD_TITLES.length),
            features: FEATURES
          }
        end
      }
    end
  end

  def build_table_rows(count = TABLE_ROW_COUNT)
    Array.new(count) do |index|
      amount_cents = 12_345 + ((index * 137) % 99_999)
      {
        id: 100_000 + index,
        name: NAMES.fetch(index % NAMES.length),
        email: EMAILS.fetch(index % EMAILS.length),
        status: STATUSES.fetch(index % STATUSES.length),
        amount_cents: amount_cents,
        tax_cents: (amount_cents * 8) / 100,
        created_unix: 1_700_000_000 + (index * 86_400),
        updated_unix: 1_710_000_000 + (index * 3_600),
        score_bps: 5_000 + ((index * 31) % 5_000),
        country: COUNTRIES.fetch(index % COUNTRIES.length),
        tags: TAG_SETS.fetch(index % TAG_SETS.length)
      }
    end
  end

  def build_products(count = PRODUCT_COUNT)
    Array.new(count) do |index|
      {
        id: 1_000 + index,
        name: %(Meridian "Model #{index}" & Co.),
        category: PRODUCT_CATEGORIES.fetch(index % PRODUCT_CATEGORIES.length),
        price_cents: 1_999 + ((index % 40) * 500),
        rating_tenths: 30 + (index % 20),
        review_count: 3 + ((index * 7) % 400)
      }
    end
  end
end

module RepresentativeSuiteHelpers
  def status_class(status)
    RepresentativeSuiteData::STATUS_CLASSES.fetch(status)
  end

  def format_count(value)
    value.to_s.reverse.scan(/.{1,3}/).join(",").reverse
  end

  def format_currency(cents)
    sign = cents.negative? ? "-" : ""
    absolute = cents.abs
    format("%s$%s.%02d", sign, format_count(absolute / 100), absolute % 100)
  end

  def format_percent(basis_points)
    format("%d.%d%%", basis_points / 100, (basis_points % 100) / 10)
  end

  def format_date(unix)
    Time.at(unix).utc.strftime("%Y-%m-%d")
  end

  def format_datetime(unix)
    Time.at(unix).utc.strftime("%Y-%m-%d %H:%M")
  end

  def format_price(cents)
    format("$%d.%02d", cents / 100, cents % 100)
  end

  def format_rating(tenths)
    format("%d.%d", tenths / 10, tenths % 10)
  end

  def star_path
    RepresentativeSuiteData::STAR_PATH
  end
end
