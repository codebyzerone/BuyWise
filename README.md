# BuyWise

BuyWise turns a short guided interview into structured laptop requirements and returns ranked, explainable laptop recommendations.

## 🚀 Live Demo

**https://main.d2kjihmub6c674.amplify.app.com**

## 🎯 Problem

Buyers usually know two things: their budget and what they will use the laptop for — studying, coding, gaming, editing, or AI work. What they do not know is how those needs translate into specifications such as RAM, storage, GPU tier, display quality, or operating system.

As a result, laptops get compared by numbers and marketing labels instead of by whether the machine actually fits the buyer — so buyers either overspend or end up with a laptop that misses their real requirements.

## 💡 Solution

BuyWise replaces specification shopping with requirements shopping:

- A guided interview asks about budget, primary use, workloads, must-haves, and preferences.
- Those answers are converted into a structured **Buyer Requirements Profile** (budget cap, use cases, RAM/storage targets, GPU tier, OS, display preference), with hard requirements kept separate from preferences.
- Every product in the catalog is checked against that profile, ranked, and returned with the reasons it matched and the compromises it makes.

## 🔄 How It Works

```
User Interview → Requirement Normalization → Feasibility Check → Recommendation & Scoring → Results
```

1. **User interview** — an adaptive question flow that skips sections that do not apply.
2. **Requirement normalization** — answers become a structured requirements profile; unanswered details stay unknown instead of being guessed.
3. **Feasibility check** — hard requirements (budget maximum, and any must-have RAM/GPU/OS) filter the catalog; when nothing passes, the conflicts are diagnosed and reported.
4. **Recommendation & scoring** — feasible products are scored against weighted preferences and ordered deterministically.
5. **Results** — matched laptops with match quality, reasons, compromises, and unknown data; when nothing fits exactly, the closest real alternatives are shown instead.

## ⭐ Key Features

- **Guided laptop interview** — adaptive question flow built around budget, workload, and must-haves.
- **Requirement-based recommendations** — results come from the user's stated requirements, never from popularity or sponsorship.
- **Feasibility & conflict detection** — hard requirements are enforced, and impossible combinations are explained rather than silently relaxed.
- **Explainable results** — each laptop states why it matches, what was compromised, and which data was unknown.
- **Closest-match fallback** — when nothing fits exactly, the 3 closest real laptops are shown with their exact differences (up to ~15% budget overage, one GPU tier lower, one storage/display step; RAM and OS are never relaxed).
- **Real laptop product catalog** — 21 curated real products, not synthetic placeholders.
- **Graceful local fallback** — if the API is unreachable, the frontend computes recommendations locally with the same engine.

## 💻 Real Product Data

The catalog contains **21 real laptop products for the India market**, stored in the project's normalized product schema with structured specifications (CPU, GPU tier/model, RAM, storage, display, OS), India pricing in INR, retailer source, and a product URL where the source provides one (18 of 21 entries link directly to the listing).

Listings are curated manually from real retailers and brand stores (Flipkart, Amazon.in, Lenovo / HP / Acer / ASUS India stores, Smartprix). Specifications that a source does not state are left empty rather than guessed.

## 🧠 Recommendation Engine

The engine is deterministic and rule-based — it does not use machine learning or an LLM.

1. **Feasibility** — filters the catalog by hard requirements (budget maximum, and must-have RAM / GPU / OS).
2. **Conflict detection** — when nothing passes, it reports which requirement no product can satisfy, including conflicting requirement pairs.
3. **Scoring** — weighted preferences (budget, GPU, RAM, storage, display, OS, portability, battery) produce a 0–100 match score; unknown data is excluded from scoring instead of being counted as a failure.
4. **Ranking & explanations** — results are ordered by score using documented tie-breakers, and every result carries factual reasons, compromises, and unknown fields.

## 🏗️ Architecture

```
React frontend (Vite)
        │  POST /recommend  { requirements }
        ▼
API  ── local: Express server   ·   AWS: API Gateway (HTTP API) → Lambda (Node.js 20.x)
        ▼
Recommendation engine (feasibility → conflict detection → scoring)
        ▼
Product catalog ── DynamoDB table "BuyWiseProducts"   ·   bundled catalog fallback
```

Both entry points run the same engine code. The AWS path — Lambda handler, API Gateway route, DynamoDB product source, packaging/deployment scripts, and a console deployment guide — is implemented in the repository, and the local Express server exposes the identical `POST /recommend` contract for development. If the Lambda cannot read DynamoDB, it automatically serves the bundled catalog.

## 🛠️ Tech Stack

- **Frontend:** React 19, Vite, plain CSS, oxlint
- **Backend:** Node.js, Express 5 (local API), AWS Lambda (Node.js 20.x), API Gateway HTTP API
- **Data:** DynamoDB (partition key `id`) via AWS SDK v3, plus the bundled catalog module
- **Testing:** Node.js built-in test runner (`node:test`)

## 📁 Project Structure

```
frontend/
  src/components/   interview flow, results view, landing page
  src/data/         interview questions, requirement builder, product catalog + schema
  src/engine/       feasibility and recommendation engine
  src/api/          optional connection to the backend API
backend/
  src/              Lambda handler, /recommend core, request validation, product source
  server.js         local Express API (same contract as the deployed endpoint)
  test/             engine, API, and integration tests
  scripts/          packaging, deployment, DynamoDB seeding, smoke tests
docs/               AWS console deployment guide
```

## 🧪 Testing

- **Backend:** `npm test` in `backend/` — 36 tests passing (requirement validation, Lambda event formats, HTTP API contract, catalog fallback, and engine/API parity).
- **Frontend:** `npm run build` completes successfully; `npm run lint` reports no errors.
- **API smoke test:** `node backend/scripts/smoke.mjs <endpoint>` checks a valid request, an impossible request, and an invalid request against the endpoint.

## 🔮 Future Improvements

- Expand the catalog well beyond 21 laptops, with more India-market listings and price ranges.
- Automate price refreshes so catalog pricing stays current.
- Use the existing multi-retailer `offers` model to compare prices across retailers.
- Add saved and shareable requirement profiles for revisiting a comparison.
- Add side-by-side comparison of the top matches alongside the existing explanations.
- Improve accessibility and add regional-language support to the interview.

## 👤 Project

BuyWise — Laptop Recommendation Assistant

