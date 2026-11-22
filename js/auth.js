/**
 * TreadPro Authentication & Role-Based Access Control (RBAC) Module
 * Manages user sessions, permission checks, and UI visibility.
 */

const AppAuth = (function () {
    'use strict';

    const SESSION_KEY = 'treadpro_session_user';
    let currentUser = null;

    // Role Permissions Matrix
    const PERMISSIONS = {
        admin: [
            'pos_checkout',
            'inventory_view',
            'inventory_manage',
            'inventory_costs',
            'stock_in',
            'sales_view',
            'services_manage',
            'users_manage',
            'analytics_view',
            'analytics_profits',
            'settings_manage',
            'database_backup',
            'loyalty_manage',
            'money_manage'
        ],
        manager: [
            'pos_checkout',
            'inventory_view',
            'inventory_manage',
            'inventory_costs',
            'stock_in',
            'sales_view',
            'analytics_view',
            'loyalty_manage',
            'money_manage'
        ],
        cashier: [
            'pos_checkout',
            'inventory_view',
            'sales_view'
        ]
    };

    /**
     * Initialize Auth on page load
     */
    async function init() {
        const stored = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
        if (stored) {
            try {
                currentUser = JSON.parse(stored);
                // Verify user still exists and is active in DB
                const userInDb = await AppDB.getById('users', currentUser.id);
                if (!userInDb || userInDb.status === 'disabled') {
                    logout();
                    return null;
                }
                currentUser = {
                    id: userInDb.id,
                    username: userInDb.username,
                    fullName: userInDb.fullName,
                    role: userInDb.role
                };
            } catch (e) {
                currentUser = null;
            }
        }
        updateUI();
        return currentUser;
    }

    /**
     * Authenticate user with username and password
     */
    async function login(username, password, rememberMe = false) {
        if (!username || !password) {
            throw new Error('Please enter both username and password.');
        }

        const users = await AppDB.query('users', u => u.username.toLowerCase() === username.trim().toLowerCase());
        if (!users || users.length === 0) {
            throw new Error('Invalid username or password.');
        }

        const user = users[0];

        if (user.status === 'disabled') {
            throw new Error('Your account is currently disabled. Contact shop administrator.');
        }

        // Verify password using cryptographically secure PBKDF2 hash verification
        const isMatch = await AppCrypto.verifyPassword(password, user.passwordHash, user.passwordSalt);
        if (!isMatch) {
            throw new Error('Invalid username or password.');
        }

        currentUser = {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            role: user.role
        };

        const sessionStr = JSON.stringify(currentUser);
        if (rememberMe) {
            localStorage.setItem(SESSION_KEY, sessionStr);
        } else {
            sessionStorage.setItem(SESSION_KEY, sessionStr);
        }

        updateUI();
        return currentUser;
    }

    /**
     * Log out current user
     */
    function logout() {
        currentUser = null;
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
        updateUI();
        // Dispatch event
        window.dispatchEvent(new CustomEvent('auth:logout'));
    }

    /**
     * Get current user
     */
    function getCurrentUser() {
        return currentUser;
    }

    /**
     * Check if current user has permission
     */
    function hasPermission(permissionName) {
        if (!currentUser) return false;
        const role = currentUser.role || 'cashier';
        const rolePerms = PERMISSIONS[role] || [];
        return rolePerms.includes(permissionName);
    }

    /**
     * Check if current user is an Admin
     */
    function isAdmin() {
        return currentUser && currentUser.role === 'admin';
    }

    /**
     * Updates DOM visibility based on current user's role and permissions
     */
    function updateUI() {
        const authStatusEls = document.querySelectorAll('.auth-user-name');
        const authRoleEls = document.querySelectorAll('.auth-user-role');
        const loginPageEl = document.getElementById('loginPage');
        const loginModalEl = document.getElementById('loginModal');
        const appWrapperEl = document.getElementById('appWrapper');

        if (currentUser) {
            authStatusEls.forEach(el => el.textContent = currentUser.fullName || currentUser.username);
            authRoleEls.forEach(el => el.textContent = currentUser.role.toUpperCase());

            // Hide full login screen & modal
            if (loginPageEl) loginPageEl.style.display = 'none';
            if (loginModalEl) loginModalEl.classList.remove('active');
            if (appWrapperEl) {
                appWrapperEl.style.display = 'flex';
                appWrapperEl.classList.remove('app-blurred');
            }

            // Apply granular element visibility based on permissions
            document.querySelectorAll('[data-permission]').forEach(el => {
                const requiredPerm = el.getAttribute('data-permission');
                if (hasPermission(requiredPerm)) {
                    el.classList.remove('hidden-by-role');
                } else {
                    el.classList.add('hidden-by-role');
                }
            });

            // Admin only elements
            document.querySelectorAll('[data-admin-only]').forEach(el => {
                if (isAdmin()) {
                    el.classList.remove('hidden-by-role');
                } else {
                    el.classList.add('hidden-by-role');
                }
            });
        } else {
            // Not logged in -> Show full login screen, hide main app
            if (loginPageEl) loginPageEl.style.display = 'flex';
            if (loginModalEl) loginModalEl.classList.add('active');
            if (appWrapperEl) {
                appWrapperEl.style.display = 'none';
                appWrapperEl.classList.add('app-blurred');
            }
        }
    }

    return {
        init,
        login,
        logout,
        getCurrentUser,
        hasPermission,
        isAdmin,
        updateUI
    };
})();

// Export for module systems and attach to global window
window.AppAuth = AppAuth;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppAuth;
}
