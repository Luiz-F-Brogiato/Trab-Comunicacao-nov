const crypto = require("node:crypto");
const mysql = require("mysql2/promise");

const paymentStatuses = ["pending", "approved", "rejected", "cancelled"];

function createPoolFromEnv(env = process.env) {
    const required = ["DB_HOST", "DB_USER", "DB_NAME"];
    const missing = required.filter((name) => !env[name]);
    if (missing.length) {
        throw new Error(`Variáveis de banco ausentes: ${missing.join(", ")}`);
    }

    return mysql.createPool({
        host: env.DB_HOST,
        port: Number(env.DB_PORT) || 3306,
        user: env.DB_USER,
        password: env.DB_PASSWORD || "",
        database: env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        decimalNumbers: true
    });
}

function normalizePayment(row) {
    if (!row) return null;
    return {
        id: row.id,
        cliente: row.customer_name,
        valor: Number(row.amount),
        status: row.status,
        criadoEm: new Date(row.created_at).toISOString(),
        ...(row.updated_at ? { atualizadoEm: new Date(row.updated_at).toISOString() } : {})
    };
}

function createPaymentStore(pool) {
    return {
        async initialize() {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS payments (
                    id CHAR(36) NOT NULL PRIMARY KEY,
                    customer_name VARCHAR(120) NOT NULL,
                    amount DECIMAL(10, 2) NOT NULL,
                    status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
                    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                    updated_at TIMESTAMP(3) NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);
            await pool.query(`
                CREATE TABLE IF NOT EXISTS payment_events (
                    event_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
                    payment_id CHAR(36) NOT NULL,
                    status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL,
                    received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                    CONSTRAINT fk_payment_events_payment
                        FOREIGN KEY (payment_id) REFERENCES payments(id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);
        },

        async createPayment(customer, amount) {
            const id = crypto.randomUUID();
            await pool.execute(
                "INSERT INTO payments (id, customer_name, amount) VALUES (?, ?, ?)",
                [id, customer, amount]
            );
            const [rows] = await pool.execute("SELECT * FROM payments WHERE id = ?", [id]);
            return normalizePayment(rows[0]);
        },

        async getPayment(id) {
            const [rows] = await pool.execute("SELECT * FROM payments WHERE id = ?", [id]);
            return normalizePayment(rows[0]);
        },

        async listPayments(status) {
            const [rows] = status
                ? await pool.execute(
                    "SELECT * FROM payments WHERE status = ? ORDER BY created_at DESC, id DESC",
                    [status]
                )
                : await pool.query("SELECT * FROM payments ORDER BY created_at DESC, id DESC");
            return rows.map(normalizePayment);
        },

        async processWebhook({ paymentId, status, eventId }) {
            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();
                const [existingEvents] = await connection.execute(
                    "SELECT event_id FROM payment_events WHERE event_id = ?",
                    [eventId]
                );
                if (existingEvents.length) {
                    await connection.rollback();
                    return { type: "duplicate" };
                }

                const [payments] = await connection.execute(
                    "SELECT * FROM payments WHERE id = ? FOR UPDATE",
                    [paymentId]
                );
                if (!payments.length) {
                    await connection.rollback();
                    return { type: "not_found" };
                }

                await connection.execute(
                    "INSERT INTO payment_events (event_id, payment_id, status) VALUES (?, ?, ?)",
                    [eventId, paymentId, status]
                );
                await connection.execute(
                    "UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
                    [status, paymentId]
                );
                const [updatedPayments] = await connection.execute(
                    "SELECT * FROM payments WHERE id = ?",
                    [paymentId]
                );
                await connection.commit();
                return { type: "updated", payment: normalizePayment(updatedPayments[0]) };
            } catch (error) {
                await connection.rollback();
                if (error.code === "ER_DUP_ENTRY") return { type: "duplicate" };
                throw error;
            } finally {
                connection.release();
            }
        }
    };
}

module.exports = {
    createPoolFromEnv,
    createPaymentStore,
    paymentStatuses
};
