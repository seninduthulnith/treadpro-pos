/**
 * TreadPro Point of Sale (POS) Module
 * Handles fast catalogue browsing, cart management, customer details capture,
 * vehicle plate tracking, stock deduction checkout, and triggers invoices.
 */

const AppPOS = (function () {
    'use strict';

    let cart = []; // Array of { item, quantity, discount, customPrice }
    let products = [];
    let services = [];
    let activeCategory = 'all';
    let searchQuery = '';
    let sizeFilter = '';
    let brandFilter = '';

    /**
     * Initialize POS Module
     */
    async function init() {
        await loadProducts();
        bindEvents();
        renderCart();
    }

    /**
     * Reload products and services from database
     */
    async function loadProducts() {
        products = await AppDB.getAll('items');
        services = await AppDB.getAll('services');
        populateBrandAndSizeDropdowns();
        renderProductGrid();
    }

    /**
     * Populate filter dropdowns dynamically from available inventory
     */
    function populateBrandAndSizeDropdowns() {
        const brandSelect = document.getElementById('posBrandFilter');
        const sizeSelect = document.getElementById('posSizeFilter');

        if (brandSelect) {
            const brands = Array.from(new Set(products.map(p => p.brand).filter(Boolean))).sort();
            brandSelect.innerHTML = '<option value="">All Brands</option>' +
                brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
        }

        if (sizeSelect) {
            const sizes = Array.from(new Set(products.map(p => p.size).filter(Boolean))).sort();
            sizeSelect.innerHTML = '<option value="">All Sizes</option>' +
                sizes.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
        }
    }

    /**
     * Bind UI event listeners
     */
    function bindEvents() {
        // Search bar
        const searchInput = document.getElementById('posSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.toLowerCase().trim();
                renderProductGrid();
            });

            // Barcode scanner listener (Enter key triggers immediate add if exact SKU match)
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const barcode = searchInput.value.trim();
                    const exactMatch = products.find(p => p.sku && p.sku.toLowerCase() === barcode.toLowerCase());
                    if (exactMatch) {
                        addToCart(exactMatch.id);
                        searchInput.value = '';
                        searchQuery = '';
                        renderProductGrid();
                        AppNotification.toast('Barcode Scanned', `Added ${exactMatch.brand} ${exactMatch.size}`, 'info');
                    }
                }
            });
        }

        // Category pills (All, Tyres, Tubes, Services)
        document.querySelectorAll('.pos-cat-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.pos-cat-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                activeCategory = tab.getAttribute('data-cat') || 'all';
                renderProductGrid();
            });
        });

        // Brand filter
        const brandSelect = document.getElementById('posBrandFilter');
        if (brandSelect) {
            brandSelect.addEventListener('change', (e) => {
                brandFilter = e.target.value;
                renderProductGrid();
            });
        }

        // Size filter
        const sizeSelect = document.getElementById('posSizeFilter');
        if (sizeSelect) {
            sizeSelect.addEventListener('change', (e) => {
                sizeFilter = e.target.value;
                renderProductGrid();
            });
        }

        // Clear cart button
        const clearCartBtn = document.getElementById('clearCartBtn');
        if (clearCartBtn) {
            clearCartBtn.addEventListener('click', () => {
                if (cart.length === 0) return;
                if (confirm('Are you sure you want to clear the active cart?')) {
                    clearCart();
                }
            });
        }

        // Checkout Button
        const checkoutBtn = document.getElementById('posCheckoutBtn');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', handleCheckout);
        }

        // Amount Tendered listener for Change calculation
        const tenderedInput = document.getElementById('posAmountTendered');
        if (tenderedInput) {
            tenderedInput.addEventListener('input', calculateChange);
        }

        // Quick cash preset buttons ($10, $20, $50, $100, Exact)
        document.querySelectorAll('.btn-quick-cash').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const val = btn.getAttribute('data-amount');
                if (val === 'exact') {
                    const total = calculateGrandTotal();
                    tenderedInput.value = total.toFixed(2);
                } else {
                    tenderedInput.value = parseFloat(val).toFixed(2);
                }
                calculateChange();
            });
        });

        // Discount input listener
        const discountInput = document.getElementById('posDiscountInput');
        if (discountInput) {
            discountInput.addEventListener('input', () => {
                renderCartSummary();
                calculateChange();
            });
        }
    }

    /**
     * Render the POS Product Grid
     */
    function renderProductGrid() {
        const grid = document.getElementById('posProductGrid');
        if (!grid) return;

        let displayItems = [];

        // Mix in products & services based on activeCategory
        if (activeCategory === 'service') {
            displayItems = services.filter(s => s.active !== false).map(s => ({
                id: s.id,
                name: s.name,
                category: 'service',
                brand: 'Service',
                size: `${s.durationMinutes || 15} mins`,
                pattern: s.category || 'Maintenance',
                sellingPrice: s.price,
                stock: 999, // infinite
                vehicleType: 'All',
                sku: 'SRV-' + s.id.substring(4)
            }));
        } else {
            displayItems = products.filter(p => {
                if (activeCategory !== 'all' && p.category !== activeCategory) {
                    return false;
                }
                if (brandFilter && p.brand !== brandFilter) {
                    return false;
                }
                if (sizeFilter && p.size !== sizeFilter) {
                    return false;
                }
                if (searchQuery) {
                    const match =
                        (p.name && p.name.toLowerCase().includes(searchQuery)) ||
                        (p.brand && p.brand.toLowerCase().includes(searchQuery)) ||
                        (p.size && p.size.toLowerCase().includes(searchQuery)) ||
                        (p.sku && p.sku.toLowerCase().includes(searchQuery));
                    if (!match) return false;
                }
                return true;
            });
        }

        if (displayItems.length === 0) {
            grid.innerHTML = `
                <div class="pos-empty-grid">
                    <span class="icon">🔍</span>
                    <p>No products found matching "${escapeHtml(searchQuery || 'current filters')}".</p>
                    <button class="btn btn-outline-primary btn-sm" onclick="AppPOS.resetFilters()">Clear Filters</button>
                </div>
            `;
            return;
        }

        const currency = AppSettings.getCurrency();

        grid.innerHTML = displayItems.map(item => {
            const stock = item.category === 'service' ? 999 : (item.stock || 0);
            const isOut = stock <= 0;
            const isLow = stock > 0 && stock <= (item.minStockAlert || 5);

            let stockTag = `<span class="pos-card-stock in">${stock} in stock</span>`;
            if (item.category === 'service') {
                stockTag = `<span class="pos-card-stock service">Labor Service</span>`;
            } else if (isOut) {
                stockTag = `<span class="pos-card-stock out">Out of Stock</span>`;
            } else if (isLow) {
                stockTag = `<span class="pos-card-stock low">Low: ${stock} left</span>`;
            }

            const pillClass = item.category === 'tube' ? 'pill-tube' : (item.category === 'service' ? 'pill-service' : 'pill-tyre');

            return `
                <div class="pos-card ${isOut ? 'disabled' : ''}" onclick="AppPOS.addToCart('${item.id}', '${item.category}')">
                    <div class="pos-card-header">
                        <span class="pill ${pillClass}">${item.category.toUpperCase()}</span>
                        <span class="pos-card-vehicle">${escapeHtml(item.vehicleType || '')}</span>
                    </div>
                    <div class="pos-card-body">
                        <div class="pos-card-brand">${escapeHtml(item.brand)}</div>
                        <div class="pos-card-size">${escapeHtml(item.size)}</div>
                        <div class="pos-card-name">${escapeHtml(item.name)}</div>
                    </div>
                    <div class="pos-card-footer">
                        <div class="pos-card-price">${currency}${Number(item.sellingPrice || 0).toFixed(2)}</div>
                        ${stockTag}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Add product or service to Cart
     */
    function addToCart(itemId, category = 'tyre') {
        let targetItem = null;
        if (category === 'service') {
            const s = services.find(x => x.id === itemId);
            if (s) {
                targetItem = {
                    id: s.id,
                    name: s.name,
                    category: 'service',
                    brand: 'Service',
                    size: 'N/A',
                    costPrice: 0,
                    sellingPrice: s.price,
                    stock: 999
                };
            }
        } else {
            targetItem = products.find(p => p.id === itemId);
        }

        if (!targetItem) return;

        // Check stock availability
        if (targetItem.category !== 'service' && (targetItem.stock || 0) <= 0) {
            AppNotification.toast('Stock Alert', `Item ${targetItem.brand} ${targetItem.size} is out of stock!`, 'warning');
            return;
        }

        const existingCartIndex = cart.findIndex(c => c.item.id === targetItem.id);

        if (existingCartIndex > -1) {
            const currentQty = cart[existingCartIndex].quantity;
            if (targetItem.category !== 'service' && currentQty + 1 > targetItem.stock) {
                AppNotification.toast('Stock Limit', `Only ${targetItem.stock} units available in stock.`, 'warning');
                return;
            }
            cart[existingCartIndex].quantity += 1;
        } else {
            cart.push({
                item: targetItem,
                quantity: 1,
                discount: 0,
                unitPrice: targetItem.sellingPrice
            });
        }

        renderCart();
    }

    /**
     * Update quantity of item in cart
     */
    function updateCartQuantity(index, delta) {
        if (!cart[index]) return;

        const cartItem = cart[index];
        const newQty = cartItem.quantity + delta;

        if (newQty <= 0) {
            cart.splice(index, 1);
        } else {
            if (cartItem.item.category !== 'service' && newQty > cartItem.item.stock) {
                AppNotification.toast('Stock Limit', `Only ${cartItem.item.stock} units available in stock.`, 'warning');
                return;
            }
            cartItem.quantity = newQty;
        }

        renderCart();
    }

    /**
     * Remove item from cart
     */
    function removeCartItem(index) {
        if (!cart[index]) return;
        cart.splice(index, 1);
        renderCart();
    }

    /**
     * Clear active cart
     */
    function clearCart() {
        cart = [];
        const discountInput = document.getElementById('posDiscountInput');
        if (discountInput) discountInput.value = '0';
        const tenderedInput = document.getElementById('posAmountTendered');
        if (tenderedInput) tenderedInput.value = '';
        renderCart();
    }

    /**
     * Render the Cart Items and Summary
     */
    function renderCart() {
        const cartContainer = document.getElementById('posCartItemsContainer');
        const emptyState = document.getElementById('posCartEmpty');
        const badgeCount = document.getElementById('cartItemCountBadge');

        const totalItemsCount = cart.reduce((acc, c) => acc + c.quantity, 0);
        if (badgeCount) badgeCount.textContent = totalItemsCount;

        if (!cartContainer) return;

        if (cart.length === 0) {
            cartContainer.innerHTML = '';
            if (emptyState) emptyState.style.display = 'flex';
            renderCartSummary();
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        const currency = AppSettings.getCurrency();

        cartContainer.innerHTML = cart.map((cartItem, idx) => {
            const lineTotal = cartItem.quantity * cartItem.unitPrice;
            return `
                <div class="cart-row">
                    <div class="cart-row-main">
                        <div class="cart-row-title">
                            <strong>${escapeHtml(cartItem.item.brand)}</strong> ${escapeHtml(cartItem.item.size)}
                        </div>
                        <div class="cart-row-meta">
                            ${escapeHtml(cartItem.item.name)} • ${currency}${cartItem.unitPrice.toFixed(2)} each
                        </div>
                    </div>
                    <div class="cart-row-actions">
                        <div class="qty-control">
                            <button class="btn-qty" onclick="AppPOS.updateCartQuantity(${idx}, -1)">−</button>
                            <span class="qty-val">${cartItem.quantity}</span>
                            <button class="btn-qty" onclick="AppPOS.updateCartQuantity(${idx}, 1)">+</button>
                        </div>
                        <div class="cart-row-price">
                            ${currency}${lineTotal.toFixed(2)}
                        </div>
                        <button class="btn-remove-item" onclick="AppPOS.removeCartItem(${idx})" title="Remove item">✕</button>
                    </div>
                </div>
            `;
        }).join('');

        renderCartSummary();
        calculateChange();
    }

    /**
     * Calculate Subtotal, Tax, Discount, and Grand Total
     */
    function calculateTotals() {
        const subtotal = cart.reduce((sum, c) => sum + (c.quantity * c.unitPrice), 0);
        const discountInput = document.getElementById('posDiscountInput');
        const discountAmount = parseFloat(discountInput ? discountInput.value : 0) || 0;

        const discountedSubtotal = Math.max(0, subtotal - discountAmount);

        const taxEnabled = AppSettings.get('taxEnabled') !== false;
        const taxRate = taxEnabled ? (parseFloat(AppSettings.get('taxRate')) || 0) : 0;
        const taxAmount = (discountedSubtotal * taxRate) / 100;

        const grandTotal = discountedSubtotal + taxAmount;

        return {
            subtotal,
            discountAmount,
            taxRate,
            taxAmount,
            grandTotal
        };
    }

    function calculateGrandTotal() {
        return calculateTotals().grandTotal;
    }

    /**
     * Render the Cart Totals Summary
     */
    function renderCartSummary() {
        const totals = calculateTotals();
        const currency = AppSettings.getCurrency();

        const subtotalEl = document.getElementById('posSubtotal');
        if (subtotalEl) subtotalEl.textContent = `${currency}${totals.subtotal.toFixed(2)}`;

        const taxRateEl = document.getElementById('posTaxRateLabel');
        if (taxRateEl) taxRateEl.textContent = `Tax (${totals.taxRate}%)`;

        const taxAmountEl = document.getElementById('posTaxAmount');
        if (taxAmountEl) taxAmountEl.textContent = `${currency}${totals.taxAmount.toFixed(2)}`;

        const grandTotalEl = document.getElementById('posGrandTotal');
        if (grandTotalEl) grandTotalEl.textContent = `${currency}${totals.grandTotal.toFixed(2)}`;
    }

    /**
     * Calculate and display change to return to customer
     */
    function calculateChange() {
        const tenderedInput = document.getElementById('posAmountTendered');
        const changeDisplay = document.getElementById('posChangeReturn');
        if (!tenderedInput || !changeDisplay) return;

        const tendered = parseFloat(tenderedInput.value) || 0;
        const grandTotal = calculateGrandTotal();
        const currency = AppSettings.getCurrency();

        if (tendered >= grandTotal && grandTotal > 0) {
            const change = tendered - grandTotal;
            changeDisplay.textContent = `${currency}${change.toFixed(2)}`;
            changeDisplay.classList.add('text-success');
        } else {
            changeDisplay.textContent = `${currency}0.00`;
            changeDisplay.classList.remove('text-success');
        }
    }

    /**
     * Process Checkout & Invoice Generation
     */
    async function handleCheckout() {
        if (cart.length === 0) {
            AppNotification.toast('Empty Cart', 'Please add tyres, tubes or services to the cart before checking out.', 'warning');
            return;
        }

        // Customer details
        const custName = document.getElementById('posCustName')?.value.trim() || 'Walk-in Customer';
        const custPhone = document.getElementById('posCustPhone')?.value.trim() || '';
        const vehicleNo = document.getElementById('posVehicleNo')?.value.trim().toUpperCase() || 'N/A';
        const vehicleModel = document.getElementById('posVehicleModel')?.value.trim() || '';
        const paymentMethod = document.getElementById('posPaymentMethod')?.value || 'cash';
        const tenderedInput = document.getElementById('posAmountTendered');
        const tenderedVal = parseFloat(tenderedInput ? tenderedInput.value : 0) || 0;

        const totals = calculateTotals();
        const amountPaid = tenderedVal > 0 ? tenderedVal : totals.grandTotal;
        const change = Math.max(0, amountPaid - totals.grandTotal);

        // Verification for cash payment
        if (paymentMethod === 'cash' && tenderedVal > 0 && tenderedVal < totals.grandTotal) {
            AppNotification.toast('Insufficient Amount', `Amount tendered (${AppSettings.getCurrency()}${tenderedVal}) is less than total (${AppSettings.getCurrency()}${totals.grandTotal.toFixed(2)})`, 'error');
            return;
        }

        // Generate Invoice Number
        const invoicePrefix = AppSettings.get('invoicePrefix') || 'INV-';
        const randomInvoiceSuffix = String(Math.floor(1000 + Math.random() * 9000));
        const invoiceNo = `${invoicePrefix}${new Date().getFullYear()}-${randomInvoiceSuffix}`;

        const currentUser = AppAuth.getCurrentUser();

        // Build Sale Data Structure
        const saleRecord = {
            id: 'sale_' + Date.now(),
            invoiceNo: invoiceNo,
            date: new Date().toISOString(),
            customer: {
                name: custName,
                phone: custPhone,
                vehicleNo: vehicleNo,
                vehicleModel: vehicleModel
            },
            items: cart.map(c => ({
                itemId: c.item.id,
                itemName: `${c.item.brand} ${c.item.name}`,
                brand: c.item.brand,
                size: c.item.size,
                category: c.item.category,
                quantity: c.quantity,
                unitPrice: c.unitPrice,
                costPrice: c.item.costPrice || 0,
                discount: c.discount || 0,
                total: c.quantity * c.unitPrice
            })),
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            taxRate: totals.taxRate,
            taxAmount: totals.taxAmount,
            totalAmount: totals.grandTotal,
            paymentMethod: paymentMethod,
            amountPaid: amountPaid,
            change: change,
            cashier: currentUser ? currentUser.username : 'admin',
            status: 'completed'
        };

        try {
            // Save sale and atomically deduct inventory stock
            await AppDB.processSaleCheckout(saleRecord);

            AppNotification.toast('Sale Completed!', `Invoice #${invoiceNo} processed successfully. Stock deducted.`, 'success');

            // Reset customer form & clear cart
            document.getElementById('posCustName').value = '';
            document.getElementById('posCustPhone').value = '';
            document.getElementById('posVehicleNo').value = '';
            document.getElementById('posVehicleModel').value = '';
            clearCart();

            // Refresh products to reflect new stock levels
            await loadProducts();
            if (window.AppInventory) AppInventory.loadItems();
            if (window.AppAnalytics) AppAnalytics.refreshCharts();

            // Trigger and display Invoice Modal for Printing / PDF download
            if (window.AppInvoice) {
                AppInvoice.showInvoice(saleRecord);
            }
        } catch (err) {
            console.error('Checkout error:', err);
            AppNotification.toast('Transaction Failed', 'Could not complete checkout. Check database connection.', 'error');
        }
    }

    /**
     * Reset POS filters
     */
    function resetFilters() {
        searchQuery = '';
        brandFilter = '';
        sizeFilter = '';
        activeCategory = 'all';

        const sInput = document.getElementById('posSearchInput');
        if (sInput) sInput.value = '';

        const bSelect = document.getElementById('posBrandFilter');
        if (bSelect) bSelect.value = '';

        const szSelect = document.getElementById('posSizeFilter');
        if (szSelect) szSelect.value = '';

        document.querySelectorAll('.pos-cat-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-cat') === 'all');
        });

        renderProductGrid();
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
        loadProducts,
        renderProductGrid,
        addToCart,
        updateCartQuantity,
        removeCartItem,
        clearCart,
        resetFilters,
        handleCheckout
    };
})();

// Export for module systems and attach to global window
window.AppPOS = AppPOS;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppPOS;
}
