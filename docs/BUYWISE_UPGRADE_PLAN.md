# BuyWise Upgrade Plan

Source of truth for this plan: the code in this repository, verified by reading every file listed in the audit brief and by running `npm test` (backend), `npm run build` and `npm run lint` (frontend). No issue in section 3 was invented; each is traced to a file and line.

Real results recorded at audit time (2026-11-04):

- `cd backend && npm test` → `tests 36, pass 36, fail 0` (one `SyntaxError` line is logged by the malformed-JSON-over-HTTP test, which is expected and caught).
- `cd frontend && npm run build` → built successfully, `index-uY-qyuGI.js` 298.10 kB gzipped to 90.32 kB.
- `cd frontend && npm run lint` → `Found 1 warning and 0 errors` (unused `GPU_TIERS` import in `src/debug-trace.mjs`).

## 1. Architecture summary

BuyWise is a requirements-first laptop recommender. A buyer completes a guided, adaptively-branched interview (`laptopInterview.js` + `QuestionFlow.jsx`) whose answers are converted by `buildRequirements.js` into a normalized Buyer Requirements Profile that separates hard requirements (budget cap, and RAM/GPU/OS only when the buyer marks them must-have) from preferences (everything else, including inferred needs logged in `derived`). The pipeline runs feasibility first (`feasibility.js`): every applicable hard constraint filters the catalog, and when nothing passes, conflicts are diagnosed per-constraint plus jointly (clashing pairs) rather than silently relaxed. Feasible survivors are then scored by `recommendations.js` against weighted preferences (budget 20, GPU 20, RAM 15, storage 15, display 10, OS 10, portability 5, battery 5); unknown product data is excluded from the scoring denominator instead of being counted as failure, and per-product `unknowns`/`compromises` are reported. If no exact match exists, `findClosestMatches` returns up to 3 real alternatives labelled "closest match" with only controlled deviations (~+15% budget, one GPU tier, one storage step, one display step; RAM and OS never relaxed), ranked by satisfied requirement groups then the documented tie-breakers (score desc, cheaper price, stronger GPU, more RAM, id asc). Results are rendered by `ResultsView.jsx` with factual reasons, compromises, conflicts, and match-quality labels ("strong match" >= 75, "good match" >= 45, "partial match" > 0, "meets hard requirements" = 0), never claiming "best".

API path: frontend `App.jsx` calls `fetchRecommendations.js`, which POSTs the normalized profile to `VITE_BUYWISE_API_URL/recommend` (API Gateway HTTP API → Lambda `lambda-handler.handler` → `recommend.mjs` → the same frontend engine imported unchanged, so no duplicated logic → DynamoDB table `BuyWiseProducts` via `products.mjs`, with bundled-catalog fallback reported in `meta.catalogSource`). When `VITE_BUYWISE_API_URL` is unset or the API call fails for any reason, `App.jsx` falls back to the local engine (`getRecommendations(profile, laptopCatalog)`) so the UI never depends on the backend. The local Express stand-in `backend/server.js` exposes the identical `POST /recommend` contract plus `GET /health` for development.

## 2. What is already interview-strong (verified)

- Single shared engine: `backend/src/recommend.mjs` and `lambda-handler.mjs` import `frontend/src/engine/recommendations.js` and `feasibility.js` directly; no recommendation/feasibility logic is duplicated in the backend (backend/README.md confirms this design).
- Deterministic scoring with documented tie-breakers: `recommendations.js` documents the weight table, the unknown-data exclusion rule, and the 5-way ordering tie-breaker (score, price, GPU, RAM, id).
- Unknown data excluded from scoring instead of counted as failure: `scoreProduct` only scores a preference when both the preference exists and the product field is non-null; unknowns are reported per product, never penalized.
- Closest-match fallback with controlled deviations only: `findClosestMatches` allows budget +15%, one GPU tier, one storage step, one display step; RAM and OS are never relaxed (verified by the "os is never relaxed" and "exactly-satisfied requirements never produce deviation notes" tests).
- Graceful DynamoDB fallback reported in `meta.catalogSource`: `products.mjs` catches DynamoDB read failures, serves `laptopCatalog`, and returns `source: 'bundled-catalog-fallback'` plus a warning, which `recommend.mjs` exposes under `meta.catalogSource`.

## 3. What is weak or risky (verified from code — nothing invented)

