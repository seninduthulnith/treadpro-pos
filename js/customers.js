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

    // Configurable Loyalty & Membership Tier Settings (editable by Manager & Admin)
    let loyaltyRules = {
        enabled: false,          // Default disabled until manager/admin checks the tick box!
        spendPerPoint: 100,      // Spend Rs. X to earn 1 Point
        pointValue: 1.0,         // 1 Point = Rs. Y discount
        silverMin: 200,          // Silver Tier min points
        goldMin: 500,            // Gold Tier min points
        platinumMin: 1000        // Platinum VIP min points (0 to disable)
    };

    /**
     * Initialize Customers Module
     */
    async function init() {
        bindEvents();
        await loadLoyaltyRules();
    }

    /**
     * Load Loyalty rules from DB settings
     */
    async function loadLoyaltyRules() {
        try {
            const stored = await AppDB.getById('settings', 'loyaltyRules');
            if (stored && stored.value) {
                loyaltyRules = { ...loyaltyRules, ...stored.value };
            }
            syncLoyaltyCheckboxUI();
        } catch (e) {
            console.warn('Could not load custom loyalty rules:', e);
        }
    }

    /**
     * Sync checkbox elements with current loyaltyRules.enabled
     */
    function syncLoyaltyCheckboxUI() {
        const chkPage = document.getElementById('chkEnableLoyaltyProgram');
        if (chkPage) {
            chkPage.checked = !!loyaltyRules.enabled;
        }
        const chkModal = document.getElementById('modalEnableLoyaltyProgram');
        if (chkModal) {
            chkModal.checked = !!loyaltyRules.enabled;
        }
    }

    /**
     * Save Loyalty rules to DB settings
     */
    async function saveLoyaltyRules(newRules) {
        loyaltyRules = { ...loyaltyRules, ...newRules };
        syncLoyaltyCheckboxUI();
        await AppDB.update('settings', { key: 'loyaltyRules', value: loyaltyRules });
        if (window.AppFirebase && AppFirebase.isReady()) {
            AppFirebase.syncRecord('settings', { key: 'loyaltyRules', value: loyaltyRules }).catch(() => {});
        }
        await loadCustomers();
        AppNotification.toast('Settings Saved', 'Loyalty & Tier settings updated successfully!', 'success');
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

        // Checkbox tick toggle right on the Vehicles & Customers page
        const chkPage = document.getElementById('chkEnableLoyaltyProgram');
        if (chkPage) {
            chkPage.addEventListener('change', async (e) => {
                const isEnabled = e.target.checked;
                await saveLoyaltyRules({ enabled: isEnabled });
                AppNotification.toast(
                    isEnabled ? 'Loyalty Enabled' : 'Loyalty Disabled',
                    isEnabled ? 'Customer loyalty point earning & tiers are now active.' : 'Loyalty points and tier discounts are paused.',
                    isEnabled ? 'success' : 'info'
                );
            });
        }

        // Open Loyalty Config Modal button
        const btnOpenConfig = document.getElementById('btnOpenLoyaltyConfig');
        if (btnOpenConfig) {
            btnOpenConfig.addEventListener('click', openLoyaltyConfigModal);
        }

        // Loyalty Config Form submit
        const configForm = document.getElementById('loyaltySettingsForm');
        if (configForm) {
            configForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const enabledInput = document.getElementById('modalEnableLoyaltyProgram');
                const spendInput = document.getElementById('loyaltySpendPerPoint');
                const valueInput = document.getElementById('loyaltyRedeemValue');
                const silverInput = document.getElementById('loyaltySilverMin');
                const goldInput = document.getElementById('loyaltyGoldMin');
                const platInput = document.getElementById('loyaltyPlatinumMin');

                const newRules = {
                    enabled: enabledInput ? enabledInput.checked : loyaltyRules.enabled,
                    spendPerPoint: Math.max(1, parseFloat(spendInput.value) || 100),
                    pointValue: Math.max(0.1, parseFloat(valueInput.value) || 1.0),
                    silverMin: Math.max(1, parseInt(silverInput.value, 10) || 200),
                    goldMin: Math.max(1, parseInt(goldInput.value, 10) || 500),
                    platinumMin: parseInt(platInput.value, 10) || 0
                };

                await saveLoyaltyRules(newRules);
                closeModal('loyaltySettingsModal');
            });
        }
    }

    /**
     * Open Loyalty Config Modal and populate with current rules
     */
    function openLoyaltyConfigModal() {
        const modal = document.getElementById('loyaltySettingsModal');
        if (!modal) return;

        syncLoyaltyCheckboxUI();
        const spendInput = document.getElementById('loyaltySpendPerPoint');
        const valueInput = document.getElementById('loyaltyRedeemValue');
        const silverInput = document.getElementById('loyaltySilverMin');
        const goldInput = document.getElementById('loyaltyGoldMin');
        const platInput = document.getElementById('loyaltyPlatinumMin');

        if (spendInput) spendInput.value = loyaltyRules.spendPerPoint;
        if (valueInput) valueInput.value = loyaltyRules.pointValue;
        if (silverInput) silverInput.value = loyaltyRules.silverMin;
        if (goldInput) goldInput.value = loyaltyRules.goldMin;
        if (platInput) platInput.value = loyaltyRules.platinumMin || 0;

        modal.classList.add('active');
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
                            saleId: sale.id,
                            name: it.itemName || `${it.brand} ${it.size}`,
                            price: it.price || it.total
                        });
                    } else {
                        profile.fittedTyres.push({
                            date: sale.date,
                            invoiceNo: sale.invoiceNo,
                            saleId: sale.id,
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

        // Compute Loyalty Points & Tier based on shop configurable loyaltyRules
        const list = Object.values(map);
        const spendRate = loyaltyRules.spendPerPoint > 0 ? loyaltyRules.spendPerPoint : 100;
        const pValue = loyaltyRules.pointValue > 0 ? loyaltyRules.pointValue : 1.0;
        const silverMin = loyaltyRules.silverMin || 200;
        const goldMin = loyaltyRules.goldMin || 500;
        const platMin = loyaltyRules.platinumMin || 0;

        list.forEach(c => {
            // User-defined: 1 Point for every Rs. X spent (Gross points earned)
            const grossPointsEarned = Math.floor(c.totalSpent / spendRate);

            // Deduct points claimed/redeemed in previous sales
            let totalPointsClaimed = 0;
            if (c.sales) {
                c.sales.forEach(s => {
                    if (s.pointsClaimed && Number(s.pointsClaimed) > 0) {
                        totalPointsClaimed += Number(s.pointsClaimed);
                    } else if (s.discountAmount && Number(s.discountAmount) > 0 && !s.pointsClaimed) {
                        // Fallback for older sales where discount was applied
                        // If discount was given, convert discount to claimed points if applicable
                    }
                });
            }

            // Remaining available points to redeem
            c.loyaltyPoints = Math.max(0, grossPointsEarned - totalPointsClaimed);
            c.discountValue = c.loyaltyPoints * pValue;
            c.pointsClaimed = totalPointsClaimed;
            c.lifetimePoints = grossPointsEarned;

            // Tier evaluation according to lifetime points or active points (typically lifetime points determine VIP status!)
            const tierMetricPoints = grossPointsEarned;
            if (platMin > 0 && tierMetricPoints >= platMin) {
                c.tier = 'Platinum VIP';
                c.tierColor = '#0284c7'; // Cyan/Platinum
                c.tierBadge = 'badge-primary';
            } else if (tierMetricPoints >= goldMin) {
                c.tier = 'Gold';
                c.tierColor = '#f59e0b'; // Gold
                c.tierBadge = 'badge-warning';
            } else if (tierMetricPoints >= silverMin) {
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
                            ${loyaltyRules.enabled ? `
                                <span class="badge ${c.tierBadge}" style="font-size: 11px; padding: 4px 8px;">
                                    ★ ${c.tier} Member
                                </span>
                                <div style="font-size: 12px; font-weight: 700; color: #0284c7; margin-top: 4px;">
                                    ${c.loyaltyPoints} Points
                                </div>
                            ` : `
                                <span class="badge badge-secondary" style="font-size: 10px; padding: 3px 6px; color: #64748b; background: #f1f5f9;">
                                    Loyalty Disabled
                                </span>
                            `}
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
                    <td><a href="javascript:void(0)" onclick="closeModal('vehicleHistoryModal'); AppRouter.viewSaleInvoice('${it.saleId || it.invoiceNo}')">${it.invoiceNo}</a></td>
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
                    <td><a href="javascript:void(0)" onclick="closeModal('vehicleHistoryModal'); AppRouter.viewSaleInvoice('${srv.saleId || srv.invoiceNo}')">${srv.invoiceNo}</a></td>
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
                        ${loyaltyRules.enabled ? `
                            <span class="badge ${c.tierBadge}" style="font-size: 13px; padding: 6px 12px;">
                                ★ ${c.tier} Member
                            </span>
                            <div style="font-size: 15px; font-weight: 800; color: #0284c7; margin-top: 6px;">
                                ${c.loyaltyPoints} Points (${currency}${(c.discountValue || c.loyaltyPoints).toFixed(2)} Discount)
                            </div>
                        ` : `
                            <span class="badge badge-secondary" style="font-size: 11px; padding: 4px 8px; color: #64748b; background: #f1f5f9;">
                                Loyalty Program Disabled
                            </span>
                        `}
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
        openVehicleHistoryModal,
        openLoyaltyConfigModal,
        isLoyaltyEnabled: () => !!loyaltyRules.enabled,
        getLoyaltyRules: () => ({ ...loyaltyRules })
    };
})();

// Attach to window
window.AppCustomers = AppCustomers;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppCustomers;
}
