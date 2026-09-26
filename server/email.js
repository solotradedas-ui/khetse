const nodemailer = require('nodemailer');

// ─── TRANSPORTER ─────────────────────────────────────────────────────────────
// Configured via environment variables set in Render dashboard.
// Falls back to "ethereal" (fake SMTP that captures emails in a web UI)
// if no real credentials are set — perfect for local testing.
let transporter = null;
let testAccount = null;

async function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587');

  if (user && pass) {
    // Real SMTP — Gmail or any provider
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    });
    console.log(`📧  Email: using ${host} as ${user}`);
  } else {
    // Ethereal test account — emails captured at ethereal.email, no real sending
    try {
      testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: { user: testAccount.user, pass: testAccount.pass }
      });
      console.log(`📧  Email: Ethereal (${testAccount.user})`);
      console.log(`    → Preview: https://ethereal.email/messages`);
    } catch (_) {
      // Ethereal unreachable — use null transport (emails logged, not sent)
      transporter = { sendMail: async (m) => { console.log('📧 [offline] Would email:', m.to, '|', m.subject); return { messageId: 'offline' }; } };
      console.log('📧  Email: offline mode (no SMTP credentials set)');
    }
  }

  return transporter;
}

const FROM = process.env.SMTP_FROM || '"KhetSe Platform" <noreply@khetse.in>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'admin@khetse.in';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ─── SEND HELPER ─────────────────────────────────────────────────────────────
async function send(to, subject, html) {
  try {
    const t = await getTransporter();
    const info = await t.sendMail({ from: FROM, to, subject, html });
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) console.log(`📧  Preview: ${preview}`);
    return { ok: true, messageId: info.messageId, preview };
  } catch (e) {
    console.error('Email send error:', e.message);
    return { ok: false, error: e.message };
  }
}

