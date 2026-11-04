// Check-freshness script for BuyWise product catalog
// Lists products with missing or >90-day-old check dates
// Usage: node backend/scripts/check-freshness.mjs

import { laptopCatalog } from '../src/data/laptopCatalog.js'

const NOW = new Date()
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

console.log('BuyWise Product Price Freshness Check')
console.log('========================================')
console.log()

let hasIssues = false

for (const product of laptopCatalog) {
  const checkedAt = product.pricing?.checkedAt
  let issue = null

  if (checkedAt == null) {
    issue = 'MISSING: pricing.checkedAt is not stated'
  } else {
    const checkedDate = new Date(checkedAt)
    const diffMs = NOW - checkedDate
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays > 90) {
      issue = 'STALE: checked \ days ago (older than 90 days)'
    }
  }

  if (issue !== null) {
    hasIssues = true
    const id = product.id || 'unknown'
    const brand = product.brand || 'unknown'
    const model = product.model || 'unknown'
    console.log(\  [\] \ \ (\)\)
  }
}

console.log()
if (hasIssues) {
  console.log(\Found \ products with freshness issues.\)
  console.log('Consider updating pricing.checkedAt for these products.')
  process.exit(1)
} else {
  console.log('All products have recent price check dates (within 90 days).')
  process.exit(0)
}
