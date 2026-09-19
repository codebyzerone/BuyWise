/**
 * Generates per-item JSON files for loading the 21-product catalog into the
 * BuyWiseProducts DynamoDB table WITHOUT the AWS CLI (Console-only flow).
 *
 * Output (committed so the files are always available):
 *   backend/console-seed/<id>.json          - regular JSON (use when the
 *                                             DynamoDB console item editor
 *                                             is switched off "DynamoDB JSON")
 *   backend/console-seed-ddb/<id>.json      - DynamoDB attribute-value JSON
 *                                             (default console JSON view)
 *
 * Each file is exactly ONE table item: paste its contents in
 * DynamoDB Console -> BuyWiseProducts -> Explore items -> Create item.
 * No data is invented - every file is the existing normalized product
 * (frontend/src/data/laptopCatalog.js) verbatim.
 */

import { laptopCatalog } from '../../frontend/src/data/laptopCatalog.js'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(scriptDir, '..')
const plainDir = path.join(backendDir, 'console-seed')
const ddbDir = path.join(backendDir, 'console-seed-ddb')

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
  return entries.length > 0
    ? { M: Object.fromEntries(entries.map(([k, v]) => [k, marshall(v)])) }
    : { NULL: true }
}

for (const dir of [plainDir, ddbDir]) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}

for (const product of laptopCatalog) {
  writeFileSync(
    path.join(plainDir, `${product.id}.json`),
    `${JSON.stringify(product, null, 2)}\n`,
  )
  writeFileSync(
    path.join(ddbDir, `${product.id}.json`),
    `${JSON.stringify(marshall(product), null, 2)}\n`,
  )
}

console.log(
  `Wrote ${laptopCatalog.length} items:\n  ${plainDir}\n  ${ddbDir}`,
)
