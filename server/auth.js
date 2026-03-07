import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const SESSION_COOKIE = 'hookradar_session';
const SESSION_TTL_DAYS = 30;

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    const [salt, expectedHash] = (storedHash || '').split(':');
    if (!salt || !expectedHash) return false;

    const calculatedHash = scryptSync(password, salt, 64).toString('hex');
    const left = Buffer.from(calculatedHash, 'hex');
    const right = Buffer.from(expectedHash, 'hex');

    if (left.length !== right.length) {
        return false;
    }

    return timingSafeEqual(left, right);
}

function createSessionToken() {
    return randomBytes(32).toString('hex');
}

function hashSessionToken(token) {
    return createHash('sha256').update(token).digest('hex');
}

function parseCookies(header = '') {
    return header
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((cookies, part) => {
            const [key, ...rest] = part.split('=');
            cookies[key] = decodeURIComponent(rest.join('='));
            return cookies;
        }, {});
}

function getSessionExpiryDate() {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
    return expiresAt;
}

function formatSqliteDate(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function isSecureRequest(req) {
    return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function serializeSessionCookie(token, req) {
    const expires = getSessionExpiryDate();
    const parts = [
        `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Expires=${expires.toUTCString()}`,
        `Max-Age=${SESSION_TTL_DAYS * 24 * 60 * 60}`,
    ];

    if (isSecureRequest(req)) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

function serializeExpiredSessionCookie(req) {
    const parts = [
        `${SESSION_COOKIE}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'Max-Age=0',
    ];

    if (isSecureRequest(req)) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

function publicUser(user) {
    if (!user) return null;

    return {
        id: user.id || user.user_id,
        email: user.email,
        name: user.name,
        plan: user.plan || 'free',
        created_at: user.created_at,
    };
}

export {
    SESSION_COOKIE,
    createSessionToken,
    formatSqliteDate,
    getSessionExpiryDate,
    hashPassword,
    hashSessionToken,
    parseCookies,
    publicUser,
    serializeExpiredSessionCookie,
    serializeSessionCookie,
    verifyPassword,
};
