// ─── STATE ────────────────────────────────────────────────────────────────────
const API = '';
let currentUser = null;
let currentFarmer = null;
let cartCount = 0;

// ─── UTILS ────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const main = () => $('app-main');

function token() { return localStorage.getItem('khetse_token'); }

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token()) headers['Authorization'] = 'Bearer ' + token();
  if (opts.body instanceof FormData) delete headers['Content-Type'];
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.style.opacity = '0', 2800);
  setTimeout(() => el.remove(), 3200);
}

function navigate(page, params = {}) {
  closeDropdowns();
  window.scrollTo(0, 0);
  history.pushState({ page, params }, '', '#' + page);
  renderPage(page, params);
}

function closeDropdowns() {
  document.querySelectorAll('.user-dropdown').forEach(d => d.classList.remove('open'));
}

function toggleUserMenu() {
  $('user-dropdown').classList.toggle('open');
}

function closeModal() {
  $('modal-overlay').style.display = 'none';
}

function showModal(html) {
  $('modal-box').innerHTML = html;
  $('modal-overlay').style.display = 'flex';
}

function formatCurrency(n) {
  return '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(s) {
  return `<span class="order-status status-${s}">${s.toUpperCase()}</span>`;
}

function verifyBadge(s) {
  const map = { verified: 'badge-verified ✓ Verified', pending: 'badge-pending ⧖ Pending', rejected: 'badge-rejected ✗ Rejected' };
  const [cls, text] = (map[s] || 'badge-pending ⧖ Pending').split(' ');
  return `<span class="badge ${cls}">${text.trim()}</span>`;
}

function catEmoji(cat) {
  const m = { Vegetables: '🥬', Grains: '🌾', Fruits: '🍎', Spices: '🌶️', Dairy: '🥛', Pulses: '🫘', Oilseeds: '🫒' };
  return m[cat] || '🌿';
}

// ─── AUTH STATE ───────────────────────────────────────────────────────────────
async function loadUser() {
  if (!token()) return;
  try {
    const { user, farmer } = await api('/api/auth/me');
    currentUser = user;
    currentFarmer = farmer;
    updateNavForUser();
    await updateCartCount();
  } catch {
    localStorage.removeItem('khetse_token');
    currentUser = null;
  }
}

function updateNavForUser() {
  $('nav-auth-guest').style.display = currentUser ? 'none' : 'flex';
  $('nav-auth-user').style.display = currentUser ? 'flex' : 'none';
  if (currentUser) {
    $('nav-user-name').textContent = currentUser.name.split(' ')[0];
    $('farmer-nav-links').style.display = currentUser.role === 'farmer' ? 'block' : 'none';
    $('admin-nav-links').style.display = currentUser.role === 'admin' ? 'block' : 'none';
  }
}

async function updateCartCount() {
  if (!currentUser || currentUser.role !== 'customer') return;
  try {
    const { items } = await api('/api/cart');
    cartCount = items.length;
    $('cart-count').textContent = cartCount;
  } catch {}
}

