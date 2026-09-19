/**
 * The normalized BuyWise laptop catalog.
 *
 * Pipeline position:
 *   rawLaptops.js (curated REAL India listings, hand-maintained - no scraper)
 *     -> normalizeProduct() -> validateProduct() -> laptopCatalog
 *     -> FEASIBILITY -> SCORING (future) -> RECOMMENDATION
 *
 * - `laptopCatalog` is the REAL India catalog the application consumes. Every
 *   entry conforms to productSchema.js and keeps provenance (retailer, URL,
 *   price, checkedAt) for the recommendation display.
 * - Validation runs at module load and THROWS on any malformed entry:
 *   malformed products are never silently accepted.
 * - mockProducts.js stays available as a test fixture via `mockCatalog`;
 *   it is NOT part of the real catalog.
 */
import { rawLaptops } from './rawLaptops.js'
import { normalizeProduct } from './normalizeProduct.js'
import { validateCatalog } from './validateProduct.js'
import { mockProducts } from './mockProducts.js'

/** The raw real listings (exported for provenance/debugging). */
export { rawLaptops }

/** Test fixtures (BUYWISE-TEST-*) - kept for tests, not in the real catalog. */
export const mockCatalog = mockProducts

/** REAL India catalog: raw listings -> normalized products. */
export const realCatalog = rawLaptops.map((raw) => normalizeProduct(raw))

/** Fail fast on malformed curated data - deterministic, at load time. */
const catalogValidation = validateCatalog(realCatalog)
if (!catalogValidation.valid) {
  throw new Error(
    `Invalid real laptop catalog:\n${catalogValidation.errors.join('\n')}`,
  )
}

/** The catalog the application consumes (REAL products). */
export const laptopCatalog = realCatalog

/** Last validation report for the real catalog (tests/debugging). */
export const catalogValidationReport = catalogValidation