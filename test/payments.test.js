const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, before, test } = require("node:test");
const { createApp } = require("../src/app");

class TestPaymentStore {
    constructor() {
        this.payments = new Map();
        this.events = new Set();
    }

    async createPayment(cliente, valor) {
        const pagamento = {
            id: crypto.randomUUID(),
            cliente,
            valor,
            status: "pending",
            criadoEm: new Date().toISOString()
        };
        this.payments.set(pagamento.id, pagamento);
        return { ...pagamento };
    }

    async getPayment(id) {
        const pagamento = this.payments.get(id);
        return pagamento ? { ...pagamento } : null;
    }

    async listPayments(status) {
        return [...this.payments.values()]
            .filter((pagamento) => !status || pagamento.status === status)
            .map((pagamento) => ({ ...pagamento }));
    }

    async processWebhook({ paymentId, status, eventId }) {
        if (this.events.has(eventId)) return { type: "duplicate" };
        const pagamento = this.payments.get(paymentId);
        if (!pagamento) return { type: "not_found" };
        this.events.add(eventId);
        pagamento.status = status;
        pagamento.atualizadoEm = new Date().toISOString();
        return { type: "updated", payment: { ...pagamento } };
    }
}

let server;
let baseUrl;
let store;

before(async () => {
    store = new TestPaymentStore();
    server = createApp({ store, webhookToken: "test-webhook-token" })
        .listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
});

async function createPayment() {
    const response = await fetch(`${baseUrl}/pagamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente: "Ana Silva", valor: 42.5 })
    });
    return { response, data: await response.json() };
}

test("cria, consulta e lista pagamentos filtrando pelo status", async () => {
    const { response, data } = await createPayment();
    assert.equal(response.status, 201);
    assert.equal(data.pagamento.status, "pending");
    assert.equal(data.pagamento.cliente, "Ana Silva");

    const byId = await fetch(`${baseUrl}/pagamentos/${data.pagamento.id}`);
    assert.equal(byId.status, 200);
    assert.equal((await byId.json()).pagamento.id, data.pagamento.id);

    const pending = await fetch(`${baseUrl}/pagamentos?status=pending`);
    assert.equal((await pending.json()).pagamentos.length, 1);
    const invalidFilter = await fetch(`${baseUrl}/pagamentos?status=unknown`);
    assert.equal(invalidFilter.status, 400);
});

test("rejeita dados inválidos na criação e na notificação", async () => {
    const invalidPayment = await fetch(`${baseUrl}/pagamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente: " ", valor: -1 })
    });
    assert.equal(invalidPayment.status, 400);

    const validDecimal = await fetch(`${baseUrl}/pagamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente: "Bruno", valor: 42.29 })
    });
    assert.equal(validDecimal.status, 201);

    const invalidWebhook = await fetch(`${baseUrl}/webhook/pagamento`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-webhook-token": "test-webhook-token"
        },
        body: JSON.stringify({ pagamentoId: "id-inválido", status: "unknown", eventoId: "" })
    });
    assert.equal(invalidWebhook.status, 400);
});

test("atualiza status pelo webhook e não reaplica evento duplicado", async () => {
    const { data: created } = await createPayment();
    const payload = {
        pagamentoId: created.pagamento.id,
        status: "approved",
        eventoId: "evento-teste-1"
    };
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-webhook-token": "test-webhook-token"
        },
        body: JSON.stringify(payload)
    };

    const updated = await fetch(`${baseUrl}/webhook/pagamento`, options);
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).pagamento.status, "approved");

    const duplicate = await fetch(`${baseUrl}/webhook/pagamento`, {
        ...options,
        body: JSON.stringify({ ...payload, status: "rejected" })
    });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).duplicado, true);

    const current = await fetch(`${baseUrl}/pagamentos/${created.pagamento.id}`);
    assert.equal((await current.json()).pagamento.status, "approved");
});

test("recusa token inválido e permite simular recebimento", async () => {
    const { data: created } = await createPayment();
    const unauthorized = await fetch(`${baseUrl}/webhook/pagamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-token": "wrong-token" },
        body: JSON.stringify({
            pagamentoId: created.pagamento.id,
            status: "approved",
            eventoId: "evento-nao-autorizado"
        })
    });
    assert.equal(unauthorized.status, 401);

    const simulated = await fetch(`${baseUrl}/pagamentos/${created.pagamento.id}/simular`, {
        method: "POST"
    });
    assert.equal(simulated.status, 200);
    assert.equal((await simulated.json()).pagamento.status, "approved");
});
