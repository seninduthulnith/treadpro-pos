# 💾 Unlimited Free Database Architecture & Cloud Options

This document explains how **TreadPro POS** handles database storage with **zero ongoing server or database costs**, and how you can backup, restore, or optionally link to cloud databases like Supabase.

---

## 1. The Built-in Solution: Client-Side IndexedDB (100% Free Forever)

### Why IndexedDB is Perfect for Retail Tyre & Tube Shops:
1. **Unlimited Storage Capacity**:
   Modern web browsers (Chrome, Edge, Safari, Firefox) allocate IndexedDB storage dynamically based on disk space. It easily supports **tens of thousands of items, invoices, and sales transactions (hundreds of megabytes to gigabytes)** without hitting limits.
2. **$0.00 / Month Cost**:
   There is **no database server to rent, no AWS/Google Cloud bill**, and no subscription fees.
3. **100% Offline-First Operation**:
   Tyre shops, garages, and fitting bays frequently experience Wi-Fi drops or internet outages. Because IndexedDB runs directly on your device, **sales, stock deductions, and billing continue without interruption** even if your internet is completely offline.
4. **Data Isolation & Privacy**:
   Your customer names, vehicle numbers, profit margins, and supplier purchase costs remain strictly stored on your machine.

---

## 2. One-Click Backup & Restore (Safety First)

To protect your business records against device loss or browser cache clearing:

### How to Create a Backup:
1. Navigate to the **Settings & Backup** tab in the sidebar.
2. Under **Backup Database**, click **"📥 Download JSON Database Backup"**.
3. A JSON file (e.g. `treadpro_backup_2026-11-21.json`) containing all:
   - Items (Tyres & Tubes)
   - Stock transactions
   - Sales & Invoices
   - Supplier Purchases
   - User Accounts & Hashed Credentials
   - Settings & Services
   will be saved to your computer.
4. **Best Practice:** Save this backup to a USB drive or Google Drive / OneDrive once a week or at the end of each business day.

### How to Restore a Backup on Any Computer:
1. Open TreadPro on your new computer or browser.
2. Go to **Settings & Backup**.
3. Click **"📤 Upload & Restore from JSON"** and select your backup file.
4. All inventory, sales, and user accounts are instantly restored!

---

## 3. Optional Multi-Branch Cloud Database: Supabase (Free Tier)

If your business expands into **multiple physical shop branches** in different locations that need to share a single centralized live database in real-time, **Supabase** offers the most generous free PostgreSQL tier in the industry:

- **Free Tier Specs**:
  - Free PostgreSQL database (500 MB storage — holds ~500,000 tyre transactions).
  - Unlimited API requests.
  - Built-in Row Level Security (RLS).
  - Built-in Realtime subscriptions.

### How to Connect Supabase (When you are ready to expand):
1. Create a free account at [https://supabase.com](https://supabase.com).
2. Create a new project called `treadpro-pos`.
3. In your Supabase SQL editor, create the matching tables (`items`, `sales`, `purchases`, `users`, `services`).
4. In `js/db.js`, simply swap the IndexedDB read/write functions with the `@supabase/supabase-js` client using your free project URL and Anon public key.
