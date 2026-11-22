/**
 * TreadPro Money Management Module
 * Tracks Extra Expenses (Shop overheads: Rent, Electricity, Salaries, Misc)
 * and Extra Investments (Capital injection: Loans, Owner equity, Partner funds).
 * 
 * Automatically updates the Dashboard Weekly Cash & Restock Re-investment table!
 */

const AppMoney = (function () {
    'use strict';

    let allExpenses = [];
    let allInvestments = [];
    let currentFilterTab = 'all'; // 'all', 'expenses', 'investments'
    let searchQuery = '';
    let filterStartDate = null; // YYYY-MM-DD or null
    let filterEndDate = null;   // YYYY-MM-DD or null

    /**
     * Initialize Money Management Module
     */
    async function init() {
        bindEvents();
        await loadEntries();
    }

    /**
     * Bind DOM UI Events
     */
    function bindEvents() {
        // Tab buttons (All, Expenses, Investments)
        const tabBtns = document.querySelectorAll('.money-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilterTab = btn.getAttribute('data-tab');
                renderLedgerTable();
            });
        });

        // Search input
        const searchInput = document.getElementById('moneySearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = (e.target.value || '').toLowerCase().trim();
                renderLedgerTable();
            });
        }

        // Date Range Filter buttons
        const btnApply = document.getElementById('btnApplyMoneyFilter');
        if (btnApply) {
            btnApply.addEventListener('click', applyDateFilter);
        }

        const btnReset = document.getElementById('btnResetMoneyFilter');
        if (btnReset) {
            btnReset.addEventListener('click', resetDateFilter);
        }

        // Expense Form submission
        const formExpense = document.getElementById('formExpenseEntry');
        if (formExpense) {
            formExpense.addEventListener('submit', handleSaveExpense);
        }

        // Investment Form submission
        const formInvestment = document.getElementById('formInvestmentEntry');
        if (formInvestment) {
            formInvestment.addEventListener('submit', handleSaveInvestment);
        }
    }

    /**
     * Apply date range filter
     */
    function applyDateFilter() {
        const startInput = document.getElementById('moneyStartDate');
        const endInput = document.getElementById('moneyEndDate');
        const sVal = startInput ? startInput.value : '';
        const eVal = endInput ? endInput.value : '';

        if (!sVal && !eVal) {
            filterStartDate = null;
            filterEndDate = null;
        } else {
            filterStartDate = sVal || null;
            filterEndDate = eVal || null;
        }

        updateSummaryCards();
        renderLedgerTable();

        const statusEl = document.getElementById('moneyFilterStatusText');
        if (statusEl) {
            if (filterStartDate || filterEndDate) {
                statusEl.textContent = `Filtered: ${filterStartDate || 'Beginning'} to ${filterEndDate || 'Now'}`;
                statusEl.style.color = '#2563eb';
            } else {
                statusEl.textContent = 'Showing All Time Records';
                statusEl.style.color = '#64748b';
            }
        }

        if (window.AppNotification) {
            AppNotification.toast('Filtered', `Money transactions filtered: ${filterStartDate || 'Beginning'} to ${filterEndDate || 'Now'}`, 'info');
        }
    }

    /**
     * Reset date range filter
     */
    function resetDateFilter() {
        const startInput = document.getElementById('moneyStartDate');
        const endInput = document.getElementById('moneyEndDate');
        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';

        filterStartDate = null;
        filterEndDate = null;

        const statusEl = document.getElementById('moneyFilterStatusText');
        if (statusEl) {
            statusEl.textContent = 'Showing All Time Records';
            statusEl.style.color = '#64748b';
        }

        updateSummaryCards();
        renderLedgerTable();

        if (window.AppNotification) {
            AppNotification.toast('Reset', 'Money records reset to all time.', 'info');
        }
    }

    /**
     * Helper to test if date string falls within active date filter
     */
    function isWithinDateFilter(dateStr) {
        if (!filterStartDate && !filterEndDate) return true;
        const startTs = filterStartDate ? new Date(filterStartDate + 'T00:00:00').getTime() : 0;
        const endTs = filterEndDate ? new Date(filterEndDate + 'T23:59:59.999').getTime() : Infinity;
        const t = new Date(dateStr).getTime();
        return t >= startTs && t <= endTs;
    }

    /**
     * Load expenses and investments from IndexedDB
     */
    async function loadEntries() {
        try {
            allExpenses = await AppDB.getAll('expenses');
            allInvestments = await AppDB.getAll('investments');

            // Sort newest first
            allExpenses.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
            allInvestments.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

            updateSummaryCards();
            renderLedgerTable();
        } catch (err) {
            console.error('Error loading money entries:', err);
        }
    }

    /**
     * Update top Summary Cards according to active Date Range
     */
    function updateSummaryCards() {
        const currency = AppSettings.getCurrency();

        let totalExpenses = 0;
        let totalInvestments = 0;
        let filteredExpCount = 0;
        let filteredInvCount = 0;

        allExpenses.forEach(exp => {
            const expDate = exp.date || exp.createdAt;
            if (isWithinDateFilter(expDate)) {
                totalExpenses += Number(exp.amount || 0);
                filteredExpCount++;
            }
        });

        allInvestments.forEach(inv => {
            const invDate = inv.date || inv.createdAt;
            if (isWithinDateFilter(invDate)) {
                totalInvestments += Number(inv.amount || 0);
                filteredInvCount++;
            }
        });

        const netImpact = totalInvestments - totalExpenses;

        const totalExpEl = document.getElementById('moneyTotalExpenses');
        if (totalExpEl) {
            totalExpEl.textContent = `${currency}${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }

        const expCountEl = document.getElementById('moneyExpCount');
        if (expCountEl) {
            expCountEl.textContent = `${filteredExpCount} recorded expense${filteredExpCount === 1 ? '' : 's'}`;
        }

        const totalInvEl = document.getElementById('moneyTotalInvestments');
        if (totalInvEl) {
            totalInvEl.textContent = `${currency}${totalInvestments.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }

        const invCountEl = document.getElementById('moneyInvCount');
        if (invCountEl) {
            invCountEl.textContent = `${filteredInvCount} recorded investment${filteredInvCount === 1 ? '' : 's'}`;
        }

        const netEl = document.getElementById('moneyNetImpact');
        if (netEl) {
            const prefix = netImpact >= 0 ? '+' : '';
            netEl.textContent = `${prefix}${currency}${netImpact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            netEl.style.color = netImpact >= 0 ? '#059669' : '#dc2626';
        }

        const netCountEl = document.getElementById('moneyNetCount');
        if (netCountEl) {
            netCountEl.textContent = filterStartDate || filterEndDate ? 'Net balance for selected period' : 'Net balance across all time';
        }
    }

    /**
     * Render the combined ledger table
     */
    function renderLedgerTable() {
        const tbody = document.getElementById('moneyLedgerTableBody');
        if (!tbody) return;

        const currency = AppSettings.getCurrency();

        // Merge entries with unified structure
        let combined = [];

        if (currentFilterTab === 'all' || currentFilterTab === 'expenses') {
            allExpenses.forEach(exp => {
                combined.push({
                    type: 'expense',
                    id: exp.id,
                    date: exp.date || exp.createdAt,
                    categoryOrSource: exp.category || 'Other',
                    description: exp.description || '',
                    paymentMethod: exp.paymentMethod || 'cash',
                    amount: Number(exp.amount || 0),
                    addedBy: exp.addedBy || 'Admin',
                    raw: exp
                });
            });
        }

        if (currentFilterTab === 'all' || currentFilterTab === 'investments') {
            allInvestments.forEach(inv => {
                combined.push({
                    type: 'investment',
                    id: inv.id,
                    date: inv.date || inv.createdAt,
                    categoryOrSource: inv.source || 'Other',
                    description: inv.description || '',
                    paymentMethod: inv.paymentMethod || 'cash',
                    amount: Number(inv.amount || 0),
                    addedBy: inv.addedBy || 'Admin',
                    raw: inv
                });
            });
        }

        // Sort descending by date
        combined.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Filter by date range
        if (filterStartDate || filterEndDate) {
            combined = combined.filter(item => isWithinDateFilter(item.date));
        }

        // Filter by search query
        if (searchQuery) {
            combined = combined.filter(item => {
                return (item.categoryOrSource || '').toLowerCase().includes(searchQuery) ||
                       (item.description || '').toLowerCase().includes(searchQuery) ||
                       (item.addedBy || '').toLowerCase().includes(searchQuery) ||
                       (item.paymentMethod || '').toLowerCase().includes(searchQuery) ||
                       String(item.amount).includes(searchQuery);
            });
        }

        if (combined.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-6 text-slate-500">
                        No transactions recorded yet. Click <strong>+ Record Expense</strong> or <strong>+ Add Investment</strong> above.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = combined.map(item => {
            const isExp = item.type === 'expense';
            const typeBadge = isExp
                ? `<span class="badge badge-danger" style="background: #fee2e2; color: #991b1b; font-weight: 700; border: 1px solid #fca5a5;">🔻 Expense (-)</span>`
                : `<span class="badge badge-success" style="background: #dcfce7; color: #166534; font-weight: 700; border: 1px solid #86efac;">🟢 Investment (+)</span>`;

            const amountDisplay = isExp
                ? `<strong style="color: #dc2626; font-size: 14px;">-${currency}${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`
                : `<strong style="color: #059669; font-size: 14px;">+${currency}${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;

            const formattedDate = new Date(item.date).toLocaleDateString('en-GB', {
                year: 'numeric',
                month: 'short',
                day: '2-digit'
            });

            return `
                <tr>
                    <td><strong>${formattedDate}</strong></td>
                    <td>${typeBadge}</td>
                    <td><strong>${escapeHtml(item.categoryOrSource)}</strong></td>
                    <td>
                        <div class="text-sm">${escapeHtml(item.description || '-')}</div>
                    </td>
                    <td>
                        <span class="badge badge-payment">${escapeHtml((item.paymentMethod || 'cash').toUpperCase())}</span>
                    </td>
                    <td>${amountDisplay}</td>
                    <td class="action-cell">
                        <button class="btn btn-sm btn-outline-danger" title="Delete entry" onclick="AppMoney.deleteEntry('${item.type}', '${item.id}')">
                            🗑️
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Open Expense Entry Modal
     */
    function openExpenseModal() {
        const form = document.getElementById('formExpenseEntry');
        if (form) form.reset();

        const dateInput = document.getElementById('expDate');
        if (dateInput) {
            dateInput.value = new Date().toISOString().substring(0, 10);
        }

        const modal = document.getElementById('modalAddExpense');
        if (modal) modal.classList.add('active');
    }

    /**
     * Open Investment Entry Modal
     */
    function openInvestmentModal() {
        const form = document.getElementById('formInvestmentEntry');
        if (form) form.reset();

        const dateInput = document.getElementById('invDate');
        if (dateInput) {
            dateInput.value = new Date().toISOString().substring(0, 10);
        }

        const modal = document.getElementById('modalAddInvestment');
        if (modal) modal.classList.add('active');
    }

    /**
     * Handle Expense Save
     */
    async function handleSaveExpense(e) {
        e.preventDefault();

        const currentUser = AppAuth.getCurrentUser();
        const dateVal = document.getElementById('expDate').value || new Date().toISOString().substring(0, 10);
        const categoryVal = document.getElementById('expCategory').value;
        const amountVal = parseFloat(document.getElementById('expAmount').value);
        const paymentMethodVal = document.getElementById('expPaymentMethod').value;
        const descVal = document.getElementById('expDescription').value.trim();

        if (isNaN(amountVal) || amountVal <= 0) {
            AppNotification.toast('Invalid Amount', 'Please enter a valid expense amount greater than 0.', 'error');
            return;
        }

        const newExpense = {
            id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            date: dateVal,
            category: categoryVal,
            amount: amountVal,
            paymentMethod: paymentMethodVal,
            description: descVal,
            addedBy: currentUser ? (currentUser.fullName || currentUser.username) : 'Manager',
            createdAt: new Date().toISOString()
        };

        try {
            await AppDB.add('expenses', newExpense);
            closeModal('modalAddExpense');
            await loadEntries();

            // Refresh Analytics Dashboard charts and Rolling Cash Table
            if (window.AppAnalytics) {
                await AppAnalytics.refreshCharts();
            }

            AppNotification.toast('Expense Recorded', `Deducted Rs. ${amountVal.toFixed(2)} from available cash.`, 'success');
        } catch (err) {
            console.error('Error saving expense:', err);
            AppNotification.toast('Save Failed', 'Could not save expense entry.', 'error');
        }
    }

    /**
     * Handle Investment Save
     */
    async function handleSaveInvestment(e) {
        e.preventDefault();

        const currentUser = AppAuth.getCurrentUser();
        const dateVal = document.getElementById('invDate').value || new Date().toISOString().substring(0, 10);
        const sourceVal = document.getElementById('invSource').value;
        const amountVal = parseFloat(document.getElementById('invAmount').value);
        const paymentMethodVal = document.getElementById('invPaymentMethod').value;
        const descVal = document.getElementById('invDescription').value.trim();

        if (isNaN(amountVal) || amountVal <= 0) {
            AppNotification.toast('Invalid Amount', 'Please enter a valid investment amount greater than 0.', 'error');
            return;
        }

        const newInvestment = {
            id: 'inv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            date: dateVal,
            source: sourceVal,
            amount: amountVal,
            paymentMethod: paymentMethodVal,
            description: descVal,
            addedBy: currentUser ? (currentUser.fullName || currentUser.username) : 'Manager',
            createdAt: new Date().toISOString()
        };

        try {
            await AppDB.add('investments', newInvestment);
            closeModal('modalAddInvestment');
            await loadEntries();

            // Refresh Analytics Dashboard charts and Rolling Cash Table
            if (window.AppAnalytics) {
                await AppAnalytics.refreshCharts();
            }

            AppNotification.toast('Investment Added', `Added Rs. ${amountVal.toFixed(2)} to available cash flow.`, 'success');
        } catch (err) {
            console.error('Error saving investment:', err);
            AppNotification.toast('Save Failed', 'Could not save investment entry.', 'error');
        }
    }

    /**
     * Delete an entry
     */
    async function deleteEntry(type, id) {
        if (!confirm(`Are you sure you want to delete this ${type} record? This will adjust your rolling cash calculation.`)) {
            return;
        }

        try {
            const storeName = type === 'expense' ? 'expenses' : 'investments';
            await AppDB.remove(storeName, id);
            await loadEntries();

            if (window.AppAnalytics) {
                await AppAnalytics.refreshCharts();
            }

            AppNotification.toast('Deleted', `${type.toUpperCase()} record removed.`, 'info');
        } catch (err) {
            console.error('Error deleting entry:', err);
            AppNotification.toast('Error', 'Failed to delete record.', 'error');
        }
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
        loadEntries,
        openExpenseModal,
        openInvestmentModal,
        deleteEntry
    };
})();

// Attach to window
window.AppMoney = AppMoney;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppMoney;
}
