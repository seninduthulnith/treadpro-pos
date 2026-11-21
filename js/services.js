/**
 * TreadPro Repair & Maintenance Services Module (Future-Proof Architecture)
 * Handles tyre puncture repairs, wheel alignment, dynamic wheel balancing,
 * vulcanizing, and labor services expandable for future workshop growth.
 */

const AppServices = (function () {
    'use strict';

    let servicesList = [];

    /**
     * Initialize Services Module
     */
    async function init() {
        bindEvents();
        await loadServices();
    }

    /**
     * Load services from IndexedDB
     */
    async function loadServices() {
        servicesList = await AppDB.getAll('services');
        renderServicesTable();
    }

    /**
     * Get all active services
     */
    function getActiveServices() {
        return servicesList.filter(s => s.active !== false);
    }

    /**
     * Bind UI event listeners
     */
    function bindEvents() {
        const addBtn = document.getElementById('openAddServiceModalBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => openServiceModal());
        }

        const serviceForm = document.getElementById('serviceForm');
        if (serviceForm) {
            serviceForm.addEventListener('submit', handleSaveService);
        }
    }

    /**
     * Render the Services Table
     */
    function renderServicesTable() {
        const tbody = document.getElementById('servicesTableBody');
        if (!tbody) return;

        const currency = AppSettings.getCurrency();
        const canManage = AppAuth.hasPermission('services_manage');

        if (servicesList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-6 text-slate-500">
                        No repair services configured. Click "+ Add New Service" to create one.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = servicesList.map(srv => {
            const statusBadge = srv.active === false
                ? '<span class="badge badge-danger">Disabled</span>'
                : '<span class="badge badge-success">Available in POS</span>';

            let categoryPill = '<span class="pill pill-service">Repair</span>';
            if (srv.category === 'maintenance') categoryPill = '<span class="pill pill-tyre">Maintenance</span>';
            if (srv.category === 'fitting') categoryPill = '<span class="pill pill-tube">Fitting</span>';

            return `
                <tr>
                    <td>
                        <div class="font-bold text-slate-800">${escapeHtml(srv.name)}</div>
                        <div class="text-xs text-slate-400">${escapeHtml(srv.description || 'Workshop service')}</div>
                    </td>
                    <td>${categoryPill}</td>
                    <td><span class="font-bold text-primary">${currency}${Number(srv.price || 0).toFixed(2)}</span></td>
                    <td>${srv.durationMinutes || 15} mins</td>
                    <td>${statusBadge}</td>
                    <td class="action-cell">
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-primary" onclick="AppServices.billInPOS('${srv.id}')" title="Add to POS Cart">
                                + Bill in POS
                            </button>
                            ${canManage ? `
                                <button class="btn btn-icon btn-sm" title="Edit Service" onclick="AppServices.openServiceModal('${srv.id}')">
                                    ✏️
                                </button>
                                <button class="btn btn-icon btn-sm text-danger" title="Delete Service" onclick="AppServices.deleteService('${srv.id}')">
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
     * Open Modal to Add or Edit Service
     */
    function openServiceModal(serviceId = null) {
        const modal = document.getElementById('serviceModal');
        const form = document.getElementById('serviceForm');
        const title = document.getElementById('serviceModalTitle');
        if (!modal || !form) return;

        form.reset();

        if (serviceId) {
            const srv = servicesList.find(s => s.id === serviceId);
            if (!srv) return;

            title.textContent = 'Edit Repair Service';
            document.getElementById('serviceId').value = srv.id;
            document.getElementById('serviceName').value = srv.name || '';
            document.getElementById('serviceCategory').value = srv.category || 'repair';
            document.getElementById('servicePrice').value = srv.price || 0;
            document.getElementById('serviceDuration').value = srv.durationMinutes || 15;
            document.getElementById('serviceDescription').value = srv.description || '';
            document.getElementById('serviceActive').checked = srv.active !== false;
        } else {
            title.textContent = 'Add New Repair / Labor Service';
            document.getElementById('serviceId').value = '';
            document.getElementById('servicePrice').value = 100.00;
            document.getElementById('serviceDuration').value = 15;
            document.getElementById('serviceActive').checked = true;
        }

        modal.classList.add('active');
    }

    /**
     * Handle Save Service submission
     */
    async function handleSaveService(e) {
        e.preventDefault();

        const id = document.getElementById('serviceId').value;
        const name = document.getElementById('serviceName').value.trim();
        const category = document.getElementById('serviceCategory').value;
        const price = parseFloat(document.getElementById('servicePrice').value) || 0;
        const durationMinutes = parseInt(document.getElementById('serviceDuration').value, 10) || 15;
        const description = document.getElementById('serviceDescription').value.trim();
        const active = document.getElementById('serviceActive').checked;

        if (!name || price < 0) {
            AppNotification.toast('Validation Error', 'Please enter a valid service name and fee.', 'error');
            return;
        }

        try {
            if (id) {
                const existing = servicesList.find(s => s.id === id);
                const updated = {
                    ...existing,
                    name,
                    category,
                    price,
                    durationMinutes,
                    description,
                    active,
                    updatedAt: new Date().toISOString()
                };
                await AppDB.update('services', updated);
                AppNotification.toast('Service Updated', `Updated service "${name}".`, 'success');
            } else {
                const newSrv = {
                    id: 'srv_' + Date.now(),
                    name,
                    category,
                    price,
                    durationMinutes,
                    description,
                    active,
                    createdAt: new Date().toISOString()
                };
                await AppDB.add('services', newSrv);
                AppNotification.toast('Service Created', `Added "${name}" to available services.`, 'success');
            }

            document.getElementById('serviceModal').classList.remove('active');
            await loadServices();
            if (window.AppPOS) AppPOS.loadProducts();
        } catch (err) {
            console.error('Error saving service:', err);
            AppNotification.toast('Error', 'Failed to save service.', 'error');
        }
    }

    /**
     * Quick action to bill this service directly in POS
     */
    function billInPOS(serviceId) {
        if (window.AppRouter) {
            AppRouter.navigate('pos');
        }
        if (window.AppPOS) {
            AppPOS.addToCart(serviceId, 'service');
            AppNotification.toast('Added to Cart', 'Service added to active POS cart.', 'info');
        }
    }

    /**
     * Delete Service
     */
    async function deleteService(serviceId) {
        const srv = servicesList.find(s => s.id === serviceId);
        if (!srv) return;

        if (!confirm(`Are you sure you want to delete service "${srv.name}"?`)) return;

        try {
            await AppDB.remove('services', serviceId);
            AppNotification.toast('Deleted', `Service "${srv.name}" removed.`, 'info');
            await loadServices();
            if (window.AppPOS) AppPOS.loadProducts();
        } catch (err) {
            console.error('Error deleting service:', err);
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
        loadServices,
        getActiveServices,
        openServiceModal,
        billInPOS,
        deleteService
    };
})();

// Export for module systems or attach to global window
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppServices;
}
