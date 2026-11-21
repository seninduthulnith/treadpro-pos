/**
 * TreadPro Database Engine (IndexedDB)
 * 100% Free, Unlimited Client-Side Storage, Zero Server Cost, Offline-First.
 * Handles Items, Inventory Movements, Sales, Purchases, Users, and Services.
 */

const AppDB = (function () {
    'use strict';

    const DB_NAME = 'TreadProTyreTubeDB';
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
            { key: 'phone', value: '+1 (555) 382-7888' },
            { key: 'email', value: 'contact@apextyrecentre.com' },
            { key: 'address', value: '450 Industrial Parkway, Auto Hub Blvd' },
            { key: 'currency', value: '$' },
            { key: 'taxRate', value: 5.0 },
            { key: 'taxEnabled', value: true },
            { key: 'invoicePrefix', value: 'INV-' },
            { key: 'invoiceFooterNote', value: 'Thank you for your business! Please check wheel nuts after 50km.' }
        ];

        for (const s of settings) {
            await add('settings', s);
        }

        // 3. Seed Realistic Tyre & Tube Inventory
        const initialItems = [
            // --- CAR TYRES ---
            {
                id: 'item_tyr_01',
                sku: 'TYR-MIC-2055516',
                name: 'Michelin Primacy 4',
                category: 'tyre',
                brand: 'Michelin',
                size: '205/55 R16',
                pattern: 'Primacy 4 ST',
                vehicleType: 'Car',
                plyRating: 'Tubeless (91V)',
                valveType: '',
                costPrice: 85.00,
                sellingPrice: 120.00,
                stock: 24,
                minStockAlert: 6,
                location: 'Rack A-01',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'item_tyr_02',
                sku: 'TYR-BRD-1956515',
                name: 'Bridgestone Turanza T005',
                category: 'tyre',
                brand: 'Bridgestone',
                size: '195/65 R15',
                pattern: 'Turanza T005',
                vehicleType: 'Car',
                plyRating: 'Tubeless (91H)',
                valveType: '',
                costPrice: 62.00,
                sellingPrice: 90.00,
                stock: 32,
                minStockAlert: 8,
                location: 'Rack A-02',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'item_tyr_03',
                sku: 'TYR-GOO-1756514',
                name: 'Goodyear Assurance TripleMax',
                category: 'tyre',
                brand: 'Goodyear',
                size: '175/65 R14',
                pattern: 'Assurance 2',
                vehicleType: 'Car',
                plyRating: 'Tubeless (82T)',
                valveType: '',
                costPrice: 45.00,
                sellingPrice: 68.00,
                stock: 18,
                minStockAlert: 5,
                location: 'Rack A-03',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'item_tyr_04',
                sku: 'TYR-CON-2156016',
                name: 'Continental UltraContact UC6',
                category: 'tyre',
                brand: 'Continental',
                size: '215/60 R16',
                pattern: 'UC6 SUV',
                vehicleType: 'SUV',
                plyRating: 'Tubeless (95H)',
                valveType: '',
                costPrice: 95.00,
                sellingPrice: 135.00,
                stock: 12,
                minStockAlert: 4,
                location: 'Rack B-01',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'item_tyr_05',
                sku: 'TYR-PIR-2254517',
                name: 'Pirelli Cinturato P7',
                category: 'tyre',
                brand: 'Pirelli',
                size: '225/45 R17',
                pattern: 'Cinturato P7 RunFlat',
                vehicleType: 'Car',
                plyRating: 'Tubeless (91W)',
                valveType: '',
                costPrice: 110.00,
                sellingPrice: 155.00,
                stock: 4, // Low stock on purpose
                minStockAlert: 6,
                location: 'Rack B-02',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            // --- MOTORCYCLE & SCOOTER TYRES ---
            {
                id: 'item_tyr_06',
                sku: 'TYR-MRF-1009017',
                name: 'MRF Zapper C Rear',
                category: 'tyre',
                brand: 'MRF',
                size: '100/90-17',
                pattern: 'Zapper C Tubeless',
                vehicleType: 'Motorcycle',
                plyRating: '6PR (55P)',
                valveType: '',
                costPrice: 24.00,
                sellingPrice: 38.00,
                stock: 40,
                minStockAlert: 10,
                location: 'Rack C-01',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'item_tyr_07',
                sku: 'TYR-CEA-1208018',
                name: 'CEAT Zoom Plus',
                category: 'tyre',
                brand: 'CEAT',
                size: '120/80-18',
                pattern: 'Zoom Plus Radial',
                vehicleType: 'Motorcycle',
                plyRating: 'Tubeless (62P)',
                valveType: '',
                costPrice: 32.00,
                sellingPrice: 48.00,
                stock: 15,
                minStockAlert: 5,
                location: 'Rack C-02',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'item_tyr_08',
                sku: 'TYR-TVS-909012',
                name: 'TVS Eurogrip Dragon',
                category: 'tyre',
                brand: 'TVS Eurogrip',
                size: '90/90-12',
                pattern: 'Dragon Scooty',
                vehicleType: 'Scooter',
                plyRating: 'Tubeless (54J)',
                valveType: '',
                costPrice: 16.00,
                sellingPrice: 26.00,
                stock: 28,
                minStockAlert: 8,
                location: 'Rack C-03',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            // --- COMMERCIAL & TRUCK TYRES ---
            {
                id: 'item_tyr_09',
                sku: 'TYR-APO-2958022',
                name: 'Apollo EnduRace RA',
                category: 'tyre',
                brand: 'Apollo',
                size: '295/80 R22.5',
                pattern: 'EnduRace Steer/All',
                vehicleType: 'Truck',
                plyRating: '16PR (152/148M)',
                valveType: '',
                costPrice: 280.00,
                sellingPrice: 360.00,
                stock: 8,
                minStockAlert: 3,
                location: 'Heavy Bay 01',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },

            // --- TUBES (Scooter, Bike, Car, Truck) ---
            {
                id: 'item_tub_01',
                sku: 'TUB-MRF-909012',
                name: 'MRF Premium Butyl Tube',
                category: 'tube',
                brand: 'MRF',
                size: '90/90-12 (3.00/3.50-10)',
                pattern: 'Heat Resistant Butyl',
                vehicleType: 'Scooter',
                plyRating: 'Heavy Duty',
                valveType: 'TR-87 (90-deg Bent Valve)',
                costPrice: 4.50,
                sellingPrice: 8.00,
                stock: 65,
                minStockAlert: 15,
                location: 'Bin Tube-01',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'item_tub_02',
                sku: 'TUB-CEA-1009017',
                name: 'CEAT Secura Heavy Tube',
                category: 'tube',
                brand: 'CEAT',
                size: '100/90-17 (3.00-17)',
                pattern: 'Reinforced Motorcycle Tube',
                vehicleType: 'Motorcycle',
                plyRating: 'Standard Duty',
                valveType: 'TR-4 (Straight Threaded)',
                costPrice: 5.20,
                sellingPrice: 9.50,
                stock: 50,
                minStockAlert: 12,
                location: 'Bin Tube-02',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'item_tub_03',
                sku: 'TUB-APO-1458012',
                name: 'Apollo DuraTube Car Tube',
                category: 'tube',
                brand: 'Apollo',
                size: '145/80 R12 (155/70 R12)',
                pattern: 'Passenger Car Butyl Tube',
                vehicleType: 'Car',
                plyRating: 'Heavy Duty',
                valveType: 'TR-13 (Straight Brass)',
                costPrice: 7.00,
                sellingPrice: 13.00,
                stock: 35,
                minStockAlert: 10,
                location: 'Bin Tube-03',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'item_tub_04',
                sku: 'TUB-BRD-1757014',
                name: 'Bridgestone Radial Car Tube',
                category: 'tube',
                brand: 'Bridgestone',
                size: '175/70 R14 (185/65 R14)',
                pattern: 'Long Life Butyl',
                vehicleType: 'Car',
                plyRating: 'Extra Thick',
                valveType: 'TR-13 (Straight Rubber Base)',
                costPrice: 9.50,
                sellingPrice: 16.00,
                stock: 22,
                minStockAlert: 8,
                location: 'Bin Tube-04',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'item_tub_05',
                sku: 'TUB-JKT-100020',
                name: 'JK Tyre Truck Heavy Duty Tube',
                category: 'tube',
                brand: 'JK Tyre',
                size: '10.00-20 (11.00-20)',
                pattern: 'Commercial Truck Tube',
                vehicleType: 'Truck',
                plyRating: 'Double Thick',
                valveType: 'TR-78A (Long Bent Brass)',
                costPrice: 22.00,
                sellingPrice: 35.00,
                stock: 14,
                minStockAlert: 5,
                location: 'Heavy Bay Tube',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        ];

        for (const item of initialItems) {
            await add('items', item);
        }

        // 4. Seed Future-Ready Repair & Maintenance Services
        const initialServices = [
            {
                id: 'srv_01',
                name: 'Tubeless Tyre Puncture Repair (Plugs)',
                category: 'repair',
                price: 8.00,
                durationMinutes: 10,
                description: 'Fast rubberized puncture string plug for tubeless tyres',
                active: true
            },
            {
                id: 'srv_02',
                name: 'Inner Mushroom Patch / Vulcanizing Repair',
                category: 'repair',
                price: 18.00,
                durationMinutes: 25,
                description: 'Permanent internal cold vulcanized mushroom patch for high-speed tyres',
                active: true
            },
            {
                id: 'srv_03',
                name: 'Tube Puncture Hot Vulcanizing Patch',
                category: 'repair',
                price: 5.00,
                durationMinutes: 15,
                description: 'Durable heat-bonded patch repair for punctured inner tubes',
                active: true
            },
            {
                id: 'srv_04',
                name: 'Precision Computerized Wheel Balancing (Per Wheel)',
                category: 'maintenance',
                price: 7.50,
                durationMinutes: 15,
                description: 'Dynamic wheel balancing with clip-on/stick-on zinc weights',
                active: true
            },
            {
                id: 'srv_05',
                name: '3D Laser Computerized Wheel Alignment (4 Wheels)',
                category: 'maintenance',
                price: 25.00,
                durationMinutes: 30,
                description: 'Complete front and rear toe, camber & caster alignment measurement',
                active: true
            },
            {
                id: 'srv_06',
                name: 'Tyre Dismount, Mount & New Valve Fitting',
                category: 'fitting',
                price: 6.00,
                durationMinutes: 15,
                description: 'Hydraulic tyre changer mounting with new high-pressure TR-414 valve',
                active: true
            },
            {
                id: 'srv_07',
                name: 'Pure Nitrogen Air Filling (4 Tyres)',
                category: 'maintenance',
                price: 10.00,
                durationMinutes: 10,
                description: '99% pure nitrogen inflation for steady tyre pressure and cooler runs',
                active: true
            }
        ];

        for (const srv of initialServices) {
            await add('services', srv);
        }

        // 5. Seed Historical Purchases & Sales (Last 4 Weeks)
        // This makes the Dashboard Graphs immediately populated and insightful!
        const now = new Date();
        const makeDate = (daysAgo) => {
            const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
            return d.toISOString();
        };

        // Historical Purchases
        const samplePurchases = [
            {
                id: 'pur_01',
                purchaseNo: 'PUR-2026-001',
                date: makeDate(28),
                supplier: 'Apex National Rubber Ltd',
                supplierInvoiceNo: 'SUP-9921',
                totalAmount: 3820.00,
                paymentStatus: 'paid',
                items: [
                    { itemId: 'item_tyr_01', itemName: 'Michelin Primacy 4 (205/55 R16)', brand: 'Michelin', size: '205/55 R16', quantity: 20, unitCost: 85.00, totalCost: 1700.00 },
                    { itemId: 'item_tyr_02', itemName: 'Bridgestone Turanza T005 (195/65 R15)', brand: 'Bridgestone', size: '195/65 R15', quantity: 25, unitCost: 62.00, totalCost: 1550.00 },
                    { itemId: 'item_tub_01', itemName: 'MRF Premium Butyl Tube (90/90-12)', brand: 'MRF', size: '90/90-12', quantity: 60, unitCost: 4.50, totalCost: 270.00 },
                    { itemId: 'item_tub_02', itemName: 'CEAT Secura Heavy Tube (100/90-17)', brand: 'CEAT', size: '100/90-17', quantity: 50, unitCost: 6.00, totalCost: 300.00 }
                ]
            },
            {
                id: 'pur_02',
                purchaseNo: 'PUR-2026-002',
                date: makeDate(14),
                supplier: 'Continental & Apollo Wholesale Corp',
                supplierInvoiceNo: 'AP-5541',
                totalAmount: 2650.00,
                paymentStatus: 'paid',
                items: [
                    { itemId: 'item_tyr_04', itemName: 'Continental UltraContact UC6 (215/60 R16)', brand: 'Continental', size: '215/60 R16', quantity: 15, unitCost: 95.00, totalCost: 1425.00 },
                    { itemId: 'item_tyr_06', itemName: 'MRF Zapper C Rear (100/90-17)', brand: 'MRF', size: '100/90-17', quantity: 30, unitCost: 24.00, totalCost: 720.00 },
                    { itemId: 'item_tub_03', itemName: 'Apollo DuraTube Car Tube (145/80 R12)', brand: 'Apollo', size: '145/80 R12', quantity: 30, unitCost: 7.00, totalCost: 210.00 }
                ]
            },
            {
                id: 'pur_03',
                purchaseNo: 'PUR-2026-003',
                date: makeDate(3),
                supplier: 'Eurogrip & Truck Tyres Express',
                supplierInvoiceNo: 'ET-1029',
                totalAmount: 1840.00,
                paymentStatus: 'paid',
                items: [
                    { itemId: 'item_tyr_08', itemName: 'TVS Eurogrip Dragon (90/90-12)', brand: 'TVS Eurogrip', size: '90/90-12', quantity: 25, unitCost: 16.00, totalCost: 400.00 },
                    { itemId: 'item_tyr_09', itemName: 'Apollo EnduRace RA (295/80 R22.5)', brand: 'Apollo', size: '295/80 R22.5', quantity: 4, unitCost: 280.00, totalCost: 1120.00 },
                    { itemId: 'item_tub_05', itemName: 'JK Tyre Truck Heavy Duty Tube (10.00-20)', brand: 'JK Tyre', size: '10.00-20', quantity: 10, unitCost: 22.00, totalCost: 220.00 }
                ]
            }
        ];

        for (const p of samplePurchases) {
            await add('purchases', p);
        }

        // Historical Sales (spanning past 3 weeks to showcase graphs)
        const sampleSales = [
            {
                id: 'sale_01',
                invoiceNo: 'INV-2026-0001',
                date: makeDate(21),
                customer: { name: 'David Miller', phone: '+1-555-0142', vehicleNo: 'CA-789-TY', vehicleModel: 'Honda Civic 2020' },
                items: [
                    { itemId: 'item_tyr_01', itemName: 'Michelin Primacy 4 (205/55 R16)', brand: 'Michelin', size: '205/55 R16', category: 'tyre', quantity: 4, unitPrice: 120.00, costPrice: 85.00, discount: 0, total: 480.00 },
                    { itemId: 'srv_04', itemName: 'Precision Computerized Wheel Balancing', brand: 'Service', size: 'N/A', category: 'service', quantity: 4, unitPrice: 7.50, costPrice: 0, discount: 0, total: 30.00 }
                ],
                subtotal: 510.00,
                discountAmount: 20.00,
                taxRate: 5.0,
                taxAmount: 24.50,
                totalAmount: 514.50,
                paymentMethod: 'card',
                amountPaid: 514.50,
                change: 0.00,
                cashier: 'admin',
                status: 'completed'
            },
            {
                id: 'sale_02',
                invoiceNo: 'INV-2026-0002',
                date: makeDate(17),
                customer: { name: 'Sarah Jenkins', phone: '+1-555-0188', vehicleNo: 'NY-332-ZZ', vehicleModel: 'Toyota Corolla' },
                items: [
                    { itemId: 'item_tyr_02', itemName: 'Bridgestone Turanza T005 (195/65 R15)', brand: 'Bridgestone', size: '195/65 R15', category: 'tyre', quantity: 2, unitPrice: 90.00, costPrice: 62.00, discount: 0, total: 180.00 },
                    { itemId: 'item_tub_04', itemName: 'Bridgestone Radial Car Tube', brand: 'Bridgestone', size: '175/70 R14', category: 'tube', quantity: 2, unitPrice: 16.00, costPrice: 9.50, discount: 0, total: 32.00 }
                ],
                subtotal: 212.00,
                discountAmount: 0.00,
                taxRate: 5.0,
                taxAmount: 10.60,
                totalAmount: 222.60,
                paymentMethod: 'cash',
                amountPaid: 250.00,
                change: 27.40,
                cashier: 'cashier',
                status: 'completed'
            },
            {
                id: 'sale_03',
                invoiceNo: 'INV-2026-0003',
                date: makeDate(12),
                customer: { name: 'Carlos Gomez', phone: '+1-555-0199', vehicleNo: 'FL-BIKE-99', vehicleModel: 'Yamaha FZ / R15' },
                items: [
                    { itemId: 'item_tyr_06', itemName: 'MRF Zapper C Rear (100/90-17)', brand: 'MRF', size: '100/90-17', category: 'tyre', quantity: 1, unitPrice: 38.00, costPrice: 24.00, discount: 0, total: 38.00 },
                    { itemId: 'item_tub_02', itemName: 'CEAT Secura Heavy Tube (100/90-17)', brand: 'CEAT', size: '100/90-17', category: 'tube', quantity: 1, unitPrice: 9.50, costPrice: 5.20, discount: 0, total: 9.50 }
                ],
                subtotal: 47.50,
                discountAmount: 0.00,
                taxRate: 5.0,
                taxAmount: 2.38,
                totalAmount: 49.88,
                paymentMethod: 'cash',
                amountPaid: 50.00,
                change: 0.12,
                cashier: 'cashier',
                status: 'completed'
            },
            {
                id: 'sale_04',
                invoiceNo: 'INV-2026-0004',
                date: makeDate(8),
                customer: { name: 'Metro Transport Co.', phone: '+1-555-0300', vehicleNo: 'TX-COMM-44', vehicleModel: 'Freight Truck' },
                items: [
                    { itemId: 'item_tyr_09', itemName: 'Apollo EnduRace RA (295/80 R22.5)', brand: 'Apollo', size: '295/80 R22.5', category: 'tyre', quantity: 2, unitPrice: 360.00, costPrice: 280.00, discount: 20.00, total: 700.00 },
                    { itemId: 'item_tub_05', itemName: 'JK Tyre Truck Heavy Duty Tube', brand: 'JK Tyre', size: '10.00-20', category: 'tube', quantity: 2, unitPrice: 35.00, costPrice: 22.00, discount: 0, total: 70.00 }
                ],
                subtotal: 770.00,
                discountAmount: 0.00,
                taxRate: 5.0,
                taxAmount: 38.50,
                totalAmount: 808.50,
                paymentMethod: 'transfer',
                amountPaid: 808.50,
                change: 0.00,
                cashier: 'admin',
                status: 'completed'
            },
            {
                id: 'sale_05',
                invoiceNo: 'INV-2026-0005',
                date: makeDate(4),
                customer: { name: 'Emily Watson', phone: '+1-555-0455', vehicleNo: 'IL-554-QR', vehicleModel: 'Subaru Forester SUV' },
                items: [
                    { itemId: 'item_tyr_04', itemName: 'Continental UltraContact UC6 (215/60 R16)', brand: 'Continental', size: '215/60 R16', category: 'tyre', quantity: 4, unitPrice: 135.00, costPrice: 95.00, discount: 0, total: 540.00 },
                    { itemId: 'srv_05', itemName: '3D Laser Computerized Wheel Alignment', brand: 'Service', size: 'N/A', category: 'service', quantity: 1, unitPrice: 25.00, costPrice: 0, discount: 0, total: 25.00 }
                ],
                subtotal: 565.00,
                discountAmount: 15.00,
                taxRate: 5.0,
                taxAmount: 27.50,
                totalAmount: 577.50,
                paymentMethod: 'card',
                amountPaid: 577.50,
                change: 0.00,
                cashier: 'admin',
                status: 'completed'
            },
            {
                id: 'sale_06',
                invoiceNo: 'INV-2026-0006',
                date: makeDate(1),
                customer: { name: 'Kevin Lee', phone: '+1-555-0811', vehicleNo: 'WA-201-MC', vehicleModel: 'Honda Activa Scooter' },
                items: [
                    { itemId: 'item_tyr_08', itemName: 'TVS Eurogrip Dragon (90/90-12)', brand: 'TVS Eurogrip', size: '90/90-12', category: 'tyre', quantity: 1, unitPrice: 26.00, costPrice: 16.00, discount: 0, total: 26.00 },
                    { itemId: 'item_tub_01', itemName: 'MRF Premium Butyl Tube (90/90-12)', brand: 'MRF', size: '90/90-12', category: 'tube', quantity: 1, unitPrice: 8.00, costPrice: 4.50, discount: 0, total: 8.00 },
                    { itemId: 'srv_01', itemName: 'Tubeless Tyre Puncture Repair', brand: 'Service', size: 'N/A', category: 'service', quantity: 1, unitPrice: 8.00, costPrice: 0, discount: 0, total: 8.00 }
                ],
                subtotal: 42.00,
                discountAmount: 0.00,
                taxRate: 5.0,
                taxAmount: 2.10,
                totalAmount: 44.10,
                paymentMethod: 'cash',
                amountPaid: 50.00,
                change: 5.90,
                cashier: 'cashier',
                status: 'completed'
            }
        ];

        for (const sale of sampleSales) {
            await add('sales', sale);
        }

        console.log('TreadPro initial demo data seeded successfully!');
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
        importDatabaseFromJson
    };
})();

// Export for module systems or attach to global window
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppDB;
}
