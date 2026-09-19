/**
 * Raw product ingestion -> normalized BuyWise product.
 *
 * Pipeline position:
 *   RAW SOURCE OBJECT -> normalizeProduct() -> validateProduct()
 *   -> NORMALIZED PRODUCT CATALOG -> feasibility.js
 *
 * Every future source adapter (retailer feed, dataset, API) funnels its
 * listings through this module so the rest of BuyWise only ever sees the
 * canonical shape declared by productSchema.js (createEmptyProduct()), and
 * feasibility.js never grows parsing logic of its own.
 *
 * Raw input contract - deliberately loose, because every source speaks a
 * slightly different dialect. Adapters pass through whatever the source
 * states, nested or flat, object or string:
 *
 * {
 *   id, brand, model, modelNumber, category,
 *   price: '₹79,990', originalPrice: 'M.R.P: ₹1,29,990',
 *   currency: 'INR', retailer: 'example-store', url: 'https://...',
 *   checkedAt: '2025-01-15',
 *   cpu: 'Intel Core i5-13420H' | { brand, model, generation, cores,
 *                                  threads, baseClockGHz, boostClockGHz },
 *   gpu: 'NVIDIA GeForce RTX 4050 6GB' | { model, tier, vramGb, tgpW },
 *   ram: '16 GB DDR5' | { capacityGb, type, speedMHz, slots, upgradeable,
 *                         maximumSupportedGb },
 *   storage: '1 TB SSD' | { capacityGb, type, slots, upgradeable },
 *   display: '15.6" FHD 144Hz IPS' | { sizeInches, resolution, panel,
 *                                      refreshRateHz, brightnessNits,
 *                                      colorGamut },
 *   battery: '70 Wh' | { capacityWh },
 *   weight: '2.29 kg', thickness: '22.6 mm'
 *     | physical: { weightKg, thicknessMm },
 *   connectivity: 'Wi-Fi 6E, Bluetooth 5.3' | { wifi, bluetooth },
 *   ports: ['USB-C', 'HDMI 2.1'] | 'USB-C, HDMI 2.1',
 *   os: 'Windows 11 Home',
 *   webcam: '1080p FHD camera' | { resolution },
 *   keyboard: 'Backlit keyboard with numeric keypad' | { backlit, numpad },
 *   upgradeability: { ram: true, storage: false },
 *   source: { retailer, productUrl, lastChecked, notes },
 * }
 *
 * HARD RULES
 * 1. Start from createEmptyProduct() - the canonical shape is the schema's,
 *    never re-declared here.
 * 2. Never invent a value. A field is filled only when the source states it,
 *    or when it is exact arithmetic on a stated value ("1 TB" -> 1024 GB).
 * 3. Never guess from an unrelated field: a missing price never becomes 0, a
 *    missing capacity never becomes 512, a "HD" webcam never becomes "720p".
 * 4. Pricing stays separate from technical specifications.
 * 5. Comparable values are plain numbers ("₹79,990" -> 79990).
 * 6. Provenance is preserved whenever the source provides it.
 *
 * CLASSIFICATION vs FABRICATION (gpu.tier / display.tier)
 * - GPU/display tiers are BuyWise-internal ordinals - the vocabularies
 *   feasibility.js compares. They are derived only from facts that ARE
 *   present (panel, resolution, refresh rate, GPU model name).
 * - Display ladder: OLED -> high-refresh (>=120Hz at FHD or better) -> good
 *   (FHD or better) -> basic (below FHD) -> null when resolution is unknown.
 * - A GPU model outside BuyWise's known model list keeps `tier: null`, so
 *   unknown hardware can never accidentally satisfy a strict requirement
 *   (feasibility.js ranks unknown tiers below every known value).
 * - A source that states the classification itself (`gpuTier`/`displayTier`)
 *   is trusted only when the stated value is inside the vocabulary.
 *
 * UNITS
 * - Capacities are GB (1 TB = 1024 GB). MB-scale values stay null instead of
 *   being rounded into a wrong GB figure.
 * - Display sizes are read from inch markers only. Centimetre-only values
 *   stay null: 39.62 cm is "15.6 inches" only because that source happened to
 *   be exact - converting would fabricate precision the source never gave.
 * - Weights require a kg marker and thicknesses a mm marker, so a "39.62 cm"
 *   measurement can never leak into weightKg or thicknessMm.
 */
