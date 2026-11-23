/**
 * TreadPro Inventory Management Module
 * Handles Tyres, Tubes, Stock Movements, Stock In / Purchasing, and Thresholds.
 */

const AppInventory = (function () {
    'use strict';

    let currentItems = [];
    let activeFilter = {
        search: '',
        category: 'all',
        vehicleType: 'all',
        stockStatus: 'all'
    };

    /**
     * Initialize Inventory Module
     */
    async function init() {
        await loadItems();
        bindEvents();
    }

    /**
     * Load all inventory items from IndexedDB
     */
    async function loadItems() {
        currentItems = await AppDB.getAll('items');
        renderInventoryTable();
        updateInventorySummaryCards();
    }

    /**
     * Get all items currently in memory
     */
    function getItems() {
        return currentItems;
    }

    /**
     * Get single item by ID
     */
    function getItemById(id) {
        return currentItems.find(item => item.id === id);
    }

    /**
     * Bind UI event listeners
     */
    function bindEvents() {
        // Search input
        const searchInput = document.getElementById('inventorySearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                activeFilter.search = e.target.value.toLowerCase().trim();
                renderInventoryTable();
            });
        }

        // Category filter
        const categoryFilter = document.getElementById('inventoryCategoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                activeFilter.category = e.target.value;
                renderInventoryTable();
            });
        }

        // Vehicle type filter
        const vehicleFilter = document.getElementById('inventoryVehicleFilter');
        if (vehicleFilter) {
            vehicleFilter.addEventListener('change', (e) => {
                activeFilter.vehicleType = e.target.value;
                renderInventoryTable();
            });
        }

        // Stock status filter
        const statusFilter = document.getElementById('inventoryStatusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                activeFilter.stockStatus = e.target.value;
                renderInventoryTable();
            });
        }

        // Add Item Form Submit
        const itemForm = document.getElementById('itemForm');
        if (itemForm) {
            itemForm.addEventListener('submit', handleSaveItem);
        }

        // Category change in Add Item modal to show/hide tyre vs tube specific fields
        const modalCategorySelect = document.getElementById('itemCategory');
        if (modalCategorySelect) {
            modalCategorySelect.addEventListener('change', handleCategoryFieldToggle);
        }

        // Stock In Form Submit
        const stockInForm = document.getElementById('stockInForm');
        if (stockInForm) {
            stockInForm.addEventListener('submit', handleStockInSubmit);
        }

        // Auto SKU Generate Button
        const generateSkuBtn = document.getElementById('generateSkuBtn');
        if (generateSkuBtn) {
            generateSkuBtn.addEventListener('click', generateAutoSKU);
        }
    }

    /**
     * Toggle specific fields (Valve type vs Ply rating) based on category
     */
    function handleCategoryFieldToggle() {
        const cat = document.getElementById('itemCategory').value;
        const valveGroup = document.getElementById('valveTypeGroup');
        const plyGroup = document.getElementById('plyRatingGroup');

        if (cat === 'tube') {
            if (valveGroup) valveGroup.style.display = 'block';
            if (plyGroup) plyGroup.style.display = 'none';
        } else {
            if (valveGroup) valveGroup.style.display = 'none';
            if (plyGroup) plyGroup.style.display = 'block';
        }
    }

    /**
     * Generates a clean readable SKU based on Brand, Category and Size
     */
    function generateAutoSKU() {
        const cat = (document.getElementById('itemCategory')?.value || 'TYR').substring(0, 3).toUpperCase();
        const brand = (document.getElementById('itemBrand')?.value || 'GEN').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '');
        const size = (document.getElementById('itemSize')?.value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 7);
        const randomHex = Math.floor(100 + Math.random() * 900);
        const sku = `${cat}-${brand || 'GEN'}-${size || 'STD'}-${randomHex}`;
        const skuInput = document.getElementById('itemSku');
        if (skuInput) skuInput.value = sku;
    }

    /**
     * Render the Inventory Table
     */
    function renderInventoryTable() {
        const tbody = document.getElementById('inventoryTableBody');
        if (!tbody) return;

        const canViewCosts = AppAuth.hasPermission('inventory_costs');
        const canManage = AppAuth.hasPermission('inventory_manage');

        let filtered = currentItems.filter(item => {
            // Search text
            if (activeFilter.search) {
                const query = activeFilter.search;
                const match =
                    (item.name && item.name.toLowerCase().includes(query)) ||
                    (item.brand && item.brand.toLowerCase().includes(query)) ||
                    (item.size && item.size.toLowerCase().includes(query)) ||
                    (item.sku && item.sku.toLowerCase().includes(query)) ||
                    (item.pattern && item.pattern.toLowerCase().includes(query));
                if (!match) return false;
            }

            // Category filter
            if (activeFilter.category !== 'all' && item.category !== activeFilter.category) {
                return false;
            }

            // Vehicle type filter
            if (activeFilter.vehicleType !== 'all' && item.vehicleType !== activeFilter.vehicleType) {
                return false;
            }

            // Stock status filter
            const stock = item.stock || 0;
            const minAlert = item.minStockAlert || 5;
            if (activeFilter.stockStatus === 'in_stock' && stock <= minAlert) return false;
            if (activeFilter.stockStatus === 'low_stock' && (stock <= 0 || stock > minAlert)) return false;
            if (activeFilter.stockStatus === 'out_of_stock' && stock > 0) return false;

            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${canViewCosts ? 10 : 8}" class="empty-table-cell">
                        <div class="empty-state">
                            <span class="empty-icon">🔍</span>
                            <p>No tyre or tube items found matching your filters.</p>
                            ${canManage ? '<button class="btn btn-primary btn-sm" onclick="AppInventory.openItemModal()">+ Add New Tyre/Tube</button>' : ''}
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        const currency = AppSettings.getCurrency();

        tbody.innerHTML = filtered.map(item => {
            const stock = item.stock || 0;
            const minAlert = item.minStockAlert || 5;
            let stockBadge = '<span class="badge badge-success">In Stock</span>';
            if (stock === 0) {
                stockBadge = '<span class="badge badge-danger">Out of Stock</span>';
            } else if (stock <= minAlert) {
                stockBadge = `<span class="badge badge-warning">Low Stock (${stock})</span>`;
            }

            const categoryBadge = item.category === 'tube'
                ? '<span class="pill pill-tube">Tube</span>'
                : '<span class="pill pill-tyre">Tyre</span>';

            const costCell = canViewCosts
                ? `<td>${currency}${Number(item.costPrice || 0).toFixed(2)}</td>`
                : '';

            const valuationCell = canViewCosts
                ? `<td class="font-semibold text-slate-800">${currency}${(Number(item.costPrice || 0) * stock).toFixed(2)}</td>`
                : '';

            return `
                <tr class="${stock <= minAlert ? 'row-alert' : ''}">
                    <td>
                        <span class="code-sku">${escapeHtml(item.sku || 'N/A')}</span>
                    </td>
                    <td>
                        <div class="item-name-cell">
                            <strong>${escapeHtml(item.name || '')}</strong>
                            <span class="sub-text">${escapeHtml(item.pattern || '')} ${item.location ? '• ' + escapeHtml(item.location) : ''}</span>
                        </div>
                    </td>
                    <td>
                        <span class="brand-tag">${escapeHtml(item.brand || 'Generic')}</span>
                    </td>
                    <td>
                        <span class="size-badge">${escapeHtml(item.size || 'N/A')}</span>
                    </td>
                    <td>${categoryBadge}</td>
                    <td>
                        <span class="vehicle-tag">${escapeHtml(item.vehicleType || 'Universal')}</span>
                    </td>
                    <td>
                        <span class="stock-number font-bold ${stock <= minAlert ? 'text-danger' : 'text-success'}">${stock}</span>
                        ${stockBadge}
                    </td>
                    ${costCell}
                    <td><strong class="text-primary">${currency}${Number(item.sellingPrice || 0).toFixed(2)}</strong></td>
                    ${valuationCell}
                    <td class="action-cell">
                        <div class="btn-group">
                            <button class="btn btn-icon btn-sm" title="Add Stock (Stock In)" onclick="AppInventory.openStockInModal('${item.id}')">
                                📥
                            </button>
                            ${canManage ? `
                                <button class="btn btn-icon btn-sm" title="Edit Item" onclick="AppInventory.openItemModal('${item.id}')">
                                    ✏️
                                </button>
                                <button class="btn btn-icon btn-sm text-danger" title="Delete Item" onclick="AppInventory.deleteItem('${item.id}')">
                                    🗑️
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Update Inventory Summary Cards (On-hand cost valuation, tyre count, tube count, low stock alert)
     */
    function updateInventorySummaryCards() {
        let totalTyres = 0;
        let totalTubes = 0;
        let totalValuation = 0;
        let lowStockCount = 0;

        currentItems.forEach(item => {
            const stock = Number(item.stock || 0);
            const cost = Number(item.costPrice || 0);
            const min = Number(item.minStockAlert || 5);

            if (item.category === 'tyre') {
                totalTyres += stock;
            } else if (item.category === 'tube') {
                totalTubes += stock;
            }

            totalValuation += (stock * cost);

            if (stock <= min) {
                lowStockCount++;
            }
        });

        const currency = AppSettings.getCurrency();

        const totalTyresEl = document.getElementById('summaryTotalTyres');
        if (totalTyresEl) totalTyresEl.textContent = totalTyres.toLocaleString();

        const totalTubesEl = document.getElementById('summaryTotalTubes');
        if (totalTubesEl) totalTubesEl.textContent = totalTubes.toLocaleString();

        const valuationEl = document.getElementById('summaryStockValuation');
        if (valuationEl) {
            if (AppAuth.hasPermission('inventory_costs')) {
                valuationEl.textContent = `${currency}${totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            } else {
                valuationEl.textContent = '🔒 Hidden';
            }
        }

        const lowStockEl = document.getElementById('summaryLowStockCount');
        if (lowStockEl) lowStockEl.textContent = lowStockCount;

        // Populate Low Stock Alert list in Dashboard
        renderLowStockAlerts();
    }

    /**
     * Render the low stock items list for the dashboard
     */
    function renderLowStockAlerts() {
        const container = document.getElementById('dashboardLowStockList');
        if (!container) return;

        const lowItems = currentItems.filter(i => (i.stock || 0) <= (i.minStockAlert || 5));

        if (lowItems.length === 0) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <span class="icon">✅</span>
                    <p>All tyre and tube stocks are healthy above alert thresholds.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = lowItems.slice(0, 6).map(item => `
            <div class="alert-item-row">
                <div class="alert-info">
                    <strong>${escapeHtml(item.brand)} - ${escapeHtml(item.size)}</strong>
                    <span>${escapeHtml(item.name)} (${item.category.toUpperCase()})</span>
                </div>
                <div class="alert-status">
                    <span class="stock-count-alert ${item.stock === 0 ? 'out' : 'low'}">
                        ${item.stock === 0 ? 'Out of Stock' : `${item.stock} left (Min: ${item.minStockAlert})`}
                    </span>
                    <button class="btn btn-sm btn-outline-primary" onclick="AppInventory.openStockInModal('${item.id}')">
                        + Restock
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Open Modal to Add or Edit Item
     */
    function openItemModal(itemId = null) {
        if (!AppAuth.hasPermission('inventory_manage')) {
            AppNotification.toast('Permission Denied', 'Only Admins and Managers can manage inventory items.', 'warning');
            return;
        }

        const modal = document.getElementById('itemModal');
        const form = document.getElementById('itemForm');
        const title = document.getElementById('itemModalTitle');

        if (!modal || !form) return;

        form.reset();

        if (itemId) {
            const item = getItemById(itemId);
            if (!item) return;

            title.textContent = 'Edit Tyre / Tube Item';
            document.getElementById('itemId').value = item.id;
            document.getElementById('itemCategory').value = item.category || 'tyre';
            document.getElementById('itemBrand').value = item.brand || '';
            document.getElementById('itemName').value = item.name || '';
            document.getElementById('itemSize').value = item.size || '';
            document.getElementById('itemPattern').value = item.pattern || '';
            document.getElementById('itemVehicleType').value = item.vehicleType || 'Car';
            document.getElementById('itemPlyRating').value = item.plyRating || '';
            document.getElementById('itemValveType').value = item.valveType || '';
            document.getElementById('itemCostPrice').value = item.costPrice || 0;
            document.getElementById('itemSellingPrice').value = item.sellingPrice || 0;
            const stockInput = document.getElementById('itemStock');
            if (stockInput) stockInput.value = item.stock || 0;
            document.getElementById('itemMinAlert').value = item.minStockAlert || 5;
            document.getElementById('itemSku').value = item.sku || '';
            document.getElementById('itemLocation').value = item.location || '';
        } else {
            title.textContent = 'Add New Tyre / Tube Item';
            document.getElementById('itemId').value = '';
            document.getElementById('itemMinAlert').value = '5';
            const stockInput = document.getElementById('itemStock');
            if (stockInput) stockInput.value = '0';
            generateAutoSKU();
        }

        handleCategoryFieldToggle();
        modal.classList.add('active');
    }

    /**
     * Save Item (Create or Update)
     */
    async function handleSaveItem(e) {
        e.preventDefault();

        const id = document.getElementById('itemId').value;
        const category = document.getElementById('itemCategory').value;
        const brand = document.getElementById('itemBrand').value.trim();
        const name = document.getElementById('itemName').value.trim();
        const size = document.getElementById('itemSize').value.trim();
        const pattern = document.getElementById('itemPattern').value.trim();
        const vehicleType = document.getElementById('itemVehicleType').value;
        const plyRating = document.getElementById('itemPlyRating').value.trim();
        const valveType = document.getElementById('itemValveType').value.trim();
        const costPrice = parseFloat(document.getElementById('itemCostPrice').value) || 0;
        const sellingPrice = parseFloat(document.getElementById('itemSellingPrice').value) || 0;
        const stockInput = document.getElementById('itemStock');
        let stock = stockInput ? (parseInt(stockInput.value, 10) || 0) : 0;
        if (!id && !stockInput) {
            stock = 0; // New items start with 0 stock until Stocked In
        } else if (id && !stockInput) {
            const existingItem = await AppDB.getById('items', id);
            stock = existingItem ? (existingItem.stock || 0) : 0;
        }
        const minStockAlert = parseInt(document.getElementById('itemMinAlert').value, 10) || 5;
        const sku = document.getElementById('itemSku').value.trim();
        const location = document.getElementById('itemLocation').value.trim();

        if (!brand || !name || !size || !sku) {
            AppNotification.toast('Validation Error', 'Please fill in Brand, Item Name, Size, and SKU.', 'error');
            return;
        }

        try {
            if (id) {
                // Update
                const existing = getItemById(id);
                const updated = {
                    ...existing,
                    category,
                    brand,
                    name,
                    size,
                    pattern,
                    vehicleType,
                    plyRating,
                    valveType,
                    costPrice,
                    sellingPrice,
                    stock,
                    minStockAlert,
                    sku,
                    location,
                    updatedAt: new Date().toISOString()
                };
                await AppDB.update('items', updated);
                AppNotification.toast('Success', `Updated ${name} (${brand}) successfully.`, 'success');
            } else {
                // Create
                const newItem = {
                    id: 'item_' + Date.now(),
                    category,
                    brand,
                    name,
                    size,
                    pattern,
                    vehicleType,
                    plyRating,
                    valveType,
                    costPrice,
                    sellingPrice,
                    stock,
                    minStockAlert,
                    sku,
                    location,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                await AppDB.add('items', newItem);
                AppNotification.toast('Success', `Created new ${category.toUpperCase()}: ${brand} ${size}`, 'success');
            }

            document.getElementById('itemModal').classList.remove('active');
            await loadItems();
            // Refresh POS list and Analytics
            if (window.AppPOS) AppPOS.loadProducts();
            if (window.AppAnalytics) AppAnalytics.refreshCharts();
        } catch (err) {
            console.error('Error saving item:', err);
            AppNotification.toast('Error', 'Failed to save item. Make sure SKU is unique.', 'error');
        }
    }

    /**
     * Delete Item
     */
    async function deleteItem(id) {
        if (!AppAuth.hasPermission('inventory_manage')) {
            AppNotification.toast('Access Denied', 'Only Admins and Managers can delete items.', 'warning');
            return;
        }

        const item = getItemById(id);
        if (!item) return;

        const confirmed = confirm(`Are you sure you want to delete ${item.brand} - ${item.size} (${item.name})?`);
        if (!confirmed) return;

        try {
            await AppDB.remove('items', id);
            AppNotification.toast('Deleted', `Item ${item.name} removed from inventory.`, 'info');
            await loadItems();
            if (window.AppPOS) AppPOS.loadProducts();
            if (window.AppAnalytics) AppAnalytics.refreshCharts();
        } catch (err) {
            console.error('Error deleting item:', err);
            AppNotification.toast('Error', 'Failed to delete item.', 'error');
        }
    }

    /**
     * Open Stock In / Purchase Order Modal (For New Stock In OR Editing Existing Purchase)
     */
    async function openStockInModal(preselectedItemId = null, editPurchaseId = null) {
        if (!AppAuth.hasPermission('stock_in')) {
            AppNotification.toast('Permission Denied', 'Your user role cannot perform Stock In.', 'warning');
            return;
        }

        const modal = document.getElementById('stockInModal');
        const form = document.getElementById('stockInForm');
        const select = document.getElementById('stockInItemSelect');
        const modalTitle = document.getElementById('stockInModalTitle');
        const submitBtn = document.getElementById('stockInSubmitBtn');
        const hiddenId = document.getElementById('stockInPurchaseId');
        const itemSelectGroup = document.getElementById('stockInItemSelectGroup');

        if (!modal || !form || !select) return;

        form.reset();

        // Populate items dropdown with tyres and tubes
        select.innerHTML = '<option value="">-- Choose Tyre / Tube to Restock --</option>' +
            currentItems.map(item => `
                <option value="${item.id}" ${item.id === preselectedItemId ? 'selected' : ''}>
                    [${item.category.toUpperCase()}] ${escapeHtml(item.brand)} - ${escapeHtml(item.size)} (${escapeHtml(item.name)}) | Current Stock: ${item.stock || 0}
                </option>
            `).join('');

        if (editPurchaseId) {
            // EDIT MODE
            const pur = await AppDB.getById('purchases', editPurchaseId);
            if (!pur) {
                AppNotification.toast('Not Found', 'Purchase record not found.', 'error');
                return;
            }

            if (modalTitle) modalTitle.textContent = '✏️ Edit Purchase / Stock In Record';
            if (submitBtn) submitBtn.textContent = '💾 Update Record';
            if (hiddenId) hiddenId.value = pur.id;

            const firstItem = (pur.items && pur.items[0]) ? pur.items[0] : null;
            if (firstItem && select) {
                select.value = firstItem.itemId || '';
            }
            // In edit mode, disable item select to avoid stock confusion if needed, or keep enabled
            document.getElementById('stockInQuantity').value = firstItem ? firstItem.quantity : 1;
            document.getElementById('stockInUnitCost').value = firstItem ? firstItem.unitCost : (pur.totalAmount || 0);
            document.getElementById('stockInSupplier').value = pur.supplier || '';
            document.getElementById('stockInSupplierInvoice').value = pur.supplierInvoiceNo || '';
            document.getElementById('stockInRefNo').value = pur.purchaseNo || '';
            document.getElementById('stockInDate').value = pur.date ? new Date(pur.date).toISOString().substring(0, 10) : '';
            document.getElementById('stockInNotes').value = pur.notes || '';
        } else {
            // NEW STOCK IN MODE
            if (modalTitle) modalTitle.textContent = '📥 Stock In / Purchase Receipt';
            if (submitBtn) submitBtn.textContent = '📥 Add Stock to Inventory';
            if (hiddenId) hiddenId.value = '';

            // If preselected, autofill current cost
            if (preselectedItemId) {
                const item = getItemById(preselectedItemId);
                if (item) {
                    document.getElementById('stockInUnitCost').value = item.costPrice || 0;
                }
            }

            // Set default date to today
            document.getElementById('stockInDate').value = new Date().toISOString().substring(0, 10);
            document.getElementById('stockInQuantity').value = 10;

            // Auto generate Purchase reference
            document.getElementById('stockInRefNo').value = 'PUR-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
        }

        select.onchange = () => {
            const chosen = getItemById(select.value);
            if (chosen && !editPurchaseId) {
                document.getElementById('stockInUnitCost').value = chosen.costPrice || 0;
            }
        };

        modal.classList.add('active');
    }

    /**
     * Process Stock In Form Submission (Handles both Create and Edit)
     */
    async function handleStockInSubmit(e) {
        e.preventDefault();

        const editId = document.getElementById('stockInPurchaseId')?.value;
        const itemId = document.getElementById('stockInItemSelect').value;
        const quantity = parseInt(document.getElementById('stockInQuantity').value, 10);
        const unitCost = parseFloat(document.getElementById('stockInUnitCost').value) || 0;
        const supplier = document.getElementById('stockInSupplier').value.trim() || 'General Supplier';
        const invoiceRef = document.getElementById('stockInSupplierInvoice').value.trim() || 'N/A';
        const dateStr = document.getElementById('stockInDate').value || new Date().toISOString();
        const notes = document.getElementById('stockInNotes').value.trim();

        if (editId) {
            // Update existing purchase record (e.g. date, supplier, invoice #, unitCost, quantity)
            try {
                const existingPur = await AppDB.getById('purchases', editId);
                if (!existingPur) {
                    AppNotification.toast('Error', 'Purchase record not found.', 'error');
                    return;
                }

                const prevItem = (existingPur.items && existingPur.items[0]) ? existingPur.items[0] : null;
                const prevQty = prevItem ? Number(prevItem.quantity || 0) : 0;
                const qtyDiff = quantity - prevQty; // Positive if increased, negative if decreased

                const item = getItemById(itemId) || (prevItem ? getItemById(prevItem.itemId) : null);

                // Update purchase record
                existingPur.date = new Date(dateStr).toISOString();
                existingPur.supplier = supplier;
                existingPur.supplierInvoiceNo = invoiceRef;
                existingPur.notes = notes;
                existingPur.totalAmount = quantity * unitCost;
                existingPur.updatedAt = new Date().toISOString();

                if (existingPur.items && existingPur.items[0]) {
                    existingPur.items[0].quantity = quantity;
                    existingPur.items[0].unitCost = unitCost;
                    existingPur.items[0].totalCost = quantity * unitCost;
                    if (item) {
                        existingPur.items[0].itemId = item.id;
                        existingPur.items[0].itemName = `${item.brand} ${item.name} (${item.size})`;
                    }
                }

                await AppDB.update('purchases', existingPur);

                // If quantity changed and item exists, adjust stock
                if (qtyDiff !== 0 && item) {
                    item.stock = Math.max(0, (item.stock || 0) + qtyDiff);
                    if (unitCost > 0) item.costPrice = unitCost;
                    item.updatedAt = new Date().toISOString();
                    await AppDB.update('items', item);
                }

                AppNotification.toast('Purchase Updated', `Record ${existingPur.purchaseNo} updated successfully.`, 'success');
                document.getElementById('stockInModal').classList.remove('active');

                // Reload views
                await loadItems();
                if (window.AppRouter && AppRouter.renderPurchasesHistory) {
                    await AppRouter.renderPurchasesHistory();
                }
                if (window.AppAnalytics) AppAnalytics.refreshCharts();
                return;
            } catch (err) {
                console.error('Error updating purchase:', err);
                AppNotification.toast('Error', 'Failed to update purchase record.', 'error');
                return;
            }
        }

        // --- NEW PURCHASE CREATION ---
        if (!itemId || isNaN(quantity) || quantity <= 0) {
            AppNotification.toast('Validation Error', 'Please select an item and enter a valid quantity > 0.', 'error');
            return;
        }

        const item = getItemById(itemId);
        if (!item) return;

        const purchaseRecord = {
            id: 'pur_' + Date.now(),
            purchaseNo: document.getElementById('stockInRefNo').value || ('PUR-' + Date.now()),
            date: new Date(dateStr).toISOString(),
            supplier: supplier,
            supplierInvoiceNo: invoiceRef,
            totalAmount: quantity * unitCost,
            paymentStatus: 'paid',
            notes: notes,
            items: [
                {
                    itemId: item.id,
                    itemName: `${item.brand} ${item.name} (${item.size})`,
                    brand: item.brand,
                    size: item.size,
                    quantity: quantity,
                    unitCost: unitCost,
                    totalCost: quantity * unitCost
                }
            ]
        };

        try {
            await AppDB.processStockIn(purchaseRecord);
            AppNotification.toast('Stock Added', `Added ${quantity} units of ${item.brand} ${item.size}. Stock updated to ${(item.stock || 0) + quantity}.`, 'success');
            document.getElementById('stockInModal').classList.remove('active');
            await loadItems();
            if (window.AppPOS) AppPOS.loadProducts();
            if (window.AppAnalytics) AppAnalytics.refreshCharts();
            if (window.AppRouter && AppRouter.renderPurchasesHistory) {
                await AppRouter.renderPurchasesHistory();
            }
        } catch (err) {
            console.error('Error processing Stock In:', err);
            AppNotification.toast('Error', 'Failed to add stock. Please try again.', 'error');
        }
    }

    /**
     * Utility to escape HTML strings
     */
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
        loadItems,
        getItems,
        getItemById,
        renderInventoryTable,
        openItemModal,
        openStockInModal,
        deleteItem
    };
})();

// Export for module systems and attach to global window
window.AppInventory = AppInventory;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppInventory;
}
