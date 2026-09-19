/**
 * Deterministic validator for normalized products.
 *
 * Pipeline position:
 *   RAW SOURCE OBJECT -> normalizeProduct() -> validateProduct()
 *   -> NORMALIZED PRODUCT CATALOG -> feasibility.js
 *
 * Contract:
 * - Validates structure and value TYPES against productSchema.js
 *   (createEmptyProduct() is the canonical shape). It never guesses, never
 *   repairs, and never mutates the product it is given.
 * - Unknown values are valid: null is accepted everywhere the schema allows
 *   it, so an all-unknown createEmptyProduct() product validates cleanly.
 * - Vocabulary fields (gpu.tier, display.tier, os) are checked against
 *   GPU_TIERS / DISPLAY_TIERS / OS_VALUES.
 * - Pure and deterministic: the same input always produces the same errors.
 *
 * Returns { valid, errors }: errors is a list of 'path: expectation, got X'
 * strings in a stable order.
 */

import { DISPLAY_TIERS, OS_VALUES } from './productSchema.js'
import { GPU_TIERS } from '../engine/feasibility.js'

/** Plain object (not array, not null). */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

const isStringOrNull = (value) => value === null || isNonEmptyString(value)
const isPositiveOrNull = (value) => value === null || isPositiveNumber(value)
const isCountOrNull = (value) => value === null || isNonNegativeInteger(value)
const isBooleanOrNull = (value) =>
  value === null || typeof value === 'boolean'
const isIdOrNull = (value) =>
  value === null || isNonEmptyString(value) || isFiniteNumber(value)

/** Single canonical resolution form: WIDTHxHEIGHT digits. */
const RESOLUTION_PATTERN = /^\d{3,4}x\d{3,4}$/

/** Records one deterministic error when the value violates the schema. */
function check(errors, path, value, predicate, expectation) {
  if (!predicate(value)) {
    const actual =
      value === null
        ? 'null'
        : Array.isArray(value)
          ? 'array'
          : typeof value
    errors.push(`${path}: expected ${expectation}, got ${actual}`)
  }
}

/**
 * Validate one normalized product against the schema.
 *
 * @param {object} product - normalized product (createEmptyProduct() shape).
 * @returns {{ valid: boolean, errors: string[] }} deterministic result.
 */