import {
  createEmptyProduct,
  DISPLAY_TIERS,
  OS_VALUES,
} from './productSchema.js'
import { GPU_MODELS, GPU_TIERS } from '../engine/feasibility.js'

/** Extraction helpers ------------------------------------------------------ */

const isObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A normalized nullable string: non-empty trimmed string, otherwise null. */
function asText(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** First non-empty string among the candidates, trimmed - else null. */
function firstText(...candidates) {
  for (const candidate of candidates) {
    const text = asText(candidate)
    if (text !== null) return text
  }
  return null
}

/** First object among the candidates - else null. */
function firstObject(...candidates) {
  return candidates.find(isObject) ?? null
}

/** A normalized nullable identifier (string or finite number). */
function asIdentifier(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return asText(value)
}

/** A normalized nullable boolean (real booleans plus unambiguous wording). */
function asBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase()
  if (text === '') return null
  if (/^(true|yes|y|1)$/.test(text)) return true
  if (/^(false|no|n|0)$/.test(text)) return false
  return null
}

/**
 * true | false | null from explicit wording, e.g.
 *   'Backlit keyboard with numeric keypad' -> true
 *   'No backlit keyboard'                  -> false
 *   'Chiclet keyboard'                     -> null (states nothing)
 */
function booleanFromWording(value, positivePattern) {
  const direct = asBoolean(value)
  if (direct !== null) return direct
  const text = asText(value)
  if (text === null) return null
  if (/\b(no|not|non[-\s]?|without)\b/i.test(text)) return false
  return positivePattern.test(text) ? true : null
}

/** A strictly positive finite number, otherwise null (never 0). */
const positiveOrNull = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null

/** Non-negative integer count (cores, slots) - 0 allowed, negatives are not. */
const countOrNull = (value) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null

/** Value parsers ----------------------------------------------------------- */

/**
 * Currency amounts to a plain number. Indian digit grouping is just commas,
 * so stripping them is exact - no rounding ever happens:
 *   '₹79,990'                 -> 79990
 *   '1,07,990'                -> 107990
 *   '₹1,49,990 (M.R.P.)'      -> 149990  (first stated amount wins)
 *   74990                     -> 74990
 * Anything without an amount stays null - never 0.
 */
function parsePrice(value) {
  if (typeof value === 'number') return positiveOrNull(value)
  const text = asText(value)
  if (text === null) return null
  const match = /(\d[\d,]*(?:\.\d+)?)/.exec(text)
  if (match === null) return null
  return positiveOrNull(Number(match[1].replace(/,/g, '')))
}

/**
 * Capacities to GB: '16 GB' -> 16, '1 TB' -> 1024, '1TB SSD' -> 1024, 16 -> 16.
 * The FIRST stated capacity wins, so '16 GB RAM, 512 GB SSD' is not summed.
 * MB-scale values stay null rather than being rounded into a wrong GB figure.
 */
function parseCapacityGb(value) {
  if (typeof value === 'number') return positiveOrNull(value)
  const text = asText(value)
  if (text === null) return null
  const match = /(\d+(?:[.,]\d+)?)\s*(tb|gb)\b/i.exec(text)
  if (match === null) return null
  const amount = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(amount) || amount <= 0) return null
  const gb = match[2].toLowerCase() === 'tb' ? amount * 1024 : amount
  return Number.isInteger(gb) ? gb : null
}