| # | Issue | Evidence |
|---|-------|----------|
| 1 | README demo link ends in `.amplify.app.com` (likely invalid; Amplify domains use `.amplifyapp.com`) | `README.md` line 7: `https://main.d2kjihmub6c674.amplify.app.com` |
| 2 | 938 `node_modules` files tracked in git despite `backend/.gitignore` containing `node_modules/` | `git ls-files node_modules` count = 938 in `backend/` |
| 3 | No CI pipeline | No `.github/` directory at repo root (`.github` only appears inside `node_modules`) |
| 4 | No frontend tests | `frontend/package.json` has no `test` script; no `*.test.*` or `*.spec.*` files exist under `frontend/` |
| 5 | `/health` endpoint claimed missing — does NOT fit this codebase (already implemented) | `backend/server.js` lines 26-35: `GET /health` returns `{ ok: true, catalogSource }` or 500 |
| 6 | DynamoDB `ScanCommand` in `products.mjs` with no pagination / no `LastEvaluatedKey` handling | `backend/src/products.mjs` line 75: `new ScanCommand({ TableName: tableName })` — single scan, no loop on `LastEvaluatedKey` |
| 7 | Lambda CORS `Access-Control-Allow-Origin: *` | `backend/src/lambda-handler.mjs` line 27 |
| 8 | Results rendered without a top-N limit or side-by-side comparison | `frontend/src/components/ResultsView.jsx` maps `recommendations` to cards with no slice/limit and no side-by-side layout |
| 9 | No shareable result link | No URL-encoded requirements serialization or share-link generation anywhere in the frontend |
| 10 | No per-factor score breakdown (only total score + reason strings) | `recommendations.js` `recommendProducts` returns `{ product, score, matchLabel, reasons, compromises, unknowns }` — no per-factor earned/max points |
| 11 | `offers` list in `productSchema.js` is empty (multi-retailer price comparison promised in README Future Improvements but not built) | `frontend/src/data/productSchema.js` line 114: `offers: []`, and `createEmptyProduct()` initializes `offers: []` |
| 12 | Price freshness (`lastChecked` / `checkedAt`) not surfaced to the user | `ResultsView.jsx` price rendering (`formatPrice`) shows only the amount; `pricing.checkedAt` / `source.lastChecked` are never displayed |

## 4. Phase plan (Phases 1–5)

Every phase lists exact files touched and exact verification. No phase changes the `POST /recommend` response shape — only additive fields are added.

### Phase 1 — Repo hygiene and safety net (no behavior change)

**Goal:** Stop tracking build artifacts, fix the broken demo link, add CI so regressions are caught automatically.

Files touched:
- `README.md` — correct demo URL domain (`amplifyapp.com`) once the real deployed URL is confirmed; do not claim a live demo until verified.
- `backend/.gitignore` — confirm `node_modules/` and `dist/` are ignored (already present); untrack the 938 tracked files (`git rm --cached -r node_modules`).
- `.github/workflows/ci.yml` (new) — run `npm test` in `backend/` and `npm run build` + `npm run lint` in `frontend/` on push/PR.

Verification:
- `git ls-files backend/node_modules | wc -l` returns 0.
- `npm test` in `backend/` still passes 36/36 after untracking.
- `npm run build` and `npm run lint` in `frontend/` still pass.
- CI workflow file exists and references the exact commands above.

### Phase 2 — API contract hardening

**Goal:** Safer CORS, paginated DynamoDB reads, and confirm the existing health endpoint.

Files touched:
- `backend/src/lambda-handler.mjs` — replace `Access-Control-Allow-Origin: *` with a configurable allow-list (default to no wildcard; require confirmation of allowed origins before enabling any).
- `backend/src/products.mjs` — paginate `scanProductsTable` using `LastEvaluatedKey` in a loop until all items are retrieved, with a safety cap.
- `backend/server.js` — no change required; `GET /health` already exists (verified). Add an explicit test asserting `GET /health` returns 200 with `catalogSource`.

Verification:
- Lambda response headers no longer contain `Access-Control-Allow-Origin: *` (test in `backend/test/`).
- `ScanCommand` is called repeatedly following `LastEvaluatedKey` (unit test with a mock DynamoDB client).
- `npm test` in `backend/` passes (existing 36 + new pagination/CORS/health tests).

### Phase 3 — Result transparency (top-N, per-factor breakdown, price freshness)

