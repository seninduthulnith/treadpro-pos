/**
 * TreadPro Invoice Generation, Printing & PDF Download Module
 * Formats standard A4 invoices and 80mm thermal receipts with customer details,
 * vehicle plate number, tyre/tube specifications, and handles downloads.
 */

const AppInvoice = (function () {
    'use strict';

    let currentInvoiceData = null;
    let currentFormat = 'a4'; // 'a4' or 'thermal'

    /**
     * Initialize Invoice listeners
     */
    function init() {
        // Print Button
        const printBtn = document.getElementById('invoicePrintBtn');
        if (printBtn) {
            printBtn.addEventListener('click', printInvoice);
        }

        // PDF Download Button
        const downloadPdfBtn = document.getElementById('invoiceDownloadPdfBtn');
        if (downloadPdfBtn) {
            downloadPdfBtn.addEventListener('click', downloadPDF);
        }

        // WhatsApp Share Button
        const whatsappBtn = document.getElementById('invoiceWhatsAppBtn');
        if (whatsappBtn) {
            whatsappBtn.addEventListener('click', shareViaWhatsApp);
        }

        // Format Switchers (A4 vs Thermal)
        const formatA4Btn = document.getElementById('btnFormatA4');
        const formatThermalBtn = document.getElementById('btnFormatThermal');

        if (formatA4Btn && formatThermalBtn) {
            formatA4Btn.addEventListener('click', () => {
                setFormat('a4');
                formatA4Btn.classList.add('active');
                formatThermalBtn.classList.remove('active');
            });
            formatThermalBtn.addEventListener('click', () => {
                setFormat('thermal');
                formatThermalBtn.classList.add('active');
                formatA4Btn.classList.remove('active');
            });
        }
    }

    /**
     * Show Invoice Modal with Sale Record
     */
    function showInvoice(saleData) {
        currentInvoiceData = saleData;
        renderInvoice();
        const modal = document.getElementById('invoiceModal');
        if (modal) modal.classList.add('active');
    }

    /**
     * Switch view format between standard A4 and 80mm thermal receipt
     */
    function setFormat(format) {
        currentFormat = format;
        const container = document.getElementById('invoiceRenderContainer');
        if (container) {
            if (format === 'thermal') {
                container.classList.add('thermal-mode');
                container.classList.remove('a4-mode');
            } else {
                container.classList.add('a4-mode');
                container.classList.remove('thermal-mode');
            }
        }
        renderInvoice();
    }

    /**
     * Render the Invoice HTML inside container
     */
    function renderInvoice() {
        const container = document.getElementById('invoiceRenderContainer');
        if (!container || !currentInvoiceData) return;

        const sale = currentInvoiceData;
        const settings = AppSettings.getAllSettings();
        const currency = settings.currency || 'Rs. ';

        const shopName = settings.shopName || 'Apex Tyre & Tube Center';
        const tagline = settings.tagline || 'Automotive Tyres, Tubes & Wheel Service';
        const phone = settings.phone || '+1 (555) 382-7888';
        const email = settings.email || 'contact@apextyrecentre.com';
        const address = settings.address || '450 Industrial Parkway, Auto Hub Blvd';
        const footerNote = settings.invoiceFooterNote || 'Thank you for your business! Check wheel lug nuts after 50km.';

        const formattedDate = new Date(sale.date).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        if (currentFormat === 'thermal') {
            // --- 80mm Thermal Receipt Layout ---
            container.innerHTML = `
                <div class="thermal-receipt" id="printableInvoice">
                    <div class="thermal-header text-center">
                        <h2 class="thermal-shop-name">${escapeHtml(shopName)}</h2>
                        <p class="thermal-sub">${escapeHtml(tagline)}</p>
                        <p class="thermal-contact">Ph: ${escapeHtml(phone)}</p>
                        <p class="thermal-contact">${escapeHtml(address)}</p>
                        <div class="thermal-divider">--------------------------------</div>
                    </div>

                    <div class="thermal-meta">
                        <div><strong>INVOICE:</strong> ${escapeHtml(sale.invoiceNo)}</div>
                        <div><strong>DATE:</strong> ${formattedDate}</div>
                        <div><strong>CASHIER:</strong> ${escapeHtml(sale.cashier || 'Admin')}</div>
                    </div>

                    <div class="thermal-divider">--------------------------------</div>

                    <div class="thermal-customer">
                        <div><strong>CUSTOMER:</strong> ${escapeHtml(sale.customer.name || 'Walk-in')}</div>
                        ${sale.customer.phone ? `<div><strong>PHONE:</strong> ${escapeHtml(sale.customer.phone)}</div>` : ''}
                        <div><strong>VEHICLE NO:</strong> ${escapeHtml(sale.customer.vehicleNo || 'N/A')}</div>
                        ${sale.customer.vehicleModel ? `<div><strong>MODEL:</strong> ${escapeHtml(sale.customer.vehicleModel)}</div>` : ''}
                    </div>

                    <div class="thermal-divider">================================</div>

                    <div class="thermal-items-header">
                        <span class="col-desc">ITEM / SIZE</span>
                        <span class="col-qty">QTY</span>
                        <span class="col-total">TOTAL</span>
                    </div>
                    <div class="thermal-divider">--------------------------------</div>

                    <div class="thermal-items-list">
                        ${sale.items.map(item => `
                            <div class="thermal-item-row">
                                <div class="thermal-item-name">
                                    <strong>${escapeHtml(item.brand)}</strong> ${escapeHtml(item.size)}
                                    <div class="thermal-item-sub">${escapeHtml(item.itemName)}</div>
                                </div>
                                <div class="thermal-item-numbers">
                                    <span>${item.quantity} x ${currency}${item.unitPrice.toFixed(2)}</span>
                                    <strong>${currency}${item.total.toFixed(2)}</strong>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="thermal-divider">================================</div>

                    <div class="thermal-totals">
                        <div class="thermal-total-line">
                            <span>Subtotal:</span>
                            <span>${currency}${sale.subtotal.toFixed(2)}</span>
                        </div>
                        ${sale.discountAmount > 0 ? `
                            <div class="thermal-total-line">
                                <span>Discount:</span>
                                <span>-${currency}${sale.discountAmount.toFixed(2)}</span>
                            </div>
                        ` : ''}
                        ${sale.taxAmount > 0 ? `
                            <div class="thermal-total-line">
                                <span>Tax (${sale.taxRate}%):</span>
                                <span>${currency}${sale.taxAmount.toFixed(2)}</span>
                            </div>
                        ` : ''}
                        <div class="thermal-divider">--------------------------------</div>
                        <div class="thermal-total-line grand-total">
                            <strong>TOTAL:</strong>
                            <strong>${currency}${sale.totalAmount.toFixed(2)}</strong>
                        </div>
                        <div class="thermal-divider">--------------------------------</div>
                        <div class="thermal-total-line">
                            <span>Payment (${(sale.paymentMethod || 'CASH').toUpperCase()}):</span>
                            <span>${currency}${sale.amountPaid.toFixed(2)}</span>
                        </div>
                        ${sale.change > 0 ? `
                            <div class="thermal-total-line">
                                <span>Change Due:</span>
                                <span>${currency}${sale.change.toFixed(2)}</span>
                            </div>
                        ` : ''}
                    </div>

                    <div class="thermal-footer text-center">
                        <div class="thermal-divider">--------------------------------</div>
                        <p class="thermal-note">${escapeHtml(footerNote)}</p>
                        <p class="thermal-thanks">*** THANK YOU FOR VISITING ***</p>
                    </div>
                </div>
            `;
        } else {
            // --- Standard Professional A4 Invoice Layout ---
            container.innerHTML = `
                <div class="a4-invoice-sheet" id="printableInvoice">
                    <!-- Invoice Top Banner -->
                    <div class="invoice-header-row">
                        <div class="invoice-brand">
                            <div class="brand-logo-emblem">🛞</div>
                            <div class="brand-details">
                                <h1 class="shop-title">${escapeHtml(shopName)}</h1>
                                <p class="shop-tagline">${escapeHtml(tagline)}</p>
                                <p class="shop-address">${escapeHtml(address)}</p>
                                <p class="shop-contact">Phone: ${escapeHtml(phone)} | Email: ${escapeHtml(email)}</p>
                            </div>
                        </div>
                        <div class="invoice-badge-box">
                            <div class="badge-title">TAX INVOICE</div>
                            <div class="invoice-number">${escapeHtml(sale.invoiceNo)}</div>
                            <div class="invoice-date"><strong>Date:</strong> ${formattedDate}</div>
                            <div class="invoice-cashier"><strong>Billed By:</strong> ${escapeHtml(sale.cashier || 'Admin')}</div>
                        </div>
                    </div>

                    <div class="invoice-divider"></div>

                    <!-- Customer & Vehicle Registration Details -->
                    <div class="invoice-info-grid">
                        <div class="info-block customer-info">
                            <div class="info-heading">CUSTOMER DETAILS</div>
                            <div class="info-row">
                                <span class="label">Name:</span>
                                <span class="val font-bold">${escapeHtml(sale.customer.name || 'Walk-in Customer')}</span>
                            </div>
                            <div class="info-row">
                                <span class="label">Contact Phone:</span>
                                <span class="val">${escapeHtml(sale.customer.phone || 'N/A')}</span>
                            </div>
                            <div class="info-row">
                                <span class="label">Payment Mode:</span>
                                <span class="val badge-payment">${(sale.paymentMethod || 'Cash').toUpperCase()}</span>
                            </div>
                        </div>

                        <div class="info-block vehicle-info">
                            <div class="info-heading">VEHICLE DETAILS</div>
                            <div class="info-row">
                                <span class="label">Vehicle Plate / Reg:</span>
                                <span class="val font-plate">${escapeHtml(sale.customer.vehicleNo || 'NOT RECORDED')}</span>
                            </div>
                            <div class="info-row">
                                <span class="label">Vehicle Model:</span>
                                <span class="val">${escapeHtml(sale.customer.vehicleModel || 'General Passenger Vehicle')}</span>
                            </div>
                            <div class="info-row">
                                <span class="label">Warranty Status:</span>
                                <span class="val text-success">Valid Manufacturer Warranty</span>
                            </div>
                        </div>
                    </div>

                    <!-- Items Table -->
                    <table class="invoice-items-table">
                        <thead>
                            <tr>
                                <th style="width: 5%">#</th>
                                <th style="width: 45%">Item Description & Specifications</th>
                                <th style="width: 15%">Category</th>
                                <th style="width: 10%" class="text-center">Qty</th>
                                <th style="width: 12%" class="text-right">Unit Price</th>
                                <th style="width: 13%" class="text-right">Total Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sale.items.map((item, index) => `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>
                                        <div class="item-desc-cell">
                                            <strong>${escapeHtml(item.brand)} - ${escapeHtml(item.size)}</strong>
                                            <span class="item-sub-desc">${escapeHtml(item.itemName)}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span class="pill ${item.category === 'tube' ? 'pill-tube' : (item.category === 'service' ? 'pill-service' : 'pill-tyre')}">
                                            ${(item.category || 'Tyre').toUpperCase()}
                                        </span>
                                    </td>
                                    <td class="text-center font-bold">${item.quantity}</td>
                                    <td class="text-right">${currency}${item.unitPrice.toFixed(2)}</td>
                                    <td class="text-right font-bold">${currency}${item.total.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <!-- Financial Summary & Signatures -->
                    <div class="invoice-bottom-grid">
                        <div class="invoice-notes-block">
                            <div class="notes-heading">TERMS & SERVICE WARRANTY</div>
                            <ul class="warranty-terms">
                                <li>All tyres carry manufacturer warranty against manufacturing defects.</li>
                                <li>Please check wheel alignment, balancing and lug torque after initial 50 km.</li>
                                <li>Punctures or road hazard cuts are not covered under basic warranty.</li>
                                <li>Keep this original invoice receipt for warranty claims and future servicing.</li>
                            </ul>
                            <p class="custom-footer-note">${escapeHtml(footerNote)}</p>
                        </div>

                        <div class="invoice-totals-block">
                            <div class="total-row">
                                <span>Subtotal:</span>
                                <strong>${currency}${sale.subtotal.toFixed(2)}</strong>
                            </div>
                            ${sale.discountAmount > 0 ? `
                                <div class="total-row discount-row">
                                    <span>Discount Applied:</span>
                                    <strong>-${currency}${sale.discountAmount.toFixed(2)}</strong>
                                </div>
                            ` : ''}
                            ${sale.taxAmount > 0 ? `
                                <div class="total-row">
                                    <span>Estimated Tax (${sale.taxRate}%):</span>
                                    <span>${currency}${sale.taxAmount.toFixed(2)}</span>
                                </div>
                            ` : ''}
                            <div class="total-row grand-total-row">
                                <span>Grand Total:</span>
                                <span class="grand-total-amount">${currency}${sale.totalAmount.toFixed(2)}</span>
                            </div>
                            <div class="total-row payment-row">
                                <span>Amount Paid:</span>
                                <span>${currency}${sale.amountPaid.toFixed(2)}</span>
                            </div>
                            ${sale.change > 0 ? `
                                <div class="total-row change-row">
                                    <span>Change Returned:</span>
                                    <span>${currency}${sale.change.toFixed(2)}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Signatures -->
                    <div class="invoice-signatures-row">
                        <div class="sig-box">
                            <div class="sig-line"></div>
                            <p>Customer Signature</p>
                        </div>
                        <div class="sig-box">
                            <div class="sig-line"></div>
                            <p>Authorized Signatory (Apex Tyre)</p>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Print Invoice directly using browser print engine
     */
    function printInvoice() {
        if (!currentInvoiceData) return;
        window.print();
    }

    /**
     * Download Invoice as PDF
     */
    function downloadPDF() {
        if (!currentInvoiceData) return;

        const invoiceNo = currentInvoiceData.invoiceNo || 'INV-001';

        // Check if html2pdf is available
        if (typeof html2pdf !== 'undefined') {
            const element = document.getElementById('printableInvoice');
            const opt = {
                margin: currentFormat === 'thermal' ? [5, 5, 5, 5] : [10, 10, 10, 10],
                filename: `${invoiceNo}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: {
                    unit: 'mm',
                    format: currentFormat === 'thermal' ? [80, 200] : 'a4',
                    orientation: 'portrait'
                }
            };
            html2pdf().set(opt).from(element).save();
            AppNotification.toast('PDF Generated', `Downloaded ${invoiceNo}.pdf successfully.`, 'success');
        } else {
            // Native fallback: instruct user to save as PDF via print dialog
            AppNotification.toast('Print to PDF', 'Select "Save as PDF" in your print destination window.', 'info');
            window.print();
        }
    }

    /**
     * Share invoice summary via WhatsApp
     */
    function shareViaWhatsApp() {
        if (!currentInvoiceData) return;
        const sale = currentInvoiceData;
        const currency = AppSettings.getCurrency();

        let message = `*Invoice: ${sale.invoiceNo}*\n`;
        message += `*From: ${AppSettings.get('shopName') || 'Apex Tyre & Tube Center'}*\n`;
        message += `Customer: ${sale.customer.name} (${sale.customer.vehicleNo})\n\n`;
        message += `*Items:*\n`;

        sale.items.forEach(item => {
            message += `• ${item.brand} ${item.size} x ${item.quantity} = ${currency}${item.total.toFixed(2)}\n`;
        });

        message += `\n*Total Amount: ${currency}${sale.totalAmount.toFixed(2)}*\n`;
        message += `Thank you for choosing us!`;

        let phone = sale.customer.phone ? sale.customer.phone.replace(/[^0-9]/g, '') : '';
        const url = phone
            ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
            : `https://wa.me/?text=${encodeURIComponent(message)}`;

        window.open(url, '_blank');
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
        showInvoice,
        setFormat,
        printInvoice,
        downloadPDF,
        shareViaWhatsApp
    };
})();

// Export for module systems or attach to global window
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppInvoice;
}
