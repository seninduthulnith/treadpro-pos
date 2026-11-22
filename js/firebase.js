/**
 * TreadPro Firebase Cloud Sync Engine
 * Connects local IndexedDB with Google Cloud Firestore.
 * 100% Free Forever under Firebase Spark Plan.
 */

const AppFirebase = (function () {
    'use strict';

    // Firebase App Configuration from user
    const firebaseConfig = {
        apiKey: "AIzaSyDehg_gv37p5J9jxYA7eTuPOkuNG76CLtI",
        authDomain: "treadpro-pos.firebaseapp.com",
        projectId: "treadpro-pos",
        storageBucket: "treadpro-pos.firebasestorage.app",
        messagingSenderId: "155603419070",
        appId: "1:155603419070:web:938f2d2a3b78ebb70983ef",
        measurementId: "G-2W91L45V2L"
    };

    let fbApp = null;
    let fbDb = null;
    let isInitialized = false;

    /**
     * Initialize Firebase & Firestore
     */
    function init() {
        if (typeof firebase === 'undefined') {
            console.warn('Firebase SDK script not loaded yet.');
            return false;
        }

        try {
            if (!firebase.apps || firebase.apps.length === 0) {
                fbApp = firebase.initializeApp(firebaseConfig);
            } else {
                fbApp = firebase.app();
            }

            fbDb = firebase.firestore();

            // Enable offline persistence in Firestore
            try {
                fbDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
                    console.log('Firestore offline persistence notice:', err.code);
                });
            } catch (persistErr) {
                // Ignore if not supported in multi-tab
            }

            isInitialized = true;
            console.log('✅ Firebase Cloud Firestore initialized successfully for TreadPro POS.');
            updateSyncStatusUI('Connected (Ready to Sync)', 'success');
            return true;
        } catch (e) {
            console.error('Firebase initialization error:', e);
            updateSyncStatusUI('Connection error: ' + e.message, 'danger');
            return false;
        }
    }

    /**
     * Check if Firebase is active
     */
    function isReady() {
        if (!isInitialized) {
            init();
        }
        return isInitialized && fbDb !== null;
    }

    /**
     * Sync single record to Cloud Firestore
     */
    async function syncRecord(storeName, record) {
        if (!isReady()) return;
        try {
            const docId = String(record.id || record.key || Date.now());
            // Sanitize record to plain JSON object
            const cleanData = JSON.parse(JSON.stringify(record));
            cleanData._updatedAt = new Date().toISOString();

            await fbDb.collection(storeName).doc(docId).set(cleanData, { merge: true });
        } catch (err) {
            console.warn(`Firestore sync record error for [${storeName}]:`, err);
        }
    }

    /**
     * Backup ALL local IndexedDB records to Cloud Firestore in 1 Click
     */
    async function backupAllToCloud() {
        if (!isReady()) {
            throw new Error('Firebase Cloud is not initialized. Check your internet connection.');
        }

        updateSyncStatusUI('Backing up all data to Google Cloud...', 'warning');

        const stores = ['items', 'sales', 'purchases', 'services', 'users', 'settings', 'expenses', 'investments'];
        let totalCount = 0;

        for (const storeName of stores) {
            const records = await AppDB.getAll(storeName);
            if (!records || records.length === 0) continue;

            const batch = fbDb.batch();
            let batchCount = 0;

            for (const item of records) {
                const docId = String(item.id || item.key || item.sku || Date.now() + Math.random());
                const cleanData = JSON.parse(JSON.stringify(item));
                cleanData._cloudSyncedAt = new Date().toISOString();

                const ref = fbDb.collection(storeName).doc(docId);
                batch.set(ref, cleanData, { merge: true });
                batchCount++;
                totalCount++;

                // Firestore batch limit is 500
                if (batchCount >= 450) {
                    await batch.commit();
                    batchCount = 0;
                }
            }

            if (batchCount > 0) {
                await batch.commit();
            }
        }

        // Store sync timestamp
        const nowIso = new Date().toISOString();
        await fbDb.collection('metadata').doc('last_backup').set({
            timestamp: nowIso,
            totalRecords: totalCount
        });

        localStorage.setItem('treadpro_last_cloud_backup', nowIso);
        updateSyncStatusUI(`Backed up ${totalCount} records to Cloud (${new Date().toLocaleTimeString()})`, 'success');

        return totalCount;
    }

    /**
     * Clear Cloud Firestore Collections for items, sales, and purchases
     * Called when the user chooses to start fresh with real data.
     */
    async function clearCloudStoreData() {
        if (!isReady()) return;

        updateSyncStatusUI('Clearing historical data from Google Cloud...', 'warning');

        const storesToClear = ['items', 'sales', 'purchases', 'expenses', 'investments'];

        for (const storeName of storesToClear) {
            try {
                const snap = await fbDb.collection(storeName).get();
                if (!snap.empty) {
                    const batch = fbDb.batch();
                    snap.docs.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                    await batch.commit();
                }
            } catch (err) {
                console.warn(`Failed to clear Firestore collection [${storeName}]:`, err);
            }
        }

        updateSyncStatusUI('Google Cloud cleared. Ready for fresh data.', 'success');
    }

    /**
     * Restore ALL shop records from Cloud Firestore down into local IndexedDB
     */
    async function restoreAllFromCloud() {
        if (!isReady()) {
            throw new Error('Firebase Cloud is not initialized. Check your internet connection.');
        }

        updateSyncStatusUI('Fetching backup from Google Cloud...', 'warning');

        const stores = ['items', 'sales', 'purchases', 'services', 'users', 'settings', 'expenses', 'investments'];
        let totalRestored = 0;

        for (const storeName of stores) {
            const snap = await fbDb.collection(storeName).get();
            if (snap.empty) continue;

            for (const doc of snap.docs) {
                const data = doc.data();
                delete data._cloudSyncedAt;
                delete data._updatedAt;

                try {
                    // Update or add to local DB
                    const existing = await AppDB.getById(storeName, data.id || data.key);
                    if (existing) {
                        await AppDB.update(storeName, data);
                    } else {
                        await AppDB.add(storeName, data);
                    }
                    totalRestored++;
                } catch (e) {
                    console.warn(`Local save error during cloud restore [${storeName}]:`, e);
                }
            }
        }

        updateSyncStatusUI(`Restored ${totalRestored} records from Google Cloud!`, 'success');
        return totalRestored;
    }

    /**
     * Update UI Status badge in Settings
     */
    function updateSyncStatusUI(message, statusType) {
        const badge = document.getElementById('firebaseStatusBadge');
        if (badge) {
            badge.textContent = message;
            badge.className = `badge badge-${statusType === 'danger' ? 'danger' : (statusType === 'warning' ? 'warning' : 'success')}`;
        }
    }

    return {
        init,
        isReady,
        syncRecord,
        backupAllToCloud,
        clearCloudStoreData,
        restoreAllFromCloud
    };
})();

// Attach to window
window.AppFirebase = AppFirebase;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppFirebase;
}