export function validateProduct(product) {
  const errors = []

  if (!isPlainObject(product)) {
    return {
      valid: false,
      errors: [
        'product: expected an object conforming to productSchema.js (createEmptyProduct())',
      ],
    }
  }

  /* Top-level identity ---------------------------------------------------- */
  check(
    errors,
    'id',
    product.id,
    isIdOrNull,
    'non-empty string, finite number, or null',
  )
  check(errors, 'category', product.category, isNonEmptyString, 'non-empty string')

  /* Required container sections -------------------------------------------- */
  const sections = [
    'pricing',
    'cpu',
    'gpu',
    'ram',
    'storage',
    'display',
    'battery',
    'physical',
    'connectivity',
    'webcam',
    'keyboard',
    'upgradeability',
    'source',
  ]
  for (const section of sections) {
    if (!isPlainObject(product[section])) {
      errors.push(`${section}: expected an object (see createEmptyProduct())`)
    }
  }
  for (const list of ['offers', 'ports']) {
    if (!Array.isArray(product[list])) {
      errors.push(`${list}: expected an array`)
    }
  }

  /* Nested sections (only checked when the container itself is valid) ------- */
  const pricing = product.pricing
  if (isPlainObject(pricing)) {
    check(errors, 'pricing.currency', pricing.currency, isNonEmptyString, 'non-empty string')
    check(errors, 'pricing.currentPrice', pricing.currentPrice, isPositiveOrNull, 'positive number or null')
    check(errors, 'pricing.originalPrice', pricing.originalPrice, isPositiveOrNull, 'positive number or null')
    check(errors, 'pricing.source', pricing.source, isStringOrNull, 'non-empty string or null')
    check(errors, 'pricing.url', pricing.url, isStringOrNull, 'non-empty string or null')
    check(errors, 'pricing.checkedAt', pricing.checkedAt, isStringOrNull, 'non-empty string or null')
  }

  const cpu = product.cpu
  if (isPlainObject(cpu)) {
    check(errors, 'cpu.brand', cpu.brand, isStringOrNull, 'non-empty string or null')
    check(errors, 'cpu.model', cpu.model, isStringOrNull, 'non-empty string or null')
    check(errors, 'cpu.generation', cpu.generation, isStringOrNull, 'non-empty string or null')
    check(errors, 'cpu.cores', cpu.cores, isCountOrNull, 'non-negative integer or null')
    check(errors, 'cpu.threads', cpu.threads, isCountOrNull, 'non-negative integer or null')
    check(errors, 'cpu.baseClockGHz', cpu.baseClockGHz, isPositiveOrNull, 'positive number or null')
    check(errors, 'cpu.boostClockGHz', cpu.boostClockGHz, isPositiveOrNull, 'positive number or null')
  }

  const gpu = product.gpu
  if (isPlainObject(gpu)) {
    check(errors, 'gpu.model', gpu.model, isStringOrNull, 'non-empty string or null')
    check(
      errors,
      'gpu.tier',
      gpu.tier,
      (tier) => tier === null || GPU_TIERS.includes(tier),
      `one of [${GPU_TIERS.join(', ')}] or null`,
    )
    check(errors, 'gpu.vramGb', gpu.vramGb, isPositiveOrNull, 'positive number or null')
    check(errors, 'gpu.tgpW', gpu.tgpW, isPositiveOrNull, 'positive number or null')
  }

  const ram = product.ram
  if (isPlainObject(ram)) {
    check(errors, 'ram.capacityGb', ram.capacityGb, isPositiveOrNull, 'positive number or null')
    check(errors, 'ram.type', ram.type, isStringOrNull, 'non-empty string or null')
    check(errors, 'ram.speedMHz', ram.speedMHz, isPositiveOrNull, 'positive number or null')
    check(errors, 'ram.slots', ram.slots, isCountOrNull, 'non-negative integer or null')
    check(errors, 'ram.upgradeable', ram.upgradeable, isBooleanOrNull, 'boolean or null')
    check(errors, 'ram.maximumSupportedGb', ram.maximumSupportedGb, isPositiveOrNull, 'positive number or null')
  }

  const storage = product.storage
  if (isPlainObject(storage)) {
    check(errors, 'storage.capacityGb', storage.capacityGb, isPositiveOrNull, 'positive number or null')
    check(errors, 'storage.type', storage.type, isStringOrNull, 'non-empty string or null')
    check(errors, 'storage.slots', storage.slots, isCountOrNull, 'non-negative integer or null')
    check(errors, 'storage.upgradeable', storage.upgradeable, isBooleanOrNull, 'boolean or null')
  }

  const display = product.display
  if (isPlainObject(display)) {
    check(errors, 'display.sizeInches', display.sizeInches, isPositiveOrNull, 'positive number or null')
    check(
      errors,
      'display.resolution',
      display.resolution,
      (resolution) => resolution === null || RESOLUTION_PATTERN.test(resolution),
      'WIDTHxHEIGHT string (e.g. "1920x1080") or null',
    )
    check(errors, 'display.panel', display.panel, isStringOrNull, 'non-empty string or null')
    check(errors, 'display.refreshRateHz', display.refreshRateHz, isPositiveOrNull, 'positive number or null')
    check(errors, 'display.brightnessNits', display.brightnessNits, isPositiveOrNull, 'positive number or null')
    check(errors, 'display.colorGamut', display.colorGamut, isStringOrNull, 'non-empty string or null')
    check(
      errors,
      'display.tier',
      display.tier,
      (tier) => tier === null || DISPLAY_TIERS.includes(tier),
      `one of [${DISPLAY_TIERS.join(', ')}] or null`,
    )
  }

  if (isPlainObject(product.battery)) {
    check(
      errors,
      'battery.capacityWh',
      product.battery.capacityWh,
      isPositiveOrNull,
      'positive number or null',
    )
  }

  const physical = product.physical
  if (isPlainObject(physical)) {
    check(errors, 'physical.weightKg', physical.weightKg, isPositiveOrNull, 'positive number or null')
    check(errors, 'physical.thicknessMm', physical.thicknessMm, isPositiveOrNull, 'positive number or null')
  }

  const connectivity = product.connectivity
  if (isPlainObject(connectivity)) {
    check(errors, 'connectivity.wifi', connectivity.wifi, isStringOrNull, 'non-empty string or null')
    check(errors, 'connectivity.bluetooth', connectivity.bluetooth, isStringOrNull, 'non-empty string or null')
  }

  if (Array.isArray(product.ports)) {
    product.ports.forEach((port, index) => {
      check(errors, `ports[${index}]`, port, isNonEmptyString, 'non-empty string')
    })
  }

  check(
    errors,
    'os',
    product.os,
    (os) => os === null || OS_VALUES.includes(os),
    `one of [${OS_VALUES.join(', ')}] or null`,
  )

  const webcam = product.webcam
  if (isPlainObject(webcam)) {
    check(errors, 'webcam.resolution', webcam.resolution, isStringOrNull, 'non-empty string or null')
  }

  const keyboard = product.keyboard
  if (isPlainObject(keyboard)) {
    check(errors, 'keyboard.backlit', keyboard.backlit, isBooleanOrNull, 'boolean or null')
    check(errors, 'keyboard.numpad', keyboard.numpad, isBooleanOrNull, 'boolean or null')
  }

  const upgradeability = product.upgradeability
  if (isPlainObject(upgradeability)) {
    check(errors, 'upgradeability.ram', upgradeability.ram, isBooleanOrNull, 'boolean or null')
    check(errors, 'upgradeability.storage', upgradeability.storage, isBooleanOrNull, 'boolean or null')
  }

  const source = product.source
  if (isPlainObject(source)) {
    check(errors, 'source.retailer', source.retailer, isStringOrNull, 'non-empty string or null')
    check(errors, 'source.productUrl', source.productUrl, isStringOrNull, 'non-empty string or null')
    check(errors, 'source.lastChecked', source.lastChecked, isStringOrNull, 'non-empty string or null')
  }

  if (Array.isArray(product.offers)) {
    product.offers.forEach((offer, index) => {
      if (!isPlainObject(offer)) {
        errors.push(
          `offers[${index}]: expected an offer object { retailer, currency, price, url, checkedAt }`,
        )
        return
      }
      check(errors, `offers[${index}].retailer`, offer.retailer, isNonEmptyString, 'non-empty string')
      check(errors, `offers[${index}].currency`, offer.currency, isNonEmptyString, 'non-empty string')
      check(errors, `offers[${index}].price`, offer.price, isPositiveOrNull, 'positive number or null')
      check(errors, `offers[${index}].url`, offer.url, isStringOrNull, 'non-empty string or null')
      check(errors, `offers[${index}].checkedAt`, offer.checkedAt, isStringOrNull, 'non-empty string or null')
    })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Catalog-level duplicate-id detector.
 *
 * Pure and deterministic: scans the catalog in order and reports every id
 * that appears more than once, each with its ascending list of indexes.
 *
 * @param {Array<object>} products - normalized products.
 * @returns {Array<{id: string, indexes: number[]}>} duplicates, first-seen order.
 */
export function findDuplicateIds(products) {
  const duplicates = []
  if (!Array.isArray(products)) return duplicates
  const firstIndexById = new Map()
  products.forEach((product, index) => {
    const id = isPlainObject(product) ? product.id : null
    if (!isNonEmptyString(id) && !isFiniteNumber(id)) return
    const key = String(id)
    const firstIndex = firstIndexById.get(key)
    if (firstIndex === undefined) {
      firstIndexById.set(key, index)
      return
    }
    let entry = duplicates.find((duplicate) => duplicate.id === key)
    if (entry === undefined) {
      entry = { id: key, indexes: [firstIndex] }
      duplicates.push(entry)
    }
    entry.indexes.push(index)
  })
  return duplicates
}

/**
 * Catalog-level validation: validates every product and detects duplicate
 * ids. Deterministic; errors are prefixed with their catalog index.
 *
 * @param {Array<object>} products - normalized products.
 * @returns {{ valid: boolean, duplicates: Array<{id: string, indexes: number[]}>, errors: string[] }}
 */
export function validateCatalog(products) {
  const duplicates = findDuplicateIds(products)
  const errors = []
  if (!Array.isArray(products)) {
    return {
      valid: false,
      duplicates,
      errors: ['catalog: expected an array of normalized products'],
    }
  }
  products.forEach((product, index) => {
    const result = validateProduct(product)
    if (!result.valid) {
      for (const error of result.errors) {
        errors.push(`products[${index}] ${error}`)
      }
    }
  })
  for (const duplicate of duplicates) {
    errors.push(
      `catalog: duplicate product id "${duplicate.id}" at indexes ${duplicate.indexes.join(', ')}`,
    )
  }
  return { valid: errors.length === 0, duplicates, errors }
}