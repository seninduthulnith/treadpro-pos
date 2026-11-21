/**
 * TreadPro Customers & Vehicle History Management Module
 * Tracks vehicle plate records, customer loyalty points, tiers,
 * fitted tyre history, mileage / odometer tracking, and service logs.
 */

const AppCustomers = (function () {
    'use strict';

    let allSales = [];
    let customerList = [];
    let currentFilter = '';

    /**
     * Initialize Customers Module
     */
    async function init() {
        bindEvents();
    }

    /**
     * Bind UI event listeners
     */
    function bindEvents() {
        const searchInput = document.getElementById('customerSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentFilter = e.target.value.trim().toLowerCase();
                renderCustomersList();
            });
        }
    }

    /**
     * Load sales and compute aggregated customer/vehicle profiles
     */
    async function loadCustomers() {
        allSales = await AppDB.getAll('sales');
        customerList = buildCustomerProfiles(allSales);
        renderCustomersList();
    }

    /**
     * Build customer profiles from sales history
     */
    function buildCustomerProfiles(sales) {
        const map = {};

        sales.forEach(sale => {
            const cust = sale.customer || {};
            const plate = (cust.vehicleNo || '').trim().toUpperCase();
            const phone = (cust.phone || '').trim();
            const name = (cust.name || 'Walk-in Customer').trim();
            const model = (cust.vehicleModel || '').trim();

            // Unique key: prefer vehicle plate, fallback to phone or name
            let key = '';
            if (plate && plate !== 'N/A' && plate !== 'NOT RECORDED') {
                key = 'PLATE_' + plate;
            } else if (phone) {
                key = 'PHONE_' + phone;
            } else {
                key = 'NAME_' + name.toLowerCase();
            }

            if (!map[key]) {
                map[key] = {
                    key: key,
                    name: name,
                    phone: phone,
                    vehicleNo: plate && plate !== 'N/A' ? plate : '',
                    vehicleModel: model,
                    totalVisits: 0,
                    totalSpent: 0,
                    sales: [],
                    fittedTyres: [],
                    servicesDone: [],
                    latestOdometer: 0,
                    lastVisit: null
                };
            }

            const profile = map[key];
            profile.totalVisits++;
            profile.totalSpent += Number(sale.totalAmount || 0);
            profile.sales.push(sale);

            // Update latest contact info if missing
            if (!profile.phone && phone) profile.phone = phone;
            if (!profile.vehicleNo && plate && plate !== 'N/A') profile.vehicleNo = plate;
            if (!profile.vehicleModel && model) profile.vehicleModel = model;
            if (profile.name === 'Walk-in Customer' && name && name !== 'Walk-in Customer') profile.name = name;

            // Odometer tracking
            if (cust.odometer && Number(cust.odometer) > profile.latestOdometer) {
                profile.latestOdometer = Number(cust.odometer);
            }

            // Record items
            if (sale.items) {
                sale.items.forEach(it => {
                    if (it.category === 'service') {
                        profile.servicesDone.push({
                            date: sale.date,
                            invoiceNo: sale.invoiceNo,
                            name: it.itemName || `${it.brand} ${it.size}`,
                            price: it.price || it.total
                        });
                    } else {
                        profile.fittedTyres.push({
                            date: sale.date,
                            invoiceNo: sale.invoiceNo,
                            brand: it.brand,
                            size: it.size,
                            quantity: it.quantity,
                            price: it.price || it.unitPrice,
                            odometer: cust.odometer || null
                        });
                    }
                });
            }

            // Track last visit date
            const saleDate = new Date(sale.date);
            if (!profile.lastVisit || saleDate > new Date(profile.lastVisit)) {
                profile.lastVisit = sale.date;
            }
        });

        // Compute Loyalty Points & Tier
        // Rule: 1 Loyalty Point for every Rs. 100 spent (Rs. 1 discount per point)
        const list = Object.values(map);
        list.forEach(c => {
            c.loyaltyPoints = Math.floor(c.totalSpent / 100);

            // Tiers: Bronze (0 - 200 pts), Silver (201 - 500 pts), Gold (501+ pts)
            if (c.loyaltyPoints >= 500) {
                c.tier = 'Gold';
                c.tierColor = '#f59e0b'; // Gold
                c.tierBadge = 'badge-warning';
            } else if (c.loyaltyPoints >= 200) {
                c.tier = 'Silver';
                c.tierColor = '#64748b'; // Silver
                c.tierBadge = 'badge-info';
            } else {
                c.tier = 'Bronze';
                c.tierColor = '#b45309'; // Bronze
                c.tierBadge = 'badge-secondary';
            }
        });

        // Sort by last visit descending
        list.sort((a, b) => new Date(b.lastVisit || 0) - new Date(a.lastVisit || 0));
        return list;
    }

    /**
     * Render Customer & Vehicle Cards in Customers View
     */
    function renderCustomersList() {
        const container = document.getElementById('customersListContainer');
        const emptyState = document.getElementById('customersEmptyState');
        const countBadge = document.getElementById('customersTotalCount');
        if (!container) return;

        let filtered = customerList;
        if (currentFilter) {
            filtered = customerList.filter(c =>
                c.name.toLowerCase().includes(currentFilter) ||
                c.phone.toLowerCase().includes(currentFilter) ||
                c.vehicleNo.toLowerCase().includes(currentFilter) ||
                c.vehicleModel.toLowerCase().includes(currentFilter)
            );
        }

        if (countBadge) countBadge.textContent = `${filtered.length} Registered`;

        if (filtered.length === 0) {
            container.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        const currency = AppSettings.getCurrency();

        container.innerHTML = filtered.map(c => {
            const formattedLastVisit = c.lastVisit ? new Date(c.lastVisit).toLocaleDateString() : 'N/A';
            const plateDisplay = c.vehicleNo ? escapeHtml(c.vehicleNo) : '<span style="color:#94a3b8;">No Plate</span>';
            const modelDisplay = c.vehicleModel ? escapeHtml(c.vehicleModel) : 'General Vehicle';

            return `
                <div class="customer-card">
                    <div class="customer-card-header">
                        <div>
                            <div class="vehicle-plate-pill font-mono">${plateDisplay}</div>
                            <h3 class="customer-name">${escapeHtml(c.name)}</h3>
                            <div class="customer-sub">${escapeHtml(modelDisplay)} ${c.phone ? '• 📞 ' + escapeHtml(c.phone) : ''}</div>
                        </div>
                        <div style="text-align: right;">
                            <span class="badge ${c.tierBadge}" style="font-size: 11px; padding: 4px 8px;">
                                ★ ${c.tier} Member
                            </span>
                            <div style="font-size: 12px; font-weight: 700; color: #0284c7; margin-top: 4px;">
                                ${c.loyaltyPoints} Points
                            </div>
                        </div>
                    </div>

                    <div class="customer-stats-grid">
                        <div class="cust-stat">
                            <span class="cust-stat-label">Total Visits</span>
                            <strong class="cust-stat-val">${c.totalVisits}</strong>
                        </div>
                        <div class="cust-stat">
                            <span class="cust-stat-label">Total Spend</span>
                            <strong class="cust-stat-val text-primary">${currency}${c.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                        </div>
                        <div class="cust-stat">
                            <span class="cust-stat-label">Tyres Fitted</span>
                            <strong class="cust-stat-val">${c.fittedTyres.reduce((s, it) => s + (it.quantity || 1), 0)}</strong>
                        </div>
                        <div class="cust-stat">
                            <span class="cust-stat-label">Last Odometer</span>
                            <strong class="cust-stat-val">${c.latestOdometer ? c.latestOdometer.toLocaleString() + ' km' : 'N/A'}</strong>
                        </div>
                    </div>

                    <!-- Fitted Tyres Mini History -->
                    <div class="fitted-tyres-preview">
                        <div class="fitted-title">Fitted Tyres & Tubes History:</div>
                        ${c.fittedTyres.length > 0 ? `
                            <div class="fitted-tyre-tags">
                                ${c.fittedTyres.slice(0, 3).map(it => `
                                    <span class="fitted-tag">
                                        🛞 ${escapeHtml(it.brand)} ${escapeHtml(it.size)} (x${it.quantity})
                                    </span>
                                `).join('')}
                                ${c.fittedTyres.length > 3 ? `<span class="fitted-tag" style="background:#e2e8f0;">+${c.fittedTyres.length - 3} more</span>` : ''}
                            </div>
                        ` : `
                            <p style="font-size: 12px; color: #94a3b8; margin: 0;">No fitted tyres recorded yet.</p>
                        `}
                    </div>

                    <div class="customer-card-footer">
                        <span style="font-size: 11.5px; color: var(--text-muted);">
                            Last Visit: <strong>${formattedLastVisit}</strong>
                        </span>
                        <button class="btn btn-sm btn-outline-primary" onclick="AppCustomers.openVehicleHistoryModal('${c.key}')">
                            🔍 Full Vehicle History
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Open Full Vehicle History Modal
     */
    function openVehicleHistoryModal(customerKey) {
        const c = customerList.find(item => item.key === customerKey);
        if (!c) return;

        const modal = document.getElementById('vehicleHistoryModal');
        const container = document.getElementById('vehicleHistoryContent');
        if (!modal || !container) return;

        const currency = AppSettings.getCurrency();

        let tyresHtml = '';
        if (c.fittedTyres.length === 0) {
            tyresHtml = '<tr><td colspan="5" class="text-center py-4 text-slate-400">No tyres or tubes fitted yet.</td></tr>';
        } else {
            tyresHtml = c.fittedTyres.map(it => `
                <tr>
                    <td>${new Date(it.date).toLocaleDateString()}</td>
                    <td><strong>${escapeHtml(it.brand)} ${escapeHtml(it.size)}</strong></td>
                    <td>${it.quantity}</td>
                    <td>${it.odometer ? it.odometer.toLocaleString() + ' km' : 'N/A'}</td>
                    <td><a href="javascript:void(0)" onclick="closeModal('vehicleHistoryModal'); AppRouter.viewSaleInvoice('${it.invoiceNo}')">${it.invoiceNo}</a></td>
                </tr>
            `).join('');
        }

        let servicesHtml = '';
        if (c.servicesDone.length === 0) {
            servicesHtml = '<tr><td colspan="4" class="text-center py-4 text-slate-400">No repair or maintenance services logged.</td></tr>';
        } else {
            servicesHtml = c.servicesDone.map(srv => `
                <tr>
                    <td>${new Date(srv.date).toLocaleDateString()}</td>
                    <td><strong>${escapeHtml(srv.name)}</strong></td>
                    <td>${currency}${Number(srv.price || 0).toFixed(2)}</td>
                    <td><a href="javascript:void(0)" onclick="closeModal('vehicleHistoryModal'); AppRouter.viewSaleInvoice('${srv.invoiceNo}')">${srv.invoiceNo}</a></td>
                </tr>
            `).join('');
        }

        container.innerHTML = `
            <div class="vehicle-history-header-box">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
                    <div>
                        <div class="vehicle-plate-pill large font-mono">${c.vehicleNo || 'NO PLATE'}</div>
                        <h2 style="margin: 8px 0 4px 0; font-size: 22px;">${escapeHtml(c.name)}</h2>
                        <p style="margin: 0; font-size: 13px; color: #64748b;">
                            ${escapeHtml(c.vehicleModel || 'Standard Vehicle')} ${c.phone ? '• 📞 ' + escapeHtml(c.phone) : ''}
                        </p>
                    </div>
                    <div style="text-align: right;">
                        <span class="badge ${c.tierBadge}" style="font-size: 13px; padding: 6px 12px;">
                            ★ ${c.tier} Member
                        </span>
                        <div style="font-size: 15px; font-weight: 800; color: #0284c7; margin-top: 6px;">
                            ${c.loyaltyPoints} Points (${currency}${c.loyaltyPoints} Discount)
                        </div>
                    </div>
                </div>

                <div class="history-metrics-row" style="display: flex; gap: 16px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-color);">
                    <div>
                        <span style="font-size: 11px; color: #64748b; display: block;">LIFETIME SPEND</span>
                        <strong style="font-size: 16px; color: #0f172a;">${currency}${c.totalSpent.toFixed(2)}</strong>
                    </div>
                    <div>
                        <span style="font-size: 11px; color: #64748b; display: block;">TOTAL VISITS</span>
                        <strong style="font-size: 16px; color: #0f172a;">${c.totalVisits} Times</strong>
                    </div>
                    <div>
                        <span style="font-size: 11px; color: #64748b; display: block;">LATEST ODOMETER</span>
                        <strong style="font-size: 16px; color: #0f172a;">${c.latestOdometer ? c.latestOdometer.toLocaleString() + ' km' : 'Not Logged'}</strong>
                    </div>
                    <div>
                        <span style="font-size: 11px; color: #64748b; display: block;">ROTATION RECOMMENDATION</span>
                        <strong style="font-size: 13px; color: #059669;">Every 10,000 km</strong>
                    </div>
                </div>
            </div>

            <!-- Fitted Tyres Table -->
            <h3 style="font-size: 15px; margin: 20px 0 10px 0;">🛞 Fitted Tyres & Tubes Log</h3>
            <div class="table-responsive">
                <table class="app-table">
                    <thead>
                        <tr>
                            <th>Date Fitted</th>
                            <th>Tyre / Tube Specification</th>
                            <th>Qty</th>
                            <th>Fitted At Odometer</th>
                            <th>Invoice #</th>
                        </tr>
                    </thead>
                    <tbody>${tyresHtml}</tbody>
                </table>
            </div>

            <!-- Repair & Alignment Services Table -->
            <h3 style="font-size: 15px; margin: 24px 0 10px 0;">🔧 Alignment & Repair Services Log</h3>
            <div class="table-responsive">
                <table class="app-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Service Description</th>
                            <th>Fee</th>
                            <th>Invoice #</th>
                        </tr>
                    </thead>
                    <tbody>${servicesHtml}</tbody>
                </table>
            </div>
        `;

        modal.classList.add('active');
    }

    /**
     * Real-time search for POS autocomplete:
     * When cashier types plate or phone number, suggest existing vehicles
     */
    function searchReturningCustomer(query) {
        if (!query || query.length < 2) return [];
        const q = query.trim().toLowerCase();
        return customerList.filter(c =>
            (c.vehicleNo && c.vehicleNo.toLowerCase().includes(q)) ||
            (c.phone && c.phone.toLowerCase().includes(q)) ||
            (c.name && c.name.toLowerCase().includes(q))
        ).slice(0, 5);
    }

    /**
     * Get customer profile by vehicle plate
     */
    function getCustomerByPlate(plate) {
        if (!plate) return null;
        const p = plate.trim().toUpperCase();
        return customerList.find(c => c.vehicleNo === p);
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

    return {
        init,
        loadCustomers,
        searchReturningCustomer,
        getCustomerByPlate,
        openVehicleHistoryModal
    };
})();

// Attach to window
window.AppCustomers = AppCustomers;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppCustomers;
}
