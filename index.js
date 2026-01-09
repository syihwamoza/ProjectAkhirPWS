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

// ===== PUBLIC API =====
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ message: 'Missing API Key' });
    
    db.query("SELECT * FROM api_keys WHERE api_key = ?", [apiKey], (err, results) => {
        if (results.length === 0) return res.status(403).json({ message: 'Invalid API Key' });
        next();
    });
}

app.get('/api/v1/recipes', requireApiKey, (req, res) => {
    db.query("SELECT * FROM resep", (err, results) => res.json({ status: 200, data: results }));
});

// ==========================================
// ===== ADMIN FEATURES (INI YANG HILANG) =====
// ==========================================

// Halaman Admin
app.get('/admin', (req, res) => {
    if (req.session.user && req.session.user.role === 'admin') res.sendFile(path.join(__dirname, 'frontend/admin.html'));
    else res.redirect('/admin-login');
});

// 1. CREATE RESEP
app.post('/admin/tambah', upload.single('foto'), (req, res) => {
    const { judul, deskripsi, bahan, langkah } = req.body;
    const gambar = req.file ? `http://localhost:3000/uploads/${req.file.filename}` : 'https://via.placeholder.com/300';
    db.query("INSERT INTO resep (judul, deskripsi, bahan, langkah, gambar) VALUES (?, ?, ?, ?, ?)",
        [judul, deskripsi, bahan, langkah, gambar], () => res.redirect('/admin'));
});

// 2. READ ALL RESEP (Untuk Tabel Admin)
app.get('/admin/api/resep', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).send("Forbidden");
    db.query("SELECT * FROM resep ORDER BY id DESC", (err, results) => res.json(results));
});

// 2.1 READ ONE RESEP (Untuk Modal Edit)
app.get('/admin/api/resep/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).send("Forbidden");
    db.query("SELECT * FROM resep WHERE id = ?", [req.params.id], (err, results) => res.json(results[0]));
});

// 3. DELETE RESEP
app.delete('/admin/api/resep/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).send("Forbidden");
    db.query("DELETE FROM resep WHERE id = ?", [req.params.id], (err) => {
        if(err) return res.status(500).json({error: err});
        res.json({success: true});
    });
});

// 4. EDIT RESEP
app.put('/admin/api/resep/:id', upload.single('foto'), (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).send("Forbidden");
    
    const { judul, deskripsi, bahan, langkah } = req.body;
    const id = req.params.id;

    if (req.file) {
        const gambarBaru = `http://localhost:3000/uploads/${req.file.filename}`;
        db.query("UPDATE resep SET judul=?, deskripsi=?, bahan=?, langkah=?, gambar=? WHERE id=?", 
            [judul, deskripsi, bahan, langkah, gambarBaru, id], 
            (err) => {
                if(err) return res.status(500).json({error: err});
                res.json({success: true});
            }
        );
    } else {
        db.query("UPDATE resep SET judul=?, deskripsi=?, bahan=?, langkah=? WHERE id=?", 
            [judul, deskripsi, bahan, langkah, id], 
            (err) => {
                if(err) return res.status(500).json({error: err});
                res.json({success: true});
            }
        );
    }
});

// 5. USERS LIST (Untuk Tabel User di Admin)
app.get('/admin/api/users', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).send("Forbidden");
    db.query("SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC", (err, results) => res.json(results));
});

app.listen(port, () => console.log(`🚀 Server running on http://localhost:${port}`));