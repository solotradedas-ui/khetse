const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// On Render/Railway, use /data volume if it exists, otherwise local
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const DB_PATH = path.join(DATA_DIR, 'khetse.db');

let db;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
    initSchema();
    save();
    await seedData();
    save();
    console.log(`Database created at: ${DB_PATH}`);
  }
  return db;
}

function save() {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  } catch (e) { console.error('DB save error:', e.message); }
}

function initSchema() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS farmers (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    farm_name TEXT, village TEXT NOT NULL, district TEXT NOT NULL, state TEXT NOT NULL,
    land_acres REAL, aadhaar_last4 TEXT, pm_kisan_id TEXT, land_record_number TEXT,
    enam_id TEXT, soil_health_card TEXT, verification_status TEXT DEFAULT 'pending',
    verification_date DATETIME, commission_tier TEXT DEFAULT 'seed',
    annual_sales REAL DEFAULT 0, rating REAL DEFAULT 0, total_orders INTEGER DEFAULT 0,
    trust_badge INTEGER DEFAULT 0, bio TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, farmer_id TEXT NOT NULL REFERENCES farmers(id),
    name TEXT NOT NULL, category TEXT NOT NULL, description TEXT,
    price_per_unit REAL NOT NULL, unit TEXT NOT NULL, quantity_available REAL NOT NULL,
    min_order REAL DEFAULT 1, photo TEXT, is_organic INTEGER DEFAULT 0,
    harvest_date DATE, is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'placed', total_amount REAL NOT NULL,
    commission_amount REAL NOT NULL, farmer_payout REAL NOT NULL,
    shipping_address TEXT NOT NULL, shipping_pincode TEXT,
    payment_method TEXT DEFAULT 'cod', tracking_id TEXT, notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    farmer_id TEXT NOT NULL REFERENCES farmers(id),
    quantity REAL NOT NULL, unit_price REAL NOT NULL, subtotal REAL NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES users(id),
    box_type TEXT NOT NULL, cadence TEXT NOT NULL, status TEXT DEFAULT 'active',
    next_delivery DATE, address TEXT NOT NULL, pincode TEXT,
    special_instructions TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS subscription_items (
    id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    product_id TEXT NOT NULL REFERENCES products(id), quantity REAL NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS community_posts (
    id TEXT PRIMARY KEY, farmer_id TEXT NOT NULL REFERENCES farmers(id),
    title TEXT NOT NULL, body TEXT NOT NULL, category TEXT DEFAULT 'general',
    likes INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS community_replies (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES community_posts(id),
    farmer_id TEXT NOT NULL REFERENCES farmers(id), body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS carts (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES users(id),
    product_id TEXT NOT NULL REFERENCES products(id), quantity REAL NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function seedData() {
  const { v4: uuid } = require('uuid');
  const bcrypt = require('bcryptjs');
  const hash = (p) => bcrypt.hashSync(p, 10);

  const adminId = uuid();
  db.run(`INSERT INTO users (id,name,email,phone,password_hash,role) VALUES (?,?,?,?,?,?)`,
    [adminId, 'KhetSe Admin', 'admin@khetse.in', '9000000000', hash('admin123'), 'admin']);

  const farmerData = [
    { name: 'Ramesh Patil', email: 'ramesh@farmer.in', phone: '9111111111', village: 'Dindori', district: 'Nasik', state: 'Maharashtra', land: 4.5, aadhaar: '8741', pmk: 'PMK-MH-2024-4871', landrec: 'MH-NK-7/12-2201', enam: 'ENAM-MH-2023-001', shc: 'SHC-MH-2024-0099', status: 'verified', tier: 'harvest', rating: 4.9, annual: 85000, trust: 1, bio: 'Third generation farmer growing red onions, tomatoes and garlic in the Nasik belt.' },
    { name: 'Savitri Devi', email: 'savitri@farmer.in', phone: '9111111112', village: 'Sitapur', district: 'Sitapur', state: 'Uttar Pradesh', land: 2.1, aadhaar: '3302', pmk: 'PMK-UP-2024-0021', landrec: 'UP-STP-RoR-5511', enam: 'ENAM-UP-2023-044', shc: 'SHC-UP-2024-0234', status: 'verified', tier: 'seed', rating: 4.7, annual: 42000, trust: 0, bio: 'Wheat and garlic grower from Sitapur, UP.' },
    { name: 'Hardev Singh', email: 'hardev@farmer.in', phone: '9111111113', village: 'Jandiala Guru', district: 'Amritsar', state: 'Punjab', land: 8.2, aadhaar: '5512', pmk: 'PMK-PB-2024-1823', landrec: 'PB-AMR-J-0918', enam: 'ENAM-PB-2023-109', shc: 'SHC-PB-2024-0712', status: 'verified', tier: 'premium', rating: 4.95, annual: 240000, trust: 1, bio: 'Premium Basmati rice grower (1121 variety) in Amritsar.' },
    { name: 'Mohan Borse', email: 'mohan@farmer.in', phone: '9111111114', village: 'Jagdalpur', district: 'Bastar', state: 'Chhattisgarh', land: 0.8, aadhaar: '7723', pmk: 'PMK-CG-2024-0449', landrec: 'CG-BST-RoR-1102', enam: null, shc: 'SHC-CG-2024-0088', status: 'verified', tier: 'seed', rating: 4.8, annual: 28000, trust: 0, bio: 'Natural farming practitioner growing raw turmeric and ginger in Bastar.' },
    { name: 'Prabha Rao', email: 'prabha@farmer.in', phone: '9111111115', village: 'Tumkur', district: 'Tumkur', state: 'Karnataka', land: 6.0, aadhaar: '2294', pmk: 'PMK-KA-2024-3301', landrec: 'KA-TUM-RoR-7821', enam: 'ENAM-KA-2023-220', shc: 'SHC-KA-2024-1101', status: 'verified', tier: 'harvest', rating: 4.85, annual: 92000, trust: 1, bio: 'Coconut and Alphonso mango orchardist from Tumkur. Running drip irrigation for 6 years.' },
    { name: 'Gopal Meena', email: 'gopal@farmer.in', phone: '9111111116', village: 'Jaipur Rural', district: 'Jaipur', state: 'Rajasthan', land: 5.5, aadhaar: '4417', pmk: 'PMK-RJ-2024-2201', landrec: 'RJ-JP-J-3344', enam: 'ENAM-RJ-2023-078', shc: 'SHC-RJ-2024-0678', status: 'pending', tier: 'seed', rating: 0, annual: 0, trust: 0, bio: 'Mustard and bajra grower in the Jaipur belt. New to KhetSe.' },
  ];

  const farmerIds = {};
  for (const f of farmerData) {
    const uid = uuid(); const fid = uuid();
    db.run(`INSERT INTO users (id,name,email,phone,password_hash,role) VALUES (?,?,?,?,?,?)`,
      [uid, f.name, f.email, f.phone, hash('farmer123'), 'farmer']);
    db.run(`INSERT INTO farmers (id,user_id,farm_name,village,district,state,land_acres,aadhaar_last4,pm_kisan_id,land_record_number,enam_id,soil_health_card,verification_status,commission_tier,annual_sales,rating,total_orders,trust_badge,bio) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [fid, uid, f.name+"'s Farm", f.village, f.district, f.state, f.land, f.aadhaar, f.pmk, f.landrec, f.enam, f.shc, f.status, f.tier, f.annual, f.rating, Math.floor(f.annual/500), f.trust, f.bio]);
    farmerIds[f.name] = fid;
  }

  const products = [
    { farmer: 'Ramesh Patil', name: 'Red Onions', cat: 'Vegetables', desc: 'Farm-fresh red onions, large size. Harvested from black soil fields.', price: 24, unit: 'kg', qty: 80, min: 2, organic: 0 },
    { farmer: 'Ramesh Patil', name: 'Tomatoes', cat: 'Vegetables', desc: 'Firm, ripe tomatoes harvested at peak colour.', price: 32, unit: 'kg', qty: 50, min: 1, organic: 0 },
    { farmer: 'Ramesh Patil', name: 'White Garlic', cat: 'Vegetables', desc: 'Premium white garlic bulbs, full pods. Nasik origin.', price: 110, unit: 'kg', qty: 30, min: 0.5, organic: 0 },
    { farmer: 'Savitri Devi', name: 'Sharbati Wheat', cat: 'Grains', desc: 'Sharbati wheat from Sitapur UP, known for natural sweetness.', price: 42, unit: 'kg', qty: 200, min: 5, organic: 0 },
    { farmer: 'Hardev Singh', name: 'Basmati Rice 1121', cat: 'Grains', desc: 'Traditional 1121 Basmati from Amritsar. Extra-long grain, aged 6 months.', price: 85, unit: 'kg', qty: 500, min: 5, organic: 0 },
    { farmer: 'Hardev Singh', name: 'Brown Basmati Rice', cat: 'Grains', desc: 'Unpolished brown Basmati — nutty flavour, higher fibre.', price: 95, unit: 'kg', qty: 200, min: 5, organic: 1 },
    { farmer: 'Mohan Borse', name: 'Raw Turmeric', cat: 'Spices', desc: 'Fresh raw turmeric from Bastar plateau, forest-shade grown. High curcumin.', price: 68, unit: 'kg', qty: 40, min: 0.5, organic: 1 },
    { farmer: 'Mohan Borse', name: 'Fresh Ginger', cat: 'Spices', desc: 'Young ginger rhizomes from Bastar. Grown under natural forest canopy.', price: 72, unit: 'kg', qty: 25, min: 0.5, organic: 1 },
    { farmer: 'Prabha Rao', name: 'Fresh Coconuts', cat: 'Fruits', desc: 'Tender coconuts from Tumkur district. High water content.', price: 28, unit: 'piece', qty: 1200, min: 6, organic: 0 },
    { farmer: 'Prabha Rao', name: 'Alphonso Mango', cat: 'Fruits', desc: 'GI-tagged Alphonso from Tumkur. Naturally ripened. No carbide.', price: 180, unit: 'dozen', qty: 600, min: 1, organic: 0 },
    { farmer: 'Gopal Meena', name: 'Yellow Mustard Seeds', cat: 'Spices', desc: 'Clean, sorted yellow mustard from Jaipur belt.', price: 55, unit: 'kg', qty: 120, min: 1, organic: 0 },
  ];

  for (const p of products) {
    db.run(`INSERT INTO products (id,farmer_id,name,category,description,price_per_unit,unit,quantity_available,min_order,is_organic) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uuid(), farmerIds[p.farmer], p.name, p.cat, p.desc, p.price, p.unit, p.qty, p.min, p.organic]);
  }

  const custId = uuid();
  db.run(`INSERT INTO users (id,name,email,phone,password_hash,role) VALUES (?,?,?,?,?,?)`,
    [custId, 'Priya Sharma', 'priya@customer.in', '9222222222', hash('customer123'), 'customer']);

  db.run(`INSERT INTO community_posts (id,farmer_id,title,body,category) VALUES (?,?,?,?,?)`,
    [uuid(), farmerIds['Ramesh Patil'], 'Getting better prices for onions this season', 'Has anyone else noticed that direct sales to urban customers via KhetSe are giving 40% more than local mandi price?', 'pricing']);
  db.run(`INSERT INTO community_posts (id,farmer_id,title,body,category) VALUES (?,?,?,?,?)`,
    [uuid(), farmerIds['Hardev Singh'], 'Co-shipping from Amritsar — looking for 2-3 more farmers', 'Planning a truck run to Delhi on the 15th. Have space for 200 more kg. Anyone interested in sharing freight cost?', 'logistics']);
  db.run(`INSERT INTO community_posts (id,farmer_id,title,body,category) VALUES (?,?,?,?,?)`,
    [uuid(), farmerIds['Mohan Borse'], 'Natural farming for turmeric under forest shade — AMA', 'Growing turmeric in Bastar without chemical inputs for 3 seasons. Happy to answer questions.', 'farming']);
}

function run(sql, params = []) { db.run(sql, params); save(); }
function get(sql, params = []) {
  const s = db.prepare(sql); const r = s.getAsObject(params); s.free();
  return Object.keys(r).length ? r : null;
}
function all(sql, params = []) {
  const results = []; const s = db.prepare(sql); s.bind(params);
  while (s.step()) results.push(s.getAsObject()); s.free(); return results;
}

module.exports = { getDb, run, get, all, save };
