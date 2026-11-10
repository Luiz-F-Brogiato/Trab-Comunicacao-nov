const crypto = require("node:crypto");
const express = require("express");
const { paymentStatuses } = require("../store/paymentStore");
const { processPaymentNotification } = require("../services/paymentWebhook");

const maximumAmount = 99999999.99;

function validPaymentInput(body) {
    const { cliente, valor } = body ?? {};
    return typeof cliente === "string" && cliente.trim().length > 0 &&
        cliente.trim().length <= 120 &&
        typeof valor === "number" && Number.isFinite(valor) &&
        valor > 0 && valor <= maximumAmount &&
        valor === Number(valor.toFixed(2));
}

function sendWebhookResult(res, result) {
    if (result.type === "invalid") {
        return res.status(400).json({ erro: "Informe pagamentoId, um status válido e eventoId." });
    }
    if (result.type === "not_found") {
        return res.status(404).json({ erro: "Pagamento não encontrado." });
    }
    if (result.type === "duplicate") {
        return res.status(200).json({ mensagem: "Evento já processado.", duplicado: true });
    }
    return res.status(200).json({ mensagem: "Webhook processado.", pagamento: result.payment });
}

module.exports = function createPaymentRoutes(store) {
    const router = express.Router();

    router.post("/", async (req, res) => {
        if (!validPaymentInput(req.body)) {
            return res.status(400).json({
                erro: "Informe um nome de cliente e um valor maior que zero com até duas casas decimais."
            });
        }

        const pagamento = await store.createPayment(req.body.cliente.trim(), req.body.valor);
        return res.status(201).json({ mensagem: "Cobrança criada.", pagamento });
    });

    router.get("/", async (req, res) => {
        const { status } = req.query;
        if (status !== undefined && !paymentStatuses.includes(status)) {
            return res.status(400).json({ erro: "Status inválido." });
        }
        return res.json({ pagamentos: await store.listPayments(status) });
    });

    router.get("/:id", async (req, res) => {
        const pagamento = await store.getPayment(req.params.id);
        if (!pagamento) return res.status(404).json({ erro: "Pagamento não encontrado." });
        return res.json({ pagamento });
    });

    router.post("/:id/simular", async (req, res) => {
        const result = await processPaymentNotification(store, {
            pagamentoId: req.params.id,
            status: "approved",
            eventoId: `demo-${crypto.randomUUID()}`
        });
        return sendWebhookResult(res, result);
    });

    return router;
};

module.exports.sendWebhookResult = sendWebhookResult;
