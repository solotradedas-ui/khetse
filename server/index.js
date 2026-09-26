const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const multer = require('multer');
const { getDb, run, get, all, save } = require('./db');
const { signToken, requireAuth, requireRole } = require('./auth');
const { calculateCommission, determineTier } = require('./commission');
const email = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fs = require('fs');
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => cb(null, uuid() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ─── HEALTH ──────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', platform: 'KhetSe', version: '1.1.0' });
});

// ─── AUTH — REGISTER ─────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    await getDb();
    const { name, email: userEmail, phone, password, role = 'customer' } = req.body;
    if (!name || !userEmail || !phone || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const exists = get('SELECT id FROM users WHERE email=? OR phone=?', [userEmail, phone]);
    if (exists) return res.status(409).json({ error: 'Email or phone already registered' });
    const safeRole = role === 'admin' ? 'customer' : role;
    const hash = bcrypt.hashSync(password, 10);
    const id = uuid();
    run('INSERT INTO users (id,name,email,phone,password_hash,role) VALUES (?,?,?,?,?,?)',
      [id, name, userEmail, phone, hash, safeRole]);
    const token = signToken({ id, name, email: userEmail, role: safeRole });
    // Welcome email — fire-and-forget, don't block the response
    const user = { id, name, email: userEmail, phone, role: safeRole };
    if (safeRole === 'customer') email.sendWelcomeCustomer(user).catch(() => {});
    else if (safeRole === 'farmer') email.sendWelcomeFarmer(user).catch(() => {});
    res.json({ token, user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── AUTH — LOGIN ─────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    await getDb();
    const { email: userEmail, password } = req.body;
    if (!userEmail || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = get('SELECT * FROM users WHERE email=?', [userEmail]);
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── AUTH — ME ────────────────────────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, async (req, res) => {
  await getDb();
  const user = get('SELECT id,name,email,phone,role,created_at FROM users WHERE id=?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const farmer = user.role === 'farmer' ? get('SELECT * FROM farmers WHERE user_id=?', [user.id]) : null;
  res.json({ user, farmer });
});

// ─── PROFILE — UPDATE NAME/PHONE/BIO ─────────────────────────────────────────
app.put('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    await getDb();
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    // Check phone not taken by another user
    const conflict = get('SELECT id FROM users WHERE phone=? AND id!=?', [phone, req.user.id]);
    if (conflict) return res.status(409).json({ error: 'Phone number already in use' });
    run('UPDATE users SET name=?, phone=? WHERE id=?', [name, phone, req.user.id]);
    // If farmer, also allow bio + farm name update
    if (req.body.bio !== undefined || req.body.farm_name !== undefined) {
      const farmer = get('SELECT id FROM farmers WHERE user_id=?', [req.user.id]);
      if (farmer) {
        if (req.body.bio !== undefined) run('UPDATE farmers SET bio=? WHERE id=?', [req.body.bio, farmer.id]);
        if (req.body.farm_name !== undefined) run('UPDATE farmers SET farm_name=? WHERE id=?', [req.body.farm_name, farmer.id]);
      }
    }
    const updated = get('SELECT id,name,email,phone,role FROM users WHERE id=?', [req.user.id]);
    res.json({ user: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PROFILE — CHANGE PASSWORD ────────────────────────────────────────────────
app.put('/api/auth/password', requireAuth, async (req, res) => {
  try {
    await getDb();
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Current and new password required' });
    if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const user = get('SELECT * FROM users WHERE id=?', [req.user.id]);
    if (!bcrypt.compareSync(current_password, user.password_hash))
      return res.status(401).json({ error: 'Current password is incorrect' });
    run('UPDATE users SET password_hash=? WHERE id=?', [bcrypt.hashSync(new_password, 10), req.user.id]);
    // Security notification email — fire-and-forget
    email.sendPasswordChanged(user).catch(() => {});
    res.json({ success: true, message: 'Password updated. A confirmation email has been sent.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── FARMERS — REGISTER ───────────────────────────────────────────────────────
app.post('/api/farmers/register', requireAuth, async (req, res) => {
  try {
    await getDb();
    const { farm_name, village, district, state, land_acres, aadhaar_last4, pm_kisan_id, land_record_number, enam_id, soil_health_card, bio } = req.body;
    if (!village || !district || !state) return res.status(400).json({ error: 'Village, district, and state are required' });
    if (!aadhaar_last4) return res.status(400).json({ error: 'Aadhaar last 4 digits required' });
    const existing = get('SELECT id FROM farmers WHERE user_id=?', [req.user.id]);
    if (existing) return res.status(409).json({ error: 'Farmer profile already exists. Use the update endpoint.' });
    run('UPDATE users SET role=? WHERE id=?', ['farmer', req.user.id]);
    const id = uuid();
    run(`INSERT INTO farmers (id,user_id,farm_name,village,district,state,land_acres,aadhaar_last4,pm_kisan_id,land_record_number,enam_id,soil_health_card,bio)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.user.id, farm_name || '', village, district, state, land_acres || 0,
       aadhaar_last4, pm_kisan_id || '', land_record_number || '', enam_id || '', soil_health_card || '', bio || '']);
    const farmer = get('SELECT * FROM farmers WHERE id=?', [id]);
    const user = get('SELECT * FROM users WHERE id=?', [req.user.id]);
    // Email farmer: submission confirmed
    email.sendVerificationSubmitted(user, farmer).catch(() => {});
    // Email admin: new submission needs review
    email.sendAdminNewFarmer(farmer, user).catch(() => {});
    res.json({ farmer });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── FARMERS — UPDATE PROFILE ─────────────────────────────────────────────────
app.put('/api/farmers/profile', requireAuth, requireRole('farmer'), async (req, res) => {
  try {
    await getDb();
    const farmer = get('SELECT * FROM farmers WHERE user_id=?', [req.user.id]);
    if (!farmer) return res.status(404).json({ error: 'Farmer profile not found' });
    const { farm_name, village, district, state, land_acres, bio, pm_kisan_id, land_record_number, enam_id, soil_health_card, aadhaar_last4 } = req.body;
    // If submitting fresh docs while pending/rejected, reset to pending and re-notify
    const wasRejected = farmer.verification_status === 'rejected';
    const hasNewDocs = aadhaar_last4 || pm_kisan_id || land_record_number;
    const newStatus = hasNewDocs && (wasRejected || farmer.verification_status === 'pending')
      ? 'pending' : farmer.verification_status;
    run(`UPDATE farmers SET
          farm_name=COALESCE(?,farm_name), village=COALESCE(?,village),
          district=COALESCE(?,district), state=COALESCE(?,state),
          land_acres=COALESCE(?,land_acres), bio=COALESCE(?,bio),
          pm_kisan_id=COALESCE(?,pm_kisan_id), land_record_number=COALESCE(?,land_record_number),
          enam_id=COALESCE(?,enam_id), soil_health_card=COALESCE(?,soil_health_card),
          aadhaar_last4=COALESCE(?,aadhaar_last4), verification_status=?
        WHERE id=?`,
      [farm_name||null, village||null, district||null, state||null, land_acres||null,
       bio||null, pm_kisan_id||null, land_record_number||null, enam_id||null,
       soil_health_card||null, aadhaar_last4||null, newStatus, farmer.id]);
    const updated = get('SELECT * FROM farmers WHERE id=?', [farmer.id]);
    const user = get('SELECT * FROM users WHERE id=?', [req.user.id]);
    if (hasNewDocs && newStatus === 'pending') {
      email.sendVerificationSubmitted(user, updated).catch(() => {});
      email.sendAdminNewFarmer(updated, user).catch(() => {});
    }
    res.json({ farmer: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── FARMERS — ADMIN VERIFY ───────────────────────────────────────────────────
app.put('/api/farmers/:id/verify', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await getDb();
    const { status, reason } = req.body;
    if (!['verified', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be verified or rejected' });
    run(`UPDATE farmers SET verification_status=?, verification_date=datetime('now') WHERE id=?`, [status, req.params.id]);
    // Send status email to farmer
    const farmer = get('SELECT * FROM farmers WHERE id=?', [req.params.id]);
    if (farmer) {
      const user = get('SELECT * FROM users WHERE id=?', [farmer.user_id]);
      if (user) {
        if (status === 'verified') email.sendFarmerApproved(user, farmer).catch(() => {});
        else email.sendFarmerRejected(user, reason || null).catch(() => {});
      }
    }
    res.json({ success: true, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── FARMERS — LIST / GET ─────────────────────────────────────────────────────
app.get('/api/farmers', async (req, res) => {
  await getDb();
  const { state, status, verified_only } = req.query;
  let sql = `SELECT f.*, u.name, u.email, u.phone FROM farmers f JOIN users u ON f.user_id=u.id WHERE 1=1`;
  const params = [];
  if (state) { sql += ' AND f.state=?'; params.push(state); }
  if (status) { sql += ' AND f.verification_status=?'; params.push(status); }
  if (verified_only === '1') { sql += " AND f.verification_status='verified'"; }
  sql += ' ORDER BY f.rating DESC, f.annual_sales DESC';
  res.json(all(sql, params));
});

app.get('/api/farmers/:id', async (req, res) => {
  await getDb();
  const farmer = get(`SELECT f.*, u.name, u.email, u.phone FROM farmers f JOIN users u ON f.user_id=u.id WHERE f.id=?`, [req.params.id]);
  if (!farmer) return res.status(404).json({ error: 'Farmer not found' });
  const products = all('SELECT * FROM products WHERE farmer_id=? AND is_active=1', [req.params.id]);
  res.json({ farmer, products });
});

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  await getDb();
  const { category, q, min_price, max_price, organic, state } = req.query;
  let sql = `SELECT p.*, f.district, f.state, f.verification_status, f.rating as farmer_rating,
             f.trust_badge, u.name as farmer_name, f.id as farmer_id_real
             FROM products p JOIN farmers f ON p.farmer_id=f.id JOIN users u ON f.user_id=u.id
             WHERE p.is_active=1 AND f.verification_status='verified'`;
  const params = [];
  if (category) { sql += ' AND p.category=?'; params.push(category); }
  if (q) { sql += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (min_price) { sql += ' AND p.price_per_unit >= ?'; params.push(parseFloat(min_price)); }
  if (max_price) { sql += ' AND p.price_per_unit <= ?'; params.push(parseFloat(max_price)); }
  if (organic === '1') { sql += ' AND p.is_organic=1'; }
  if (state) { sql += ' AND f.state=?'; params.push(state); }
  sql += ' ORDER BY f.trust_badge DESC, f.rating DESC, p.created_at DESC';
  res.json(all(sql, params));
});

app.get('/api/products/:id', async (req, res) => {
  await getDb();
  const p = get(`SELECT p.*, f.district, f.state, f.verification_status, f.rating as farmer_rating,
                 f.trust_badge, f.bio as farmer_bio, f.commission_tier, u.name as farmer_name, f.id as farmer_id_real
                 FROM products p JOIN farmers f ON p.farmer_id=f.id JOIN users u ON f.user_id=u.id
                 WHERE p.id=?`, [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(p);
});

app.post('/api/products', requireAuth, requireRole('farmer'), upload.single('photo'), async (req, res) => {
  try {
    await getDb();
    const farmer = get('SELECT * FROM farmers WHERE user_id=?', [req.user.id]);
    if (!farmer) return res.status(404).json({ error: 'Farmer profile not found' });
    if (farmer.verification_status !== 'verified') return res.status(403).json({ error: 'Your account must be verified before listing products' });
    const { name, category, description, price_per_unit, unit, quantity_available, min_order, is_organic, harvest_date } = req.body;
    if (!name || !category || !price_per_unit || !unit || !quantity_available) return res.status(400).json({ error: 'Required fields missing' });
    const id = uuid();
    const photo = req.file ? '/uploads/' + req.file.filename : null;
    run(`INSERT INTO products (id,farmer_id,name,category,description,price_per_unit,unit,quantity_available,min_order,photo,is_organic,harvest_date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, farmer.id, name, category, description || '', parseFloat(price_per_unit), unit,
       parseFloat(quantity_available), parseFloat(min_order || 1), photo, is_organic === '1' ? 1 : 0, harvest_date || null]);
    res.json({ product: get('SELECT * FROM products WHERE id=?', [id]) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/products/:id', requireAuth, requireRole('farmer'), async (req, res) => {
  await getDb();
  const farmer = get('SELECT * FROM farmers WHERE user_id=?', [req.user.id]);
  const product = get('SELECT * FROM products WHERE id=?', [req.params.id]);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.farmer_id !== farmer?.id) return res.status(403).json({ error: 'Not your product' });
  const { price_per_unit, quantity_available, is_active, description } = req.body;
  if (price_per_unit) run('UPDATE products SET price_per_unit=? WHERE id=?', [parseFloat(price_per_unit), req.params.id]);
  if (quantity_available !== undefined) run('UPDATE products SET quantity_available=? WHERE id=?', [parseFloat(quantity_available), req.params.id]);
  if (is_active !== undefined) run('UPDATE products SET is_active=? WHERE id=?', [is_active ? 1 : 0, req.params.id]);
  if (description !== undefined) run('UPDATE products SET description=? WHERE id=?', [description, req.params.id]);
  res.json({ product: get('SELECT * FROM products WHERE id=?', [req.params.id]) });
});

// ─── CART ─────────────────────────────────────────────────────────────────────
app.get('/api/cart', requireAuth, async (req, res) => {
  await getDb();
  const items = all(`SELECT c.*, p.name, p.price_per_unit, p.unit, p.quantity_available, p.category,
                     u.name as farmer_name, f.state
                     FROM carts c JOIN products p ON c.product_id=p.id
                     JOIN farmers f ON p.farmer_id=f.id JOIN users u ON f.user_id=u.id
                     WHERE c.customer_id=?`, [req.user.id]);
  const total = items.reduce((s, i) => s + i.price_per_unit * i.quantity, 0);
  res.json({ items, total: parseFloat(total.toFixed(2)) });
});

app.post('/api/cart', requireAuth, async (req, res) => {
  await getDb();
  const { product_id, quantity } = req.body;
  if (!product_id || !quantity) return res.status(400).json({ error: 'product_id and quantity required' });
  const existing = get('SELECT id FROM carts WHERE customer_id=? AND product_id=?', [req.user.id, product_id]);
  if (existing) {
    run('UPDATE carts SET quantity=? WHERE id=?', [parseFloat(quantity), existing.id]);
  } else {
    run('INSERT INTO carts (id,customer_id,product_id,quantity) VALUES (?,?,?,?)',
      [uuid(), req.user.id, product_id, parseFloat(quantity)]);
  }
  res.json({ success: true });
});

app.delete('/api/cart/:product_id', requireAuth, async (req, res) => {
  await getDb();
  run('DELETE FROM carts WHERE customer_id=? AND product_id=?', [req.user.id, req.params.product_id]);
  res.json({ success: true });
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────
app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    await getDb();
    const { shipping_address, shipping_pincode, payment_method = 'cod', notes } = req.body;
    if (!shipping_address) return res.status(400).json({ error: 'Shipping address required' });
    const cartItems = all(`SELECT c.*, p.price_per_unit, p.farmer_id, p.name as product_name, p.unit, p.quantity_available, f.commission_tier
                           FROM carts c JOIN products p ON c.product_id=p.id JOIN farmers f ON p.farmer_id=f.id
                           WHERE c.customer_id=?`, [req.user.id]);
    if (!cartItems.length) return res.status(400).json({ error: 'Cart is empty' });
    const total = cartItems.reduce((s, i) => s + i.price_per_unit * i.quantity, 0);
    const { commission, payout } = calculateCommission(total, cartItems[0]?.commission_tier || 'seed');
    const orderId = uuid();
    run(`INSERT INTO orders (id,customer_id,total_amount,commission_amount,farmer_payout,shipping_address,shipping_pincode,payment_method,notes)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      [orderId, req.user.id, total, commission, payout, shipping_address, shipping_pincode || '', payment_method, notes || '']);
    // Group items by farmer for per-farmer notifications
    const byFarmer = {};
    for (const item of cartItems) {
      const sub = item.price_per_unit * item.quantity;
      run(`INSERT INTO order_items (id,order_id,product_id,farmer_id,quantity,unit_price,subtotal) VALUES (?,?,?,?,?,?,?)`,
        [uuid(), orderId, item.product_id, item.farmer_id, item.quantity, item.price_per_unit, sub]);
      run('UPDATE products SET quantity_available=quantity_available-? WHERE id=?', [item.quantity, item.product_id]);
      if (!byFarmer[item.farmer_id]) byFarmer[item.farmer_id] = [];
      byFarmer[item.farmer_id].push(item);
    }
    // Update farmer stats + tier
    for (const [fid, items] of Object.entries(byFarmer)) {
      const farmerTotal = items.reduce((s, i) => s + i.price_per_unit * i.quantity, 0);
      run('UPDATE farmers SET annual_sales=annual_sales+?, total_orders=total_orders+1 WHERE id=?', [farmerTotal, fid]);
      const f = get('SELECT annual_sales FROM farmers WHERE id=?', [fid]);
      run('UPDATE farmers SET commission_tier=? WHERE id=?', [determineTier(f?.annual_sales || 0), fid]);
    }
    run('DELETE FROM carts WHERE customer_id=?', [req.user.id]);
    const order = get('SELECT * FROM orders WHERE id=?', [orderId]);
    const customerUser = get('SELECT * FROM users WHERE id=?', [req.user.id]);
    const orderItems = all(`SELECT oi.*, p.name as product_name, p.unit FROM order_items oi
                            JOIN products p ON oi.product_id=p.id WHERE oi.order_id=?`, [orderId]);
    // Email customer confirmation
    if (customerUser) email.sendOrderConfirmation(customerUser, order, orderItems).catch(() => {});
    // Email each farmer involved
    for (const [fid, items] of Object.entries(byFarmer)) {
      const farmerRec = get('SELECT * FROM farmers WHERE id=?', [fid]);
      if (farmerRec) {
        const farmerUser = get('SELECT * FROM users WHERE id=?', [farmerRec.user_id]);
        if (farmerUser) email.sendFarmerNewOrder(farmerUser, items, customerUser?.name || 'A customer', orderId).catch(() => {});
      }
    }
    res.json({ order });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders', requireAuth, async (req, res) => {
  await getDb();
  if (req.user.role === 'admin') {
    return res.json(all(`SELECT o.*, u.name as customer_name FROM orders o JOIN users u ON o.customer_id=u.id ORDER BY o.created_at DESC`));
  }
  if (req.user.role === 'farmer') {
    const farmer = get('SELECT id FROM farmers WHERE user_id=?', [req.user.id]);
    return res.json(all(`SELECT oi.*, o.created_at, o.status, o.shipping_address, u.name as customer_name, p.name as product_name
                         FROM order_items oi JOIN orders o ON oi.order_id=o.id JOIN users u ON o.customer_id=u.id
                         JOIN products p ON oi.product_id=p.id
                         WHERE oi.farmer_id=? ORDER BY o.created_at DESC`, [farmer?.id]));
  }
  res.json(all(`SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC`, [req.user.id]));
});

app.get('/api/orders/:id', requireAuth, async (req, res) => {
  await getDb();
  const order = get('SELECT * FROM orders WHERE id=?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = all(`SELECT oi.*, p.name as product_name, p.unit, u.name as farmer_name, f.district, f.state
                     FROM order_items oi JOIN products p ON oi.product_id=p.id
                     JOIN farmers f ON oi.farmer_id=f.id JOIN users u ON f.user_id=u.id
                     WHERE oi.order_id=?`, [req.params.id]);
  res.json({ order, items });
});

app.put('/api/orders/:id/status', requireAuth, async (req, res) => {
  await getDb();
  const { status, tracking_id } = req.body;
  run('UPDATE orders SET status=?,tracking_id=?,updated_at=datetime("now") WHERE id=?',
    [status, tracking_id || null, req.params.id]);
  res.json({ success: true });
});

// ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────
app.post('/api/subscriptions', requireAuth, async (req, res) => {
  await getDb();
  const { box_type, cadence, address, pincode, special_instructions, items } = req.body;
  if (!box_type || !cadence || !address) return res.status(400).json({ error: 'box_type, cadence, address required' });
  const today = new Date();
  const next = new Date(today.setDate(today.getDate() + (cadence === 'monthly' ? 30 : 15)));
  const id = uuid();
  run(`INSERT INTO subscriptions (id,customer_id,box_type,cadence,address,pincode,special_instructions,next_delivery)
       VALUES (?,?,?,?,?,?,?,?)`,
    [id, req.user.id, box_type, cadence, address, pincode || '', special_instructions || '', next.toISOString().split('T')[0]]);
  if (items?.length) {
    for (const item of items) {
      run('INSERT INTO subscription_items (id,subscription_id,product_id,quantity) VALUES (?,?,?,?)',
        [uuid(), id, item.product_id, item.quantity]);
    }
  }
  res.json({ subscription: get('SELECT * FROM subscriptions WHERE id=?', [id]) });
});

app.get('/api/subscriptions', requireAuth, async (req, res) => {
  await getDb();
  const subs = all('SELECT * FROM subscriptions WHERE customer_id=? ORDER BY created_at DESC', [req.user.id]);
  for (const s of subs) {
    s.items = all(`SELECT si.*, p.name, p.price_per_unit, p.unit FROM subscription_items si
                   JOIN products p ON si.product_id=p.id WHERE si.subscription_id=?`, [s.id]);
  }
  res.json(subs);
});

app.put('/api/subscriptions/:id/pause', requireAuth, async (req, res) => {
  await getDb();
  run("UPDATE subscriptions SET status='paused' WHERE id=? AND customer_id=?", [req.params.id, req.user.id]);
  res.json({ success: true });
});

app.put('/api/subscriptions/:id/resume', requireAuth, async (req, res) => {
  await getDb();
  run("UPDATE subscriptions SET status='active' WHERE id=? AND customer_id=?", [req.params.id, req.user.id]);
  res.json({ success: true });
});

// ─── COMMUNITY ────────────────────────────────────────────────────────────────
app.get('/api/community/posts', async (req, res) => {
  await getDb();
  const { category } = req.query;
  let sql = `SELECT cp.*, u.name as farmer_name, f.district, f.state, f.trust_badge,
             (SELECT COUNT(*) FROM community_replies cr WHERE cr.post_id=cp.id) as reply_count
             FROM community_posts cp JOIN farmers f ON cp.farmer_id=f.id JOIN users u ON f.user_id=u.id WHERE 1=1`;
  const params = [];
  if (category && category !== 'all') { sql += ' AND cp.category=?'; params.push(category); }
  sql += ' ORDER BY cp.created_at DESC';
  res.json(all(sql, params));
});

app.post('/api/community/posts', requireAuth, requireRole('farmer'), async (req, res) => {
  await getDb();
  const farmer = get('SELECT * FROM farmers WHERE user_id=?', [req.user.id]);
  if (!farmer) return res.status(404).json({ error: 'Farmer profile required' });
  const { title, body, category = 'general' } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body required' });
  const id = uuid();
  run('INSERT INTO community_posts (id,farmer_id,title,body,category) VALUES (?,?,?,?,?)',
    [id, farmer.id, title, body, category]);
  res.json({ post: get('SELECT * FROM community_posts WHERE id=?', [id]) });
});

app.get('/api/community/posts/:id/replies', async (req, res) => {
  await getDb();
  res.json(all(`SELECT cr.*, u.name as farmer_name, f.district, f.state
                FROM community_replies cr JOIN farmers f ON cr.farmer_id=f.id JOIN users u ON f.user_id=u.id
                WHERE cr.post_id=? ORDER BY cr.created_at ASC`, [req.params.id]));
});

app.post('/api/community/posts/:id/replies', requireAuth, requireRole('farmer'), async (req, res) => {
  await getDb();
  const farmer = get('SELECT * FROM farmers WHERE user_id=?', [req.user.id]);
  if (!farmer) return res.status(404).json({ error: 'Farmer profile required' });
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'Reply body required' });
  const id = uuid();
  run('INSERT INTO community_replies (id,post_id,farmer_id,body) VALUES (?,?,?,?)',
    [id, req.params.id, farmer.id, body]);
  res.json({ reply: get('SELECT * FROM community_replies WHERE id=?', [id]) });
});

app.post('/api/community/posts/:id/like', async (req, res) => {
  await getDb();
  run('UPDATE community_posts SET likes=likes+1 WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────
app.get('/api/admin/stats', requireAuth, requireRole('admin'), async (req, res) => {
  await getDb();
  res.json({
    total_farmers:        get('SELECT COUNT(*) as n FROM farmers')?.n || 0,
    verified_farmers:     get("SELECT COUNT(*) as n FROM farmers WHERE verification_status='verified'")?.n || 0,
    pending_farmers:      get("SELECT COUNT(*) as n FROM farmers WHERE verification_status='pending'")?.n || 0,
    total_products:       get('SELECT COUNT(*) as n FROM products WHERE is_active=1')?.n || 0,
    total_orders:         get('SELECT COUNT(*) as n FROM orders')?.n || 0,
    total_revenue:        get('SELECT SUM(total_amount) as n FROM orders')?.n || 0,
    total_commission:     get('SELECT SUM(commission_amount) as n FROM orders')?.n || 0,
    total_customers:      get("SELECT COUNT(*) as n FROM users WHERE role='customer'")?.n || 0,
    active_subscriptions: get("SELECT COUNT(*) as n FROM subscriptions WHERE status='active'")?.n || 0,
  });
});

// ─── MISC ─────────────────────────────────────────────────────────────────────
app.get('/api/categories', async (req, res) => {
  await getDb();
  res.json(all("SELECT DISTINCT category FROM products WHERE is_active=1 ORDER BY category"));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── SAFETY NET ──────────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (non-fatal):', reason?.message || reason);
});

// ─── START ────────────────────────────────────────────────────────────────────
getDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🌾  KhetSe v1.1 is running!`);
    console.log(`   → http://localhost:${PORT}\n`);
    console.log(`   Admin:    admin@khetse.in   / admin123`);
    console.log(`   Farmer:   ramesh@farmer.in  / farmer123`);
    console.log(`   Customer: priya@customer.in / customer123\n`);
    const emailMode = process.env.SMTP_USER ? `Gmail (${process.env.SMTP_USER})` : 'Ethereal (test)';
    console.log(`   Email:    ${emailMode}`);
  });
}).catch(e => { console.error('Startup failed:', e.message); process.exit(1); });