// ─── SHARED STYLES ───────────────────────────────────────────────────────────
function wrap(content) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#F7F3EC;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;color:#2C2418}
  .shell{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
  .header{background:#1A3020;padding:28px 36px;display:flex;align-items:center;gap:14px}
  .logo{width:40px;height:40px;background:#E8891A;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#1A3020;font-family:Georgia,serif;text-align:center;line-height:40px}
  .brand{font-family:Georgia,serif;font-size:22px;font-weight:900;color:#fff}
  .brand span{color:#E8891A}
  .body{padding:36px}
  .highlight{background:#EAF2E6;border-left:4px solid #5C8A5C;border-radius:4px;padding:16px 20px;margin:20px 0;font-size:14px}
  .highlight.gold{background:#FBF3E1;border-left-color:#E8891A}
  .highlight.red{background:#FFEBEE;border-left-color:#C62828}
  .cta{display:inline-block;background:#E8891A;color:#1A3020;font-weight:700;font-size:15px;padding:12px 28px;border-radius:4px;text-decoration:none;margin:20px 0}
  .divider{border:none;border-top:1px solid #E8E4DB;margin:24px 0}
  .meta-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F0EDE8;font-size:13px}
  .meta-row span:first-child{color:#8A7A68}
  .meta-row span:last-child{font-weight:600}
  .check{color:#2E7D32;font-weight:700}
  .footer{background:#F7F3EC;padding:20px 36px;font-size:12px;color:#8A7A68;border-top:1px solid #E8E4DB}
  .footer a{color:#5C8A5C}
  h2{font-family:Georgia,serif;font-size:24px;font-weight:900;color:#1A3020;margin:0 0 8px}
  p{line-height:1.65;margin:12px 0;color:#4A3C2C}
  strong{color:#2C2418}
  code{background:#F0EDE8;padding:2px 6px;border-radius:3px;font-family:monospace;font-size:13px}
</style></head><body>
<div class="shell">
  <div class="header">
    <div class="logo">K</div>
    <div class="brand">Khet<span>Se</span></div>
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    © 2026 KhetSe Technologies Pvt. Ltd. · <a href="${BASE_URL}">khetse.in</a><br>
    This is an automated message from the KhetSe platform. Do not reply to this email.
  </div>
</div></body></html>`;
}

// ─── EMAIL TEMPLATES ─────────────────────────────────────────────────────────

// 1. Welcome — new customer registration
async function sendWelcomeCustomer(user) {
  return send(user.email, 'Welcome to KhetSe 🌾', wrap(`
    <h2>Welcome, ${user.name.split(' ')[0]}!</h2>
    <p>You're now part of KhetSe — India's direct farmer-to-customer marketplace where every product comes from a government-verified farmer.</p>
    <div class="highlight">
      <strong>What you can do right now:</strong><br><br>
      🥬 Browse fresh produce from verified farmers across India<br>
      📦 Set up a monthly or fortnightly subscription box<br>
      👨‍🌾 See exactly who grew your food — name, village, land records
    </div>
    <a class="cta" href="${BASE_URL}/#shop">Browse produce →</a>
    <hr class="divider">
    <p style="font-size:13px;color:#8A7A68">Your account: <strong>${user.email}</strong></p>
  `));
}

// 2. Welcome — new farmer registration (before verification)
async function sendWelcomeFarmer(user) {
  return send(user.email, 'KhetSe account created — complete your farm profile', wrap(`
    <h2>Welcome to KhetSe, ${user.name.split(' ')[0]}!</h2>
    <p>Your account has been created. The next step is to complete your farm profile and submit it for government verification — this usually takes <strong>24–48 hours</strong>.</p>
    <div class="highlight gold">
      <strong>To start listing your produce:</strong><br><br>
      1. Log in to KhetSe<br>
      2. Go to Dashboard → Complete farm profile<br>
      3. Enter your Aadhaar, PM-Kisan ID, and land records<br>
      4. Submit — we'll verify and notify you by email
    </div>
    <a class="cta" href="${BASE_URL}/#farmer-register">Complete farm profile →</a>
    <hr class="divider">
    <p style="font-size:13px;color:#8A7A68">Questions? Reply to this email or contact us at support@khetse.in</p>
  `));
}

// 3. Farmer submitted verification — confirmation to farmer
async function sendVerificationSubmitted(user, farmer) {
  return send(user.email, 'Verification submitted — KhetSe is reviewing your profile', wrap(`
    <h2>Your farm profile has been submitted ✓</h2>
    <p>Thank you, <strong>${user.name.split(' ')[0]}</strong>. We've received your verification request and will cross-check your details against government records.</p>
    <div class="highlight">
      <strong>Documents submitted:</strong><br><br>
      ${farmer.aadhaar_last4 ? `<span class="check">✓</span> Aadhaar (last 4: ${farmer.aadhaar_last4})<br>` : ''}
      ${farmer.pm_kisan_id ? `<span class="check">✓</span> PM-Kisan ID: <code>${farmer.pm_kisan_id}</code><br>` : ''}
      ${farmer.land_record_number ? `<span class="check">✓</span> Land records: <code>${farmer.land_record_number}</code><br>` : ''}
      ${farmer.enam_id ? `<span class="check">✓</span> eNAM: <code>${farmer.enam_id}</code><br>` : ''}
      ${farmer.soil_health_card ? `<span class="check">✓</span> Soil Health Card: <code>${farmer.soil_health_card}</code><br>` : ''}
    </div>
    <div class="meta-row"><span>Farm location</span><span>${farmer.village}, ${farmer.district}, ${farmer.state}</span></div>
    <div class="meta-row"><span>Land holding</span><span>${farmer.land_acres} acres</span></div>
    <div class="meta-row"><span>Typical turnaround</span><span>24–48 hours</span></div>
    <p style="margin-top:20px">We'll email you as soon as verification is complete. Once approved, you can immediately start listing your produce.</p>
    <a class="cta" href="${BASE_URL}/#dashboard">View your dashboard →</a>
  `));
}

// 4. Admin alert — new farmer needs verification
async function sendAdminNewFarmer(farmer, user) {
  return send(ADMIN_EMAIL, `[KhetSe Admin] New farmer verification request — ${user.name}`, wrap(`
    <h2>New verification request</h2>
    <p>A farmer has submitted their profile for verification. Please review and approve or reject from the admin panel.</p>
    <div class="highlight gold">
      <strong>${user.name}</strong> — ${farmer.village}, ${farmer.district}, ${farmer.state}<br>
      Email: ${user.email} · Phone: ${user.phone}
    </div>
    <div class="meta-row"><span>Aadhaar last 4</span><span>${farmer.aadhaar_last4 || '—'}</span></div>
    <div class="meta-row"><span>PM-Kisan ID</span><span>${farmer.pm_kisan_id || '—'}</span></div>
    <div class="meta-row"><span>Land records</span><span>${farmer.land_record_number || '—'}</span></div>
    <div class="meta-row"><span>eNAM ID</span><span>${farmer.enam_id || '—'}</span></div>
    <div class="meta-row"><span>Soil Health Card</span><span>${farmer.soil_health_card || '—'}</span></div>
    <div class="meta-row"><span>Land holding</span><span>${farmer.land_acres} acres</span></div>
    ${farmer.bio ? `<p style="margin-top:16px;font-size:13px;color:#5A4A38">"${farmer.bio}"</p>` : ''}
    <a class="cta" href="${BASE_URL}/#admin">Open admin panel →</a>
  `));
}

// 5. Farmer approved
async function sendFarmerApproved(user, farmer) {
  return send(user.email, '🎉 You are verified on KhetSe — start listing now!', wrap(`
    <h2>Congratulations — you're verified! 🎉</h2>
    <p>Your farm profile has been approved. You can now list your produce, set your own prices, and start selling directly to customers across India.</p>
    <div class="highlight">
      <strong>Your verified profile:</strong><br><br>
      <span class="check">✓</span> <strong>${user.name}</strong> — Government Verified Farmer<br>
      <span class="check">✓</span> ${farmer.village}, ${farmer.district}, ${farmer.state}<br>
      <span class="check">✓</span> Commission tier: <strong>${farmer.commission_tier === 'seed' ? 'Seed (15%)' : farmer.commission_tier === 'harvest' ? 'Harvest (12%)' : 'Kisan Premium (8%)'}</strong><br>
      <span class="check">✓</span> Farmer ID: <code>${farmer.id.slice(0, 8).toUpperCase()}</code>
    </div>
    <p><strong>What to do next:</strong></p>
    <p>1. Log in to your dashboard<br>
    2. Click <strong>Add new listing</strong><br>
    3. Enter your produce name, quantity, and <em>your own price</em><br>
    4. Customers will see your verified profile alongside every listing</p>
    <a class="cta" href="${BASE_URL}/#add-product">Add your first listing →</a>
    <hr class="divider">
    <p style="font-size:13px;color:#8A7A68">
      Commission is charged only when a sale completes — ₹0 for listing. 
      As your annual sales grow, your commission rate drops automatically 
      (15% → 12% → 8%).
    </p>
  `));
}

// 6. Farmer rejected
async function sendFarmerRejected(user, reason) {
  return send(user.email, 'KhetSe verification update — action required', wrap(`
    <h2>Verification requires more information</h2>
    <p>Hi ${user.name.split(' ')[0]}, thank you for submitting your farm profile. Unfortunately we were unable to complete verification with the information provided.</p>
    <div class="highlight red">
      <strong>Reason:</strong><br>
      ${reason || 'One or more documents could not be matched against government records. Please check your Aadhaar last 4 digits, PM-Kisan ID, and land record number and resubmit.'}
    </div>
    <p><strong>To resubmit:</strong></p>
    <p>1. Log in to KhetSe<br>
    2. Go to Dashboard → Update farm profile<br>
    3. Correct your document details<br>
    4. Submit again — we'll re-review within 24 hours</p>
    <a class="cta" href="${BASE_URL}/#farmer-register">Update and resubmit →</a>
    <hr class="divider">
    <p style="font-size:13px;color:#8A7A68">
      If you believe this is an error, reply to this email with your correct 
      document details and we will review manually.
    </p>
  `));
}

// 7. Order confirmation — customer
async function sendOrderConfirmation(user, order, items) {
  const itemRows = items.map(i =>
    `<div class="meta-row"><span>${i.product_name} × ${i.quantity} ${i.unit}</span><span>₹${i.subtotal.toLocaleString('en-IN')}</span></div>`
  ).join('');
  return send(user.email, `Order confirmed — KhetSe #${order.id.slice(0, 8).toUpperCase()}`, wrap(`
    <h2>Your order is confirmed ✓</h2>
    <p>Thank you, ${user.name.split(' ')[0]}! Your order has been placed and the farmers have been notified.</p>
    <div class="highlight">
      <strong>Order #${order.id.slice(0, 8).toUpperCase()}</strong><br>
      Status: <strong>Placed</strong> · Payment: <strong>${(order.payment_method || 'COD').toUpperCase()}</strong>
    </div>
    ${itemRows}
    <div class="meta-row"><span><strong>Total</strong></span><span><strong>₹${order.total_amount.toLocaleString('en-IN')}</strong></span></div>
    <p style="margin-top:16px;font-size:13px;color:#5A4A38">
      <strong>Delivery to:</strong> ${order.shipping_address}${order.shipping_pincode ? ' — ' + order.shipping_pincode : ''}
    </p>
    <a class="cta" href="${BASE_URL}/#order?id=${order.id}">Track your order →</a>
  `));
}

// 8. New order — farmer notification
async function sendFarmerNewOrder(farmerUser, orderItems, customerName, orderId) {
  const rows = orderItems.map(i =>
    `<div class="meta-row"><span>${i.product_name}</span><span>${i.quantity} ${i.unit} · ₹${i.subtotal.toLocaleString('en-IN')}</span></div>`
  ).join('');
  return send(farmerUser.email, `New order received — KhetSe #${orderId.slice(0, 8).toUpperCase()}`, wrap(`
    <h2>You have a new order! 🌾</h2>
    <p>A customer has ordered your produce. Please prepare it for dispatch within your stated timeline.</p>
    <div class="highlight gold">
      <strong>Order from:</strong> ${customerName}
    </div>
    ${rows}
    <p style="margin-top:16px;font-size:14px">Log in to your dashboard to confirm the order and update the status once packed.</p>
    <a class="cta" href="${BASE_URL}/#dashboard">View in dashboard →</a>
  `));
}

// 9. Password changed confirmation
async function sendPasswordChanged(user) {
  return send(user.email, 'Your KhetSe password has been changed', wrap(`
    <h2>Password changed successfully ✓</h2>
    <p>Hi ${user.name.split(' ')[0]}, the password for your KhetSe account (<strong>${user.email}</strong>) was just changed.</p>
    <div class="highlight red">
      If you did not make this change, please contact us immediately at 
      <strong>support@khetse.in</strong> or reply to this email.
    </div>
    <a class="cta" href="${BASE_URL}/#login">Log in to your account →</a>
  `));
}

module.exports = {
  sendWelcomeCustomer,
  sendWelcomeFarmer,
  sendVerificationSubmitted,
  sendAdminNewFarmer,
  sendFarmerApproved,
  sendFarmerRejected,
  sendOrderConfirmation,
  sendFarmerNewOrder,
  sendPasswordChanged,
};
