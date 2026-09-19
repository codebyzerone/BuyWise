/**
 * Normalized laptop product schema.
 *
 * The single format every future product source (retailers, APIs, datasets)
 * must be mapped into before entering the BuyWise pipeline:
 *
 *   PRODUCT SOURCES -> NORMALIZED PRODUCTS -> FEASIBILITY -> SCORING
 *
 * Design rules:
 * 1. Unknown information stays null. Never invent values (e.g. no
 *    `slots: 2` when the source does not say).
 * 2. No retailer-specific fields in the core schema; provenance lives in
 *    `pricing.source` and the top-level `source` block.
 * 3. Pricing is separate from technical specifications.
 * 4. Source information is kept so BuyWise can later explain where every
 *    price/specification came from.
 * 5. Extensible: add new nullable fields, never repurpose existing ones.
 * 6. Comparable values are plain numbers (price, capacities, VRAM, TGP,
 *    weight, refresh rate) - never strings like "₹79,990" or "16 GB".
 * 7. No invented specifications for real products; data fillers must only
 *    publish what a source actually states.
 *
 * Field notes:
 * - `gpu.model: null` means "no dedicated GPU / unknown"; `gpu.tier` uses the
 *   ordered vocabulary consumed by feasibility.js (GPU_TIERS).
 * - `display.tier` is the normalized quality classification from the same
 *   vocabulary as the interview's display question - it is derived from the
 *   technical display fields during ingestion and stays null until then.
 *
 * Product vs. retailer offer (architectural requirement):
 * - A catalog entry is a PRODUCT (one laptop model), never a retailer
 *   listing. The same laptop may be sold by several retailers.
 * - `pricing` holds the primary/current offer snapshot so V1 stays simple;
 *   the optional `offers` list records every known retailer offer
 *   { retailer, currency, price, url, checkedAt } for future price
 *   comparison.
 * - A future deduplication layer will merge same-laptop listings from
 *   different sources into one product with many offers. Until then, each
 *   source maps its listings onto this schema and leaves `offers` empty.
 *
 * V1 scope: sources only need to capture V1_MINIMUM_FIELDS (below). All
 * other fields stay optional and are null when unknown.
 */

/** Schema version - bump when the normalized shape changes. */
export const PRODUCT_SCHEMA_VERSION = 2

/**
 * Display-quality tiers, mirroring the interview's display options
 * (see laptopInterview.js). Comparison targets for feasibility.
 */
export const DISPLAY_TIERS = ['basic', 'good', 'high-refresh', 'oled']

/**
 * Operating-system vocabulary. Mirrors the interview's OS options
 * (see laptopInterview.js, minus 'no-preference' which is a buyer answer, not
 * a product property). Ingestion maps source OS names onto these values and
 * leaves anything unverifiable null - never guessed.
 */
export const OS_VALUES = ['windows', 'macos', 'linux']

/**
 * The minimum fields a V1 product source must capture. Values may still be
 * null when a source does not provide them - never guessed. Every other
 * schema field stays optional and is filled by richer sources later.
 */
export const V1_MINIMUM_FIELDS = [
  'id',
  'brand',
  'model',
  'category',
  'pricing.currency',
  'pricing.currentPrice',
  'pricing.url',
  'cpu.model',
  'gpu.model',
  'gpu.tier',
  'gpu.vramGb',
  'ram.capacityGb',
  'storage.capacityGb',
  'display.tier',
  'display.sizeInches',
  'display.refreshRateHz',
  'os',
  'source.retailer',
  'source.productUrl',
]

/**
 * Canonical empty product - the documented normalized shape with every
 * unknown value as null and every collection as []. Future ingestion
 * adapters should start from this object and only fill what their source
 * actually provides.
 *
 * @returns {object} A normalized, all-unknown laptop product.
 */
export function createEmptyProduct() {
  return {
    id: null,
    brand: null,
    model: null,
    category: 'laptop',

    pricing: {
      currency: 'INR',
      currentPrice: null,
      originalPrice: null,
      source: null,
      url: null,
      checkedAt: null,
    },

    /** Per-retailer offers; empty until multi-retailer data exists. */
    offers: [],

    cpu: {
      brand: null,
      model: null,
      generation: null,
      cores: null,
      threads: null,
      baseClockGHz: null,
      boostClockGHz: null,
    },

    gpu: {
      model: null,
      tier: null,
      vramGb: null,
      tgpW: null,
    },

    ram: {
      capacityGb: null,
      type: null,
      speedMHz: null,
      slots: null,
      upgradeable: null,
      maximumSupportedGb: null,
    },

    storage: {
      capacityGb: null,
      type: null,
      slots: null,
      upgradeable: null,
    },

    display: {
      sizeInches: null,
      resolution: null,
      panel: null,
      refreshRateHz: null,
      brightnessNits: null,
      colorGamut: null,
      tier: null,
    },

    battery: { capacityWh: null },

    physical: { weightKg: null, thicknessMm: null },

    connectivity: { wifi: null, bluetooth: null },

    ports: [],

    os: null,

    webcam: { resolution: null },

    keyboard: { backlit: null, numpad: null },

    upgradeability: { ram: null, storage: null },

    source: { retailer: null, productUrl: null, lastChecked: null },
  }
}