/**
 * Stages the BuyWise recommendation Lambda deployment package.
 *
 * Single source of truth: the engine and the product catalog are COPIED from
 * the frontend (frontend/src/engine, frontend/src/data) into the staging tree
 * preserving the repository layout, so every relative import in the copied
 * files keeps resolving exactly as it does in the repository. No logic is
 * duplicated - `npm run package` must be re-run after engine/catalog changes.
 *
 * Staging tree (zip root = dist/lambda-package):
 *   package.json                      {"type":"module"} - enables ESM in Lambda
 *   backend/src/*.mjs                 handler + shared core
 *   frontend/src/engine/*.js          feasibility + recommendations (unchanged)
 *   frontend/src/data/*.js            product schema/catalog (unchanged)
 *
 * Output: backend/dist/buywise-recommendations.zip
 * Lambda handler setting: backend/src/lambda-handler.handler
 *
 * The AWS SDK v3 (@aws-sdk/client-dynamodb, @aws-sdk/util-dynamodb) is NOT
 * bundled - it is provided by the Lambda Node.js 20.x runtime.
 */

import { cpSync, mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(scriptDir, '..')
const repoRoot = path.dirname(backendDir)
const distDir = path.join(backendDir, 'dist')
const stageDir = path.join(distDir, 'lambda-package')
const zipPath = path.join(distDir, 'buywise-recommendations.zip')

console.log('[package] staging Lambda package...')
rmSync(stageDir, { recursive: true, force: true })
mkdirSync(stageDir, { recursive: true })

// backend shared core (handler + request mapping + products source)
cpSync(path.join(backendDir, 'src'), path.join(stageDir, 'backend', 'src'), {
  recursive: true,
})

// the EXISTING BuyWise engine and product data (unchanged copies)
cpSync(
  path.join(repoRoot, 'frontend', 'src', 'engine'),
  path.join(stageDir, 'frontend', 'src', 'engine'),
  { recursive: true },
)
cpSync(
  path.join(repoRoot, 'frontend', 'src', 'data'),
  path.join(stageDir, 'frontend', 'src', 'data'),
  { recursive: true },
)

// ESM marker - the Lambda needs "type": "module" for the .js engine imports
writeFileSync(
  path.join(stageDir, 'package.json'),
  JSON.stringify(
    { name: 'buywise-recommendations', private: true, type: 'module' },
    null,
    2,
  ),
)

console.log('[package] creating zip...')
execSync(
  `powershell.exe -NoProfile -Command "Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${zipPath}' -Force"`,
  { stdio: 'inherit' },
)

const zipSizeMb = statSync(zipPath).size / (1024 * 1024)
console.log(`[package] ${zipPath} (${zipSizeMb.toFixed(2)} MB)`)
console.log(
  '[package] Lambda handler setting: backend/src/lambda-handler.handler',
)
