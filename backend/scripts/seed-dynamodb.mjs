/**
 * Seeds the BuyWise products DynamoDB table with the bundled, validated REAL
 * India catalog (frontend/src/data/laptopCatalog.js - single source of truth).
 *
 * Table design (Phase B):
 *   - Table name: BuyWiseProducts (default, override with argv[2])
 *   - Partition key: id (String) - the stable normalized product id
 *   - Billing: PAY_PER_REQUEST (small table, spiky hackathon traffic)
 *   - Each item: the full normalized product document (productSchema.js)
 *
 * Implementation notes:
 * - Uses the AWS CLI (no npm SDK dependency needed on this machine):
 *     aws dynamodb create-table / put-item / wait table-exists
 * - A small recursive marshaller converts plain JSON into DynamoDB JSON.
 * - Idempotent: put-item upserts, so the script can be re-run safely.
 *
 * Prerequisite: AWS CLI configured with credentials. If AWS is unavailable
 * this step is a documented blocker - the Lambda still works end-to-end with
 * the bundled catalog fallback.
 */

import { laptopCatalog } from '../../frontend/src/data/laptopCatalog.js'
import { execFileSync } from 'node:child_process'

const tableName = process.argv[2] ?? 'BuyWiseProducts'
const region = process.argv[3] ?? process.env.AWS_REGION ?? 'ap-south-1'

/** Plain JSON -> DynamoDB attribute value JSON (strings/numbers/bool/null). */
function marshall(value) {
  if (value === null || value === undefined) return { NULL: true }
  if (typeof value === 'string') return { S: value }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { N: String(value) } : { NULL: true }
  }
  if (typeof value === 'boolean') return { BOOL: value }
  if (Array.isArray(value)) {
    return value.length > 0 ? { L: value.map(marshall) } : { NULL: true }
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined)
  return entries.length > 0 ? { M: Object.fromEntries(entries.map(([k, v]) => [k, marshall(v)])) } : { NULL: true }
}

function aws(args, options = {}) {
  return execFileSync('aws', [...args, '--region', region], {
    encoding: 'utf-8',
    ...options,
  })
}

console.log(`[seed] table "${tableName}" in region ${region}`)

// 1. Create the table when it does not exist yet.
try {
  aws(['dynamodb', 'describe-table', '--table-name', tableName])
  console.log('[seed] table already exists')
} catch {
  console.log('[seed] creating table...')
  aws([
    'dynamodb', 'create-table',
    '--table-name', tableName,
    '--attribute-definitions', 'AttributeName=id,AttributeType=S',
    '--key-schema', 'AttributeName=id,KeyType=HASH',
    '--billing-mode', 'PAY_PER_REQUEST',
  ])
  aws(['dynamodb', 'wait', 'table-exists', '--table-name', tableName])
  console.log('[seed] table active')
}

// 2. Upsert every product from the bundled catalog.
for (const product of laptopCatalog) {
  aws([
    'dynamodb', 'put-item',
    '--table-name', tableName,
    '--item', JSON.stringify(marshall(product)),
  ])
  console.log(`[seed] put ${product.id}`)
}

console.log(`[seed] done - ${laptopCatalog.length} products in "${tableName}".`)
console.log('[seed] Enable it on the Lambda with:')
console.log(
  `[seed]   ./scripts/deploy-lambda.ps1 -Region ${region} -TableName ${tableName}`,
)