function logout() {
  localStorage.removeItem('khetse_token');
  currentUser = null;
  currentFarmer = null;
  updateNavForUser();
  toast('Logged out successfully');
  navigate('home');
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────
async function renderPage(page, params = {}) {
  const el = main();
  el.innerHTML = '<div class="loading">Loading…</div>';
  try {
    switch (page) {
      case 'home': await renderHome(); break;
      case 'shop': await renderShop(params); break;
      case 'product': await renderProduct(params); break;
      case 'farmers': await renderFarmers(params); break;
      case 'farmer': await renderFarmer(params); break;
      case 'subscribe': await renderSubscribe(); break;
      case 'community': await renderCommunity(); break;
      case 'cart': await renderCart(); break;
      case 'checkout': await renderCheckout(); break;
      case 'orders': await renderOrders(); break;
      case 'order': await renderOrder(params); break;
      case 'subscriptions': await renderSubscriptions(); break;
      case 'login': renderLogin(); break;
      case 'register': renderRegister(); break;
      case 'dashboard': await renderDashboard(); break;
      case 'my-listings': await renderMyListings(); break;
      case 'add-product': renderAddProduct(); break;
      case 'farmer-register': renderFarmerRegister(); break;
      case 'admin': await renderAdmin(); break;
      case 'profile': await renderProfile(); break;
      default: navigate('home');
    }
  } catch (e) {
    el.innerHTML = `<div class="section section-light"><div class="container"><div class="empty-state"><div class="empty-icon">⚠️</div><h3>Something went wrong</h3><p>${e.message}</p><button class="btn btn-primary mt-24" onclick="navigate('home')">Go home</button></div></div></div>`;
  }
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
async function renderHome() {
  const el = main();
  const [productsRaw, farmersRaw] = await Promise.all([
    api('/api/products').catch(() => []),
    api('/api/farmers?verified_only=1').catch(() => [])
  ]);

  const tickerItems = farmersRaw.slice(0, 8).map(f => {
    const prods = productsRaw.filter(p => p.farmer_id_real === f.id).slice(0, 2).map(p => p.name).join(', ');
    return `<span class="ticker-item"><span class="ticker-dot"></span><span style="font-weight:800">${f.name}</span> · ${f.district}, ${f.state} <span class="ticker-tag">${prods || 'Produce available'}</span></span>`;
  }).join('');

  const featProds = productsRaw.slice(0, 6).map(p => productCardHTML(p)).join('');
  const featFarmers = farmersRaw.slice(0, 3).map(f => farmerCardHTML(f)).join('');

  el.innerHTML = `
    <section class="hero-section">
      <div class="hero-bg"></div>
      <div class="hero-eyebrow"><span class="dot"></span><span>Live Platform · India</span></div>
      <h1 class="hero-h1">From the <span class="accent">field</span><br>to your <span class="italic accent">door.</span></h1>
      <p class="hero-sub">A commission-based marketplace where verified Indian farmers set their own prices, list their produce, and sell directly to customers — no middlemen, no guesswork.</p>
      <div class="hero-actions">
        <button class="btn btn-primary btn-lg" onclick="navigate('shop')">Browse Produce</button>
        <button class="btn btn-outline btn-lg" style="color:rgba(255,255,255,.8);border-color:rgba(255,255,255,.25)" onclick="navigate('farmer-register')">Register as Farmer</button>
      </div>
      <div class="hero-stats">
        <div class="h-stat"><span class="h-stat-num">12%</span><span class="h-stat-label">Platform commission</span></div>
        <div class="h-stat"><span class="h-stat-num">100%</span><span class="h-stat-label">Govt-verified farmers</span></div>
        <div class="h-stat"><span class="h-stat-num">48hr</span><span class="h-stat-label">Farm-to-door</span></div>
        <div class="h-stat"><span class="h-stat-num">₹0</span><span class="h-stat-label">Listing fee</span></div>
      </div>
    </section>

    <div class="ticker-wrap"><div class="ticker-track">${tickerItems}${tickerItems}</div></div>

    <section class="section section-light">
      <div class="container">
        <div class="section-header">
          <div class="section-eyebrow">Fresh listings</div>
          <h2 class="section-title">Straight from the field.</h2>
          <p class="section-sub text-muted">Named, verified farmers. Their prices. Zero broker markup.</p>
        </div>
        <div class="product-grid">${featProds || '<div class="empty-state"><p>No products yet.</p></div>'}</div>
        <div class="text-center mt-32"><button class="btn btn-secondary" onclick="navigate('shop')">View all produce →</button></div>
      </div>
    </section>

    <section class="section section-dark">
      <div class="container">
        <div class="section-header">
          <div class="section-eyebrow light">Our farmers</div>
          <h2 class="section-title" style="color:var(--white)">Meet the growers.</h2>
          <p class="section-sub" style="color:rgba(255,255,255,.55)">Every farmer on KhetSe is government-verified. You see who grew your food before you buy.</p>
        </div>
        <div class="farmer-grid">${featFarmers}</div>
        <div class="text-center mt-32"><button class="btn btn-primary" onclick="navigate('farmers')">All farmers →</button></div>
      </div>
    </section>

    <section class="section section-white">
      <div class="container">
        <div class="two-col" style="align-items:center">
          <div>
            <div class="section-eyebrow">How it works</div>
            <h2 class="section-title">Three roles.<br>One honest chain.</h2>
            <div class="feat-item"><div class="feat-icon">🌾</div><div class="feat-text"><h4>Farmers list and price freely</h4><p>Verify your identity, list your produce, set your own price. We take a small commission only when you sell.</p></div></div>
            <div class="feat-item"><div class="feat-icon">🧺</div><div class="feat-text"><h4>Customers know exactly who grew it</h4><p>Every product links to a verified farmer profile. See their land records, crop history, and delivery timeline.</p></div></div>
            <div class="feat-item"><div class="feat-icon">⚖️</div><div class="feat-text"><h4>Platform stays in the background</h4><p>KhetSe verifies, mediates, and ships. That's it. No reselling, no price-setting, no interference.</p></div></div>
          </div>
          <div class="verify-card">
            <div style="font-size:11px;color:rgba(255,255,255,.35);font-family:var(--mono);letter-spacing:1px;margin-bottom:20px;text-transform:uppercase">Sample · Verified Farmer Profile</div>
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
              <div style="width:52px;height:52px;border-radius:50%;background:var(--sage);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:var(--white);font-family:var(--display)">R</div>
              <div>
                <div style="font-size:16px;font-weight:700;color:var(--white)">Ramesh K. Patil</div>
                <div style="font-size:11px;color:rgba(255,255,255,.4);font-family:var(--mono)">Dindori, Nasik · Maharashtra</div>
              </div>
              <span class="badge badge-verified" style="margin-left:auto">✓ Verified</span>
            </div>
            <div class="verify-check">✓ Aadhaar verified</div>
            <div class="verify-check">✓ PM-Kisan linked · PMK-MH-2024-4871</div>
            <div class="verify-check">✓ Land record (7/12) confirmed</div>
            <div class="verify-check">✓ eNAM registered</div>
            <div class="verify-check">✓ Soil Health Card active</div>
            <div style="margin-top:16px;padding:14px;background:rgba(255,255,255,.05);border-radius:4px;display:flex;justify-content:space-between;font-size:13px">
              <span style="color:rgba(255,255,255,.5)">Commission tier</span>
              <span class="badge badge-harvest">Harvest · 12%</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section section-sage">
      <div class="container">
        <div class="section-eyebrow light">Subscribe & save</div>
        <h2 class="section-title" style="color:var(--white)">Set it and eat well every fortnight.</h2>
        <p class="section-sub" style="color:rgba(255,255,255,.75)">Monthly or fortnightly boxes of your chosen produce, coordinated with your verified farmers. Pause, swap, or cancel anytime.</p>
        <div class="three-col mt-32">
          ${['Staples Box','Fresh Harvest Box','Build Your Own'].map((name, i) => `
          <div class="card" style="border:none">
            <div class="card-body">
              <div style="font-size:32px;margin-bottom:12px">${['🌾','🥦','✨'][i]}</div>
              <h3 style="font-size:18px;font-weight:700;margin-bottom:8px">${name}</h3>
              <p class="text-small text-muted">${['Monthly staples — grains, pulses, spices from the same verified farmer.','Fortnightly seasonal vegetables and fruit matched to what\'s in season.','Choose your own mix of produce and farmers. Swap anytime before dispatch.'][i]}</p>
              <button class="btn btn-secondary mt-24 btn-block" onclick="navigate('subscribe')">Set up subscription</button>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </section>

    ${renderFooter()}
  `;
}

// ─── SHOP PAGE ────────────────────────────────────────────────────────────────
async function renderShop(params = {}) {
  const el = main();
  let url = '/api/products?';
  if (params.category) url += `category=${encodeURIComponent(params.category)}&`;
  if (params.q) url += `q=${encodeURIComponent(params.q)}&`;
  if (params.organic) url += `organic=1&`;

  const [products, categories] = await Promise.all([
    api(url).catch(() => []),
    api('/api/categories').catch(() => [])
  ]);

  const cats = ['All', ...categories.map(c => c.category)];

  el.innerHTML = `
    <div class="page-header">
      <div class="container">
        <div class="page-eyebrow">Marketplace</div>
        <h1 class="page-title">Browse Produce</h1>
        <p class="page-sub">All products from government-verified farmers. Real prices, real people.</p>
      </div>
    </div>
    <section class="section section-light">
      <div class="container">
        <div class="filter-bar">
          <input id="search-input" type="text" placeholder="Search produce…" value="${params.q || ''}" oninput="filterShop()">
          <select id="cat-filter" onchange="filterShop()">
            ${cats.map(c => `<option value="${c === 'All' ? '' : c}" ${(params.category || '') === (c === 'All' ? '' : c) ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <label class="form-check"><input type="checkbox" id="organic-filter" ${params.organic ? 'checked' : ''} onchange="filterShop()"> Organic only</label>
        </div>
        <div id="products-container" class="product-grid">
          ${products.length ? products.map(p => productCardHTML(p)).join('') : '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🌿</div><h3>No products found</h3><p>Try a different search or filter.</p></div>'}
        </div>
      </div>
    </section>
    ${renderFooter()}
  `;
}

function filterShop() {
  const q = $('search-input')?.value || '';
  const category = $('cat-filter')?.value || '';
  const organic = $('organic-filter')?.checked || false;
  navigate('shop', { q, category, organic });
}

// ─── PRODUCT DETAIL ───────────────────────────────────────────────────────────
async function renderProduct({ id }) {
  if (!id) return navigate('shop');
  const p = await api(`/api/products/${id}`);
  const el = main();
  const canBuy = currentUser && currentUser.role === 'customer';

  el.innerHTML = `
    <section class="section section-light">
      <div class="container">
        <p class="text-muted mb-16"><a onclick="navigate('shop')" style="color:var(--sage)">← Back to shop</a></p>
        <div class="two-col" style="gap:40px">
          <div>
            <div style="background:var(--white);border:1.5px solid var(--mist);border-radius:var(--radius);height:280px;display:flex;align-items:center;justify-content:center;font-size:100px;margin-bottom:20px">${catEmoji(p.category)}</div>
            <div class="card">
              <div class="card-header"><strong>About the Farmer</strong></div>
              <div class="card-body">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
                  <div class="farmer-avatar-lg" style="width:48px;height:48px;font-size:20px">${p.farmer_name[0]}</div>
                  <div>
                    <div style="font-weight:700">${p.farmer_name}</div>
                    <div class="text-small text-muted">${p.district}, ${p.state}</div>
                  </div>
                  ${p.verification_status === 'verified' ? '<span class="badge badge-verified" style="margin-left:auto">✓ Verified</span>' : ''}
                </div>
                ${p.farmer_bio ? `<p class="text-small text-muted">${p.farmer_bio}</p>` : ''}
                <button class="btn btn-outline btn-sm mt-16" onclick="navigate('farmer', { id: '${p.farmer_id_real}' })">View farmer profile →</button>
              </div>
            </div>
          </div>
          <div>
            <div class="flex gap-8 mb-16">
              ${p.is_organic ? '<span class="badge badge-organic">🌿 Organic</span>' : ''}
              <span class="badge badge-${p.verification_status}">${p.verification_status === 'verified' ? '✓ Verified farm' : p.verification_status}</span>
              ${p.trust_badge ? '<span class="badge badge-trust">⭐ Top Farmer</span>' : ''}
            </div>
            <h1 style="font-family:var(--display);font-size:38px;font-weight:900;letter-spacing:-0.5px;margin-bottom:8px">${p.name}</h1>
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:16px">
              <span style="font-family:var(--display);font-size:44px;font-weight:900;color:var(--saffron)">₹${p.price_per_unit}</span>
              <span class="text-muted">per ${p.unit}</span>
            </div>
            <p style="color:#5A4A38;line-height:1.7;margin-bottom:24px">${p.description}</p>
            <div class="card mb-24">
              <div class="card-body" style="padding:16px 20px">
                <div class="flex-between mb-8"><span class="text-small text-muted">Available quantity</span><strong>${p.quantity_available} ${p.unit}</strong></div>
                <div class="flex-between mb-8"><span class="text-small text-muted">Minimum order</span><strong>${p.min_order} ${p.unit}</strong></div>
                <div class="flex-between mb-8"><span class="text-small text-muted">Farmer rating</span><strong>⭐ ${p.farmer_rating ? p.farmer_rating.toFixed(1) : 'New'}</strong></div>
                ${p.harvest_date ? `<div class="flex-between"><span class="text-small text-muted">Harvest date</span><strong>${formatDate(p.harvest_date)}</strong></div>` : ''}
              </div>
            </div>
            ${canBuy ? `
              <div class="flex gap-12 mb-16">
                <input type="number" id="buy-qty" value="${p.min_order}" min="${p.min_order}" max="${p.quantity_available}" step="${p.min_order}" class="form-input" style="width:100px">
                <span class="text-muted" style="align-self:center">${p.unit}</span>
              </div>
              <button class="btn btn-primary btn-lg btn-block" onclick="addToCartFromDetail('${p.id}', '${p.name}')">Add to Cart 🛒</button>
            ` : currentUser ? '<p class="text-muted">Farmers cannot place orders.</p>' : `
              <p class="text-muted mb-16">Log in as a customer to buy this product.</p>
              <button class="btn btn-primary btn-block" onclick="navigate('login')">Log in to buy</button>
            `}
          </div>
        </div>
      </div>
    </section>
    ${renderFooter()}
  `;
}

async function addToCartFromDetail(productId, name) {
  const qty = parseFloat($('buy-qty')?.value || 1);
  try {
    await api('/api/cart', { method: 'POST', body: JSON.stringify({ product_id: productId, quantity: qty }) });
    toast(`Added ${name} to cart`, 'success');
    await updateCartCount();
  } catch (e) { toast(e.message, 'error'); }
}

async function addToCart(productId, name, event) {
  if (event) event.stopPropagation();
  if (!currentUser) { toast('Please log in to add items to cart'); return navigate('login'); }
  if (currentUser.role !== 'customer') { toast('Only customers can place orders'); return; }
  try {
    await api('/api/cart', { method: 'POST', body: JSON.stringify({ product_id: productId, quantity: 1 }) });
    toast(`Added ${name} to cart ✓`, 'success');
    await updateCartCount();
  } catch (e) { toast(e.message, 'error'); }
}

// ─── FARMERS LIST ─────────────────────────────────────────────────────────────
async function renderFarmers() {
  const el = main();
  const farmers = await api('/api/farmers?verified_only=1');
  el.innerHTML = `
    <div class="page-header">
      <div class="container">
        <div class="page-eyebrow">Verified Farmers</div>
        <h1 class="page-title">Meet the growers</h1>
        <p class="page-sub">Every farmer below is verified against government records. Click any profile to see their produce.</p>
      </div>
    </div>
    <section class="section section-light">
      <div class="container">
        <div class="farmer-grid">${farmers.map(f => farmerCardHTML(f)).join('') || '<div class="empty-state"><p>No verified farmers yet.</p></div>'}</div>
      </div>
    </section>
    ${renderFooter()}
  `;
}

async function renderFarmer({ id }) {
  if (!id) return navigate('farmers');
  const { farmer, products } = await api(`/api/farmers/${id}`);
  const el = main();
  el.innerHTML = `
    <div class="page-header">
      <div class="container">
        <p style="color:rgba(255,255,255,.5);margin-bottom:8px"><a onclick="navigate('farmers')" style="color:rgba(255,255,255,.5)">← All farmers</a></p>
        <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
          <div class="farmer-avatar-lg" style="width:72px;height:72px;font-size:30px">${farmer.name[0]}</div>
          <div>
            <h1 class="page-title" style="margin-bottom:6px">${farmer.name}</h1>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${verifyBadge(farmer.verification_status)}
              ${farmer.trust_badge ? '<span class="badge badge-trust">⭐ Top Farmer</span>' : ''}
              <span class="badge badge-${farmer.commission_tier}">${farmer.commission_tier}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <section class="section section-light">
      <div class="container">
        <div class="two-col">
          <div>
            <div class="card mb-24">
              <div class="card-header"><strong>Farm Details</strong></div>
              <div class="card-body">
                <div class="flex-between mb-12"><span class="text-muted">Village</span><strong>${farmer.village}</strong></div>
                <div class="flex-between mb-12"><span class="text-muted">District</span><strong>${farmer.district}</strong></div>
                <div class="flex-between mb-12"><span class="text-muted">State</span><strong>${farmer.state}</strong></div>
                <div class="flex-between mb-12"><span class="text-muted">Land holding</span><strong>${farmer.land_acres} acres</strong></div>
                <div class="flex-between mb-12"><span class="text-muted">Rating</span><strong>⭐ ${farmer.rating ? farmer.rating.toFixed(1) : 'New'}</strong></div>
                <div class="flex-between"><span class="text-muted">Orders completed</span><strong>${farmer.total_orders}</strong></div>
              </div>
            </div>
            ${farmer.bio ? `<div class="card mb-24"><div class="card-header"><strong>About</strong></div><div class="card-body"><p style="line-height:1.7;color:#5A4A38">${farmer.bio}</p></div></div>` : ''}
          </div>
          <div>
            <div class="verify-card mb-24">
              <div style="font-size:11px;color:rgba(255,255,255,.4);font-family:var(--mono);letter-spacing:1px;text-transform:uppercase;margin-bottom:16px">Government Verification</div>
              ${farmer.aadhaar_last4 ? `<div class="verify-check">✓ Aadhaar (last 4: ${farmer.aadhaar_last4})</div>` : ''}
              ${farmer.pm_kisan_id ? `<div class="verify-check">✓ PM-Kisan · ${farmer.pm_kisan_id}</div>` : ''}
              ${farmer.land_record_number ? `<div class="verify-check">✓ Land Records · ${farmer.land_record_number}</div>` : ''}
              ${farmer.enam_id ? `<div class="verify-check">✓ eNAM · ${farmer.enam_id}</div>` : ''}
              ${farmer.soil_health_card ? `<div class="verify-check">✓ Soil Health Card · ${farmer.soil_health_card}</div>` : ''}
              ${farmer.verification_date ? `<p style="font-size:11px;color:rgba(255,255,255,.3);font-family:var(--mono);margin-top:12px">Verified on: ${formatDate(farmer.verification_date)}</p>` : ''}
            </div>
          </div>
        </div>
        <h2 style="font-family:var(--display);font-size:26px;font-weight:900;margin-bottom:24px">Current Listings (${products.length})</h2>
        <div class="product-grid">${products.map(p => productCardHTML({ ...p, farmer_name: farmer.name, farmer_id_real: farmer.id, verification_status: farmer.verification_status, farmer_rating: farmer.rating, trust_badge: farmer.trust_badge })).join('') || '<div class="empty-state"><p>No active listings.</p></div>'}</div>
      </div>
    </section>
    ${renderFooter()}
  `;
}

// ─── SUBSCRIBE PAGE ───────────────────────────────────────────────────────────
async function renderSubscribe() {
  const el = main();
  const products = await api('/api/products');
  el.innerHTML = `
    <div class="page-header">
      <div class="container">
        <div class="page-eyebrow">Subscription Boxes</div>
        <h1 class="page-title">Set it. Forget it.<br>Eat fresh.</h1>
        <p class="page-sub">Monthly or fortnightly delivery of your chosen produce, coordinated with verified farmers.</p>
      </div>
    </div>
    <section class="section section-white">
      <div class="container">
        ${!currentUser ? `
          <div class="empty-state">
            <div class="empty-icon">📦</div>
            <h3>Log in to set up a subscription</h3>
            <p>Create an account or log in to choose your box and set a delivery schedule.</p>
            <button class="btn btn-primary mt-24" onclick="navigate('login')">Log in</button>
          </div>
        ` : currentUser.role !== 'customer' ? '<div class="empty-state"><div class="empty-icon">🚜</div><h3>Subscriptions are for customers</h3><p>Farmer accounts cannot place orders.</p></div>' : `
          <div class="two-col">
            <div>
              <h2 style="font-family:var(--display);font-size:26px;font-weight:900;margin-bottom:24px">Configure your box</h2>
              <form id="sub-form">
                <div class="form-group">
                  <label class="form-label">Box type</label>
                  <select class="form-input form-select" id="sub-box-type">
                    <option value="staples">Staples Box — grains, pulses, spices (monthly)</option>
                    <option value="fresh">Fresh Harvest Box — seasonal vegetables + fruit (fortnightly)</option>
                    <option value="custom">Build Your Own — choose exactly what you want</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Delivery cadence</label>
                  <select class="form-input form-select" id="sub-cadence">
                    <option value="monthly">Monthly (every 30 days)</option>
                    <option value="fortnightly">Fortnightly (every 15 days)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Delivery address</label>
                  <textarea class="form-input form-textarea" id="sub-address" placeholder="Full delivery address including flat/house number, street, area…" style="min-height:80px"></textarea>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Pincode</label>
                    <input type="text" class="form-input" id="sub-pincode" placeholder="e.g. 400001">
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Special instructions (optional)</label>
                  <input type="text" class="form-input" id="sub-notes" placeholder="e.g. Leave with security, call before delivery…">
                </div>
                <h3 style="font-size:16px;font-weight:700;margin:24px 0 12px">Add products to your box</h3>
                <div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:8px" id="sub-products">
                  ${products.slice(0, 12).map(p => `
                  <label class="form-check" style="border:1.5px solid var(--mist);border-radius:var(--radius);padding:10px 14px;cursor:pointer;gap:12px">
                    <input type="checkbox" class="sub-product-check" data-id="${p.id}" data-name="${p.name}"> 
                    <span style="flex:1;font-size:14px">${catEmoji(p.category)} ${p.name}</span>
                    <span class="text-muted text-small">₹${p.price_per_unit}/${p.unit}</span>
                    <input type="number" class="sub-product-qty" data-id="${p.id}" value="1" min="1" style="width:60px;padding:4px 8px;border:1.5px solid var(--mist);border-radius:4px;font-size:13px" onclick="event.stopPropagation()">
                  </label>`).join('')}
                </div>
                <button type="button" class="btn btn-primary btn-block mt-24" onclick="placeSubscription()">Create Subscription →</button>
              </form>
            </div>
            <div>
              <div class="card" style="position:sticky;top:84px">
                <div class="card-header"><strong>How it works</strong></div>
                <div class="card-body">
                  ${[['01','Choose your box','Pick from our curated boxes or build your own from verified farmer listings.'],['02','We coordinate','KhetSe groups your order with others from the same region to give farmers enough volume for dispatch.'],['03','Packed & shipped','Each item arrives with a QR code linking to the farmer\'s profile, harvest date, and transport chain.'],['04','Full control','Pause, swap, or cancel at any time up to 48 hours before your dispatch window.']].map(([n,t,d]) => `<div class="feat-item" style="padding:14px 0;border-bottom:1px solid var(--mist)"><div style="font-family:var(--display);font-size:26px;font-weight:900;color:var(--mist);min-width:36px">${n}</div><div><strong style="font-size:14px;display:block;margin-bottom:3px">${t}</strong><span class="text-small text-muted">${d}</span></div></div>`).join('')}
                </div>
              </div>
            </div>
          </div>
        `}
      </div>
    </section>
    ${renderFooter()}
  `;
}

async function placeSubscription() {
  const boxType = $('sub-box-type')?.value;
  const cadence = $('sub-cadence')?.value;
  const address = $('sub-address')?.value?.trim();
  const pincode = $('sub-pincode')?.value?.trim();
  const notes = $('sub-notes')?.value?.trim();
  if (!address) { toast('Please enter a delivery address', 'error'); return; }
  const items = [];
  document.querySelectorAll('.sub-product-check:checked').forEach(cb => {
    const qty = parseFloat(document.querySelector(`.sub-product-qty[data-id="${cb.dataset.id}"]`)?.value || 1);
    items.push({ product_id: cb.dataset.id, quantity: qty });
  });
  try {
    await api('/api/subscriptions', { method: 'POST', body: JSON.stringify({ box_type: boxType, cadence, address, pincode, special_instructions: notes, items }) });
    toast('Subscription created! ✓', 'success');
    navigate('subscriptions');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── COMMUNITY ────────────────────────────────────────────────────────────────
async function renderCommunity() {
  const el = main();
  const posts = await api('/api/community/posts');
  const isFarmer = currentUser?.role === 'farmer';

  el.innerHTML = `
    <div class="page-header">
      <div class="container">
        <div class="page-eyebrow">Community</div>
        <h1 class="page-title">Farmers talking<br>to farmers.</h1>
        <p class="page-sub">Share pricing intel, co-shipping opportunities, farming tips, and experience reports.</p>
      </div>
    </div>
    <section class="section section-light">
      <div class="container">
        <div class="two-col" style="gap:40px;align-items:start">
          <div>
            <div class="flex-between mb-24">
              <div class="flex gap-8 flex-wrap">
                ${['all','pricing','logistics','farming','general'].map(c => `<button class="filter-btn ${c === 'all' ? 'active' : ''}" onclick="filterPosts('${c}', this)">${c.charAt(0).toUpperCase()+c.slice(1)}</button>`).join('')}
              </div>
            </div>
            <div id="posts-list">
              ${posts.map(p => postCardHTML(p)).join('') || '<div class="empty-state"><div class="empty-icon">💬</div><h3>No posts yet</h3><p>Be the first to start a conversation.</p></div>'}
            </div>
          </div>
          <div style="position:sticky;top:84px">
            ${isFarmer ? `
              <div class="card mb-24">
                <div class="card-header"><strong>Start a conversation</strong></div>
                <div class="card-body">
                  <div class="form-group">
                    <label class="form-label">Title</label>
                    <input type="text" class="form-input" id="post-title" placeholder="What's on your mind?">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Category</label>
                    <select class="form-input form-select" id="post-category">
                      <option value="general">General</option>
                      <option value="pricing">Pricing</option>
                      <option value="logistics">Logistics / Shipping</option>
                      <option value="farming">Farming Tips</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Message</label>
                    <textarea class="form-input form-textarea" id="post-body" placeholder="Share what you know…" style="min-height:100px"></textarea>
                  </div>
                  <button class="btn btn-primary btn-block" onclick="submitPost()">Post to community</button>
                </div>
              </div>
            ` : `
              <div class="card">
                <div class="card-body text-center">
                  <div style="font-size:36px;margin-bottom:12px">🌾</div>
                  <h3 style="font-size:16px;font-weight:700;margin-bottom:8px">Join the community</h3>
                  <p class="text-small text-muted mb-16">Farmers can post and reply. Register as a farmer to participate.</p>
                  <button class="btn btn-primary btn-block" onclick="navigate('farmer-register')">Register as farmer</button>
                </div>
              </div>
            `}
            <div class="card mt-16">
              <div class="card-header"><strong>Community stats</strong></div>
              <div class="card-body">
                <div class="flex-between mb-8"><span class="text-muted text-small">Total posts</span><strong>${posts.length}</strong></div>
                <div class="flex-between mb-8"><span class="text-muted text-small">Active discussions</span><strong>${posts.filter(p => p.reply_count > 0).length}</strong></div>
                <div class="flex-between"><span class="text-muted text-small">Total likes</span><strong>${posts.reduce((s, p) => s + (p.likes || 0), 0)}</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    ${renderFooter()}
  `;
}

async function filterPosts(cat, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const posts = await api('/api/community/posts' + (cat === 'all' ? '' : `?category=${cat}`));
  $('posts-list').innerHTML = posts.map(p => postCardHTML(p)).join('') || '<div class="empty-state"><p>No posts in this category.</p></div>';
}

async function submitPost() {
  const title = $('post-title')?.value?.trim();
  const body = $('post-body')?.value?.trim();
  const category = $('post-category')?.value;
  if (!title || !body) { toast('Title and message required', 'error'); return; }
  try {
    await api('/api/community/posts', { method: 'POST', body: JSON.stringify({ title, body, category }) });
    toast('Post published! ✓', 'success');
    await renderCommunity();
  } catch (e) { toast(e.message, 'error'); }
}

async function likePost(id, btn) {
  await api(`/api/community/posts/${id}/like`, { method: 'POST' });
  btn.textContent = '❤️ ' + (parseInt(btn.dataset.count || 0) + 1);
  btn.dataset.count = parseInt(btn.dataset.count || 0) + 1;
}

async function showReplies(postId) {
  const replies = await api(`/api/community/posts/${postId}/replies`);
  const isFarmer = currentUser?.role === 'farmer';
  showModal(`
    <div class="card-header"><strong>Replies</strong></div>
    <div class="card-body">
      ${replies.map(r => `
        <div style="padding:14px 0;border-bottom:1px solid var(--mist)">
          <div class="post-author mb-8">
            <div class="post-avatar">${r.farmer_name[0]}</div>
            <div><div class="post-author-name">${r.farmer_name}</div><div class="post-author-meta">${r.district}, ${r.state} · ${formatDate(r.created_at)}</div></div>
          </div>
          <p style="font-size:14px;color:#5A4A38;line-height:1.65">${r.body}</p>
        </div>`).join('') || '<p class="text-muted text-center" style="padding:24px">No replies yet.</p>'}
      ${isFarmer ? `
        <div style="margin-top:20px">
          <textarea id="reply-body-${postId}" class="form-input form-textarea" placeholder="Write a reply…" style="min-height:80px"></textarea>
          <button class="btn btn-primary btn-block mt-16" onclick="submitReply('${postId}')">Post reply</button>
        </div>` : ''}
    </div>
  `);
}

async function submitReply(postId) {
  const body = $(`reply-body-${postId}`)?.value?.trim();
  if (!body) return;
  try {
    await api(`/api/community/posts/${postId}/replies`, { method: 'POST', body: JSON.stringify({ body }) });
    toast('Reply posted! ✓', 'success');
    closeModal();
  } catch (e) { toast(e.message, 'error'); }
}

// ─── CART ─────────────────────────────────────────────────────────────────────
async function renderCart() {
  if (!currentUser) return navigate('login');
  const el = main();
  const { items, total } = await api('/api/cart');
  el.innerHTML = `
    <div class="page-header"><div class="container"><h1 class="page-title">Your Cart</h1></div></div>
    <section class="section section-light">
      <div class="container">
        ${items.length === 0 ? `
          <div class="empty-state"><div class="empty-icon">🛒</div><h3>Your cart is empty</h3><p>Add some produce from our verified farmers.</p><button class="btn btn-primary mt-24" onclick="navigate('shop')">Browse produce</button></div>
        ` : `
          <div class="two-col" style="gap:40px;align-items:start">
            <div>
              ${items.map(i => `
                <div class="cart-item">
                  <div class="cart-item-emoji">${catEmoji(i.category || 'Vegetables')}</div>
                  <div class="cart-item-info">
                    <div class="cart-item-name">${i.name}</div>
                    <div class="cart-item-farmer">by ${i.farmer_name} · ${i.state}</div>
                  </div>
                  <div class="cart-qty">
                    <button onclick="updateCart('${i.product_id}', ${i.quantity - 1})">−</button>
                    <span>${i.quantity}</span>
                    <button onclick="updateCart('${i.product_id}', ${i.quantity + 1})">+</button>
                  </div>
                  <div class="cart-item-price">${formatCurrency(i.price_per_unit * i.quantity)}</div>
                  <button style="background:none;border:none;color:#C62828;font-size:18px;cursor:pointer" onclick="removeFromCart('${i.product_id}')">×</button>
                </div>`).join('')}
            </div>
            <div>
              <div class="cart-summary">
                <div class="cart-summary-row"><span>Subtotal</span><span>${formatCurrency(total)}</span></div>
                <div class="cart-summary-row"><span>Platform commission (included in farmer price)</span><span>—</span></div>
                <div class="cart-summary-row"><span>Shipping</span><span class="text-muted">Calculated at checkout</span></div>
                <div class="cart-summary-row total"><span>Total</span><span>${formatCurrency(total)}</span></div>
                <button class="btn btn-primary btn-block btn-lg mt-24" onclick="navigate('checkout')">Proceed to Checkout →</button>
              </div>
            </div>
          </div>
        `}
      </div>
    </section>
    ${renderFooter()}
  `;
}

async function updateCart(productId, qty) {
  if (qty <= 0) return removeFromCart(productId);
  await api('/api/cart', { method: 'POST', body: JSON.stringify({ product_id: productId, quantity: qty }) });
  await updateCartCount();
  await renderCart();
}

async function removeFromCart(productId) {
  await api(`/api/cart/${productId}`, { method: 'DELETE' });
  await updateCartCount();
  await renderCart();
}

// ─── CHECKOUT ─────────────────────────────────────────────────────────────────
async function renderCheckout() {
  if (!currentUser) return navigate('login');
  const el = main();
  const { items, total } = await api('/api/cart');
  if (!items.length) return navigate('cart');
  el.innerHTML = `
    <div class="page-header"><div class="container"><h1 class="page-title">Checkout</h1></div></div>
    <section class="section section-light">
      <div class="container">
        <div class="two-col" style="gap:40px;align-items:start">
          <div>
            <div class="card">
              <div class="card-header"><strong>Delivery Details</strong></div>
              <div class="card-body">
                <div class="form-group"><label class="form-label">Full delivery address</label><textarea class="form-input form-textarea" id="shipping-address" placeholder="Flat/house, street, area, city, state…"></textarea></div>
                <div class="form-row">
                  <div class="form-group"><label class="form-label">Pincode</label><input type="text" class="form-input" id="shipping-pincode" placeholder="e.g. 400001"></div>
                </div>
                <div class="form-group"><label class="form-label">Payment method</label>
                  <select class="form-input form-select" id="payment-method">
                    <option value="cod">Cash on Delivery</option>
                    <option value="upi">UPI (Test mode)</option>
                    <option value="card">Card (Test mode)</option>
                  </select>
                  <p class="form-hint">This is a test instance — no real payment is processed.</p>
                </div>
                <div class="form-group"><label class="form-label">Order notes (optional)</label><input type="text" class="form-input" id="order-notes" placeholder="Any special delivery instructions…"></div>
                <button class="btn btn-primary btn-block btn-lg" onclick="placeOrder()">Place Order →</button>
              </div>
            </div>
          </div>
          <div>
            <div class="cart-summary">
              <h3 style="font-size:16px;font-weight:700;margin-bottom:16px">Order Summary</h3>
              ${items.map(i => `<div class="cart-summary-row" style="font-size:13px"><span>${i.name} × ${i.quantity}</span><span>${formatCurrency(i.price_per_unit * i.quantity)}</span></div>`).join('')}
              <div class="cart-summary-row total"><span>Total</span><span>${formatCurrency(total)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
    ${renderFooter()}
  `;
}

async function placeOrder() {
  const address = $('shipping-address')?.value?.trim();
  const pincode = $('shipping-pincode')?.value?.trim();
  const paymentMethod = $('payment-method')?.value;
  const notes = $('order-notes')?.value?.trim();
  if (!address) { toast('Please enter delivery address', 'error'); return; }
  try {
    const { order } = await api('/api/orders', { method: 'POST', body: JSON.stringify({ shipping_address: address, shipping_pincode: pincode, payment_method: paymentMethod, notes }) });
    toast('Order placed successfully! ✓', 'success');
    await updateCartCount();
    navigate('order', { id: order.id });
  } catch (e) { toast(e.message, 'error'); }
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────
async function renderOrders() {
  if (!currentUser) return navigate('login');
  const el = main();
  const orders = await api('/api/orders');
  el.innerHTML = `
    <div class="page-header"><div class="container"><h1 class="page-title">My Orders</h1></div></div>
    <section class="section section-light">
      <div class="container">
        ${orders.length === 0 ? `
          <div class="empty-state"><div class="empty-icon">📦</div><h3>No orders yet</h3><p>Start shopping from our verified farmers.</p><button class="btn btn-primary mt-24" onclick="navigate('shop')">Browse produce</button></div>
        ` : `
          <div class="card" style="overflow:hidden">
            <table class="data-table">
              <thead><tr><th>Order ID</th><th>Date</th><th>Amount</th><th>Status</th><th></th></tr></thead>
              <tbody>
                ${orders.map(o => `
                <tr>
                  <td><span style="font-family:var(--mono);font-size:12px">${o.id.slice(0,8)}…</span></td>
                  <td>${formatDate(o.created_at)}</td>
                  <td><strong>${formatCurrency(o.total_amount)}</strong></td>
                  <td>${statusBadge(o.status)}</td>
                  <td><button class="btn btn-outline btn-sm" onclick="navigate('order', { id: '${o.id}' })">View</button></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </section>
    ${renderFooter()}
  `;
}

async function renderOrder({ id }) {
  if (!id) return navigate('orders');
  const { order, items } = await api(`/api/orders/${id}`);
  const el = main();
  el.innerHTML = `
    <div class="page-header">
      <div class="container">
        <p style="color:rgba(255,255,255,.5);margin-bottom:8px"><a onclick="navigate('orders')" style="color:rgba(255,255,255,.5)">← My orders</a></p>
        <div class="flex-between flex-wrap" style="gap:12px">
          <div><h1 class="page-title">Order Details</h1><p style="color:rgba(255,255,255,.4);font-family:var(--mono);font-size:12px">${order.id}</p></div>
          ${statusBadge(order.status)}
        </div>
      </div>
    </div>
    <section class="section section-light">
      <div class="container">
        <div class="two-col" style="gap:40px;align-items:start">
          <div>
            <div class="card mb-24">
              <div class="card-header"><strong>Items Ordered</strong></div>
              <div class="card-body">
                ${items.map(i => `<div class="cart-item" style="padding:12px 0">
                  <div class="cart-item-emoji" style="font-size:28px;width:44px;height:44px">${catEmoji('Vegetables')}</div>
                  <div class="cart-item-info"><div class="cart-item-name">${i.product_name}</div><div class="cart-item-farmer">${i.farmer_name} · ${i.district}, ${i.state}</div></div>
                  <div><div class="cart-item-price">${formatCurrency(i.subtotal)}</div><div class="text-small text-muted text-center">${i.quantity} ${i.unit}</div></div>
                </div>`).join('')}
              </div>
            </div>
          </div>
          <div>
            <div class="cart-summary mb-24">
              <div class="cart-summary-row"><span>Order total</span><span><strong>${formatCurrency(order.total_amount)}</strong></span></div>
              <div class="cart-summary-row"><span>Platform commission</span><span>${formatCurrency(order.commission_amount)}</span></div>
              <div class="cart-summary-row"><span>Farmer payout</span><span>${formatCurrency(order.farmer_payout)}</span></div>
              <div class="cart-summary-row"><span>Payment method</span><span>${order.payment_method?.toUpperCase()}</span></div>
            </div>
            <div class="card">
              <div class="card-header"><strong>Delivery Details</strong></div>
              <div class="card-body">
                <p style="font-size:14px;line-height:1.6;margin-bottom:8px">${order.shipping_address}</p>
                ${order.shipping_pincode ? `<p class="text-small text-muted">Pincode: ${order.shipping_pincode}</p>` : ''}
                <p class="text-small text-muted mt-8">Ordered: ${formatDate(order.created_at)}</p>
                ${order.tracking_id ? `<p class="mt-8"><strong>Tracking ID:</strong> <span style="font-family:var(--mono)">${order.tracking_id}</span></p>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    ${renderFooter()}
  `;
}

// ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────
async function renderSubscriptions() {
  if (!currentUser) return navigate('login');
  const el = main();
  const subs = await api('/api/subscriptions');
  el.innerHTML = `
    <div class="page-header"><div class="container"><h1 class="page-title">My Subscriptions</h1></div></div>
    <section class="section section-light">
      <div class="container">
        ${subs.length === 0 ? `
          <div class="empty-state"><div class="empty-icon">📦</div><h3>No subscriptions yet</h3><p>Set up a regular delivery of fresh produce.</p><button class="btn btn-primary mt-24" onclick="navigate('subscribe')">Create a box</button></div>
        ` : subs.map(s => `
          <div class="card mb-16">
            <div class="card-header flex-between">
              <div><strong>${s.box_type} box</strong> · ${s.cadence} <span class="pill ml-8">${s.status}</span></div>
              <div class="flex gap-8">
                ${s.status === 'active' ? `<button class="btn btn-outline btn-sm" onclick="pauseSub('${s.id}')">Pause</button>` : `<button class="btn btn-primary btn-sm" onclick="resumeSub('${s.id}')">Resume</button>`}
              </div>
            </div>
            <div class="card-body">
              <p class="text-small text-muted mb-12">Next delivery: <strong>${formatDate(s.next_delivery)}</strong></p>
              <p class="text-small text-muted mb-12">Address: ${s.address}</p>
              ${s.items?.length ? `<div class="flex gap-8 flex-wrap">${s.items.map(i => `<span class="pill">${i.name} × ${i.quantity}</span>`).join('')}</div>` : ''}
            </div>
          </div>`).join('')}
        <button class="btn btn-primary mt-8" onclick="navigate('subscribe')">+ Add another box</button>
      </div>
    </section>
    ${renderFooter()}
  `;
}

async function pauseSub(id) {
  await api(`/api/subscriptions/${id}/pause`, { method: 'PUT' });
  toast('Subscription paused');
  await renderSubscriptions();
}

async function resumeSub(id) {
  await api(`/api/subscriptions/${id}/resume`, { method: 'PUT' });
  toast('Subscription resumed');
  await renderSubscriptions();
}

// ─── AUTH FORMS ───────────────────────────────────────────────────────────────
function renderLogin() {
  const el = main();
  el.innerHTML = `
    <div class="auth-page">
      <div class="auth-box">
        <div class="auth-logo"><div class="nav-logo">K</div><span style="font-family:var(--display);font-size:22px;font-weight:900">Khet<span style="color:var(--saffron)">Se</span></span></div>
        <h1 class="auth-title">Welcome back</h1>
        <p class="auth-sub">Log in to your account</p>
        <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="login-email" placeholder="you@example.com" value=""></div>
        <div class="form-group"><label class="form-label">Password</label><input type="password" class="form-input" id="login-password" placeholder="••••••••"></div>
        <button class="btn btn-primary btn-block btn-lg" onclick="doLogin()">Log in</button>
        <div class="auth-divider">or</div>
        <div style="background:var(--parchment);border-radius:var(--radius);padding:14px;font-size:13px;color:#5A4A38;margin-bottom:16px">
          <strong>Test accounts:</strong><br>
          👨‍💼 Admin: admin@khetse.in / admin123<br>
          🌾 Farmer: ramesh@farmer.in / farmer123<br>
          🛒 Customer: priya@customer.in / customer123
        </div>
        <p class="auth-footer">No account? <a onclick="navigate('register')">Register here</a></p>
      </div>
    </div>
  `;
  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

async function doLogin() {
  const email = $('login-email')?.value?.trim();
  const password = $('login-password')?.value;
  if (!email || !password) { toast('Email and password required', 'error'); return; }
  try {
    const { token: t, user } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    localStorage.setItem('khetse_token', t);
    currentUser = user;
    updateNavForUser();
    await updateCartCount();
    toast(`Welcome back, ${user.name.split(' ')[0]}! ✓`, 'success');
    navigate(user.role === 'admin' ? 'admin' : user.role === 'farmer' ? 'dashboard' : 'shop');
  } catch (e) { toast(e.message, 'error'); }
}

function renderRegister() {
  const el = main();
  el.innerHTML = `
    <div class="auth-page">
      <div class="auth-box" style="max-width:500px">
        <div class="auth-logo"><div class="nav-logo">K</div><span style="font-family:var(--display);font-size:22px;font-weight:900">Khet<span style="color:var(--saffron)">Se</span></span></div>
        <h1 class="auth-title">Join KhetSe</h1>
        <div class="tabs">
          <button class="tab-btn active" id="tab-customer" onclick="switchTab('customer')">I'm a Customer</button>
          <button class="tab-btn" id="tab-farmer-tab" onclick="switchTab('farmer')">I'm a Farmer</button>
        </div>
        <div id="reg-role-msg" style="background:var(--sage-light);border-radius:var(--radius);padding:10px 14px;font-size:13px;color:var(--sage);margin-bottom:16px">Shopping for fresh produce direct from verified farmers.</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Full name</label><input type="text" class="form-input" id="reg-name" placeholder="Your name"></div>
          <div class="form-group"><label class="form-label">Phone</label><input type="text" class="form-input" id="reg-phone" placeholder="10-digit mobile number"></div>
        </div>
        <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="reg-email" placeholder="you@example.com"></div>
        <div class="form-group"><label class="form-label">Password</label><input type="password" class="form-input" id="reg-password" placeholder="At least 6 characters"></div>
        <input type="hidden" id="reg-role" value="customer">
        <button class="btn btn-primary btn-block btn-lg" onclick="doRegister()">Create account</button>
        <p class="auth-footer">Already registered? <a onclick="navigate('login')">Log in</a></p>
      </div>
    </div>
  `;
}

function switchTab(role) {
  $('reg-role').value = role;
  $('tab-customer').classList.toggle('active', role === 'customer');
  $('tab-farmer-tab').classList.toggle('active', role === 'farmer');
  $('reg-role-msg').textContent = role === 'farmer' ? '🌾 After registration, you\'ll complete your farm profile and government verification.' : '🛒 Shopping for fresh produce direct from verified farmers.';
  $('reg-role-msg').style.background = role === 'farmer' ? 'var(--parchment)' : 'var(--sage-light)';
  $('reg-role-msg').style.color = role === 'farmer' ? 'var(--terra)' : 'var(--sage)';
}

async function doRegister() {
  const name = $('reg-name')?.value?.trim();
  const phone = $('reg-phone')?.value?.trim();
  const email = $('reg-email')?.value?.trim();
  const password = $('reg-password')?.value;
  const role = $('reg-role')?.value;
  if (!name || !phone || !email || !password) { toast('All fields required', 'error'); return; }
  try {
    const { token: t, user } = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, phone, email, password, role }) });
    localStorage.setItem('khetse_token', t);
    currentUser = user;
    updateNavForUser();
    toast(`Welcome to KhetSe, ${name.split(' ')[0]}! ✓`, 'success');
    navigate(role === 'farmer' ? 'farmer-register' : 'shop');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── FARMER REGISTER ──────────────────────────────────────────────────────────
function renderFarmerRegister() {
  if (!currentUser) return navigate('register');
  const el = main();
  el.innerHTML = `
    <div class="page-header"><div class="container"><div class="page-eyebrow">Farmer Registration</div><h1 class="page-title">Complete your farm profile</h1><p class="page-sub">We'll verify your details against government databases within 24–48 hours. You'll get an SMS when you're cleared to list.</p></div></div>
    <section class="section section-light">
      <div class="container" style="max-width:760px">
        <div class="card">
          <div class="card-header"><strong>Farm & Location Details</strong></div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group"><label class="form-label">Farm / family name (optional)</label><input type="text" class="form-input" id="fr-farm-name" placeholder="e.g. Patil Family Farm"></div>
              <div class="form-group"><label class="form-label">Land holding (acres)</label><input type="number" class="form-input" id="fr-land" placeholder="e.g. 4.5" min="0.1" step="0.1"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Village / locality *</label><input type="text" class="form-input" id="fr-village" placeholder="e.g. Dindori"></div>
              <div class="form-group"><label class="form-label">District *</label><input type="text" class="form-input" id="fr-district" placeholder="e.g. Nasik"></div>
            </div>
            <div class="form-group"><label class="form-label">State *</label>
              <select class="form-input form-select" id="fr-state">
                <option value="">Select state…</option>
                ${['Andhra Pradesh','Chhattisgarh','Gujarat','Haryana','Karnataka','Madhya Pradesh','Maharashtra','Punjab','Rajasthan','Tamil Nadu','Telangana','Uttar Pradesh','West Bengal'].map(s => `<option>${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Brief bio (optional)</label><textarea class="form-input form-textarea" id="fr-bio" placeholder="Tell customers about your farm, crops, and farming practices…"></textarea></div>
          </div>
        </div>
        <div class="card mt-24">
          <div class="card-header">
            <strong>Government Verification Documents</strong>
            <p class="text-small text-muted mt-4">Enter your document IDs. We cross-check these against government databases. You do NOT need to upload any scanned documents.</p>
          </div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Aadhaar — last 4 digits *</label>
                <input type="text" class="form-input" id="fr-aadhaar" maxlength="4" placeholder="e.g. 8741">
                <p class="form-hint">We only store the last 4 digits for verification reference.</p>
              </div>
              <div class="form-group">
                <label class="form-label">PM-Kisan beneficiary ID</label>
                <input type="text" class="form-input" id="fr-pmkisan" placeholder="e.g. PMK-MH-2024-4871">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Land record number (7/12 or RoR)</label>
                <input type="text" class="form-input" id="fr-land-rec" placeholder="e.g. MH-NK-7/12-2201">
              </div>
              <div class="form-group">
                <label class="form-label">eNAM registration ID (if any)</label>
                <input type="text" class="form-input" id="fr-enam" placeholder="e.g. ENAM-MH-2023-001">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Soil Health Card number (if any)</label>
              <input type="text" class="form-input" id="fr-shc" placeholder="e.g. SHC-MH-2024-0099">
            </div>
          </div>
          <div class="card-footer">
            <button class="btn btn-primary btn-lg" onclick="submitFarmerReg()">Submit for Verification →</button>
          </div>
        </div>
      </div>
    </section>
    ${renderFooter()}
  `;
}

async function submitFarmerReg() {
  const village = $('fr-village')?.value?.trim();
  const district = $('fr-district')?.value?.trim();
  const state = $('fr-state')?.value;
  const aadhaar = $('fr-aadhaar')?.value?.trim();
  if (!village || !district || !state || !aadhaar) { toast('Village, district, state, and Aadhaar last 4 digits are required', 'error'); return; }
  try {
    await api('/api/farmers/register', { method: 'POST', body: JSON.stringify({
      farm_name: $('fr-farm-name')?.value?.trim(),
      village, district, state,
      land_acres: parseFloat($('fr-land')?.value || 0),
      aadhaar_last4: aadhaar,
      pm_kisan_id: $('fr-pmkisan')?.value?.trim(),
      land_record_number: $('fr-land-rec')?.value?.trim(),
      enam_id: $('fr-enam')?.value?.trim(),
      soil_health_card: $('fr-shc')?.value?.trim(),
      bio: $('fr-bio')?.value?.trim()
    }) });
    await loadUser();
    toast('Farm profile submitted! Verification in 24–48 hours. ✓', 'success');
    navigate('dashboard');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  if (!currentUser) return navigate('login');
  const el = main();

  if (currentUser.role === 'customer') {
    const [orders, subs] = await Promise.all([ api('/api/orders').catch(() => []), api('/api/subscriptions').catch(() => []) ]);
    el.innerHTML = `
      <div class="page-header"><div class="container"><h1 class="page-title">My Dashboard</h1><p class="page-sub">Welcome back, ${currentUser.name.split(' ')[0]}.</p></div></div>
      <section class="section section-light">
        <div class="container">
          <div class="stats-grid">
            <div class="stat-box"><div class="stat-box-num">${orders.length}</div><div class="stat-box-label">Total orders</div></div>
            <div class="stat-box"><div class="stat-box-num">${subs.filter(s => s.status === 'active').length}</div><div class="stat-box-label">Active subscriptions</div></div>
            <div class="stat-box"><div class="stat-box-num">${formatCurrency(orders.reduce((s, o) => s + (o.total_amount || 0), 0))}</div><div class="stat-box-label">Total spent</div></div>
          </div>
          <div class="flex gap-12 flex-wrap mb-32">
            <button class="btn btn-primary" onclick="navigate('shop')">Browse produce</button>
            <button class="btn btn-outline" onclick="navigate('orders')">View orders</button>
            <button class="btn btn-outline" onclick="navigate('subscriptions')">My subscriptions</button>
          </div>
          <h2 style="font-family:var(--display);font-size:22px;font-weight:900;margin-bottom:16px">Recent Orders</h2>
          ${orders.length ? `<div class="card" style="overflow:hidden"><table class="data-table"><thead><tr><th>Order</th><th>Date</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${orders.slice(0,5).map(o => `<tr><td style="font-family:var(--mono);font-size:12px">${o.id.slice(0,8)}…</td><td>${formatDate(o.created_at)}</td><td>${formatCurrency(o.total_amount)}</td><td>${statusBadge(o.status)}</td><td><button class="btn btn-outline btn-sm" onclick="navigate('order', { id: '${o.id}' })">View</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><div class="empty-icon">📦</div><h3>No orders yet</h3><button class="btn btn-primary mt-16" onclick="navigate(\'shop\')">Start shopping</button></div>'}
        </div>
      </section>
      ${renderFooter()}
    `;
    return;
  }

  if (currentUser.role === 'farmer') {
    const { farmer } = await api('/api/auth/me');
    if (!farmer) return navigate('farmer-register');
    const [orders, products] = await Promise.all([ api('/api/orders').catch(() => []), api('/api/products?farmer_id=' + farmer.id).catch(() => []) ]);
    el.innerHTML = `
      <div class="page-header">
        <div class="container">
          <div class="flex-between flex-wrap" style="gap:12px">
            <div><h1 class="page-title">${farmer.village}, ${farmer.state}</h1><div class="flex gap-8 mt-8">${verifyBadge(farmer.verification_status)}<span class="badge badge-${farmer.commission_tier}">${farmer.commission_tier} plan · ${farmer.commission_tier === 'seed' ? '15' : farmer.commission_tier === 'harvest' ? '12' : '8'}% commission</span>${farmer.trust_badge ? '<span class="badge badge-trust">⭐ Top Farmer</span>' : ''}</div></div>
          </div>
        </div>
      </div>
      <section class="section section-light">
        <div class="container">
          ${farmer.verification_status === 'pending' ? `<div style="background:#FFF3E0;border:1.5px solid #FFB74D;border-radius:var(--radius);padding:16px 20px;margin-bottom:24px;font-size:14px">⏳ <strong>Verification in progress.</strong> Your farm profile is under review. You'll be able to list products once approved (usually 24–48 hours).</div>` : ''}
          ${farmer.verification_status === 'rejected' ? `<div style="background:#FFEBEE;border:1.5px solid #EF9A9A;border-radius:var(--radius);padding:16px 20px;margin-bottom:24px;font-size:14px">❌ <strong>Verification not approved.</strong> Contact support to re-submit or clarify your documents.</div>` : ''}
          <div class="stats-grid">
            <div class="stat-box"><div class="stat-box-num">${formatCurrency(farmer.annual_sales || 0)}</div><div class="stat-box-label">Total sales</div></div>
            <div class="stat-box"><div class="stat-box-num">${farmer.total_orders}</div><div class="stat-box-label">Orders completed</div></div>
            <div class="stat-box"><div class="stat-box-num">${farmer.rating ? farmer.rating.toFixed(1) : '—'}</div><div class="stat-box-label">Customer rating</div></div>
            <div class="stat-box"><div class="stat-box-num">${orders.length}</div><div class="stat-box-label">Recent orders</div></div>
          </div>
          <div class="flex gap-12 flex-wrap mb-32">
            ${farmer.verification_status === 'verified' ? '<button class="btn btn-primary" onclick="navigate(\'add-product\')">+ Add new listing</button>' : ''}
            <button class="btn btn-outline" onclick="navigate('my-listings')">My listings</button>
            <button class="btn btn-outline" onclick="navigate('community')">Community board</button>
          </div>
          <h2 style="font-family:var(--display);font-size:22px;font-weight:900;margin-bottom:16px">Recent Orders for Your Produce</h2>
          ${orders.length ? `<div class="card" style="overflow:hidden"><table class="data-table"><thead><tr><th>Product</th><th>Customer</th><th>Qty</th><th>Revenue</th><th>Date</th><th>Status</th></tr></thead><tbody>${orders.slice(0,10).map(o => `<tr><td>${o.product_name}</td><td>${o.customer_name}</td><td>${o.quantity}</td><td>${formatCurrency(o.subtotal)}</td><td>${formatDate(o.created_at)}</td><td>${statusBadge(o.status)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><div class="empty-icon">🌾</div><h3>No orders yet</h3><p>Once customers buy your produce, orders appear here.</p></div>'}
        </div>
      </section>
      ${renderFooter()}
    `;
    return;
  }

  navigate('admin');
}

// ─── MY LISTINGS ──────────────────────────────────────────────────────────────
async function renderMyListings() {
  if (!currentUser || currentUser.role !== 'farmer') return navigate('dashboard');
  const { farmer } = await api('/api/auth/me');
  const el = main();
  el.innerHTML = `
    <div class="page-header"><div class="container"><h1 class="page-title">My Listings</h1></div></div>
    <section class="section section-light">
      <div class="container">
        <div class="flex-between mb-24">
          <p class="text-muted">All your active product listings</p>
          ${farmer?.verification_status === 'verified' ? '<button class="btn btn-primary" onclick="navigate(\'add-product\')">+ Add new listing</button>' : ''}
        </div>
        <div id="my-listings-container"><div class="loading">Loading…</div></div>
      </div>
    </section>
    ${renderFooter()}
  `;
  const products = await api(`/api/products`).catch(() => []);
  const myProducts = farmer ? products.filter(p => p.farmer_id_real === farmer.id || p.farmer_id === farmer.id) : [];
  $('my-listings-container').innerHTML = myProducts.length ? `
    <div class="card" style="overflow:hidden">
      <table class="data-table">
        <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Available</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${myProducts.map(p => `<tr>
            <td><strong>${p.name}</strong></td>
            <td>${p.category}</td>
            <td>${formatCurrency(p.price_per_unit)}/${p.unit}</td>
            <td>${p.quantity_available} ${p.unit}</td>
            <td><span class="badge ${p.is_active ? 'badge-verified' : 'badge-rejected'}">${p.is_active ? 'Active' : 'Inactive'}</span></td>
            <td><button class="btn btn-outline btn-sm" onclick="editProduct('${p.id}', ${p.price_per_unit}, ${p.quantity_available})">Edit</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  ` : '<div class="empty-state"><div class="empty-icon">🌿</div><h3>No listings yet</h3><p>Add your first product to start selling.</p><button class="btn btn-primary mt-24" onclick="navigate(\'add-product\')">Add a product</button></div>';
}

function editProduct(id, price, qty) {
  showModal(`
    <div class="card-header"><strong>Update Listing</strong></div>
    <div class="card-body">
      <div class="form-group"><label class="form-label">Price per unit (₹)</label><input type="number" class="form-input" id="edit-price" value="${price}" min="1"></div>
      <div class="form-group"><label class="form-label">Available quantity</label><input type="number" class="form-input" id="edit-qty" value="${qty}" min="0" step="0.5"></div>
      <button class="btn btn-primary btn-block" onclick="saveProductEdit('${id}')">Save changes</button>
    </div>
  `);
}

async function saveProductEdit(id) {
  const price = parseFloat($('edit-price')?.value);
  const qty = parseFloat($('edit-qty')?.value);
  try {
    await api(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify({ price_per_unit: price, quantity_available: qty }) });
    toast('Listing updated ✓', 'success');
    closeModal();
    await renderMyListings();
  } catch (e) { toast(e.message, 'error'); }
}

// ─── ADD PRODUCT ──────────────────────────────────────────────────────────────
function renderAddProduct() {
  if (!currentUser || currentUser.role !== 'farmer') return navigate('dashboard');
  const el = main();
  el.innerHTML = `
    <div class="page-header"><div class="container"><h1 class="page-title">Add a New Listing</h1><p class="page-sub">List your produce with your own price. Customers will see your verified farmer profile alongside every listing.</p></div></div>
    <section class="section section-light">
      <div class="container" style="max-width:640px">
        <div class="card">
          <div class="card-body">
            <div class="form-row">
              <div class="form-group"><label class="form-label">Product name *</label><input type="text" class="form-input" id="p-name" placeholder="e.g. Red Onions, Basmati Rice 1121…"></div>
              <div class="form-group"><label class="form-label">Category *</label>
                <select class="form-input form-select" id="p-cat">
                  <option value="">Select category…</option>
                  ${['Vegetables','Grains','Fruits','Spices','Dairy','Pulses','Oilseeds'].map(c => `<option>${c}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group"><label class="form-label">Description</label><textarea class="form-input form-textarea" id="p-desc" placeholder="Describe your produce — variety, quality, storage, growing method…"></textarea></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Your price (₹) *</label><input type="number" class="form-input" id="p-price" placeholder="e.g. 45" min="1"></div>
              <div class="form-group"><label class="form-label">Unit *</label>
                <select class="form-input form-select" id="p-unit">
                  ${['kg','quintal','dozen','piece','litre','bunch'].map(u => `<option>${u}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Available quantity *</label><input type="number" class="form-input" id="p-qty" placeholder="e.g. 100" min="0.1" step="0.5"></div>
              <div class="form-group"><label class="form-label">Minimum order</label><input type="number" class="form-input" id="p-min" placeholder="e.g. 2" min="0.1" step="0.5" value="1"></div>
            </div>
            <div class="form-group"><label class="form-label">Harvest date (optional)</label><input type="date" class="form-input" id="p-harvest"></div>
            <div class="form-group"><label class="form-check"><input type="checkbox" id="p-organic"> This is organically grown produce (no synthetic inputs)</label></div>
            <div class="form-group"><label class="form-label">Commission preview</label>
              <div style="background:var(--parchment);border-radius:var(--radius);padding:14px;font-size:14px">
                If you price at <input type="number" id="p-preview-price" style="width:70px;border:1.5px solid var(--mist);border-radius:4px;padding:2px 6px;font-size:13px" placeholder="₹" oninput="previewCommission(this.value)"> per unit, you receive <strong id="p-preview-payout">—</strong> per unit after 12% commission.
              </div>
            </div>
          </div>
          <div class="card-footer">
            <button class="btn btn-primary btn-lg" onclick="submitProduct()">Publish listing →</button>
            <button class="btn btn-outline btn-lg" onclick="navigate('my-listings')" style="margin-left:12px">Cancel</button>
          </div>
        </div>
      </div>
    </section>
    ${renderFooter()}
  `;
}

function previewCommission(price) {
  const p = parseFloat(price);
  if (!p) { $('p-preview-payout').textContent = '—'; return; }
  $('p-preview-payout').textContent = `₹${(p * 0.88).toFixed(2)}`;
}

async function submitProduct() {
  const name = $('p-name')?.value?.trim();
  const category = $('p-cat')?.value;
  const price_per_unit = parseFloat($('p-price')?.value);
  const unit = $('p-unit')?.value;
  const quantity_available = parseFloat($('p-qty')?.value);
  if (!name || !category || !price_per_unit || !unit || !quantity_available) { toast('Please fill all required fields', 'error'); return; }
  const fd = new FormData();
  fd.append('name', name);
  fd.append('category', category);
  fd.append('description', $('p-desc')?.value || '');
  fd.append('price_per_unit', price_per_unit);
  fd.append('unit', unit);
  fd.append('quantity_available', quantity_available);
  fd.append('min_order', $('p-min')?.value || 1);
  fd.append('is_organic', $('p-organic')?.checked ? '1' : '0');
  fd.append('harvest_date', $('p-harvest')?.value || '');
  try {
    await fetch('/api/products', { method: 'POST', headers: { Authorization: 'Bearer ' + token() }, body: fd });
    toast('Product listed successfully! ✓', 'success');
    navigate('my-listings');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
async function renderAdmin() {
  if (!currentUser || currentUser.role !== 'admin') return navigate('home');
  const el = main();
  const [stats, farmers, orders] = await Promise.all([
    api('/api/admin/stats'),
    api('/api/farmers'),
    api('/api/orders')
  ]);
  el.innerHTML = `
    <div class="page-header"><div class="container"><div class="page-eyebrow">Admin Panel</div><h1 class="page-title">KhetSe Dashboard</h1></div></div>
    <section class="section section-light">
      <div class="container">
        <div class="stats-grid">
          <div class="stat-box"><div class="stat-box-num">${stats.total_farmers}</div><div class="stat-box-label">Total farmers</div></div>
          <div class="stat-box" style="border-left:3px solid var(--sage)"><div class="stat-box-num">${stats.verified_farmers}</div><div class="stat-box-label">Verified</div></div>
          <div class="stat-box" style="border-left:3px solid var(--saffron)"><div class="stat-box-num">${stats.pending_farmers}</div><div class="stat-box-label">Pending review</div></div>
          <div class="stat-box"><div class="stat-box-num">${stats.total_products}</div><div class="stat-box-label">Active listings</div></div>
          <div class="stat-box"><div class="stat-box-num">${stats.total_orders}</div><div class="stat-box-label">Total orders</div></div>
          <div class="stat-box"><div class="stat-box-num">${formatCurrency(stats.total_revenue)}</div><div class="stat-box-label">Total revenue</div></div>
          <div class="stat-box" style="border-left:3px solid var(--terra)"><div class="stat-box-num">${formatCurrency(stats.total_commission)}</div><div class="stat-box-label">Commission earned</div></div>
          <div class="stat-box"><div class="stat-box-num">${stats.active_subscriptions}</div><div class="stat-box-label">Active subscriptions</div></div>
        </div>

        <h2 style="font-family:var(--display);font-size:24px;font-weight:900;margin:32px 0 16px">Farmer Verifications</h2>
        <div class="card" style="overflow:hidden;margin-bottom:32px">
          <table class="data-table">
            <thead><tr><th>Farmer</th><th>Location</th><th>Aadhaar</th><th>PM-Kisan</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${farmers.map(f => `<tr>
                <td><strong>${f.name}</strong><div class="text-small text-muted">${f.email}</div></td>
                <td>${f.village}, ${f.district}, ${f.state}</td>
                <td style="font-family:var(--mono);font-size:12px">${f.aadhaar_last4 ? '••••' + f.aadhaar_last4 : '—'}</td>
                <td style="font-family:var(--mono);font-size:11px">${f.pm_kisan_id || '—'}</td>
                <td>${verifyBadge(f.verification_status)}</td>
                <td>
                  <div class="flex gap-8">
                    ${f.verification_status !== 'verified' ? `<button class="btn btn-sm" style="background:var(--sage);color:white;border:none" onclick="verifyFarmer('${f.id}', 'verified')">✓ Verify</button>` : ''}
                    ${f.verification_status !== 'rejected' ? `<button class="btn btn-sm" style="background:#C62828;color:white;border:none" onclick="verifyFarmer('${f.id}', 'rejected')">✗ Reject</button>` : ''}
                    <button class="btn btn-outline btn-sm" onclick="navigate('farmer', { id: '${f.id}' })">View</button>
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <h2 style="font-family:var(--display);font-size:24px;font-weight:900;margin-bottom:16px">Recent Orders</h2>
        <div class="card" style="overflow:hidden">
          <table class="data-table">
            <thead><tr><th>Order ID</th><th>Customer</th><th>Amount</th><th>Commission</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${orders.slice(0,10).map(o => `<tr>
                <td style="font-family:var(--mono);font-size:11px">${o.id.slice(0,8)}…</td>
                <td>${o.customer_name}</td>
                <td>${formatCurrency(o.total_amount)}</td>
                <td>${formatCurrency(o.commission_amount)}</td>
                <td>${statusBadge(o.status)}</td>
                <td>
                  <select class="form-select" style="padding:4px 8px;font-size:12px;border:1.5px solid var(--mist);border-radius:4px" onchange="updateOrderStatus('${o.id}', this.value)">
                    ${['placed','confirmed','packed','shipped','delivered','cancelled'].map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                  </select>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>
    ${renderFooter()}
  `;
}

async function verifyFarmer(id, status) {
  try {
    await api(`/api/farmers/${id}/verify`, { method: 'PUT', body: JSON.stringify({ status }) });
    toast(`Farmer ${status}`, status === 'verified' ? 'success' : 'error');
    await renderAdmin();
  } catch (e) { toast(e.message, 'error'); }
}

async function updateOrderStatus(id, status) {
  await api(`/api/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
  toast('Order status updated');
}

// ─── HTML HELPERS ─────────────────────────────────────────────────────────────
function productCardHTML(p) {
  return `
    <div class="product-card" onclick="navigate('product', { id: '${p.id}' })">
      <div class="product-emoji">${catEmoji(p.category)}</div>
      <div class="product-body">
        <div class="product-farmer-tag">${p.farmer_name} · ${p.state}</div>
        <div class="product-name">${p.name}</div>
        ${p.is_organic ? '<span class="badge badge-organic" style="margin-bottom:6px">🌿 Organic</span>' : ''}
        <div class="product-price-row">
          <span class="product-price">₹${p.price_per_unit}</span>
          <span class="product-unit">/${p.unit}</span>
        </div>
        <div class="product-footer">
          <span class="product-avail">${p.quantity_available} ${p.unit} avail.</span>
          <button class="product-add-btn" onclick="addToCart('${p.id}', '${p.name.replace(/'/g, "\\'")}', event)">+ Cart</button>
        </div>
      </div>
    </div>`;
}

function farmerCardHTML(f) {
  return `
    <div class="farmer-card" onclick="navigate('farmer', { id: '${f.id}' })">
      <div class="farmer-avatar-lg">${f.name[0]}</div>
      <div class="farmer-card-name">${f.name}</div>
      <div class="farmer-card-loc">${f.village} · ${f.district}, ${f.state}</div>
      <p class="farmer-card-bio">${f.bio || 'Verified farmer on KhetSe.'}</p>
      <div class="flex gap-8 mb-14">
        ${verifyBadge(f.verification_status)}
        ${f.trust_badge ? '<span class="badge badge-trust">⭐ Top Farmer</span>' : ''}
      </div>
      <div class="farmer-card-meta">
        <div class="farmer-stat"><div class="farmer-stat-val">${f.rating ? f.rating.toFixed(1) : '—'}</div><div class="farmer-stat-label">Rating</div></div>
        <div class="farmer-stat"><div class="farmer-stat-val">${f.total_orders || 0}</div><div class="farmer-stat-label">Orders</div></div>
        <div class="farmer-stat"><div class="farmer-stat-val">${f.land_acres || '?'}</div><div class="farmer-stat-label">Acres</div></div>
      </div>
    </div>`;
}

function postCardHTML(p) {
  const catClass = { pricing: 'cat-pricing', logistics: 'cat-logistics', farming: 'cat-farming', general: 'cat-general' };
  return `
    <div class="post-card">
      <div class="post-header">
        <div class="post-author">
          <div class="post-avatar">${p.farmer_name[0]}</div>
          <div>
            <div class="post-author-name">${p.farmer_name} ${p.trust_badge ? '⭐' : ''}</div>
            <div class="post-author-meta">${p.district}, ${p.state} · ${formatDate(p.created_at)}</div>
          </div>
        </div>
        <span class="post-cat-badge ${catClass[p.category] || 'cat-general'}">${p.category}</span>
      </div>
      <div class="post-title">${p.title}</div>
      <div class="post-body">${p.body}</div>
      <div class="post-footer">
        <button class="btn btn-outline btn-sm" data-count="${p.likes || 0}" onclick="likePost('${p.id}', this)">❤️ ${p.likes || 0}</button>
        <button class="btn btn-outline btn-sm" onclick="showReplies('${p.id}')">💬 ${p.reply_count} ${p.reply_count === 1 ? 'reply' : 'replies'}</button>
      </div>
    </div>`;
}

function renderFooter() {
  return `
    <footer>
      <div class="container">
        <div class="footer-grid">
          <div>
            <div class="footer-brand">Khet<span>Se</span></div>
            <p class="footer-desc">A direct farmer-to-customer marketplace built on government-verified farmer identities, fair commissions, and transparent logistics. Made for Bharat.</p>
          </div>
          <div class="footer-col"><h5>For Farmers</h5><ul><li><a onclick="navigate('farmer-register')">Register as farmer</a></li><li><a onclick="navigate('community')">Community board</a></li><li><a onclick="navigate('add-product')">List produce</a></li></ul></div>
          <div class="footer-col"><h5>For Customers</h5><ul><li><a onclick="navigate('shop')">Browse produce</a></li><li><a onclick="navigate('farmers')">Our farmers</a></li><li><a onclick="navigate('subscribe')">Subscription boxes</a></li></ul></div>
          <div class="footer-col"><h5>Platform</h5><ul><li><a onclick="navigate('home')">About KhetSe</a></li><li><a onclick="navigate('admin')">Admin (test)</a></li></ul></div>
        </div>
        <div class="footer-bottom">
          <div class="footer-copy">© 2026 KhetSe Technologies Pvt. Ltd. (Test Instance)</div>
          <div class="footer-badges"><div class="footer-badge">DEV MODE</div><div class="footer-badge">SQLite DB</div><div class="footer-badge">localhost:3000</div></div>
        </div>
      </div>
    </footer>
  `;
}

// ─── PROFILE PAGE ─────────────────────────────────────────────────────────────
async function renderProfile() {
  if (!currentUser) return navigate('login');
  const el = main();
  const { user, farmer } = await api('/api/auth/me');

  el.innerHTML = `
    <div class="page-header">
      <div class="container">
        <div class="page-eyebrow">Account</div>
        <h1 class="page-title">Edit Profile</h1>
        <p class="page-sub">Update your personal details, farm information, and password.</p>
      </div>
    </div>
    <section class="section section-light">
      <div class="container" style="max-width:760px">

        <!-- Personal Details -->
        <div class="card mb-24">
          <div class="card-header">
            <strong>Personal Details</strong>
            <p class="text-small text-muted mt-4">Your name and phone number visible to buyers and the platform.</p>
          </div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Full name</label>
                <input type="text" class="form-input" id="prof-name" value="${user.name}">
              </div>
              <div class="form-group">
                <label class="form-label">Phone number</label>
                <input type="text" class="form-input" id="prof-phone" value="${user.phone}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Email address</label>
              <input type="email" class="form-input" value="${user.email}" disabled
                style="background:var(--parchment);color:#8A7A68;cursor:not-allowed">
              <p class="form-hint">Email cannot be changed. Contact support if needed.</p>
            </div>
            ${farmer ? `
              <div class="form-group">
                <label class="form-label">Farm / family name</label>
                <input type="text" class="form-input" id="prof-farm-name" value="${farmer.farm_name || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Farm bio</label>
                <textarea class="form-input form-textarea" id="prof-bio" placeholder="Tell customers about your farm, crops, and farming practices…">${farmer.bio || ''}</textarea>
              </div>
            ` : ''}
          </div>
          <div class="card-footer">
            <button class="btn btn-primary" onclick="saveProfile()">Save changes</button>
          </div>
        </div>

        <!-- Farmer docs update (if rejected or pending) -->
        ${farmer && farmer.verification_status !== 'verified' ? `
        <div class="card mb-24" style="border-color:var(--saffron)">
          <div class="card-header" style="background:#FBF3E1">
            <strong style="color:#7A5B00">Update Verification Documents</strong>
            <p class="text-small mt-4" style="color:#7A5B00">
              ${farmer.verification_status === 'rejected'
                ? '⚠️ Your verification was not approved. Correct your documents below and resubmit.'
                : '⏳ Verification is pending. You can update your documents before review completes.'}
            </p>
          </div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Aadhaar — last 4 digits</label>
                <input type="text" class="form-input" id="upd-aadhaar" value="${farmer.aadhaar_last4 || ''}" maxlength="4">
              </div>
              <div class="form-group">
                <label class="form-label">PM-Kisan ID</label>
                <input type="text" class="form-input" id="upd-pmkisan" value="${farmer.pm_kisan_id || ''}" placeholder="e.g. PMK-MH-2024-4871">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Land record number</label>
                <input type="text" class="form-input" id="upd-landrec" value="${farmer.land_record_number || ''}" placeholder="e.g. MH-NK-7/12-2201">
              </div>
              <div class="form-group">
                <label class="form-label">eNAM ID (if any)</label>
                <input type="text" class="form-input" id="upd-enam" value="${farmer.enam_id || ''}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Soil Health Card</label>
              <input type="text" class="form-input" id="upd-shc" value="${farmer.soil_health_card || ''}">
            </div>
          </div>
          <div class="card-footer">
            <button class="btn btn-primary" onclick="resubmitVerification()">Resubmit for verification</button>
          </div>
        </div>
        ` : ''}

        <!-- Verified farmer — show status card instead -->
        ${farmer && farmer.verification_status === 'verified' ? `
        <div class="card mb-24">
          <div class="card-body">
            <div class="flex gap-12" style="align-items:center">
              <span style="font-size:32px">✅</span>
              <div>
                <strong>Your farm is verified</strong>
                <p class="text-small text-muted mt-4">
                  Verified on ${formatDate(farmer.verification_date)} ·
                  Commission tier: <span class="badge badge-${farmer.commission_tier}">${farmer.commission_tier}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
        ` : ''}

        <!-- Change Password -->
        <div class="card">
          <div class="card-header">
            <strong>Change Password</strong>
            <p class="text-small text-muted mt-4">A confirmation email will be sent to ${user.email} when you change your password.</p>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Current password</label>
              <input type="password" class="form-input" id="pwd-current" placeholder="Enter your current password">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">New password</label>
                <input type="password" class="form-input" id="pwd-new" placeholder="At least 6 characters"
                  oninput="checkPasswordStrength(this.value)">
                <div id="pwd-strength" style="margin-top:6px;font-size:12px;font-weight:600"></div>
              </div>
              <div class="form-group">
                <label class="form-label">Confirm new password</label>
                <input type="password" class="form-input" id="pwd-confirm" placeholder="Repeat new password">
              </div>
            </div>
          </div>
          <div class="card-footer">
            <button class="btn btn-primary" onclick="changePassword()">Update password</button>
          </div>
        </div>

        <!-- Danger zone -->
        <div class="card mt-24" style="border-color:#FFCDD2">
          <div class="card-header" style="background:#FFEBEE">
            <strong style="color:#C62828">Account</strong>
          </div>
          <div class="card-body">
            <div class="flex-between">
              <div>
                <strong>Member since</strong>
                <p class="text-small text-muted">${formatDate(user.created_at)}</p>
              </div>
              <div>
                <strong>Account type</strong>
                <p class="text-small text-muted" style="text-transform:capitalize">${user.role}</p>
              </div>
              <button class="btn btn-outline btn-sm" style="color:#C62828;border-color:#FFCDD2" onclick="logout()">Log out</button>
            </div>
          </div>
        </div>

      </div>
    </section>
    ${renderFooter()}
  `;
}

async function saveProfile() {
  const name = $('prof-name')?.value?.trim();
  const phone = $('prof-phone')?.value?.trim();
  const bio = $('prof-bio')?.value?.trim();
  const farm_name = $('prof-farm-name')?.value?.trim();
  if (!name || !phone) { toast('Name and phone required', 'error'); return; }
  try {
    const { user } = await api('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ name, phone, bio, farm_name })
    });
    currentUser = { ...currentUser, name: user.name, phone: user.phone };
    updateNavForUser();
    toast('Profile updated ✓', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function resubmitVerification() {
  const data = {
    aadhaar_last4: $('upd-aadhaar')?.value?.trim(),
    pm_kisan_id: $('upd-pmkisan')?.value?.trim(),
    land_record_number: $('upd-landrec')?.value?.trim(),
    enam_id: $('upd-enam')?.value?.trim(),
    soil_health_card: $('upd-shc')?.value?.trim(),
  };
  if (!data.aadhaar_last4) { toast('Aadhaar last 4 digits required', 'error'); return; }
  try {
    await api('/api/farmers/profile', { method: 'PUT', body: JSON.stringify(data) });
    toast('Documents resubmitted — we\'ll review within 24–48 hours ✓', 'success');
    await renderProfile();
  } catch (e) { toast(e.message, 'error'); }
}

function checkPasswordStrength(pwd) {
  const el = $('pwd-strength');
  if (!el) return;
  if (!pwd) { el.textContent = ''; return; }
  const score = [pwd.length >= 8, /[A-Z]/.test(pwd), /[0-9]/.test(pwd), /[^A-Za-z0-9]/.test(pwd)].filter(Boolean).length;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', '#C62828', '#E65100', '#2E7D32', '#1B5E20'];
  el.textContent = labels[score] || 'Weak';
  el.style.color = colors[score] || '#C62828';
}

async function changePassword() {
  const current = $('pwd-current')?.value;
  const newPwd = $('pwd-new')?.value;
  const confirm = $('pwd-confirm')?.value;
  if (!current || !newPwd || !confirm) { toast('All password fields required', 'error'); return; }
  if (newPwd !== confirm) { toast('New passwords do not match', 'error'); return; }
  if (newPwd.length < 6) { toast('New password must be at least 6 characters', 'error'); return; }
  try {
    await api('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: current, new_password: newPwd })
    });
    toast('Password changed! A confirmation email has been sent. ✓', 'success');
    $('pwd-current').value = '';
    $('pwd-new').value = '';
    $('pwd-confirm').value = '';
    $('pwd-strength').textContent = '';
  } catch (e) { toast(e.message, 'error'); }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  if (!e.target.closest('.nav-user-menu')) closeDropdowns();
});

window.addEventListener('popstate', e => {
  const page = e.state?.page || 'home';
  const params = e.state?.params || {};
  renderPage(page, params);
});

(async () => {
  await loadUser();
  const hash = location.hash.replace('#', '') || 'home';
  navigate(hash);
})();
