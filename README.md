# KhetSe — Farm Direct Marketplace (Local Dev Instance)

## Quick Start (3 commands)
```bash
cd khetse
npm install
npm start
```
Then open → **http://localhost:3000**

## Test Accounts
| Role     | Email                  | Password    |
|----------|------------------------|-------------|
| Admin    | admin@khetse.in        | admin123    |
| Farmer   | ramesh@farmer.in       | farmer123   |
| Customer | priya@customer.in      | customer123 |

## Features Live in This Build
- ✅ Customer + Farmer + Admin registration and login (JWT)
- ✅ Farmer verification portal (Aadhaar, PM-Kisan, 7/12 land records, eNAM, SHC)
- ✅ Admin panel: verify/reject farmers, update order status, view platform stats
- ✅ Product listings — farmer-set pricing, categories, organic flag, photo upload
- ✅ Browse, search, and filter produce by category, keyword, organic status
- ✅ Shopping cart + checkout
- ✅ Order management (customer + farmer + admin views)
- ✅ Commission calculator (15% / 12% / 8% tiered by annual sales)
- ✅ Subscription boxes — monthly or fortnightly, build-your-own
- ✅ Farmer community board — posts, replies, likes, categories
- ✅ Farmer profiles with government verification badge display
- ✅ Full SQLite database — auto-created with seed data on first run
- ✅ No cloud dependency — runs entirely on your machine

## Stack
- **Backend:** Node.js + Express
- **Database:** SQLite (sql.js, file-based — khetse.db auto-created)
- **Auth:** JWT (7-day tokens, bcrypt password hashing)
- **Frontend:** Vanilla HTML/CSS/JS SPA (no build step)
- **Uploads:** Local /uploads directory

## Data Reset
Delete `khetse.db` and restart to reset to seed data.

## What This Is NOT (yet)
- No real payment processing (COD/UPI/card are test mode placeholders)
- No real SMS/WhatsApp notifications
- No real government API calls (verification is stored, not live-checked)
- No email service
These are the next steps for a production build.
