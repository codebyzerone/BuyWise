# BuyWise Backend

AWS Lambda + API Gateway backend for BuyWise. It reuses the EXISTING
frontend engine (`frontend/src/engine`) unchanged — no recommendation or
feasibility logic is duplicated.

## Architecture

```
React / AWS Amplify (frontend, unchanged)
        |
        v
API Gateway (HTTP API, POST /recommend)
        |
        v
AWS Lambda  (buywise-recommend-api, Node.js 20.x, handler backend/src/lambda-handler.handler)
        |
        v
BuyWise Recommendation Engine  (frontend/src/engine: feasibility -> scoring, imported as-is)
        |
        v
Product Catalog  (bundled laptopCatalog by default; optional DynamoDB buywise-products)
```

Backend files:

| File | Purpose |
|---|---|
| `src/lambda-handler.mjs` | Lambda entry point: API Gateway REST (v1), HTTP API / Function URL (v2), direct invoke; CORS; errors |
| `src/recommend.mjs` | Shared core: normalize -> get products -> existing engine -> clean JSON response |
| `src/normalizeRequest.mjs` | Validates/maps API input onto the normalized Buyer Requirements Profile |
| `src/products.mjs` | Catalog source: bundled catalog (default) or DynamoDB (`BUYWISE_PRODUCTS_TABLE` env, auto-fallback) |
| `server.js` | Local Express stand-in for API Gateway: `POST /recommend`, `GET /health` (same core as Lambda) |
| `scripts/package-lambda.mjs` | Stages + zips the deployment package (`npm run package`) |
| `scripts/deploy-lambda.ps1` | Deploys IAM role + Lambda + HTTP API via AWS CLI (needs AWS access) |
| `scripts/seed-dynamodb.mjs` | Creates + seeds `buywise-products` (partition key `id`) via AWS CLI |
| `test/` | node:test suite (`npm test`) |

## API contract

`POST /recommend` — request body. The Phase B envelope wraps the requirements
object; the flat shape (fields at the top level) stays supported:

```json
{
  "requirements": {
    "budget": 90000,
    "ram": 16,
    "storage": 512,
    "gpu": "mid-range",
    "os": "Windows",
    "workloads": ["AI/ML", "Programming"]
  }
}
```

`budget` (INR) is a hard cap; `ram`/`storage`/`gpu`/`os` are preferences, mirroring
the frontend's strictness rules. The full normalized interview profile
(`budget: {max, strict}`, `gpu: {required, minimumTier, ...}`, ...) is also
accepted as-is, so the frontend can POST its profile verbatim later.

Success (200):

```json
{
  "success": true,
  "recommendations": [
    {
      "product": { "...normalized product..." },
      "score": 100,
      "matchLabel": "strong match",
      "reasons": ["..."],
      "compromises": [],
      "unknowns": []
    }
  ],
  "count": 11,
  "feasible": true,
  "conflicts": [],
  "unmetPreferences": [],
  "meta": { "catalogSource": "bundled-catalog" }
}
```

Zero matches stays `success: true` with `count: 0`, `feasible: false` and the
engine's conflict diagnosis in `conflicts`. Invalid/missing input is `400`
(`success: false`, `errors: []`); wrong path/method is `404`/`405`; unexpected
failures are `500`. CORS headers are returned on every response.

## Local run

```powershell
cd backend
npm install        # already done in this repo
npm test           # 21 tests: handler, normalization, HTTP end-to-end, fallback
npm start          # http://localhost:5000  (set PORT to override)

curl.exe -X POST http://localhost:5000/recommend -H "Content-Type: application/json" ^
  -d "{\"requirements\":{\"budget\":90000,\"ram\":16,\"storage\":512,\"gpu\":\"mid-range\",\"os\":\"Windows\",\"workloads\":[\"AI/ML\",\"Programming\"]}}"

# After deploying, verify the real API endpoint the same way:
node scripts/smoke.mjs https://<api-id>.execute-api.<region>.amazonaws.com/prod/recommend
```

## Deploy to AWS

Prerequisites: AWS CLI v2 configured (`aws configure`), Node.js.

```powershell
cd backend
node scripts/seed-dynamodb.mjs                   # creates + seeds BuyWiseProducts (21 products)
./scripts/deploy-lambda.ps1                      # Lambda (reads BuyWiseProducts) + HTTP API POST /recommend
```

The Lambda resolves its product source as:
- `BUYWISE_PRODUCTS_TABLE` env var when set (the deploy script sets it to
  `BuyWiseProducts` by default), otherwise
- `BuyWiseProducts` automatically when running inside a Lambda execution
  environment, otherwise (local dev) the bundled catalog.

DynamoDB notes: table `BuyWiseProducts`, partition key `id` (String),
PAY_PER_REQUEST, one normalized product document per item (21 real India
laptops, existing schema, no invented data). Reads use the AWS SDK bundled in
the Node 20.x runtime (nothing extra is shipped); if the table is missing or
unreachable the Lambda automatically serves the bundled catalog and flags it
in `meta.catalogSource` (`bundled-catalog-fallback`) and CloudWatch logs, so
the API never goes down because of the table.

## Rebuilding the deployment package

The Lambda zip is assembled from the CURRENT frontend engine/catalog at
package time (single source of truth). Re-run after engine changes:

```powershell
cd backend
npm run package     # -> dist/buywise-recommendations.zip (handler: backend/src/lambda-handler.handler)
```
