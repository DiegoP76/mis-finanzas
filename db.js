const { Pool } = require('pg');

let pool = null;
let isReady = false;

async function initDB() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.log('No DATABASE_URL set — using JSON file storage');
        return;
    }
    try {
        pool = new Pool({ connectionString: dbUrl });
        await pool.query('SELECT 1');
        await pool.query(`
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
        isReady = true;
        console.log('PostgreSQL connected — tables ready');
    } catch (err) {
        console.error('PostgreSQL connection failed, falling back to JSON files:', err.message);
        pool = null;
    }
}

module.exports = { initDB, getPool: () => pool, isReady: () => isReady };
