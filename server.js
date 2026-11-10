require("dotenv").config();

const { createApp } = require("./src/app");
const { createPaymentStore, createPoolFromEnv } = require("./src/store/paymentStore");

async function start() {
    const webhookToken = process.env.WEBHOOK_TOKEN;
    if (!webhookToken) throw new Error("Defina WEBHOOK_TOKEN no arquivo .env.");

    const pool = createPoolFromEnv();
    const store = createPaymentStore(pool);
    await store.initialize();

    const app = createApp({ store, webhookToken });
    const port = Number(process.env.PORT) || 5000;
    const server = app.listen(port, () => {
        console.log(`Servidor rodando em http://localhost:${port}`);
    });

    const shutdown = () => {
        server.close(async () => {
            await pool.end();
            process.exit(0);
        });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

start().catch((error) => {
    console.error("Não foi possível iniciar o servidor:", error.message);
    process.exitCode = 1;
});
