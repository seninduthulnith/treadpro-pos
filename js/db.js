/**
 * TreadPro Database Engine (IndexedDB)
 * 100% Free, Unlimited Client-Side Storage, Zero Server Cost, Offline-First.
 * Handles Items, Inventory Movements, Sales, Purchases, Users, and Services.
 */

const AppDB = (function () {
    'use strict';

    const DB_NAME = 'TreadProTyreTubeDB_v2';
    const DB_VERSION = 1;
    let dbInstance = null;

    /**
     * Open or initialize the IndexedDB database
     */
    function openDB() {
        return new Promise((resolve, reject) => {
            if (dbInstance) {
                resolve(dbInstance);
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = function (event) {
                const db = event.target.result;

                // 1. Items Store (Tyres, Tubes, Accessories)
                if (!db.objectStoreNames.contains('items')) {
                    const itemStore = db.createObjectStore('items', { keyPath: 'id' });
                    itemStore.createIndex('sku', 'sku', { unique: true });
                    itemStore.createIndex('brand', 'brand', { unique: false });
                    itemStore.createIndex('category', 'category', { unique: false });
                    itemStore.createIndex('size', 'size', { unique: false });
                    itemStore.createIndex('vehicleType', 'vehicleType', { unique: false });
                }

                // 2. Sales Store (POS Orders / Invoices)
                if (!db.objectStoreNames.contains('sales')) {
                    const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
                    salesStore.createIndex('invoiceNo', 'invoiceNo', { unique: true });
                    salesStore.createIndex('date', 'date', { unique: false });
                    salesStore.createIndex('customerPhone', 'customer.phone', { unique: false });
                    salesStore.createIndex('vehicleNo', 'customer.vehicleNo', { unique: false });
                }

                // 3. Purchases Store (Stock In)
                if (!db.objectStoreNames.contains('purchases')) {
                    const purchaseStore = db.createObjectStore('purchases', { keyPath: 'id' });
                    purchaseStore.createIndex('purchaseNo', 'purchaseNo', { unique: true });
                    purchaseStore.createIndex('date', 'date', { unique: false });
                    purchaseStore.createIndex('supplier', 'supplier', { unique: false });
                }

                // 4. Users Store (Role-based access)
                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'id' });
                    userStore.createIndex('username', 'username', { unique: true });
                    userStore.createIndex('role', 'role', { unique: false });
                }

                // 5. Repair Services Store (Future expansion)
                if (!db.objectStoreNames.contains('services')) {
                    const serviceStore = db.createObjectStore('services', { keyPath: 'id' });
                    serviceStore.createIndex('name', 'name', { unique: false });
                    serviceStore.createIndex('category', 'category', { unique: false });
                }

                // 6. Settings Store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };

            request.onsuccess = async function (event) {
                dbInstance = event.target.result;
                await seedInitialDataIfNeeded();
                resolve(dbInstance);
            };

            request.onerror = function (event) {
                console.error('IndexedDB open error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Generic helper for transaction execution
     */
    async function executeTransaction(storeNames, mode, callback) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeNames, mode);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            callback(tx);
        });
    }

    /**
     * Get all records from a store
     */
    async function getAll(storeName) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get single record by ID
     */
    async function getById(storeName, id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Add a new record
     */
    async function add(storeName, item) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.add(item);
            request.onsuccess = () => resolve(item);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Update an existing record
     */
    async function update(storeName, item) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(item);
            request.onsuccess = () => resolve(item);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete record by ID
     */
    async function remove(storeName, id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Query with filter function
     */
    async function query(storeName, filterFn) {
        const all = await getAll(storeName);
        return filterFn ? all.filter(filterFn) : all;
    }

    /**
     * Process POS Sale Checkout:
     * Saves Sale record and automatically deducts stock from items
     */
    async function processSaleCheckout(saleData) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['sales', 'items'], 'readwrite');
            const salesStore = tx.objectStore('sales');
            const itemsStore = tx.objectStore('items');

            // 1. Save Sale
            salesStore.add(saleData);

            // 2. Decrement stock for inventory items (skip non-inventory services)
            saleData.items.forEach(saleItem => {
                if (saleItem.itemId && saleItem.category !== 'service') {
                    const itemReq = itemsStore.get(saleItem.itemId);
                    itemReq.onsuccess = () => {
                        const product = itemReq.result;
                        if (product) {
                            product.stock = Math.max(0, (product.stock || 0) - saleItem.quantity);
                            product.updatedAt = new Date().toISOString();
                            itemsStore.put(product);
                        }
                    };
                }
            });

            tx.oncomplete = () => resolve(saleData);
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Process Stock In / Purchase:
     * Saves Purchase record and increases item stock + updates cost price
     */
    async function processStockIn(purchaseData) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['purchases', 'items'], 'readwrite');
            const purchaseStore = tx.objectStore('purchases');
            const itemsStore = tx.objectStore('items');

            // 1. Save purchase order
            purchaseStore.add(purchaseData);

            // 2. Increment stock for all items
            purchaseData.items.forEach(purchItem => {
                const itemReq = itemsStore.get(purchItem.itemId);
                itemReq.onsuccess = () => {
                    const product = itemReq.result;
                    if (product) {
                        product.stock = (product.stock || 0) + Number(purchItem.quantity);
                        if (purchItem.unitCost && Number(purchItem.unitCost) > 0) {
                            product.costPrice = Number(purchItem.unitCost);
                        }
                        product.updatedAt = new Date().toISOString();
                        itemsStore.put(product);
                    }
                };
            });

            tx.oncomplete = () => resolve(purchaseData);
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Seed initial demo data (Items, Users, Services, Settings, Sample History)
     */
    async function seedInitialDataIfNeeded() {
        const users = await getAll('users');
        if (users.length > 0) {
            return; // Already initialized
        }

        console.log('Seeding initial TreadPro store data...');

        // 1. Initialize Default Users with PBKDF2 Hashed Passwords
        // 'admin' -> password 'admin123'
        // 'cashier' -> password 'cashier123'
        const adminHash = await AppCrypto.hashPassword('admin123');
        const cashierHash = await AppCrypto.hashPassword('cashier123');

        const initialUsers = [
            {
                id: 'usr_admin',
                username: 'admin',
                fullName: 'Shop Owner / Administrator',
                role: 'admin',
                passwordHash: adminHash.hash,
                passwordSalt: adminHash.salt,
                status: 'active',
                createdAt: new Date().toISOString()
            },
            {
                id: 'usr_cashier',
                username: 'cashier',
                fullName: 'Counter Sales Cashier',
                role: 'cashier',
                passwordHash: cashierHash.hash,
                passwordSalt: cashierHash.salt,
                status: 'active',
                createdAt: new Date().toISOString()
            }
        ];

        for (const u of initialUsers) {
            await add('users', u);
        }

        // 2. Initialize Shop Settings
        const settings = [
            { key: 'shopName', value: 'Apex Tyre & Tube Center' },
            { key: 'tagline', value: 'Complete Tyres, Tubes & Wheel Service Solutions' },
            { key: 'phone', value: '+91 98765 43210' },
            { key: 'email', value: 'contact@apextyrecentre.com' },
            { key: 'address', value: 'Auto Hub, Main Road' },
            { key: 'currency', value: 'Rs. ' },
            { key: 'taxRate', value: 5.0 },
            { key: 'taxEnabled', value: true },
            { key: 'invoicePrefix', value: 'INV-' },
            { key: 'invoiceFooterNote', value: 'Thank you for your business! Please check wheel nuts after 50km.' }
        ];

        for (const s of settings) {
            await add('settings', s);
        }

        // 3. Base Workshop Repair & Maintenance Services
        const initialServices = [
            {
                id: 'srv_01',
                name: 'Tubeless Tyre Puncture Repair (Plugs)',
                category: 'repair',
                price: 150.00,
                durationMinutes: 10,
                description: 'Fast rubberized puncture string plug for tubeless tyres',
                active: true
            },
            {
                id: 'srv_02',
                name: 'Inner Mushroom Patch / Vulcanizing Repair',
                category: 'repair',
                price: 350.00,
                durationMinutes: 25,
                description: 'Permanent internal cold vulcanized mushroom patch for high-speed tyres',
                active: true
            },
            {
                id: 'srv_03',
                name: 'Tube Puncture Hot Vulcanizing Patch',
                category: 'repair',
                price: 100.00,
                durationMinutes: 15,
                description: 'Durable heat-bonded patch repair for punctured inner tubes',
                active: true
            },
            {
                id: 'srv_04',
                name: 'Precision Computerized Wheel Balancing (Per Wheel)',
                category: 'maintenance',
                price: 150.00,
                durationMinutes: 15,
                description: 'Dynamic wheel balancing with clip-on/stick-on weights',
                active: true
            },
            {
                id: 'srv_05',
                name: '3D Laser Computerized Wheel Alignment (4 Wheels)',
                category: 'maintenance',
                price: 600.00,
                durationMinutes: 30,
                description: 'Complete front and rear toe, camber & caster alignment measurement',
                active: true
            },
            {
                id: 'srv_06',
                name: 'Tyre Dismount, Mount & New Valve Fitting',
                category: 'fitting',
                price: 120.00,
                durationMinutes: 15,
                description: 'Hydraulic tyre changer mounting with new high-pressure valve',
                active: true
            },
            {
                id: 'srv_07',
                name: 'Pure Nitrogen Air Filling (4 Tyres)',
                category: 'maintenance',
                price: 150.00,
                durationMinutes: 10,
                description: '99% pure nitrogen inflation for steady tyre pressure and cooler runs',
                active: true
            }
        ];

        for (const srv of initialServices) {
            await add('services', srv);
        }

        // NOTE: All historical items, sales, and purchases are completely empty.
        // Ready for user to enter their real data!
        console.log('TreadPro store initialized with clean state (zero dummy sales, zero dummy stock).');
    }

    /**
     * Clear all inventory items, sales records, and purchase orders.
     * Keeps user accounts and shop settings intact.
     */
    async function clearAllHistoricalData() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['items', 'sales', 'purchases'], 'readwrite');
            tx.objectStore('items').clear();
            tx.objectStore('sales').clear();
            tx.objectStore('purchases').clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Backup whole database to JSON object for download
     */
    async function exportDatabaseToJson() {
        const stores = ['items', 'sales', 'purchases', 'users', 'services', 'settings'];
        const backupData = {
            appName: 'TreadPro POS',
            exportDate: new Date().toISOString(),
            version: DB_VERSION,
            stores: {}
        };

        for (const store of stores) {
            backupData.stores[store] = await getAll(store);
        }

        return backupData;
    }

    /**
     * Restore database from JSON backup object
     */
    async function importDatabaseFromJson(backupData) {
        if (!backupData || !backupData.stores) {
            throw new Error('Invalid backup file structure');
        }

        const stores = ['items', 'sales', 'purchases', 'users', 'services', 'settings'];
        const db = await openDB();

        for (const storeName of stores) {
            if (backupData.stores[storeName]) {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                store.clear();
                for (const item of backupData.stores[storeName]) {
                    store.add(item);
                }
            }
        }

        return true;
    }

    return {
        openDB,
        getAll,
        getById,
        add,
        update,
        remove,
        query,
        processSaleCheckout,
        processStockIn,
        exportDatabaseToJson,
        importDatabaseFromJson,
        clearAllHistoricalData
    };
})();

// Export for module systems and attach to global window
window.AppDB = AppDB;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppDB;
}
