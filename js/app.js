/**
 * TreadPro Application Controller & Router
 * Coordinates Navigation, Settings, Toast Notifications, Sales History,
 * Purchases History, and Database JSON Backup/Restore.
 */

// --- Settings Module ---
const AppSettings = (function () {
    'use strict';

    let settingsCache = {};

    async function load() {
        const list = await AppDB.getAll('settings');
        settingsCache = {};
        list.forEach(item => {
            settingsCache[item.key] = item.value;
        });
        applyToDOM();
    }

    function get(key, defaultValue = '') {
        return settingsCache[key] !== undefined ? settingsCache[key] : defaultValue;
    }

    function getCurrency() {
        return get('currency', 'Rs. ');
    }

    function getAllSettings() {
        return { ...settingsCache };
    }

    async function set(key, value) {
        settingsCache[key] = value;
        await AppDB.update('settings', { key, value });
        applyToDOM();
    }

    async function saveAll(newSettingsObj) {
        for (const [k, v] of Object.entries(newSettingsObj)) {
            settingsCache[k] = v;
            await AppDB.update('settings', { key: k, value: v });
        }
        applyToDOM();
    }

    function applyToDOM() {
        const brandEls = document.querySelectorAll('.app-shop-brand-name');
        const shopName = get('shopName', 'Apex Tyre & Tube Center');
        brandEls.forEach(el => el.textContent = shopName);
    }

    return {
        load,
        get,
        getCurrency,
        getAllSettings,
        set,
        saveAll
    };
})();

