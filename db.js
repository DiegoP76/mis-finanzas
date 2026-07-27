const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                username VARCHAR(100) PRIMARY KEY,
                password VARCHAR(255) NOT NULL,
                pin VARCHAR(10) DEFAULT '',
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id BIGINT PRIMARY KEY,
                username VARCHAR(100) REFERENCES users(username),
                type VARCHAR(20) NOT NULL,
                amount DECIMAL(12,2) NOT NULL,
                category VARCHAR(100) NOT NULL,
                description TEXT DEFAULT '',
                date VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS categories (
                id VARCHAR(100) PRIMARY KEY,
                username VARCHAR(100) REFERENCES users(username),
                type VARCHAR(20) NOT NULL,
                label VARCHAR(100) NOT NULL,
                icon VARCHAR(10) DEFAULT '\uD83D\uDCCC',
                    color VARCHAR(20) NOT NULL
                );
            `);
        console.log('Database tables initialized');
    } finally {
        client.release();
    }
}

module.exports = { pool, initDB };
