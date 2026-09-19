# BuyWise — Manual AWS Console Deployment (no AWS CLI required)

Everything on this page is done in the AWS Management Console. The machine
where you run this does NOT need the AWS CLI, only a browser and Node.js
(to build the Lambda zip and to smoke-test the deployed API).

Do the steps in order. Total time: ~20 minutes.

---

## Step 0 — Build the Lambda deployment package (local, no AWS)

```powershell
cd backend
npm run package
```

Result: `backend/dist/buywise-recommendations.zip` (~0.05 MB).
Lambda handler value (needed in Step 3): `backend/src/lambda-handler.handler`

---

## Step 1 — IAM role for Lambda

1. AWS Console → search **IAM** → left menu **Roles** → **Create role**.
2. Trusted entity type: **AWS service**; Use case: **Lambda** → Next.
3. Permissions policies: search **AWSLambdaBasicExecutionRole**, tick its
   checkbox → Next → Next.
4. Role name: **buywise-lambda-role** → **Create role**.

Expected result: role `buywise-lambda-role` appears in the roles list.

---

## Step 2 — DynamoDB table

1. Console → search **DynamoDB** → **Tables** → **Create table**.
2. Table name: **BuyWiseProducts**
   Partition key: **id** — type **String** (leave sort key empty).
3. Table class: **DynamoDB Standard**. Capacity: **On-demand** (defaults).
4. **Create table**.

Expected result: table `BuyWiseProducts`, Status **Active**.

### Step 2b — Load the 21 products (CLI-free)

1. Open the table `BuyWiseProducts` → **Explore items** (or "Items") →
   **Create item**.
2. In the item editor, if a **"DynamoDB JSON"** toggle is shown in the
   editor pane, switch it **off** (plain JSON) and paste the contents of
   `backend/console-seed/BW-IN-001.json`; create the item. Then repeat for
   BW-IN-002 … BW-IN-021.
   If you cannot turn the toggle off, paste the corresponding file from
   `backend/console-seed-ddb/` instead (those are pre-marshalled DynamoDB
   JSON).
3. After all 21: **Explore items** shows "21 items".

**Note — this step is OPTIONAL for the demo:** the Lambda automatically
falls back to the bundled 21-product catalog if the table is empty or
unreachable, and reports it in the response (`meta.catalogSource`). Seed the
table when you have time; the demo works either way.

---

## Step 3 — Lambda function

1. Console → search **Lambda** → **Create function** → **Author from
   scratch**.
2. Function name: **buywise-recommend-api**
   Runtime: **Node.js 20.x**; Architecture: **x86_64**.
3. Permissions → Change default execution role → **Use an existing role** →
   **buywise-lambda-role** (from Step 1) → **Create function**.
4. **Code tab** → **Upload from → .zip file** → select
   `backend/dist/buywise-recommendations.zip` → **Save**.
5. **Configuration → Runtime settings → Edit** → Handler:
   **backend/src/lambda-handler.handler** → Save.
6. **Configuration → Environment variables → Edit** → Add:
   Key **BUYWISE_PRODUCTS_TABLE** = Value **BuyWiseProducts** → Save.
7. **Configuration → General configuration → Edit** → Memory **256 MB**,
   Timeout **15 sec** → Save.

### Test the Lambda directly (before API Gateway)

**Test tab** → Event name `valid`, Event JSON:

```json
{
  "budget": 90000,
  "ram": 16,
  "storage": 512,
  "gpu": "mid-range",
  "os": "Windows",
  "workloads": ["AI/ML", "Programming"]
}
```

→ **Test**. Expected response (Execution result: succeeded):
`{"success":true,"recommendations":[...],"count":11,"feasible":true,...}`
(`meta.catalogSource` shows `dynamodb:BuyWiseProducts` once the table is
seeded, or `bundled-catalog` / `bundled-catalog-fallback` otherwise.)

Second event, name `impossible`:

```json
{ "budget": 15000, "gpu": "high-performance" }
```

Expected: `"success":true,"count":0,"feasible":false,"conflicts":[...]`
(zero matches is a SUCCESS response, with the conflict diagnosis).

---

## Step 4 — API Gateway (POST /recommend)

1. Console → search **API Gateway** → **Create API** → **HTTP API** →
   **Build**.
2. **Add integration** → **Lambda** → Lambda function:
   **buywise-recommend-api** (the console auto-grants invoke permission).
   Payload format version: **2.0** (default).
3. API name: **buywise-api** → **Review** → **Create**.
4. **Routes → Create** → Method **POST**, Path **/recommend** → Create.
5. Select the **POST /recommend** route → **Edit** (or "Attach integration")
   → Integration target: **buywise-recommend-api** → Save.
   (You may delete the auto-created `$default` ANY route; it is not needed.)
6. **CORS**: select the **POST /recommend** route → **Enable CORS** →
   Access-Control-Allow-Origin: **`*`**; Allow methods: **POST, OPTIONS**;
   Allow headers: **Content-Type** → Save.
   (Belt-and-braces: the Lambda also returns CORS headers itself.)
7. Stages: `$default` auto-deploys — no action needed.

Expected result — the API's main page shows the invoke URL:

```
https://<api-id>.execute-api.<region>.amazonaws.com/recommend
```

Copy this URL — it is the value for `VITE_BUYWISE_API_URL`.

---

## Step 5 — Verify the real AWS API (from this machine, no CLI)

```powershell
cd backend
node scripts/smoke.mjs https://<api-id>.execute-api.<region>.amazonaws.com/recommend
```

Expected output:

```
PASS [valid recommendation] status=200 count=11
PASS [impossible requirements] status=200 count=0
PASS [invalid request] status=400
All 3 smoke tests passed
```

(Open PowerShell, not cmd. The machine needs internet access only.)

---

## Step 6 — Connect the frontend (AWS Amplify)

1. AWS Amplify Console → your BuyWise app → **App settings → Environment
   variables** → **Manage variables** → Add:
   Key **VITE_BUYWISE_API_URL** = the API URL from Step 4.
2. **Build settings → Redeploy build** (or any new commit redeploys).
   Vite picks up `VITE_*` variables at build time.

Local equivalent: copy `frontend/.env.example` to `frontend/.env` and fill
the URL, then `npm run build`.

The frontend change is already in the repo: when the variable is set the
interview posts the normalized profile to `POST /recommend` and renders the
backend result in the existing ResultsView; if the API is unreachable the
local engine answers automatically, so the deployed demo never breaks.

---

## What you should end up with

| Resource | Name/Value |
|---|---|
| DynamoDB table | `BuyWiseProducts` (PK `id` String, on-demand, 21 items) |
| Lambda function | `buywise-recommend-api` (nodejs20.x, handler `backend/src/lambda-handler.handler`) |
| Lambda env var | `BUYWISE_PRODUCTS_TABLE=BuyWiseProducts` |
| API Gateway | HTTP API `buywise-api`, route `POST /recommend`, CORS `*` |
| API URL | `https://<api-id>.execute-api.<region>.amazonaws.com/recommend` |
| Amplify env var | `VITE_BUYWISE_API_URL=<API URL>` |



