/**
 * Product source tests - run in their own process because they manipulate
 * BUYWISE_PRODUCTS_TABLE / AWS_EXECUTION_ENV.
 *
 * Contract:
 * - a missing/unreachable DynamoDB table must NEVER take the API down; the
 *   bundled catalog is served and the degraded source is reported.
 * - inside a Lambda execution environment the products table defaults to
 *   "BuyWiseProducts" (override with BUYWISE_PRODUCTS_TABLE).
 * Locally the AWS SDK is not installed (it is provided by the Lambda
 * runtime), so every read fails immediately and exercises the fallback path.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

const { getProducts } = await import('../src/products.mjs')

test('an unavailable products table falls back to the bundled catalog', async () => {
  process.env.BUYWISE_PRODUCTS_TABLE = 'buywise-products-does-not-exist'
  try {
    const { products, source, warning } = await getProducts()
    assert.ok(Array.isArray(products))
    assert.ok(products.length > 0)
    assert.ok(products.every((p) => typeof p.id === 'string' && p.id !== ''))
    assert.equal(source, 'bundled-catalog-fallback')
    assert.ok(warning.includes('buywise-products-does-not-exist'))
  } finally {
    delete process.env.BUYWISE_PRODUCTS_TABLE
  }
})

test('inside a Lambda environment the products table defaults to BuyWiseProducts', async () => {
  process.env.AWS_EXECUTION_ENV = 'Nodejs-20.x'
  try {
    const { source, warning } = await getProducts()
    // The table does not exist locally, so the SDK-less read falls back -
    // and the warning must name the resolved default table.
    assert.equal(source, 'bundled-catalog-fallback')
    assert.ok(warning.includes('BuyWiseProducts'))
  } finally {
    delete process.env.AWS_EXECUTION_ENV
  }
})
