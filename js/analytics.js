/**
 * TreadPro Analytics & Reporting Module
 * Computes and renders graphs for:
 * 1. Top Selling Tyres (Volume & Revenue)
 * 2. Top Selling Tubes (Volume & Revenue)
 * 3. Weekly On-Hand Stock Cost & Total Valuation (Thursday cycle + Stock Cost + Revenue dual area lines)
 * 4. Weekly Re-investment & Restock Cash Flow Table (calculates on-hand money balance to reinvest in buying stock)
 * 5. Weekly Revenue vs Gross Profit (Thursday cycle)
 * 6. Category & Vehicle distribution
 * Supports Date-Range Filtering (Start Date to End Date)
 */

const AppAnalytics = (function () {
    'use strict';

    let topTyresChart = null;
    let topTubesChart = null;
    let stockCostChart = null;
    let salesProfitChart = null;
    let categoryDonutChart = null;

    let rawSales = [];
    let rawPurchases = [];
    let rawItems = [];

    // Filtered subsets according to date filter
    let currentSales = [];
    let currentPurchases = [];
    let currentItems = [];

    let topTyresMetric = 'quantity'; // 'quantity' or 'revenue'
    let topTubesMetric = 'quantity'; // 'quantity' or 'revenue'

    let filterStartDate = null; // null or YYYY-MM-DD
    let filterEndDate = null;   // null or YYYY-MM-DD

    /**
     * Initialize Analytics Module
     */
    async function init() {
        bindEvents();
        await refreshCharts();
    }

    /**
     * Bind UI event listeners
     */
    function bindEvents() {
        // Toggle for Top Tyres
        const tyresToggleBtn = document.getElementById('toggleTyresMetric');
        if (tyresToggleBtn) {
            tyresToggleBtn.addEventListener('click', () => {
                topTyresMetric = topTyresMetric === 'quantity' ? 'revenue' : 'quantity';
                tyresToggleBtn.textContent = topTyresMetric === 'quantity' ? 'Switch to: Revenue (Rs.)' : 'Switch to: Quantity (Units)';
                renderTopTyresChart();
            });
        }

        // Toggle for Top Tubes
        const tubesToggleBtn = document.getElementById('toggleTubesMetric');
        if (tubesToggleBtn) {
            tubesToggleBtn.addEventListener('click', () => {
                topTubesMetric = topTubesMetric === 'quantity' ? 'revenue' : 'quantity';
                tubesToggleBtn.textContent = topTubesMetric === 'quantity' ? 'Switch to: Revenue (Rs.)' : 'Switch to: Quantity (Units)';
                renderTopTubesChart();
            });
        }

        // Date Range Filtering buttons
        const btnApplyFilter = document.getElementById('btnApplyDateFilter');
        if (btnApplyFilter) {
            btnApplyFilter.addEventListener('click', () => {
                applyDateFilter();
            });
        }

        const btnResetFilter = document.getElementById('btnResetDateFilter');
        if (btnResetFilter) {
            btnResetFilter.addEventListener('click', () => {
                resetDateFilter();
            });
        }
    }

    /**
     * Apply date range filtering
     */
    function applyDateFilter() {
        const startInput = document.getElementById('analyticsStartDate');
        const endInput = document.getElementById('analyticsEndDate');

        const sVal = startInput ? startInput.value : '';
        const eVal = endInput ? endInput.value : '';

        if (!sVal && !eVal) {
            filterStartDate = null;
            filterEndDate = null;
        } else {
            filterStartDate = sVal || null;
            filterEndDate = eVal || null;
        }

        filterDatasets();
        renderAllVisualizations();
        if (window.AppNotification) {
            AppNotification.show(`Analytics filtered: ${filterStartDate || 'Beginning'} to ${filterEndDate || 'Now'}`, 'info');
        }
    }

    /**
     * Reset date range filtering to All Time
     */
    function resetDateFilter() {
        const startInput = document.getElementById('analyticsStartDate');
        const endInput = document.getElementById('analyticsEndDate');
        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';

        filterStartDate = null;
        filterEndDate = null;

        filterDatasets();
        renderAllVisualizations();
        if (window.AppNotification) {
            AppNotification.show('Analytics reset to all records', 'info');
        }
    }

    /**
     * Filter data arrays based on active date range
     */
    function filterDatasets() {
        if (!filterStartDate && !filterEndDate) {
            currentSales = [...rawSales];
            currentPurchases = [...rawPurchases];
            currentItems = [...rawItems];
            return;
        }

        const startTs = filterStartDate ? new Date(filterStartDate + 'T00:00:00').getTime() : 0;
        const endTs = filterEndDate ? new Date(filterEndDate + 'T23:59:59.999').getTime() : Infinity;

        currentSales = rawSales.filter(s => {
            const t = new Date(s.date).getTime();
            return t >= startTs && t <= endTs;
        });

        currentPurchases = rawPurchases.filter(p => {
            const t = new Date(p.date).getTime();
            return t >= startTs && t <= endTs;
        });

        currentItems = [...rawItems];
    }

    /**
     * Refresh data and re-render all dashboard charts
     */
    async function refreshCharts() {
        rawSales = await AppDB.getAll('sales');
        rawPurchases = await AppDB.getAll('purchases');
        rawItems = await AppDB.getAll('items');

        filterDatasets();
        renderAllVisualizations();
    }

    /**
     * Execute rendering of all UI blocks
     */
    function renderAllVisualizations() {
        updateDashboardKPIs();
        renderTopTyresChart();
        renderTopTubesChart();
        renderStockCostWeeklyChart();
        renderSalesProfitChart();
        renderCategoryDonutChart();
    }

    /**
     * Update Dashboard Key Performance Indicator (KPI) Cards
     */
    function updateDashboardKPIs() {
        const currency = AppSettings.getCurrency();
        const canViewCosts = AppAuth.hasPermission('analytics_costs');

        const now = new Date();
        const todayStr = now.toISOString().substring(0, 10);

        let todaySales = 0;
        let totalRevenue = 0;
        let totalCOGS = 0;
        let totalOrders = currentSales.length;

        currentSales.forEach(sale => {
            const saleDate = (sale.date || '').substring(0, 10);
            const amount = Number(sale.totalAmount || 0);
            totalRevenue += amount;

            if (saleDate === todayStr) {
                todaySales += amount;
            }

            // Calculate cost of goods sold
            if (sale.items) {
                sale.items.forEach(it => {
                    const cost = Number(it.costPrice || 0) * Number(it.quantity || 1);
                    totalCOGS += cost;
                });
            }
        });

        const grossProfit = Math.max(0, totalRevenue - totalCOGS);
        const marginPercent = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0;

        // Current On-Hand Stock Cost
        let currentStockCost = 0;
        let totalTyresUnits = 0;
        let totalTubesUnits = 0;
        let lowStockCount = 0;

        currentItems.forEach(item => {
            const stock = Number(item.stock || 0);
            const cost = Number(item.costPrice || 0);
            const min = Number(item.minStockAlert || 5);

            currentStockCost += (stock * cost);
            if (item.category === 'tyre') totalTyresUnits += stock;
            if (item.category === 'tube') totalTubesUnits += stock;
            if (stock <= min) lowStockCount++;
        });

        // Update DOM elements
        const todayEl = document.getElementById('kpiTodaySales');
        if (todayEl) todayEl.textContent = `${currency}${todaySales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const profitEl = document.getElementById('kpiGrossProfit');
        if (profitEl) {
            if (canViewCosts) {
                profitEl.textContent = `${currency}${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const marginEl = document.getElementById('kpiProfitMargin');
                if (marginEl) marginEl.textContent = `${marginPercent}% gross margin`;
            } else {
                profitEl.textContent = '🔒 Admin Only';
                const marginEl = document.getElementById('kpiProfitMargin');
                if (marginEl) marginEl.textContent = 'Hidden for cashier';
            }
        }

        const costEl = document.getElementById('kpiStockCost');
        if (costEl) {
            if (canViewCosts) {
                costEl.textContent = `${currency}${currentStockCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            } else {
                costEl.textContent = '🔒 Admin Only';
            }
        }

        const ordersEl = document.getElementById('kpiTotalOrders');
        if (ordersEl) ordersEl.textContent = totalOrders;
    }

    /**
     * CHART 1A: Top Selling Tyres Only
     */
    function renderTopTyresChart() {
        const canvas = document.getElementById('chartTopSellingTyres');
        if (!canvas) return;

        const tyreStats = {};

        currentSales.forEach(sale => {
            if (!sale.items) return;
            sale.items.forEach(it => {
                if (it.category !== 'tube' && it.category !== 'service') {
                    const key = it.itemId || `${it.brand}-${it.size}`;
                    if (!tyreStats[key]) {
                        tyreStats[key] = {
                            name: `${it.brand} ${it.size}`,
                            quantity: 0,
                            revenue: 0
                        };
                    }
                    tyreStats[key].quantity += Number(it.quantity || 0);
                    tyreStats[key].revenue += Number(it.total || 0);
                }
            });
        });

        const list = Object.values(tyreStats);
        list.sort((a, b) => b[topTyresMetric] - a[topTyresMetric]);
        const topList = list.slice(0, 6);

        const labels = topList.map(item => item.name);
        const dataValues = topList.map(item => topTyresMetric === 'quantity' ? item.quantity : item.revenue);
        const currency = AppSettings.getCurrency();

        if (window.Chart) {
            if (topTyresChart) topTyresChart.destroy();

            const ctx = canvas.getContext('2d');
            topTyresChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels.length ? labels : ['No tyre sales in period'],
                    datasets: [{
                        label: topTyresMetric === 'quantity' ? 'Tyres Sold (Units)' : `Tyre Revenue (${currency})`,
                        data: dataValues.length ? dataValues : [0],
                        backgroundColor: 'rgba(59, 130, 246, 0.85)', // Blue for tyres
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return topTyresMetric === 'quantity'
                                        ? `Units Sold: ${context.parsed.y}`
                                        : `Revenue: ${currency}${context.parsed.y.toFixed(2)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { font: { size: 11 } }
                        },
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(226, 232, 240, 0.6)' },
                            ticks: {
                                callback: value => topTyresMetric === 'quantity' ? value : currency + value
                            }
                        }
                    }
                }
            });
        }
    }

    /**
     * CHART 1B: Top Selling Tubes Only
     */
    function renderTopTubesChart() {
        const canvas = document.getElementById('chartTopSellingTubes');
        if (!canvas) return;

        const tubeStats = {};

        currentSales.forEach(sale => {
            if (!sale.items) return;
            sale.items.forEach(it => {
                if (it.category === 'tube') {
                    const key = it.itemId || `${it.brand}-${it.size}`;
                    if (!tubeStats[key]) {
                        tubeStats[key] = {
                            name: `${it.brand} ${it.size}`,
                            quantity: 0,
                            revenue: 0
                        };
                    }
                    tubeStats[key].quantity += Number(it.quantity || 0);
                    tubeStats[key].revenue += Number(it.total || 0);
                }
            });
        });

        const list = Object.values(tubeStats);
        list.sort((a, b) => b[topTubesMetric] - a[topTubesMetric]);
        const topList = list.slice(0, 6);

        const labels = topList.map(item => item.name);
        const dataValues = topList.map(item => topTubesMetric === 'quantity' ? item.quantity : item.revenue);
        const currency = AppSettings.getCurrency();

        if (window.Chart) {
            if (topTubesChart) topTubesChart.destroy();

            const ctx = canvas.getContext('2d');
            topTubesChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels.length ? labels : ['No tube sales in period'],
                    datasets: [{
                        label: topTubesMetric === 'quantity' ? 'Tubes Sold (Units)' : `Tube Revenue (${currency})`,
                        data: dataValues.length ? dataValues : [0],
                        backgroundColor: 'rgba(245, 158, 11, 0.85)', // Amber for tubes
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return topTubesMetric === 'quantity'
                                        ? `Units Sold: ${context.parsed.y}`
                                        : `Revenue: ${currency}${context.parsed.y.toFixed(2)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { font: { size: 11 } }
                        },
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(226, 232, 240, 0.6)' },
                            ticks: {
                                callback: value => topTubesMetric === 'quantity' ? value : currency + value
                            }
                        }
                    }
                }
            });
        }
    }

    /**
     * Compute 6 Thursday cycles based on current reference date or filtered end date
     * Ensures the current ongoing week is included up to the upcoming Thursday
     */
    function getThursdayWeeks() {
        const weeks = [];
        const refDate = filterEndDate ? new Date(filterEndDate + 'T23:59:59.999') : new Date();

        // Calculate upcoming Thursday cycle boundary (so current week transactions are captured)
        const dayOfWeek = refDate.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
        const daysUntilNextThursday = (4 - dayOfWeek + 7) % 7;

        const currentCycleThursday = new Date(
            refDate.getFullYear(),
            refDate.getMonth(),
            refDate.getDate() + daysUntilNextThursday,
            23, 59, 59, 999
        );

        for (let i = 5; i >= 0; i--) {
            const endOfWeek = new Date(currentCycleThursday.getTime() - (i * 7) * 24 * 60 * 60 * 1000);
            const startOfWeek = new Date(endOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000 + 1);

            const thuDayMonth = endOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            const isCurrent = (i === 0 && !filterEndDate);
            const label = `Thu, ${thuDayMonth}${isCurrent ? ' (Current)' : ''}`;

            weeks.push({
                index: i,
                label: label,
                endDateStr: endOfWeek.toISOString().substring(0, 10),
                startTime: startOfWeek.getTime(),
                endTime: endOfWeek.getTime(),
                purchasesCost: 0,
                salesRevenue: 0,
                salesCost: 0
            });
        }

        return weeks;
    }

    /**
     * CHART 2: On-Hand Stock Cost & Business Asset Valuation (Thursday Cycles + Dual Area Lines)
     * Plus renders the Weekly Re-investment & Restock Cash Flow Table
     */
    function renderStockCostWeeklyChart() {
        const canvas = document.getElementById('chartStockCostWeekly');
        if (!canvas) return;

        // Current stock valuation from items inventory
        let currentStockValuation = 0;
        currentItems.forEach(i => {
            currentStockValuation += (Number(i.stock || 0) * Number(i.costPrice || 0));
        });

        const weeks = getThursdayWeeks();
        const currency = AppSettings.getCurrency();

        // Aggregate Purchases by Thursday week
        currentPurchases.forEach(p => {
            const t = new Date(p.date).getTime();
            const w = weeks.find(wk => t >= wk.startTime && t <= wk.endTime);
            if (w) {
                w.purchasesCost += Number(p.totalAmount || 0);
            }
        });

        // Aggregate Sales revenue and COGS by Thursday week
        currentSales.forEach(s => {
            const t = new Date(s.date).getTime();
            const w = weeks.find(wk => t >= wk.startTime && t <= wk.endTime);
            if (w) {
                w.salesRevenue += Number(s.totalAmount || 0);
                if (s.items) {
                    s.items.forEach(it => {
                        w.salesCost += (Number(it.costPrice || 0) * Number(it.quantity || 1));
                    });
                }
            }
        });

        // Back-calculate week-by-week on-hand stock cost
        const stockCostData = new Array(6);
        let runningStockVal = currentStockValuation;
        stockCostData[5] = Math.round(runningStockVal);

        for (let i = 4; i >= 0; i--) {
            const nextWeek = weeks[i + 1];
            runningStockVal = runningStockVal - (nextWeek.purchasesCost || 0) + (nextWeek.salesCost || 0);
            if (runningStockVal < 0) runningStockVal = 0;
            stockCostData[i] = Math.round(runningStockVal);
        }

        // Calculate Stock Cost + Cumulative Revenue (Total Business Asset Pool)
        const totalValueData = new Array(6);
        let cumRevenue = 0;
        for (let i = 0; i < 6; i++) {
            cumRevenue += weeks[i].salesRevenue;
            // Value is On-Hand Stock Cost + Revenue generated up to that week
            totalValueData[i] = Math.round(stockCostData[i] + cumRevenue);
        }

        const labels = weeks.map(w => w.label);

        if (window.Chart) {
            if (stockCostChart) stockCostChart.destroy();

            const ctx = canvas.getContext('2d');

            // Gradient for Stock Cost (Emerald Green)
            const gradStock = ctx.createLinearGradient(0, 0, 0, 320);
            gradStock.addColorStop(0, 'rgba(16, 185, 129, 0.40)');
            gradStock.addColorStop(1, 'rgba(16, 185, 129, 0.03)');

            // Gradient for Total Value (Royal Blue)
            const gradTotal = ctx.createLinearGradient(0, 0, 0, 320);
            gradTotal.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
            gradTotal.addColorStop(1, 'rgba(59, 130, 246, 0.03)');

            stockCostChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: `On-Hand Stock Cost (${currency})`,
                            data: stockCostData,
                            borderColor: '#10b981',
                            borderWidth: 3,
                            backgroundColor: gradStock,
                            fill: true,
                            tension: 0.35,
                            pointBackgroundColor: '#10b981',
                            pointBorderColor: '#ffffff',
                            pointBorderWidth: 2,
                            pointRadius: 5,
                            pointHoverRadius: 7
                        },
                        {
                            label: `On-Hand Stock + Revenue Valuation (${currency})`,
                            data: totalValueData,
                            borderColor: '#3b82f6',
                            borderWidth: 3,
                            backgroundColor: gradTotal,
                            fill: true,
                            tension: 0.35,
                            pointBackgroundColor: '#3b82f6',
                            pointBorderColor: '#ffffff',
                            pointBorderWidth: 2,
                            pointRadius: 5,
                            pointHoverRadius: 7
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: { boxWidth: 14, font: { size: 12, weight: 'bold' } }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return `${context.dataset.label}: ${currency}${context.parsed.y.toLocaleString()}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(226, 232, 240, 0.4)' },
                            ticks: { font: { size: 11, weight: '600' } }
                        },
                        y: {
                            beginAtZero: false,
                            grid: { color: 'rgba(226, 232, 240, 0.6)' },
                            ticks: {
                                callback: value => currency + value.toLocaleString()
                            }
                        }
                    }
                }
            });
        }

        // Render the Re-investment & Restock Cash Flow Table
        renderReinvestmentTable(weeks, stockCostData);
    }

    /**
     * Render the Re-investment & Restock Cash Flow Table
     */
    function renderReinvestmentTable(weeks, stockCostData) {
        const tbody = document.getElementById('tableWeeklyReinvestmentBody');
        if (!tbody) return;

        const currency = AppSettings.getCurrency();
        let runningCashBalance = 0;

        let rowsHtml = '';
        // Iterate newest week first (reverse of weeks array)
        for (let i = 5; i >= 0; i--) {
            const w = weeks[i];
            const stockCost = stockCostData[i] || 0;
            const rev = w.salesRevenue || 0;
            const bought = w.purchasesCost || 0;
            const netCashFlow = rev - bought;
            runningCashBalance += netCashFlow;

            const netBadgeClass = netCashFlow >= 0 ? 'badge-success' : 'badge-danger';
            const netPrefix = netCashFlow >= 0 ? '+' : '';

            rowsHtml += `
                <tr>
                    <td><strong>${w.label}</strong> <span style="font-size: 11px; color: var(--text-muted);">(${w.endDateStr})</span></td>
                    <td>${currency}${stockCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="color: #1e40af; font-weight: 600;">${currency}${rev.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="color: #92400e; font-weight: 600;">${currency}${bought.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>
                        <span class="badge ${netBadgeClass}">
                            ${netPrefix}${currency}${netCashFlow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </td>
                    <td>
                        <strong style="color: ${runningCashBalance >= 0 ? '#059669' : '#dc2626'};">
                            ${currency}${Math.max(0, runningCashBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </strong>
                        <span style="font-size: 11px; color: var(--text-muted); display: block;">Available to buy stock</span>
                    </td>
                </tr>
            `;
        }

        tbody.innerHTML = rowsHtml;
    }

    /**
     * CHART 3: Weekly Revenue vs Gross Profit (Thursday cycle)
     */
    function renderSalesProfitChart() {
        const canvas = document.getElementById('chartWeeklySalesProfit');
        if (!canvas) return;

        const weeks = getThursdayWeeks();
        const currency = AppSettings.getCurrency();

        // Aggregate sales and COGS into Thursday weeks
        currentSales.forEach(s => {
            const t = new Date(s.date).getTime();
            const w = weeks.find(wk => t >= wk.startTime && t <= wk.endTime);
            if (w) {
                w.salesRevenue += Number(s.totalAmount || 0);
                if (s.items) {
                    s.items.forEach(it => {
                        w.salesCost += (Number(it.costPrice || 0) * Number(it.quantity || 1));
                    });
                }
            }
        });

        const labels = weeks.map(w => w.label);
        const revenueData = weeks.map(w => w.salesRevenue);
        const profitData = weeks.map(w => Math.max(0, w.salesRevenue - w.salesCost));

        if (window.Chart) {
            if (salesProfitChart) salesProfitChart.destroy();

            const ctx = canvas.getContext('2d');
            salesProfitChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Total Revenue',
                            data: revenueData,
                            backgroundColor: 'rgba(59, 130, 246, 0.85)',
                            borderRadius: 5
                        },
                        {
                            label: 'Gross Profit',
                            data: profitData,
                            backgroundColor: 'rgba(16, 185, 129, 0.85)',
                            borderRadius: 5
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: { boxWidth: 12, font: { size: 12 } }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return `${context.dataset.label}: ${currency}${context.parsed.y.toFixed(2)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(226, 232, 240, 0.6)' },
                            ticks: {
                                callback: value => currency + value
                            }
                        }
                    }
                }
            });
        }
    }

    /**
     * CHART 4: Category Distribution (Tyres vs Tubes vs Services)
     */
    function renderCategoryDonutChart() {
        const canvas = document.getElementById('chartCategoryDonut');
        if (!canvas) return;

        let tyreUnits = 0;
        let tubeUnits = 0;
        let serviceUnits = 0;

        currentSales.forEach(s => {
            if (!s.items) return;
            s.items.forEach(it => {
                const qty = Number(it.quantity || 0);
                if (it.category === 'tube') tubeUnits += qty;
                else if (it.category === 'service') serviceUnits += qty;
                else tyreUnits += qty;
            });
        });

        const totalUnits = tyreUnits + tubeUnits + serviceUnits;

        if (window.Chart) {
            if (categoryDonutChart) categoryDonutChart.destroy();

            const ctx = canvas.getContext('2d');
            categoryDonutChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Tyres Sold', 'Tubes Sold', 'Services Rendered'],
                    datasets: [{
                        data: totalUnits > 0 ? [tyreUnits, tubeUnits, serviceUnits] : [1, 1, 1],
                        backgroundColor: ['#3b82f6', '#f59e0b', '#8b5cf6'],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { boxWidth: 12, padding: 14 }
                        }
                    }
                }
            });
        }
    }

    return {
        init,
        refreshCharts,
        applyDateFilter,
        resetDateFilter
    };
})();

// Export for module systems and attach to global window
window.AppAnalytics = AppAnalytics;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppAnalytics;
}
