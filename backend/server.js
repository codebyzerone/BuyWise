const express = require("express");
const cors = require("cors");

/**
 * BuyWise local backend - the local stand-in for the AWS API Gateway ->
 * Lambda deployment (see scripts/deploy-lambda.ps1).
 *
 * Routes:
 *   GET  /          - liveness message (unchanged original endpoint)
 *   GET  /health    - health + active product catalog source
 *   POST /recommend - the same code path as the Lambda's POST /recommend
 *                     (src/recommend.mjs -> existing BuyWise engine)
 */

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "BuyWise backend is running!"
    });
});

app.get("/health", async (req, res) => {
    try {
        const { getProducts } = await import("./src/products.mjs");
        const { source } = await getProducts();
        res.json({ ok: true, catalogSource: source });
    } catch (error) {
        console.error("[health] catalog check failed:", error);
        res.status(500).json({ ok: false, error: "Catalog unavailable" });
    }
});

app.post("/recommend", async (req, res) => {
    try {
        const { handleRecommendRequest } = await import("./src/recommend.mjs");
        const result = await handleRecommendRequest(req.body);
        res.status(result.statusCode).json(result.payload);
    } catch (error) {
        // Never leak internals; the console keeps the full stack trace.
        console.error("[recommend] unhandled error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error while generating recommendations."
        });
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`BuyWise backend running on http://localhost:${PORT}`);
});

module.exports = app;