// --- Toast Notifications Module ---
const AppNotification = (function () {
    'use strict';

    function toast(title, message, type = 'info', duration = 3500) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toastEl = document.createElement('div');
        toastEl.className = `toast-item toast-${type}`;

        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'warning') icon = '⚠️';
        if (type === 'error') icon = '❌';

        toastEl.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-body">
                <div class="toast-title">${escapeHtml(title)}</div>
                <div class="toast-message">${escapeHtml(message)}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
        `;

        container.appendChild(toastEl);

        setTimeout(() => {
            toastEl.classList.add('toast-fade-out');
            setTimeout(() => toastEl.remove(), 300);
        }, duration);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    return { toast };
})();

// --- Main App Router & Coordinator ---
const AppRouter = (function () {
    'use strict';

    let currentView = 'dashboard';

    /**
     * Navigate to a view
     */
    function navigate(viewName) {
        // Role permission checks
        if (viewName === 'users' && !AppAuth.isAdmin()) {
            AppNotification.toast('Restricted View', 'Only Administrator accounts have access to User Management.', 'warning');
            return;
        }

        currentView = viewName;

        // Update nav items active class
        document.querySelectorAll('.nav-link').forEach(link => {
            const target = link.getAttribute('data-view');
            link.classList.toggle('active', target === viewName);
        });

        // Hide all views, show target view
        document.querySelectorAll('.view-section').forEach(sec => {
            sec.classList.remove('active');
        });

        const activeSec = document.getElementById(`view-${viewName}`);
        if (activeSec) {
            activeSec.classList.add('active');
        }

        // View specific activations
        if (viewName === 'dashboard') {
            if (window.AppAnalytics) AppAnalytics.refreshCharts();
        } else if (viewName === 'pos') {
            if (window.AppPOS) AppPOS.loadProducts();
        } else if (viewName === 'inventory') {
            if (window.AppInventory) AppInventory.loadItems();
        } else if (viewName === 'sales') {
            renderSalesHistory();
        } else if (viewName === 'purchases') {
            renderPurchasesHistory();
        } else if (viewName === 'users') {
            if (window.AppUsers) AppUsers.loadUsers();
        } else if (viewName === 'services') {
            if (window.AppServices) AppServices.loadServices();
        } else if (viewName === 'settings') {
            populateSettingsForm();
        }
    }

    /**
     * Render Sales & Invoices History Table
     */
    async function renderSalesHistory() {
        const tbody = document.getElementById('salesTableBody');
        if (!tbody) return;

        const sales = await AppDB.getAll('sales');
        sales.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (sales.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-6 text-slate-500">
                        No sales transactions recorded yet.
                    </td>
                </tr>
            `;
            return;
        }

        const currency = AppSettings.getCurrency();

        tbody.innerHTML = sales.map(sale => {
            const formattedDate = new Date(sale.date).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const itemsCount = sale.items ? sale.items.reduce((sum, it) => sum + it.quantity, 0) : 0;
            const itemsSummary = sale.items ? sale.items.map(it => `${it.brand} ${it.size} (x${it.quantity})`).join(', ') : '';

            return `
                <tr>
                    <td><strong>${escapeHtml(sale.invoiceNo)}</strong></td>
                    <td>${formattedDate}</td>
                    <td>
                        <div><strong>${escapeHtml(sale.customer.name || 'Walk-in')}</strong></div>
                        <div class="text-xs text-slate-400">Plate: <span class="font-bold text-slate-700">${escapeHtml(sale.customer.vehicleNo || 'N/A')}</span></div>
                    </td>
                    <td>
                        <div class="text-xs truncate max-w-xs" title="${escapeHtml(itemsSummary)}">
                            <span class="badge badge-info">${itemsCount} items</span> ${escapeHtml(itemsSummary)}
                        </div>
                    </td>
                    <td><span class="badge badge-payment">${(sale.paymentMethod || 'cash').toUpperCase()}</span></td>
                    <td><strong class="text-primary">${currency}${Number(sale.totalAmount || 0).toFixed(2)}</strong></td>
                    <td class="action-cell">
                        <button class="btn btn-sm btn-outline-primary" onclick="AppRouter.viewSaleInvoice('${sale.id}')">
                            📄 View / Print
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * View existing sale in the Invoice Modal
     */
    async function viewSaleInvoice(saleId) {
        if (!saleId) return;
        const sale = await AppDB.getById('sales', saleId);
        if (sale) {
            if (window.AppInvoice) {
                AppInvoice.showInvoice(sale);
            } else if (typeof AppInvoice !== 'undefined') {
                AppInvoice.showInvoice(sale);
            }
        } else {
            AppNotification.toast('Not Found', 'Could not find invoice record.', 'error');
        }
    }

    /**
     * Render Purchases & Stock In History Table
     */
    async function renderPurchasesHistory() {
        const tbody = document.getElementById('purchasesTableBody');
        if (!tbody) return;

        const purchases = await AppDB.getAll('purchases');
        purchases.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (purchases.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-6 text-slate-500">
                        No purchase or stock-in orders recorded yet.
                    </td>
                </tr>
            `;
            return;
        }

        const currency = AppSettings.getCurrency();

        tbody.innerHTML = purchases.map(pur => {
            const formattedDate = new Date(pur.date).toLocaleDateString();
            const itemsSummary = pur.items ? pur.items.map(it => `${it.itemName} (Qty: ${it.quantity})`).join(', ') : '';

            return `
                <tr>
                    <td><strong>${escapeHtml(pur.purchaseNo)}</strong></td>
                    <td>${formattedDate}</td>
                    <td><strong>${escapeHtml(pur.supplier)}</strong></td>
                    <td>${escapeHtml(pur.supplierInvoiceNo || 'N/A')}</td>
                    <td>
                        <div class="text-xs truncate max-w-sm" title="${escapeHtml(itemsSummary)}">
                            ${escapeHtml(itemsSummary)}
                        </div>
                    </td>
                    <td><strong>${currency}${Number(pur.totalAmount || 0).toFixed(2)}</strong></td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Populate Settings Form with current values
     */
    function populateSettingsForm() {
        const s = AppSettings.getAllSettings();
        document.getElementById('settingShopName').value = s.shopName || '';
        document.getElementById('settingTagline').value = s.tagline || '';
        document.getElementById('settingPhone').value = s.phone || '';
        document.getElementById('settingEmail').value = s.email || '';
        document.getElementById('settingAddress').value = s.address || '';
        document.getElementById('settingCurrency').value = s.currency || 'Rs. ';
        document.getElementById('settingTaxRate').value = s.taxRate || 5;
        document.getElementById('settingTaxEnabled').checked = s.taxEnabled !== false;
        document.getElementById('settingInvoicePrefix').value = s.invoicePrefix || 'INV-';
        document.getElementById('settingFooterNote').value = s.invoiceFooterNote || '';
    }

    /**
     * Save Settings Form
     */
    async function saveSettings(e) {
        e.preventDefault();

        const updated = {
            shopName: document.getElementById('settingShopName').value.trim(),
            tagline: document.getElementById('settingTagline').value.trim(),
            phone: document.getElementById('settingPhone').value.trim(),
            email: document.getElementById('settingEmail').value.trim(),
            address: document.getElementById('settingAddress').value.trim(),
            currency: document.getElementById('settingCurrency').value.trim(),
            taxRate: parseFloat(document.getElementById('settingTaxRate').value) || 0,
            taxEnabled: document.getElementById('settingTaxEnabled').checked,
            invoicePrefix: document.getElementById('settingInvoicePrefix').value.trim(),
            invoiceFooterNote: document.getElementById('settingFooterNote').value.trim()
        };

        await AppSettings.saveAll(updated);
        AppNotification.toast('Settings Saved', 'Shop details and configurations updated successfully.', 'success');
    }

    /**
     * Backup Database to JSON file
     */
    async function backupDatabase() {
        try {
            const data = await AppDB.exportDatabaseToJson();
            const jsonString = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
            const dlAnchor = document.createElement('a');
            const dateStr = new Date().toISOString().substring(0, 10);
            dlAnchor.setAttribute('href', jsonString);
            dlAnchor.setAttribute('download', `treadpro_backup_${dateStr}.json`);
            document.body.appendChild(dlAnchor);
            dlAnchor.click();
            dlAnchor.remove();

            AppNotification.toast('Backup Exported', 'Downloaded complete store database backup file.', 'success');
        } catch (err) {
            console.error('Backup error:', err);
            AppNotification.toast('Backup Failed', 'Could not export database.', 'error');
        }
    }

    /**
     * Restore Database from JSON file
     */
    function restoreDatabase(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                const parsed = JSON.parse(e.target.result);
                if (!confirm('Restoring will replace all current database records with the backup. Proceed?')) {
                    return;
                }

                await AppDB.importDatabaseFromJson(parsed);
                AppNotification.toast('Database Restored', 'Store database restored successfully from file.', 'success');

                // Reload all modules
                await AppSettings.load();
                if (window.AppInventory) await AppInventory.loadItems();
                if (window.AppPOS) await AppPOS.loadProducts();
                if (window.AppAnalytics) await AppAnalytics.refreshCharts();
                if (window.AppUsers) await AppUsers.loadUsers();
                if (window.AppServices) await AppServices.loadServices();
            } catch (err) {
                console.error('Restore error:', err);
                AppNotification.toast('Restore Failed', 'Invalid backup file format.', 'error');
            }
        };
        reader.readAsText(file);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Clear all inventory items, sales records, and purchase orders.
     */
    async function clearAllStoreData() {
        const confirm1 = confirm("WARNING: Are you sure you want to delete ALL inventory items, sales records, and purchases?\n\nThis will clear all data so you can enter your new real data. (User accounts and shop settings will be preserved).");
        if (!confirm1) return;

        try {
            await AppDB.clearAllHistoricalData();
            AppNotification.toast('Data Cleared', 'All inventory items, sales, and purchases have been wiped clean. Ready for new real data.', 'success');

            // Refresh all views
            if (window.AppInventory) await AppInventory.loadItems();
            if (window.AppPOS) await AppPOS.loadProducts();
            if (window.AppAnalytics) await AppAnalytics.refreshCharts();
            renderSalesHistory();
            renderPurchasesHistory();
        } catch (err) {
            console.error('Failed to clear data:', err);
            AppNotification.toast('Error', 'Failed to clear data.', 'error');
        }
    }

    return {
        navigate,
        viewSaleInvoice,
        saveSettings,
        backupDatabase,
        restoreDatabase,
        clearAllStoreData
    };
})();

// Attach modules to global window
window.AppSettings = AppSettings;
window.AppNotification = AppNotification;
window.AppRouter = AppRouter;

// Global Modal Closer helper
function closeModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.remove('active');
}

// Global App Initialization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('Bootstrapping TreadPro POS...');

        // 1. Initialize IndexedDB
        await AppDB.openDB();

        // 2. Load Settings
        await AppSettings.load();

        // 3. Initialize Authentication
        await AppAuth.init();

        // 4. Initialize Core Modules
        await AppInventory.init();
        await AppPOS.init();
        await AppAnalytics.init();
        await AppUsers.init();
        await AppServices.init();
        AppInvoice.init();

        // 5. Setup Navigation Links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                if (view) AppRouter.navigate(view);
            });
        });

        // 6. Setup Settings Form Listener
        const settingsForm = document.getElementById('settingsForm');
        if (settingsForm) {
            settingsForm.addEventListener('submit', AppRouter.saveSettings);
        }

        // 7. Setup Login Form Listener
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const user = document.getElementById('loginUsername').value;
                const pass = document.getElementById('loginPassword').value;
                const remember = document.getElementById('loginRemember').checked;

                try {
                    await AppAuth.login(user, pass, remember);
                    AppNotification.toast('Welcome Back', `Logged in as ${user}`, 'success');
                    AppRouter.navigate('dashboard');
                } catch (err) {
                    AppNotification.toast('Login Failed', err.message, 'error');
                }
            });
        }

        // 8. Logout Button Listener
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to log out?')) {
                    AppAuth.logout();
                }
            });
        }

        // 9. Quick Demo Login Buttons on Modal
        const btnLoginAdmin = document.getElementById('demoLoginAdmin');
        if (btnLoginAdmin) {
            btnLoginAdmin.addEventListener('click', () => {
                document.getElementById('loginUsername').value = 'admin';
                document.getElementById('loginPassword').value = 'admin123';
            });
        }

        const btnLoginCashier = document.getElementById('demoLoginCashier');
        if (btnLoginCashier) {
            btnLoginCashier.addEventListener('click', () => {
                document.getElementById('loginUsername').value = 'cashier';
                document.getElementById('loginPassword').value = 'cashier123';
            });
        }

        // 10. Close modals when clicking outside modal content
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal && modal.id !== 'loginModal') {
                    modal.classList.remove('active');
                }
            });
        });

        // 11. Escape key closes top open modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                    if (modal.id !== 'loginModal') {
                        modal.classList.remove('active');
                    }
                });
            }
        });

        console.log('TreadPro POS initialization complete!');
    } catch (err) {
        console.error('Fatal initialization error:', err);
    }
});
