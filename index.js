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

// ===== MIDDLEWARE =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('frontend'));
app.use('/uploads', express.static(path.join(__dirname, 'frontend/uploads')));
app.use(session({
    secret: 'rahasia_dapur_nusantara',
    resave: false,
    saveUninitialized: true
}));

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, 'frontend/uploads/'),
        filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
    })
});

function generateApiKey() {
    return 'sk-or-v1-' + crypto.randomBytes(16).toString('hex');
}
// ===== AUTH ROUTES =====
app.post('/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    db.query("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, 'developer')", 
    [username, email, password], (err, result) => {
        if (err) return res.send(`<script>alert('Gagal Register!'); window.history.back();</script>`);
        
        // Buat API Key Pertama (Single Key Logic)
        const firstKey = generateApiKey();
        db.query("INSERT INTO api_keys (user_id, api_key, name, is_active) VALUES (?, ?, ?, 1)", 
            [result.insertId, firstKey, 'Main Key']);
            
        res.redirect('/login.html');
    });
});

app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, results) => {
        if (results.length > 0) {
            req.session.user = results[0];
            if (results[0].role === 'admin') res.redirect('/admin');
            else res.redirect('/dashboard.html');
        } else {
            res.send(`<script>alert('Login Gagal!'); window.history.back();</script>`);
        }
    });
});

app.get('/admin-login', (req, res) => res.sendFile(path.join(__dirname, 'frontend/admin-login.html')));
app.post('/auth/admin-login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM users WHERE username = ? AND password = ? AND role = 'admin'", [username, password], (err, results) => {
        if (results.length > 0) {
            req.session.user = results[0];
            res.redirect('/admin');
        } else {
            res.send(`<script>alert('Bukan Admin!'); window.location.href='/admin-login';</script>`);
        }
    });
});

app.get('/auth/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
// ===== SINGLE KEY LOGIC (Developer Dashboard) =====

// 1. Get My Key
app.get('/my-key', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Login required' });
    
    db.query("SELECT * FROM api_keys WHERE user_id = ? LIMIT 1", [req.session.user.id], (err, results) => {
        if (results.length > 0) {
            res.json({ found: true, key: results[0] });
        } else {
            res.json({ found: false });
        }
    });
});

// 2. Regenerate Key
app.post('/regenerate-key', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Login required' });

    const newKey = generateApiKey();

    // Hapus key lama, insert key baru
    db.query("DELETE FROM api_keys WHERE user_id = ?", [req.session.user.id], (err) => {
        if (err) return res.status(500).json({ error: err });
        
        db.query("INSERT INTO api_keys (user_id, api_key, name, is_active) VALUES (?, ?, ?, 1)", 
            [req.session.user.id, newKey, 'Main Key'], 
            (err, result) => {
                if (err) return res.status(500).json({ error: err });
                res.json({ success: true, new_key: newKey });
            }
        );
    });
});



