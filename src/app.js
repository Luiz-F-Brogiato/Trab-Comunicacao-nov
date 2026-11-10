const express = require("express");
const path = require("node:path");
const createPaymentRoutes = require("./routes/paymentRoutes");
const createWebhookRoutes = require("./routes/webhookRoutes");

function createApp({ store, webhookToken }) {
    if (!store) throw new Error("O armazenamento de pagamentos é obrigatório.");
    if (typeof webhookToken !== "string" || !webhookToken) {
        throw new Error("WEBHOOK_TOKEN é obrigatório.");
    }

    const app = express();
    app.use(express.json({ limit: "16kb" }));
    app.use(express.static(path.join(__dirname, "public")));
    app.get("/", (req, res) => {
        res.sendFile(path.join(__dirname, "public", "index.html"));
    });

    app.use("/pagamentos", createPaymentRoutes(store));
    app.use("/webhook", createWebhookRoutes(store, webhookToken));
    app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);
        if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
            return res.status(400).json({ erro: "JSON inválido." });
        }
        if (error.status === 413) {
            return res.status(413).json({ erro: "Corpo da requisição muito grande." });
        }
        console.error("Erro ao processar requisição:", error);
        return res.status(500).json({ erro: "Erro interno do servidor." });
    });

    return app;
}

module.exports = { createApp };
