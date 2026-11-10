const crypto = require("node:crypto");
const express = require("express");
const { processPaymentNotification } = require("../services/paymentWebhook");
const { sendWebhookResult } = require("./paymentRoutes");

function tokenMatches(received, expected) {
    if (typeof received !== "string" || typeof expected !== "string") return false;
    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);
    return receivedBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

module.exports = function createWebhookRoutes(store, webhookToken) {
    const router = express.Router();

    router.post("/pagamento", async (req, res) => {
        if (!tokenMatches(req.get("x-webhook-token"), webhookToken)) {
            return res.status(401).json({ erro: "Token do webhook inválido." });
        }

        return sendWebhookResult(res, await processPaymentNotification(store, req.body));
    });

    return router;
};
