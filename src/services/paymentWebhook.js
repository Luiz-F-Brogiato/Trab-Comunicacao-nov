const { paymentStatuses } = require("../store/paymentStore");

const paymentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateWebhookPayload(body) {
    const { pagamentoId, status, eventoId } = body ?? {};
    if (typeof pagamentoId !== "string" || !paymentIdPattern.test(pagamentoId) ||
        typeof status !== "string" || !paymentStatuses.includes(status) ||
        typeof eventoId !== "string" || !eventoId.trim() || eventoId.length > 128) {
        return null;
    }

    return {
        paymentId: pagamentoId,
        status,
        eventId: eventoId.trim()
    };
}

async function processPaymentNotification(store, body) {
    const notification = validateWebhookPayload(body);
    if (!notification) return { type: "invalid" };
    return store.processWebhook(notification);
}

module.exports = { processPaymentNotification, validateWebhookPayload };
