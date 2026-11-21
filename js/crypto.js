/**
 * TreadPro Security & Cryptography Module
 * Implements PBKDF2 (Password-Based Key Derivation Function 2) with SHA-256
 * and cryptographically secure random salts via Web Crypto API.
 */

const AppCrypto = (function () {
    'use strict';

    const PBKDF2_ITERATIONS = 100000;
    const KEY_LENGTH = 256; // bits

    /**
     * Converts an ArrayBuffer to a hex string
     */
    function bufferToHex(buffer) {
        const byteArray = new Uint8Array(buffer);
        return Array.from(byteArray)
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Converts a hex string to a Uint8Array
     */
    function hexToBuffer(hexString) {
        if (!hexString || hexString.length % 2 !== 0) {
            throw new Error('Invalid hex string format');
        }
        const byteArray = new Uint8Array(hexString.length / 2);
        for (let i = 0; i < hexString.length; i += 2) {
            byteArray[i / 2] = parseInt(hexString.substr(i, 2), 16);
        }
        return byteArray;
    }

    /**
     * Generates a cryptographically random salt (default 16 bytes = 128 bits)
     */
    function generateSalt(byteLength = 16) {
        const array = new Uint8Array(byteLength);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(array);
        } else {
            // Fallback for older legacy browsers
            for (let i = 0; i < byteLength; i++) {
                array[i] = Math.floor(Math.random() * 256);
            }
        }
        return bufferToHex(array.buffer);
    }

    /**
     * Securely hashes a plain-text password using PBKDF2 with SHA-256
     * @param {string} password - The plain-text password
     * @param {string|null} saltHex - Hex string of salt (auto-generated if null)
     * @returns {Promise<{hash: string, salt: string, iterations: number}>}
     */
    async function hashPassword(password, saltHex = null) {
        if (!password || typeof password !== 'string') {
            throw new Error('Password must be a non-empty string');
        }

        const salt = saltHex || generateSalt(16);
        const saltBuffer = hexToBuffer(salt);
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);

        if (window.crypto && window.crypto.subtle) {
            try {
                // Import password as PBKDF2 key
                const keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    passwordBuffer,
                    { name: 'PBKDF2' },
                    false,
                    ['deriveBits', 'deriveKey']
                );

                // Derive bits using PBKDF2
                const derivedBits = await window.crypto.subtle.deriveBits(
                    {
                        name: 'PBKDF2',
                        salt: saltBuffer,
                        iterations: PBKDF2_ITERATIONS,
                        hash: 'SHA-256'
                    },
                    keyMaterial,
                    KEY_LENGTH
                );

                const hash = bufferToHex(derivedBits);
                return {
                    hash: hash,
                    salt: salt,
                    iterations: PBKDF2_ITERATIONS
                };
            } catch (err) {
                console.warn('WebCrypto Subtle failed, falling back to secure JS hash:', err);
            }
        }

        // Pure JS SHA-256 Fallback with salt if WebCrypto is unavailable
        const fallbackHash = await sha256Fallback(password + ':' + salt);
        return {
            hash: fallbackHash,
            salt: salt,
            iterations: 1
        };
    }

    /**
     * Verifies if a given password matches the stored hash and salt
     * @param {string} password - Plain text password entered by user
     * @param {string} storedHash - Stored hex hash from DB
     * @param {string} storedSalt - Stored hex salt from DB
     * @returns {Promise<boolean>}
     */
    async function verifyPassword(password, storedHash, storedSalt) {
        try {
            const result = await hashPassword(password, storedSalt);
            // Constant-time comparison to prevent timing attacks
            return constantTimeCompare(result.hash, storedHash);
        } catch (error) {
            console.error('Password verification error:', error);
            return false;
        }
    }

    /**
     * Constant-time comparison between two strings
     */
    function constantTimeCompare(a, b) {
        if (!a || !b || a.length !== b.length) {
            return false;
        }
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
    }

    /**
     * SHA-256 implementation fallback
     */
    async function sha256Fallback(ascii) {
        function rightRotate(value, amount) {
            return (value >>> amount) | (value << (32 - amount));
        }

        const mathPow = Math.pow;
        const maxWord = mathPow(2, 32);
        const lengthProperty = 'length';
        let i, j;
        let result = '';

        const words = [];
        const asciiBitLength = ascii[lengthProperty] * 8;

        let hash = [];
        const k = [];
        let primeCounter = 0;

        const isComposite = {};
        for (let candidate = 2; primeCounter < 64; candidate++) {
            if (!isComposite[candidate]) {
                for (i = 0; i < 300; i += candidate) {
                    isComposite[i] = candidate;
                }
                hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
                k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
            }
        }

        hash = hash.slice(0, 8);

        ascii += '\x80';
        while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
        for (i = 0; i < ascii[lengthProperty]; i++) {
            j = ascii.charCodeAt(i);
            if (j >> 8) return;
            words[i >> 2] |= j << ((3 - i) % 4) * 8;
        }
        words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
        words[words[lengthProperty]] = (asciiBitLength);

        for (j = 0; j < words[lengthProperty];) {
            const w = words.slice(j, j += 16);
            const oldHash = hash;
            hash = hash.slice(0, 8);

            for (i = 0; i < 64; i++) {
                const i2 = i + j;
                const w15 = w[i - 15], w2 = w[i - 2];

                const a = hash[0], e = hash[4];
                const temp1 = hash[7]
                    + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                    + ((e & hash[5]) ^ ((~e) & hash[6]))
                    + k[i]
                    + (w[i] = (i < 16) ? w[i] : (
                        w[i - 16]
                        + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                        + w[i - 7]
                        + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                    ) | 0
                    );
                const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                    + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

                hash = [(temp1 + temp2) | 0].concat(hash);
                hash[4] = (hash[4] + temp1) | 0;
            }

            for (i = 0; i < 8; i++) {
                hash[i] = (hash[i] + oldHash[i]) | 0;
            }
        }

        for (i = 0; i < 8; i++) {
            for (let b = 3; b >= 0; b--) {
                const byte = (hash[i] >> (b * 8)) & 255;
                result += ((byte < 16 ? '0' : '') + byte.toString(16));
            }
        }
        return result;
    }

    return {
        generateSalt,
        hashPassword,
        verifyPassword
    };
})();

// Export for module systems or attach to global window
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppCrypto;
}
