# 🚀 GitHub Setup & Zero-Cost Distribution Guide

This guide explains how to initialize a Git repository, push your **TreadPro POS** application to GitHub, and host it **100% free forever** using **GitHub Pages**.

---

## 1. Initialize Local Git Repository

Open your terminal or PowerShell in your project folder (`e:\Tyre Tube`):

```bash
# Check git status
git status

# Add all files
git add .

# Create the initial commit
git commit -m "feat: initial commit of TreadPro Tyre & Tube POS and Inventory System"
```

---

## 2. Create a Repository on GitHub

1. Go to [https://github.com](https://github.com) and log into your account.
2. Click the **`+`** icon in the top right corner and select **New repository**.
3. Fill in the repository details:
   - **Repository name**: `treadpro-tyre-tube-pos` (or any name you prefer)
   - **Description**: `Point of Sale (POS), Inventory & Analytics Management System for Tyre & Tube Retailers`
   - **Public or Private**:
     - Select **Public** if you want to use free GitHub Pages directly.
     - Select **Private** if you want to keep your code private (GitHub Pro / free for private repos with custom settings).
   - **Do NOT** check "Initialize this repository with a README" (since we already have one).
4. Click **Create repository**.

---

## 3. Link and Push to GitHub

Copy the repository URL from GitHub (replace `YOUR_USERNAME` with your actual GitHub username) and run:

```bash
# Rename branch to main if not already
git branch -M main

# Add your GitHub remote repository
git remote add origin https://github.com/YOUR_USERNAME/treadpro-tyre-tube-pos.git

# Push code to GitHub
git push -u origin main
```

---

## 4. Host 100% Free with GitHub Pages

Since **TreadPro POS** is built with an offline-first client architecture using modern JavaScript and IndexedDB, you can host the entire application live on the web via GitHub Pages **at zero hosting cost**:

1. On your GitHub repository page, click **Settings** (gear icon in the top tab bar).
2. On the left sidebar menu, click **Pages** (under the "Code and automation" section).
3. Under **Build and deployment**:
   - **Source**: Select `Deploy from a branch`.
   - **Branch**: Select `main` and folder `/ (root)`.
4. Click **Save**.
5. Wait 1-2 minutes. GitHub will provide your live URL:
   ```
   https://YOUR_USERNAME.github.io/treadpro-tyre-tube-pos/
   ```
6. Open that URL on any computer, tablet, or smartphone — your POS is live!

---

## 5. Multi-Device Local Network Setup (Shop Wi-Fi)

If you prefer running TreadPro on a dedicated counter computer in your shop and accessing it from other cashiers, mechanics, or tablets connected to your shop Wi-Fi:

1. On your counter PC, run:
   ```bash
   node server.js
   ```
2. The server will output your local network address, for example:
   ```
   🛞 TreadPro Tyre & Tube POS System is Running!
   Local URL:   http://localhost:3000
   Shop LAN:    http://192.168.1.15:3000
   ```
3. Open `http://192.168.1.15:3000` on any tablet or phone connected to the same Wi-Fi router.
