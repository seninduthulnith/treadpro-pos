# 🛞 TreadPro POS - Tyre & Tube Management System

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Offline--First-emerald)](https://github.com)
[![Storage](https://img.shields.io/badge/Database-IndexedDB%20(Unlimited%20Free)-blueviolet)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
[![Security](https://img.shields.io/badge/Security-PBKDF2%20SHA--256%20Hashing-success)](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey)

**TreadPro POS** is a modern, high-performance Point of Sale (POS), Inventory Control, and Business Analytics system engineered specifically for **tyre and tube retailers, fitment centers, and automotive workshops**.

Built with an offline-first architecture using **CSS3, modern JavaScript (ES6+), WebCrypto PBKDF2 hashing, and IndexedDB**, it runs 100% free with unlimited local storage, requires zero monthly server fees, and is ready for one-click deployment via **GitHub Pages**.

---

## 🌟 Key Features

### 1. 🛞 Tyre & Tube Inventory Management
- **Brand & Size Management:** Categorize tyres and tubes by exact automotive specifications (e.g., `205/55 R16`, `195/65 R15`, `175/70 R14`, `90/90-12`, `100/90-17`, `10.00-20`).
- **Tyre Specifics:** Track tread patterns, ply ratings (4PR, 6PR, 8PR, 16PR), load/speed index (e.g. 91V, 94H), and construction (Tubeless vs. Tube-Type).
- **Tube Specifics:** Dedicated valve classification (TR-13 straight brass, TR-4 threaded motorcycle, TR-87 90-degree scooter, TR-78A commercial bent valve).
- **Vehicle Categorization:** Passenger Car, SUV / 4x4, Motorcycle, Scooter, Commercial Truck/Bus, Tractor/Agri.
- **Auto-SKU & Barcode Generation:** One-click SKU generator (e.g. `TYR-MIC-2055516-104`) with barcode scanner support.
- **Stock Threshold Alerts:** Customizable minimum stock alert limits with real-time low stock badges and reorder notifications.

### 2. 📥 Stock In (Purchasing) & 📤 Stock Out (POS Selling)
- **Stock In (Buying):** Record wholesale purchase receipts with supplier details, supplier invoice numbers, purchase dates, and acquisition unit costs. Updates inventory count and automatically tracks on-hand capital valuation.
- **Stock Out (Selling):** Fast POS checkout screen with instant stock deduction. Prevents selling out-of-stock items and warns cashiers in real time.
- **Audit Trail:** Complete historical logs of all stock receipts and customer sales.

### 3. 🛒 Fast POS Counter Checkout
- **Instant Search & Filter:** Instant search by brand (Michelin, Bridgestone, Goodyear, Continental, MRF, CEAT, Apollo, etc.), size, model name, or barcode scanner input.
- **Cart Controls:** Real-time quantity adjustments, price checks, line discounts, and automated sales tax/GST calculation.
- **Vehicle & Customer Tracking:** Capture customer name, phone number, vehicle plate registration number (e.g., `ABC-1234`), and vehicle make/model for warranty and service records.
- **Payment Methods:** Support for Cash, Credit/Debit Card, Bank Transfer / UPI, and Shop Credit (Due).
- **Change Calculator:** Instant cash tendered and change due computation with quick-cash preset buttons ($20, $50, $100, $200, Exact).

### 4. 🧾 Dual Invoice System (A4 Standard & 80mm Thermal Receipt)
- **Standard A4 Tax Invoice:** Clean, professional invoice featuring shop branding, tax registration, customer info, vehicle plate number, itemized tyre/tube specifications, subtotal, tax, discounts, signatures, and manufacturer warranty terms.
- **80mm POS Thermal Receipt:** Compact receipt format optimized for thermal counter printers.
- **Export & Print:**
  - One-click **Direct Print** (optimized `@media print` rules hide sidebars and UI).
  - Direct **Download PDF** via client-side PDF rendering.
  - **WhatsApp Share:** Instantly share invoice summaries with customers via WhatsApp.

### 5. 📊 Analytics & Reporting Dashboard
- **Most Selling Tyres & Tubes Graph:** Interactive chart ranking top products by volume (units sold) or revenue ($), with distinct color coding for tyres vs. tubes.
- **Weekly On-Hand Stock Cost Graph:** Visual trend line tracking total capital tied up in inventory week over week (`sum(stock * costPrice)`).
- **Weekly Revenue vs. Gross Profit:** Comparative bar chart analyzing sales income against Cost of Goods Sold (COGS) and gross margin percentages.
- **Category Breakdown:** Donut chart illustrating sales distribution across Tyres, Tubes, and Services.
- **KPI Summary Cards:** Real-time metrics for Today's Sales, Total Gross Profit, On-Hand Stock Capital, and Active Low Stock Items.

### 6. 🔧 Future-Ready Repair Services Module
- Expandable architecture for automotive workshop services:
  - Tubeless Tyre Puncture Plug Repair
  - Inner Cold/Hot Vulcanizing Mushroom Patch
  - 3D Laser Computerized Wheel Alignment (4 Wheels)
  - Precision Dynamic Wheel Balancing
  - Hydraulic Tyre Mounting & Valve Replacement
  - 99% Pure Nitrogen Air Filling
- Ability to add custom services and bill labor directly in the POS cart alongside tyres and tubes.

### 7. 🔐 Security, Roles & WebCrypto Password Hashing
- **PBKDF2 with SHA-256:** Cryptographically secure password hashing (100,000 iterations with unique 16-byte random salts) via the native Web Cryptography API. Plaintext passwords are never stored.
- **Role-Based Access Control (RBAC):**
  - **Administrator:** Full system access (can create users, view cost prices, inspect profit analytics, configure shop settings, and perform backups).
  - **Shop Manager:** Inventory management, stock in, sales POS, and volume analytics.
  - **Cashier:** POS counter checkout and inventory stock queries (sensitive wholesale cost prices and profit margins are hidden).
- **Admin User Management:** Administrator can create staff accounts, assign roles, reset passwords, or disable accounts.

### 8. 💾 Unlimited Free Database (Offline-First)
- Powered by client-side **IndexedDB**, offering gigabytes of storage **completely free forever** with zero cloud hosting bills.
- Works **100% offline** without internet dependency.
- **One-Click Backup & Restore:** Export your full store database to a `.json` backup file or restore it anytime on any computer.

---

## 📂 Project Structure

```
e:\Tyre Tube\
├── index.html                  # Single-Page Application (SPA) entry point
├── server.js                   # Optional Node.js LAN server (zero npm dependencies)
├── package.json                # Project manifest and metadata
├── .gitignore                  # Git ignore rules
├── README.md                   # Complete documentation
├── css/
│   ├── styles.css              # Modern automotive slate UI styling
│   └── print.css               # Print rules for A4 invoices & 80mm thermal receipts
├── js/
│   ├── crypto.js               # WebCrypto PBKDF2 SHA-256 password hashing
│   ├── db.js                   # IndexedDB storage engine (Items, Sales, Purchases, Users)
│   ├── auth.js                 # Authentication & Role-Based Access Control
│   ├── inventory.js            # Tyre/Tube catalogue & stock movements
│   ├── pos.js                  # Point of Sale engine & checkout
│   ├── invoice.js              # Invoice rendering, PDF generation & printing
│   ├── analytics.js            # Chart.js dashboard graphs
│   ├── users.js                # Admin user & staff management
│   ├── services.js             # Future-proof repair services module
│   └── app.js                  # App router, settings & JSON backup/restore
└── docs/
    ├── GITHUB_SETUP.md         # Guide to push to GitHub & deploy on GitHub Pages
    └── DATABASE_OPTIONS.md     # Unlimited free database details & Supabase guide
```

---

## 🚀 Quick Start Guide

### Option A: Run Directly in Any Web Browser (No installation needed)
1. Double-click `index.html` in your file explorer.
2. Sign in with the default credentials:
   - **Admin:** `admin` / `admin123`
   - **Cashier:** `cashier` / `cashier123`

### Option B: Run on Local Shop Network (Wi-Fi for Tablets & Counter PCs)
You can host TreadPro on a shop computer and allow multiple tablets or laptops on your shop Wi-Fi to connect:
```bash
# Start local server (uses native Node.js)
node server.js
```
The console will display:
```
================================================================
  🛞  TreadPro Tyre & Tube POS System is Running!
  Local URL:   http://localhost:3000
  Shop LAN:    http://192.168.1.15:3000
================================================================
```
Open the LAN URL on any tablet or smartphone connected to your shop's Wi-Fi.

---

## 🌐 Deploy Free on GitHub Pages

1. Initialize git and commit:
   ```bash
   git init
   git add .
   git commit -m "feat: TreadPro Tyre & Tube POS System"
   ```
2. Create a new repository on [GitHub](https://github.com) called `treadpro-pos`.
3. Link and push:
   ```bash
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/treadpro-pos.git
   git push -u origin main
   ```
4. On GitHub, navigate to **Settings > Pages > Branch: `main` / `root` > Save**.
5. Your system is live at `https://YOUR_USERNAME.github.io/treadpro-pos/` with **100% free hosting and SSL**.

See [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md) for detailed step-by-step instructions.

---

## 📄 License
This project is open-source and released under the [MIT License](LICENSE).
