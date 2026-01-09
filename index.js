const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const fs = require('fs');

const app = express();
const port = 3000;

// ===== KONFIGURASI DATABASE =====
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Binoza2610', // ⚠️ Pastikan password sesuai
    database: 'db_resep'
});

db.connect(err => {
    if (err) { console.error('❌ DB Error:', err); process.exit(1); }
    console.log('✅ Database connected');
});

