# BuyWise Demo Checklist

This checklist governs the public demo link and frontend API connection. It is
documentation only — no source code is changed by this file.

## 1. README demo link (do not change yet)

The current `README.md` live-demo link ends in `.amplify.app.com`. It was verified
broken: opening it produces a TLS certificate mismatch (the certificate does not
match the domain), so the link does not serve the BuyWise frontend.

**Do NOT** replace this URL with a guessed domain. The correct Amplify domain
must be copied from the AWS Amplify Console (App settings → Domains & hosting,
or the App settings → Environment variables page for `VITE_BUYWISE_API_URL`).

## 2. Before the demo link can be updated in README

A human must complete all of the following, in order:

1. Open the AWS Amplify Console for the BuyWise app.
2. Copy the actual `amplifyapp.com` domain from App settings (not a guessed
   variant ending in `.amplify.app.com`).
3. Set `VITE_BUYWISE_API_URL` in Amplify App settings → Environment variables
   to the deployed API Gateway invoke URL, then redeploy, if the demo is to use
   the backend API instead of the local engine.
4. Open the copied Amplify URL in an incognito/private browser window.
5. Complete one full interview (answer all questions through "Find my laptop
   matches").
6. Confirm the results page renders without errors.

Only after steps 1–6 succeed may the README demo URL be updated to the verified
domain.

## 3. Local development equivalent

Copy `frontend/.env.example` to `frontend/.env`, set `VITE_BUYWISE_API_URL` to
the local backend (`http://localhost:5000/recommend`) or leave empty to use the
local engine, then run `npm run build` in `frontend/`.

## 4. What is intentionally NOT done here

- No frontend unit tests are added in this phase (backend tests already cover
  the engine/API contract).
- The README link is left untouched until a human completes the incognito
  check above.
- No invented demo URL, price, or retailer claim appears anywhere in this file.