/** Display sizes need an inch marker: '15.6"' -> 15.6, '14-inch' -> 14. */
function parseDisplaySizeInches(value) {
  if (typeof value === 'number') return positiveOrNull(value)
  const text = asText(value)
  if (text === null) return null
  const match = /(\d+(?:\.\d+)?)\s*(?:"|”|″|''|inch|inches|\bin\b)/i.exec(text)
  if (match === null) return null
  return positiveOrNull(Number(match[1]))
}

/** '1920 x 1080' -> '1920x1080' (canonical WIDTHxHEIGHT), else null. */
function parseResolution(value) {
  const text = asText(value)
  if (text === null) return null
  const match = /(\d{3,4})\s*[x×*]\s*(\d{3,4})/i.exec(text)
  if (match === null) return null
  return `${match[1]}x${match[2]}`
}

/** Resolution height: '1920x1080' -> 1080, unparseable -> null. */
function resolutionHeight(resolution) {
  if (typeof resolution !== 'string') return null
  const match = /^(\d{3,4})x(\d{3,4})$/.exec(resolution)
  return match === null ? null : positiveOrNull(Number(match[2]))
}

/**
 * CPU clocks from one spec sentence, e.g.
 * '1.3 GHz (12M Cache, up to 4.6 GHz)' -> base 1.3, boost 4.6.
 * The boost figure is removed before reading the base clock so the two can
 * never be confused.
 */
function parseClocks(text) {
  const source = asText(text)
  if (source === null) return { baseClockGHz: null, boostClockGHz: null }
  const boost = /up\s*to\s*(\d+(?:\.\d+)?)\s*ghz/i.exec(source)
  const withoutBoost = source.replace(
    /up\s*to\s*\d+(?:\.\d+)?\s*ghz/gi,
    '',
  )
  const base = /(\d+(?:\.\d+)?)\s*ghz/i.exec(withoutBoost)
  return {
    baseClockGHz: base === null ? null : positiveOrNull(Number(base[1])),
    boostClockGHz: boost === null ? null : positiveOrNull(Number(boost[1])),
  }
}

/** '10 cores' / '8 Cores' -> 10 / 8; 'Octa-core' -> null (not numeric). */
function parseCores(value) {
  if (typeof value === 'number') return countOrNull(value)
  const text = asText(value)
  if (text === null) return null
  const match = /(\d+)\s*cores?/i.exec(text)
  return match === null ? null : countOrNull(Number(match[1]))
}

/** '12 Threads' -> 12. */
function parseThreads(value) {
  if (typeof value === 'number') return countOrNull(value)
  const text = asText(value)
  if (text === null) return null
  const match = /(\d+)\s*threads?/i.exec(text)
  return match === null ? null : countOrNull(Number(match[1]))
}

/** '70 Wh' / '41Whr' / '5000 mAh' -> 70 / 41 / null (mAh is not Wh). */
function parseWattHours(value) {
  if (typeof value === 'number') return positiveOrNull(value)
  const text = asText(value)
  if (text === null) return null
  const match = /(\d+(?:\.\d+)?)\s*wh(?:r|rs)?\b/i.exec(text)
  return match === null ? null : positiveOrNull(Number(match[1]))
}

/** Weights need a kg marker: '2.29 kg' -> 2.29. Grams stay null. */
function parseWeightKg(value) {
  if (typeof value === 'number') return positiveOrNull(value)
  const text = asText(value)
  if (text === null) return null
  const match = /(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilograms?)\b/i.exec(text)
  return match === null ? null : positiveOrNull(Number(match[1]))
}

/** Thicknesses need a mm marker: '22.6 mm' -> 22.6. */
function parseThicknessMm(value) {
  if (typeof value === 'number') return positiveOrNull(value)
  const text = asText(value)
  if (text === null) return null
  const match = /(\d+(?:\.\d+)?)\s*(?:mm|millimet(?:er|re)s?)\b/i.exec(text)
  return match === null ? null : positiveOrNull(Number(match[1]))
}

/** Memory speed: '5500 MHz' -> 5500. */
function parseSpeedMHz(value) {
  if (typeof value === 'number') return positiveOrNull(value)
  const text = asText(value)
  if (text === null) return null
  const match = /(\d{3,5})\s*mhz\b/i.exec(text)
  return match === null ? null : positiveOrNull(Number(match[1]))
}

/** CPU generation wording: '13th Gen' -> '13th Gen'; '15-13420H' -> null. */
function parseGeneration(value) {
  if (typeof value === 'number') return null
  const text = asText(value)
  if (text === null) return null
  const match = /\b(\d{1,2}(?:st|nd|rd|th)\s*gen\b)/i.exec(text)
  return match === null ? null : match[1].replace(/\s+/g, ' ')
}

/**
 * RECOVERY APPENDIX (interrupted-task recovery).
 *
 * The extraction helpers and value parsers above were left exactly as they
 * were. Everything below this banner - a few additional extraction helpers
 * plus the missing main normalizeProduct() export - was appended to complete
 * the interrupted implementation. No existing function was rewritten.
 */

/** Vocabulary-tier classification for KNOWN GPU models (stated facts only). */
const GPU_MODEL_TIERS = {
  'RTX 3050': 'entry-level',
  'RTX 4050': 'mid-range',
  'RTX 4060': 'mid-range',
  'RTX 4070': 'high-performance',
  'RTX 4080': 'high-performance',
  'RTX 4090': 'high-performance',
  'RTX 5090': 'high-performance',
}

/** Wording that states the machine has no dedicated GPU. */
const INTEGRATED_GPU_PATTERN =
  /\b(integrated|iris(?:\s*xe)?|uhd|hd\s*graphics|radeon\s*(?:tm)?\s*graphics|vega|onboard\s*graphics|on[-\s]?chip)\b/i

const CPU_BRAND_WORDS = {
  intel: 'Intel',
  amd: 'AMD',
  apple: 'Apple',
  mediatek: 'MediaTek',
  qualcomm: 'Qualcomm',
  snapdragon: 'Snapdragon',
}

/** CPU vendor stated in text: 'Intel Core i5-13420H' -> 'Intel'. */
function parseCpuBrand(value) {
  const text = asText(value)
  if (text === null) return null
  const match = /\b(intel|amd|apple|mediatek|qualcomm|snapdragon)\b/i.exec(text)
  return match === null ? null : CPU_BRAND_WORDS[match[1].toLowerCase()]
}

/** Canonical GPU model from the known vocabulary stated in text, else null. */
function findKnownGpuModel(value) {
  const text = asText(value)
  if (text === null) return null
  const lowered = text.toLowerCase()
  for (const model of GPU_MODELS) {
    if (lowered.includes(model.toLowerCase())) return model
  }
  return null
}

/** Tier for a KNOWN GPU model - unknown models stay null, never guessed. */
function deriveGpuTier(model) {
  return model === null ? null : (GPU_MODEL_TIERS[model] ?? null)
}

/** '1920 x 1080' given as separate width/height numbers -> '1920x1080'. */
function resolutionFromPair(pair) {
  const width = pair?.width
  const height = pair?.height
  if (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0
  ) {
    return `${width}x${height}`
  }
  return null
}

/** RAM type stated in text: '16 GB DDR5 5500 MHz' -> 'DDR5'. */
function parseRamType(value) {
  const text = asText(value)
  if (text === null) return null
  const match = /\b(lp)?ddr\d(?:x)?\b/i.exec(text)
  return match === null ? null : match[0].toUpperCase()
}

const STORAGE_TYPE_WORDS = {
  'nvme ssd': 'NVMe SSD',
  nvme: 'NVMe',
  ssd: 'SSD',
  hdd: 'HDD',
  emmc: 'eMMC',
  'e-mmc': 'eMMC',
  'hard drive': 'HDD',
}

/** Storage type stated in text: '1 TB SSD' -> 'SSD'. */
function parseStorageType(value) {
  const text = asText(value)
  if (text === null) return null
  const match = /\b(nvme\s*ssd|nvme|ssd|hdd|e-?mmc|hard\s*drive)\b/i.exec(text)
  if (match === null) return null
  return STORAGE_TYPE_WORDS[match[1].toLowerCase().replace(/\s+/g, ' ')] ?? null
}

const PANEL_TYPE_WORDS = {
  oled: 'OLED',
  'mini led': 'Mini LED',
  ips: 'IPS',
  tn: 'TN',
  va: 'VA',
  lcd: 'LCD',
}

/** Panel stated in text: '15.6" FHD IPS' -> 'IPS'. */
function parsePanelType(value) {
  const text = asText(value)
  if (text === null) return null
  const match = /\b(oled|mini\s*led|ips|tn|va|lcd)\b/i.exec(text)
  if (match === null) return null
  return PANEL_TYPE_WORDS[match[1].toLowerCase().replace(/\s+/g, ' ')] ?? null
}

/** Refresh rate: '144Hz' -> 144. */
function parseRefreshHz(value) {
  if (typeof value === 'number') return positiveOrNull(value)
  const text = asText(value)
  if (text === null) return null
  const match = /(\d{2,4})\s*hz\b/i.exec(text)
  return match === null ? null : positiveOrNull(Number(match[1]))
}

/** Brightness: '300 nits' -> 300. */
function parseNits(value) {
  if (typeof value === 'number') return positiveOrNull(value)
  const text = asText(value)
  if (text === null) return null
  const match = /(\d{2,4})\s*nits?\b/i.exec(text)
  return match === null ? null : positiveOrNull(Number(match[1]))
}

/** Stated gamut: '100% sRGB' -> '100% sRGB'. */
function parseColorGamut(value) {
  const text = asText(value)
  if (text === null) return null
  const match =
    /\b(\d{2,3}\s*%\s*(?:srgb|ntsc|dci-?p3|adobe\s*rgb|p3))\b/i.exec(text)
  return match === null
    ? null
    : match[1].replace(/\s*%\s*/, '% ').replace(/\s+/g, ' ')
}

/** TGP in watts: '75 W' -> 75 ('Wh' is deliberately NOT matched). */
function parseWatts(value) {
  if (typeof value === 'number') return positiveOrNull(value)
  const text = asText(value)
  if (text === null) return null
  const match = /(\d{1,4})\s*w\b(?!h)/i.exec(text)
  return match === null ? null : positiveOrNull(Number(match[1]))
}

/** Explicit maximum wording only: 'max 32 GB' / 'up to 32GB' -> 32. */
function parseMaxCapacityGb(value) {
  if (typeof value === 'number') return positiveOrNull(value)
  const text = asText(value)
  if (text === null) return null
  const match =
    /\bmax(?:imum)?(?:\s*supported)?\s*(?:memory|ram)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(tb|gb)\b/i.exec(
      text,
    )
  if (match === null) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  const gb = match[2].toLowerCase() === 'tb' ? amount * 1024 : amount
  return Number.isInteger(gb) ? gb : null
}

/** Stated webcam resolution: '1080p FHD camera' -> '1080p'; 'HD' -> null. */
function parseWebcamResolution(value) {
  const text = asText(value)
  if (text === null) return null
  const match = /\b(\d{3,4})\s*p\b/i.exec(text)
  return match === null ? null : `${match[1]}p`
}

const WIFI_PATTERN = /\bwi[\s-]?fi(?:\s*\d[a-z]?)?\b/i
const BLUETOOTH_PATTERN = /\bbluetooth(?:\s*\d+(?:\.\d+)?)?\b/i

/** 'Wi-Fi 6E, Bluetooth 5.3' -> 'Wi-Fi 6E'. */
function parseWifi(value) {
  const text = asText(value)
  if (text === null) return null
  const match = WIFI_PATTERN.exec(text)
  return match === null
    ? null
    : match[0].replace(/^wi[\s-]?fi/i, 'Wi-Fi').replace(/\s+/g, ' ')
}

/** 'Wi-Fi 6E, Bluetooth 5.3' -> 'Bluetooth 5.3'. */
function parseBluetooth(value) {
  const text = asText(value)
  if (text === null) return null
  const match = BLUETOOTH_PATTERN.exec(text)
  return match === null ? null : match[0].replace(/\s+/g, ' ')
}

/** 'Windows 11 Home' -> 'windows'; 'Ubuntu 22.04' -> 'linux'; else null. */
function osFromText(value) {
  const text = asText(value)
  if (text === null) return null
  const lowered = text.toLowerCase()
  if (OS_VALUES.includes(lowered)) return lowered
  if (/\bwindows\b/.test(lowered)) return 'windows'
  if (/\bmac(?:os|intosh|\s*os)?\b|\bdarwin\b/.test(lowered)) return 'macos'
  if (/\blinux\b|\bubuntu\b|\bfedora\b|\bdebian\b/.test(lowered)) {
    return 'linux'
  }
  return null
}

/** Array of trimmed stated ports from an array or comma-separated string. */
function normalizePorts(value) {
  const parts = Array.isArray(value)
    ? value
    : (asText(value)?.split(/[,;]/) ?? [])
  return parts.map((part) => asText(part)).filter((part) => part !== null)
}

/** First parser result that is not null. */
function pickParsed(parser, ...candidates) {
  for (const candidate of candidates) {
    const parsed = parser(candidate)
    if (parsed !== null) return parsed
  }
  return null
}

/** First candidate that is a stated boolean. */
function firstBoolean(...candidates) {
  for (const candidate of candidates) {
    const stated = asBoolean(candidate)
    if (stated !== null) return stated
  }
  return null
}

/**
 * Display tier from stated technical facts only (see the header ladder):
 * OLED -> high-refresh (>=120Hz at FHD or better) -> good (FHD or better)
 * -> basic (below FHD) -> null when nothing is stated.
 */
function deriveDisplayTier(display) {
  if (/\boled\b/i.test(asText(display.panel) ?? '')) return 'oled'
  const height = resolutionHeight(display.resolution)
  if (height === null) return null
  if (height < 1080) return 'basic'
  const refresh = display.refreshRateHz
  return typeof refresh === 'number' && refresh >= 120
    ? 'high-refresh'
    : 'good'
}

/**
 * Main normalization pipeline.
 *
 * Maps one loose raw listing (object-or-string fields per the header
 * contract, any retailer/dataset dialect) onto the canonical schema shape
 * from createEmptyProduct(). Fills ONLY what the source states (or exact
 * arithmetic like 1 TB -> 1024 GB); everything else stays null. Pure:
 * returns a fresh product and never mutates its input.
 *
 * @param {object} rawProduct - loose raw listing (see the header contract).
 * @returns {object} normalized product ready for validateProduct().
 */
export function normalizeProduct(rawProduct) {
  const raw = isObject(rawProduct) ? rawProduct : {}
  const rawPricing = firstObject(raw.pricing) ?? {}
  const rawSource = firstObject(raw.source) ?? {}
  const upgradeObj = firstObject(raw.upgradeability, raw.upgradability) ?? {}
  const product = createEmptyProduct()

  /* Identity --------------------------------------------------------------- */
  product.id = asIdentifier(firstText(raw.id, raw.productId, raw.sku))
  product.brand = firstText(raw.brand, raw.manufacturer)
  product.model = firstText(raw.model, raw.modelName, raw.name, raw.title)
  product.category =
    firstText(raw.category, raw.productType) ?? product.category

  /* Provenance (shared by pricing and source) ------------------------------- */
  const retailer = firstText(
    rawSource.retailer,
    raw.retailer,
    raw.seller,
    raw.vendor,
  )
  const productUrl = firstText(
    rawSource.productUrl,
    raw.productUrl,
    raw.url,
    raw.link,
    rawPricing.url,
  )
  const lastChecked = firstText(
    rawSource.lastChecked,
    raw.checkedAt,
    raw.lastChecked,
  )

  /* Pricing ----------------------------------------------------------------- */
  product.pricing.currency =
    firstText(rawPricing.currency, raw.currency) ?? product.pricing.currency
  product.pricing.currentPrice = pickParsed(
    parsePrice,
    rawPricing.currentPrice,
    raw.price,
    raw.currentPrice,
  )
  product.pricing.originalPrice = pickParsed(
    parsePrice,
    rawPricing.originalPrice,
    raw.originalPrice,
    raw.mrp,
  )
  product.pricing.source = retailer
  product.pricing.url = productUrl
  product.pricing.checkedAt = lastChecked
  // offers stay [] in V1 (see productSchema.js).

  /* CPU --------------------------------------------------------------------- */
  const rawCpu = raw.cpu
  const cpuObj = isObject(rawCpu) ? rawCpu : {}
  const cpuText = asText(
    typeof rawCpu === 'string'
      ? rawCpu
      : firstText(cpuObj.model, cpuObj.name, cpuObj.chipset),
  )
  product.cpu.brand =
    firstText(cpuObj.brand, cpuObj.manufacturer) ?? parseCpuBrand(cpuText)
  product.cpu.model =
    firstText(cpuObj.model, cpuObj.name, cpuObj.chipset) ?? cpuText
  product.cpu.generation = pickParsed(parseGeneration, cpuObj.generation, cpuText)
  product.cpu.cores = pickParsed(parseCores, cpuObj.cores, cpuText)
  product.cpu.threads = pickParsed(parseThreads, cpuObj.threads, cpuText)
  const textClocks = parseClocks(cpuText)
  const statedClocks = parseClocks(
    firstText(
      cpuObj.baseClock,
      cpuObj.boostClock,
      cpuObj.maxClockGHz,
      cpuObj.clockSpeed,
    ),
  )
  product.cpu.baseClockGHz =
    pickParsed(positiveOrNull, cpuObj.baseClockGHz) ??
    statedClocks.baseClockGHz ??
    textClocks.baseClockGHz
  product.cpu.boostClockGHz =
    pickParsed(positiveOrNull, cpuObj.boostClockGHz) ??
    statedClocks.boostClockGHz ??
    textClocks.boostClockGHz

  /* GPU --------------------------------------------------------------------- */
  const gpuSource = raw.gpu ?? raw.graphics
  const gpuObj = isObject(gpuSource) ? gpuSource : {}
  const gpuText = asText(typeof gpuSource === 'string' ? gpuSource : null)
  const statedGpuModel = firstText(gpuObj.model, gpuObj.name, gpuObj.chipset)
  const knownGpuModel = findKnownGpuModel(firstText(statedGpuModel, gpuText))
  product.gpu.model = knownGpuModel ?? statedGpuModel ?? gpuText
  const statedGpuTier = firstText(gpuObj.tier, raw.gpuTier, raw.graphicsTier)
  product.gpu.tier =
    statedGpuTier !== null && GPU_TIERS.includes(statedGpuTier)
      ? statedGpuTier
      : knownGpuModel !== null
        ? deriveGpuTier(knownGpuModel)
        : INTEGRATED_GPU_PATTERN.test(gpuText ?? '')
          ? 'integrated'
          : null
  product.gpu.vramGb = pickParsed(
    parseCapacityGb,
    gpuObj.vramGb,
    gpuObj.vram,
    gpuText,
  )
  product.gpu.tgpW = pickParsed(parseWatts, gpuObj.tgpW, gpuObj.tgp, gpuText)

  /* RAM --------------------------------------------------------------------- */
  const ramSource = raw.ram ?? raw.memory
  const ramObj = isObject(ramSource) ? ramSource : {}
  const ramText = asText(typeof ramSource === 'string' ? ramSource : null)
  product.ram.capacityGb = pickParsed(
    parseCapacityGb,
    ramObj.capacityGb,
    ramObj.size,
    ramText,
  )
  product.ram.type =
    firstText(ramObj.type, ramObj.memoryType) ?? parseRamType(ramText)
  product.ram.speedMHz = pickParsed(
    parseSpeedMHz,
    ramObj.speedMHz,
    ramObj.speed,
    ramText,
  )
  product.ram.slots = pickParsed(countOrNull, ramObj.slots)
  const ramUpgradeable =
    firstBoolean(ramObj.upgradeable, ramObj.upgradable, upgradeObj.ram) ??
    booleanFromWording(ramText, /\b(?:upgradeable|upgradable)\b/i)
  product.ram.upgradeable = ramUpgradeable
  product.ram.maximumSupportedGb = pickParsed(
    parseMaxCapacityGb,
    ramObj.maximumSupportedGb,
    ramObj.maxCapacityGb,
    ramObj.maximumCapacityGb,
    ramText,
  )

  /* Storage ------------------------------------------------------------------ */
  const storageSource = raw.storage ?? raw.disk ?? raw.drive
  const storageObj = isObject(storageSource) ? storageSource : {}
  const storageText = asText(
    typeof storageSource === 'string' ? storageSource : null,
  )
  product.storage.capacityGb = pickParsed(
    parseCapacityGb,
    storageObj.capacityGb,
    storageObj.size,
    storageText,
  )
  product.storage.type =
    firstText(storageObj.type, storageObj.storageType, storageObj.driveType) ??
    parseStorageType(storageText)
  product.storage.slots = pickParsed(countOrNull, storageObj.slots)
  const storageUpgradeable =
    firstBoolean(
      storageObj.upgradeable,
      storageObj.upgradable,
      upgradeObj.storage,
    ) ?? booleanFromWording(storageText, /\b(?:upgradeable|upgradable)\b/i)
  product.storage.upgradeable = storageUpgradeable

  /* Display ------------------------------------------------------------------- */
  const displaySource = raw.display ?? raw.screen
  const displayObj = isObject(displaySource) ? displaySource : {}
  const displayText = asText(
    typeof displaySource === 'string' ? displaySource : null,
  )
  product.display.sizeInches = pickParsed(
    parseDisplaySizeInches,
    displayObj.sizeInches,
    displayObj.size,
    displayText,
  )
  product.display.resolution =
    parseResolution(firstText(displayObj.resolution, displayText)) ??
    resolutionFromPair(displayObj)
  product.display.panel =
    firstText(displayObj.panel, displayObj.panelType) ??
    parsePanelType(displayText)
  product.display.refreshRateHz = pickParsed(
    parseRefreshHz,
    displayObj.refreshRateHz,
    displayObj.refreshRate,
    displayText,
  )
  product.display.brightnessNits = pickParsed(
    parseNits,
    displayObj.brightnessNits,
    displayObj.brightness,
    displayText,
  )
  product.display.colorGamut =
    firstText(displayObj.colorGamut, displayObj.gamut) ??
    parseColorGamut(displayText)
  const statedDisplayTier = firstText(
    displayObj.tier,
    displayObj.displayTier,
    raw.displayTier,
  )
  product.display.tier =
    statedDisplayTier !== null && DISPLAY_TIERS.includes(statedDisplayTier)
      ? statedDisplayTier
      : deriveDisplayTier({
          panel: product.display.panel,
          resolution: product.display.resolution,
          refreshRateHz: product.display.refreshRateHz,
        })

  /* Battery / physical --------------------------------------------------------- */
  const batteryObj = firstObject(raw.battery) ?? {}
  const batteryText = asText(
    typeof raw.battery === 'string' ? raw.battery : null,
  )
  product.battery.capacityWh = pickParsed(
    parseWattHours,
    batteryObj.capacityWh,
    batteryText,
  )
  const physicalObj = firstObject(raw.physical) ?? {}
  product.physical.weightKg = pickParsed(
    parseWeightKg,
    physicalObj.weightKg,
    physicalObj.weight,
    raw.weight,
    raw.weightKg,
  )
  product.physical.thicknessMm = pickParsed(
    parseThicknessMm,
    physicalObj.thicknessMm,
    physicalObj.thickness,
    raw.thickness,
    raw.thicknessMm,
  )

  /* Connectivity / ports -------------------------------------------------------- */
  const connSource = raw.connectivity ?? raw.wireless
  const connObj = isObject(connSource) ? connSource : {}
  const connText = asText(typeof connSource === 'string' ? connSource : null)
  product.connectivity.wifi =
    firstText(connObj.wifi, connObj.wireless, connObj.wifiStandard) ??
    parseWifi(connText) ??
    parseWifi(raw.wifi)
  product.connectivity.bluetooth =
    firstText(connObj.bluetooth) ?? parseBluetooth(connText)
  product.ports = normalizePorts(raw.ports ?? raw.portList)

  /* OS / webcam / keyboard ------------------------------------------------------- */
  product.os = osFromText(firstText(raw.os, raw.operatingSystem, raw.osName))
  const webcamSource = raw.webcam ?? raw.camera
  const webcamObj = isObject(webcamSource) ? webcamSource : {}
  const webcamText = asText(
    typeof webcamSource === 'string' ? webcamSource : null,
  )
  product.webcam.resolution = parseWebcamResolution(
    firstText(webcamObj.resolution, webcamText),
  )
  const keyboardSource = raw.keyboard
  const keyboardObj = isObject(keyboardSource) ? keyboardSource : {}
  const keyboardText = asText(
    typeof keyboardSource === 'string' ? keyboardSource : null,
  )
  const keyboardDescription =
    firstText(keyboardObj.keyboard, keyboardObj.description) ?? keyboardText
  product.keyboard.backlit =
    firstBoolean(keyboardObj.backlit) ??
    booleanFromWording(keyboardDescription, /\bbacklit\b/i)
  product.keyboard.numpad =
    firstBoolean(keyboardObj.numpad) ??
    booleanFromWording(
      keyboardDescription,
      /\bnumeric(?:al)?\s*keypad\b|\bnumpad\b/i,
    )

  /* Upgradeability ---------------------------------------------------------------- */
  product.upgradeability.ram = firstBoolean(upgradeObj.ram) ?? ramUpgradeable
  product.upgradeability.storage =
    firstBoolean(upgradeObj.storage) ?? storageUpgradeable

  /* Source provenance --------------------------------------------------------------- */
  product.source.retailer = retailer
  product.source.productUrl = productUrl
  product.source.lastChecked = lastChecked

  return product
}