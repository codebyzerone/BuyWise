/**
 * Product catalog source for the BuyWise recommendation Lambda.
 *
 * Milestone 2/Phase B contract:
 * - DEFAULT (local): the bundled, validated REAL India catalog
 *   (frontend/src/data laptopCatalog.js) - zero infrastructure, fast,
 *   reliable for the MVP.
 * - INSIDE LAMBDA (AWS): reads the products table "BuyWiseProducts" by
 *   default (stable product id as partition key, one normalized product
 *   document per item - productSchema.js). Override the name with the
 *   BUYWISE_PRODUCTS_TABLE env var. The AWS SDK v3 is bundled in the Lambda
 *   Node.js runtime, so no dependency is shipped.
 * - DynamoDB failures NEVER take the API down: the Lambda falls back to the
 *   bundled catalog and reports the degraded source in the response meta
 *   (and CloudWatch logs). A short in-memory cache avoids re-reading the
 *   table on every warm invocation.
 */

import { laptopCatalog } from '../../frontend/src/data/laptopCatalog.js'

/** Default products table used inside a Lambda execution environment. */
const DEFAULT_LAMBDA_TABLE = 'BuyWiseProducts'

const CACHE_TTL_MS = 5 * 60 * 1000

/** Module-level cache for DynamoDB reads (per warm Lambda execution env). */
const cache = { products: null, source: null, expiresAt: 0 }

/**
 * Returns the product catalog to recommend from.
 *
 * @returns {Promise<{products: object[], source: string, warning: string|null}>}
 */
export async function getProducts() {
  const tableName =
    process.env.BUYWISE_PRODUCTS_TABLE ??
    (process.env.AWS_EXECUTION_ENV ? DEFAULT_LAMBDA_TABLE : null)
  if (!tableName) {
    return { products: laptopCatalog, source: 'bundled-catalog', warning: null }
  }

  const now = Date.now()
  if (cache.products !== null && now < cache.expiresAt) {
    return { products: cache.products, source: cache.source, warning: null }
  }

  try {
    const products = await scanProductsTable(tableName)
    if (!Array.isArray(products) || products.length === 0) {
      throw new Error(`table "${tableName}" returned no usable products`)
    }
    cache.products = products
    cache.source = `dynamodb:${tableName}`
    cache.expiresAt = now + CACHE_TTL_MS
    return { products, source: cache.source, warning: null }
  } catch (error) {
    // Fallback: the bundled catalog keeps the API working end-to-end.
    console.error(
      `[products] DynamoDB read failed (${error.message}); falling back to the bundled catalog.`,
    )
    return {
      products: laptopCatalog,
      source: 'bundled-catalog-fallback',
      warning: `Product table "${tableName}" unavailable; served the built-in catalog instead (${error.message}).`,
    }
  }
}

/** Scans the products table and unmarshalls each item into plain JSON. */
async function scanProductsTable(tableName) {
  const { DynamoDBClient, ScanCommand } = await import('@aws-sdk/client-dynamodb')
  const { unmarshall } = await import('@aws-sdk/util-dynamodb')

  const client = new DynamoDBClient({})
  const result = await client.send(new ScanCommand({ TableName: tableName }))
  return (result.Items ?? [])
    .map(unmarshall)
    .filter(isUsableProduct)
}

/**
 * A product is usable only when feasibility can evaluate it: a stable id and
 * a known numeric price. Malformed items are skipped, never invented around.
 */
function isUsableProduct(product) {
  return (
    product !== null &&
    typeof product === 'object' &&
    typeof product.id === 'string' &&
    product.id !== '' &&
    typeof product.pricing?.currentPrice === 'number'
  )
}
