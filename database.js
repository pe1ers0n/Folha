// database.js
const { Pool } = require('pg'); // Driver do Postgres (para o DW)
const mysql = require('mysql2/promise'); // Driver do MySQL (para o App Local)

// --- CONEXÃO 1: DATA WAREHOUSE (Remoto - Postgres) ---
const poolDW = new Pool({
  user: 'cezanilton',
  host: '192.168.70.6',
  database: 'dw_tijuca_v2',
  password: 'Tijuca@2025',
  port: 5432,
  connectionTimeoutMillis: 2000,
});

// --- CONEXÃO 2: BANCO DA APLICAÇÃO (Local - MySQL) ---
const poolApp = mysql.createPool({
  host: 'localhost', // Conecta no próprio PC (onde está o 192.168.8.11)
  user: 'root',
  password: 'root',      // No XAMPP/WAMP a senha do root geralmente é vazia. Se tiver senha, coloque aqui.
  database: 'folha_pagamentos',
  port: 3306,        // Porta padrão do MySQL
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Testes de Conexão (Logs no terminal)
poolDW.query('SELECT NOW()', (err) => {
    if (err) console.error('[ERRO DW] Falha ao conectar no Postgres:', err.code);
    else console.log('[OK] Conectado ao Data Warehouse (Postgres).');
});

// Teste assíncrono para MySQL
(async () => {
    try {
        const connection = await poolApp.getConnection();
        console.log('[OK] Conectado ao Banco Local (MySQL).');
        connection.release();
    } catch (err) {
        console.error('[ERRO APP] Falha ao conectar no MySQL Local:', err.message);
    }
})();

module.exports = { 
    dbDW: poolDW, 
    dbApp: poolApp 
};