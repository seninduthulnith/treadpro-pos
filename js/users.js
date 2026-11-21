/**
 * TreadPro User Management Module (Admin Exclusive)
 * Handles user creation, role assignment, and secure password hashing using WebCrypto PBKDF2.
 */

const AppUsers = (function () {
    'use strict';

    let userList = [];

    /**
     * Initialize User Management Module
     */
    async function init() {
        bindEvents();
        await loadUsers();
    }

    /**
     * Load all users from DB
     */
    async function loadUsers() {
        userList = await AppDB.getAll('users');
        renderUsersTable();
    }

    /**
     * Bind UI event listeners
     */
    function bindEvents() {
        // Add User Button
        const openModalBtn = document.getElementById('openAddUserModalBtn');
        if (openModalBtn) {
            openModalBtn.addEventListener('click', () => openUserModal());
        }

        // User Form Submit
        const userForm = document.getElementById('userForm');
        if (userForm) {
            userForm.addEventListener('submit', handleSaveUser);
        }

        // Reset Password Form Submit
        const resetPwForm = document.getElementById('resetPasswordForm');
        if (resetPwForm) {
            resetPwForm.addEventListener('submit', handleResetPasswordSubmit);
        }
    }

    /**
     * Render the Users Table
     */
    function renderUsersTable() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        const currentAdmin = AppAuth.getCurrentUser();

        if (userList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4 text-slate-500">
                        No users found in database.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = userList.map(u => {
            const isMe = currentAdmin && currentAdmin.id === u.id;
            let roleBadge = '<span class="badge badge-info">Cashier</span>';
            if (u.role === 'admin') roleBadge = '<span class="badge badge-primary">Administrator</span>';
            if (u.role === 'manager') roleBadge = '<span class="badge badge-warning">Shop Manager</span>';

            const statusBadge = u.status === 'disabled'
                ? '<span class="badge badge-danger">Disabled</span>'
                : '<span class="badge badge-success">Active</span>';

            const formattedDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A';

            return `
                <tr>
                    <td>
                        <div class="user-cell">
                            <div class="avatar-circle">${escapeHtml(u.username.substring(0, 2).toUpperCase())}</div>
                            <div>
                                <strong>${escapeHtml(u.username)}</strong> ${isMe ? '<span class="text-xs text-primary font-bold">(You)</span>' : ''}
                                <div class="text-xs text-slate-400">ID: ${escapeHtml(u.id)}</div>
                            </div>
                        </div>
                    </td>
                    <td>${escapeHtml(u.fullName || u.username)}</td>
                    <td>${roleBadge}</td>
                    <td>${statusBadge}</td>
                    <td>${formattedDate}</td>
                    <td class="action-cell">
                        <div class="btn-group">
                            <button class="btn btn-icon btn-sm" title="Reset Password" onclick="AppUsers.openResetPasswordModal('${u.id}')">
                                🔑
                            </button>
                            ${!isMe ? `
                                <button class="btn btn-icon btn-sm" title="${u.status === 'disabled' ? 'Enable User' : 'Disable User'}" onclick="AppUsers.toggleUserStatus('${u.id}')">
                                    ${u.status === 'disabled' ? '🟢' : '⏸️'}
                                </button>
                                <button class="btn btn-icon btn-sm text-danger" title="Delete User" onclick="AppUsers.deleteUser('${u.id}')">
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
     * Open Modal to Create User
     */
    function openUserModal() {
        if (!AppAuth.isAdmin()) {
            AppNotification.toast('Admin Only', 'Only the Administrator can create new users.', 'warning');
            return;
        }

        const modal = document.getElementById('userModal');
        const form = document.getElementById('userForm');
        if (!modal || !form) return;

        form.reset();
        modal.classList.add('active');
    }

    /**
     * Handle Create User submission
     */
    async function handleSaveUser(e) {
        e.preventDefault();

        const username = document.getElementById('userUsername').value.trim().toLowerCase();
        const fullName = document.getElementById('userFullName').value.trim();
        const role = document.getElementById('userRole').value;
        const password = document.getElementById('userPassword').value;
        const confirmPw = document.getElementById('userConfirmPassword').value;

        if (!username || !fullName || !role || !password) {
            AppNotification.toast('Validation Error', 'Please complete all required fields.', 'error');
            return;
        }

        if (username.length < 3) {
            AppNotification.toast('Invalid Username', 'Username must be at least 3 characters.', 'error');
            return;
        }

        if (password.length < 6) {
            AppNotification.toast('Password Weak', 'Password must be at least 6 characters.', 'error');
            return;
        }

        if (password !== confirmPw) {
            AppNotification.toast('Mismatch', 'Passwords do not match.', 'error');
            return;
        }

        // Check if username already exists
        const existing = userList.find(u => u.username.toLowerCase() === username);
        if (existing) {
            AppNotification.toast('Username Taken', `User "${username}" already exists.`, 'error');
            return;
        }

        try {
            // Cryptographically hash password with PBKDF2 (100,000 rounds)
            const cryptoResult = await AppCrypto.hashPassword(password);

            const newUser = {
                id: 'usr_' + Date.now(),
                username: username,
                fullName: fullName,
                role: role,
                passwordHash: cryptoResult.hash,
                passwordSalt: cryptoResult.salt,
                status: 'active',
                createdAt: new Date().toISOString()
            };

            await AppDB.add('users', newUser);
            AppNotification.toast('User Created', `User "${username}" (${role}) created successfully with secure PBKDF2 hash.`, 'success');

            document.getElementById('userModal').classList.remove('active');
            await loadUsers();
        } catch (err) {
            console.error('Error adding user:', err);
            AppNotification.toast('Error', 'Failed to create user. Please try again.', 'error');
        }
    }

    /**
     * Open Reset Password Modal
     */
    function openResetPasswordModal(userId) {
        const user = userList.find(u => u.id === userId);
        if (!user) return;

        const modal = document.getElementById('resetPasswordModal');
        const form = document.getElementById('resetPasswordForm');
        if (!modal || !form) return;

        form.reset();
        document.getElementById('resetPasswordUserId').value = user.id;
        document.getElementById('resetPasswordTargetUser').textContent = `${user.fullName} (${user.username})`;

        modal.classList.add('active');
    }

    /**
     * Handle Reset Password submission
     */
    async function handleResetPasswordSubmit(e) {
        e.preventDefault();

        const userId = document.getElementById('resetPasswordUserId').value;
        const newPassword = document.getElementById('newPasswordInput').value;
        const confirmNew = document.getElementById('confirmNewPasswordInput').value;

        if (!newPassword || newPassword.length < 6) {
            AppNotification.toast('Password Error', 'Password must be at least 6 characters long.', 'error');
            return;
        }

        if (newPassword !== confirmNew) {
            AppNotification.toast('Mismatch', 'New passwords do not match.', 'error');
            return;
        }

        const user = userList.find(u => u.id === userId);
        if (!user) return;

        try {
            const cryptoResult = await AppCrypto.hashPassword(newPassword);
            user.passwordHash = cryptoResult.hash;
            user.passwordSalt = cryptoResult.salt;
            user.updatedAt = new Date().toISOString();

            await AppDB.update('users', user);
            AppNotification.toast('Password Updated', `Password for "${user.username}" updated successfully.`, 'success');

            document.getElementById('resetPasswordModal').classList.remove('active');
        } catch (err) {
            console.error('Error resetting password:', err);
            AppNotification.toast('Error', 'Failed to update password.', 'error');
        }
    }

    /**
     * Toggle Active / Disabled status
     */
    async function toggleUserStatus(userId) {
        const user = userList.find(u => u.id === userId);
        if (!user) return;

        const newStatus = user.status === 'disabled' ? 'active' : 'disabled';
        user.status = newStatus;

        try {
            await AppDB.update('users', user);
            AppNotification.toast('Status Changed', `User "${user.username}" is now ${newStatus}.`, 'info');
            await loadUsers();
        } catch (err) {
            console.error('Error updating status:', err);
        }
    }

    /**
     * Delete user
     */
    async function deleteUser(userId) {
        const user = userList.find(u => u.id === userId);
        if (!user) return;

        // Ensure we don't delete the last admin
        if (user.role === 'admin') {
            const adminCount = userList.filter(u => u.role === 'admin' && u.status === 'active').length;
            if (adminCount <= 1) {
                AppNotification.toast('Protection Alert', 'Cannot delete the only active Administrator account.', 'error');
                return;
            }
        }

        const confirmed = confirm(`Are you sure you want to permanently delete user "${user.username}"?`);
        if (!confirmed) return;

        try {
            await AppDB.remove('users', userId);
            AppNotification.toast('Deleted', `User "${user.username}" has been removed.`, 'info');
            await loadUsers();
        } catch (err) {
            console.error('Error deleting user:', err);
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
        loadUsers,
        openUserModal,
        openResetPasswordModal,
        toggleUserStatus,
        deleteUser
    };
})();

// Export for module systems or attach to global window
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppUsers;
}