**Goal:** Cap results, expose per-factor scoring, and show price freshness. Additive response fields only.

Files touched:
- `frontend/src/engine/recommendations.js` — add optional `topN` parameter to `recommendProducts`/`getRecommendations` (default = all current behavior preserved); extend each recommendation object with a new additive `scoreBreakdown` array `{ factor, weight, earned, max }` — never removing `score`, `reasons`, etc.
- `frontend/src/components/ResultsView.jsx` — render a per-factor score breakdown row per card and render price freshness (`pricing.checkedAt`) as "price checked <date>" when known; apply top-N cap to the rendered list.
- `backend/src/recommend.mjs` — pass `scoreBreakdown` through unchanged in the response payload (additive only).

Verification:
- New pure function for building `scoreBreakdown` has a unit test (engine test file).
- Response still contains all existing fields (`score`, `matchLabel`, `reasons`, `compromises`, `unknowns`) plus new `scoreBreakdown`.
- `npm test` in `backend/` passes; frontend `npm run build` + `npm run lint` pass.

### Phase 4 — Shareability and multi-retailer offers

**Goal:** Shareable result link; populate `offers` for multi-retailer price comparison (README Future Improvements).

Files touched:
- `frontend/src/components/ResultsView.jsx` — generate a shareable URL that encodes the requirements profile (query-string serialization/deserialization, pure functions), and render a per-retailer price comparison using `product.offers` when present.
- `frontend/src/data/productSchema.js` — no schema change needed (`offers` already exists); document ingestion rule that `offers` entries carry `{ retailer, currency, price, url, checkedAt }`.
- `frontend/src/data/laptopCatalog.js` — do NOT invent offers or prices; leave `offers: []` until real retailer data is available (no fake laptops, no invented prices).

Verification:
- Shareable link round-trips: serialize profile → URL → deserialize → identical profile (pure function with test).
- ResultsView renders "price checked" freshness per offer when `checkedAt` is present; no offer is rendered without a real retailer/price.
- Catalog entries still have `offers: []` (no invented data); build and lint pass.

### Phase 5 — Frontend testing and parity

**Goal:** Bring frontend testing to parity with backend; no new heavy dependencies without confirmation.

Files touched:
- `frontend/src/data/buildRequirements.test.js`, `frontend/src/data/summarizeRequirements.test.js`, `frontend/src/engine/recommendations.test.js`, `frontend/src/engine/feasibility.test.js` (new) — pure-function tests of the requirement-building, summarization, scoring, and feasibility modules. Run with Node's built-in `node:test` (no new dependency) to respect the "no new heavy dependencies without confirmation" rule; if the user prefers Vitest, that requires a separate confirmation.
- `frontend/package.json` — add `"test": "node --test"` script (no new dependency).
- `backend/test/` — no change required; existing 36 tests remain the regression gate.

Verification:
- `npm test` added to `frontend/` and passes all new pure-function tests.
- `npm run build` and `npm run lint` in `frontend/` still pass.
- Backend `npm test` still passes 36+; frontend and backend test suites run independently.

## 5. Anything in Phases 1–5 that does NOT fit this codebase (with evidence)

| Planned item | Fit? | Evidence |
|---|---|---|
| "Add `/health` endpoint" (was listed as a weakness) | **Does not fit — already done** | `backend/server.js` lines 26-35 implement `GET /health` returning `{ ok: true, catalogSource }` or 500. No Phase work needed; Phase 2 only adds a test for it. |
| "Fix missing health check in products.mjs" | **Does not fit** | `products.mjs` already reports DynamoDB failures via warning + `bundled-catalog-fallback` source. |
| Adding a frontend test runner as a new heavy dependency | **Blocked pending confirmation** | Quality bar forbids new heavy dependencies without justification + confirmation. Plan uses built-in `node:test` instead; Vitest is NOT added. |
| Claiming the Amplify demo URL is live | **Blocked** | The README URL (`...amplify.app.com`) is unverified and likely malformed; no live demo is claimed anywhere in this plan. |
| Populating `offers` with sample prices | **Blocked** | No fake laptops, no invented prices. `offers` stays `[]` until real retailer data exists. |

No material deviation from Phases 1–5 is required: every phase maps to a verified weakness or a hygiene item, and nothing in the plan contradicts the existing `POST /recommend` response shape, the single shared engine, or the local fallback behavior.



