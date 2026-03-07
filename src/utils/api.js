const BASE_URL = '/api';

async function request(url, options = {}) {
    const response = await fetch(`${BASE_URL}${url}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
    }

    return data;
}

export const api = {
    // Auth
    getSession: () => request('/auth/session'),
    signup: (data) => request('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
    login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => request('/auth/logout', { method: 'POST' }),

    // Endpoints
    getEndpoints: () => request('/endpoints'),
    createEndpoint: (data) => request('/endpoints', { method: 'POST', body: JSON.stringify(data) }),
    getEndpoint: (id) => request(`/endpoints/${id}`),
    updateEndpoint: (id, data) => request(`/endpoints/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteEndpoint: (id) => request(`/endpoints/${id}`, { method: 'DELETE' }),

    // Requests
    getRequests: (endpointId, limit = 50, offset = 0, filters = {}) => {
        const params = new URLSearchParams({ limit, offset });
        Object.entries(filters).forEach(([key, value]) => {
            if (value) params.set(key, value);
        });
        return request(`/endpoints/${endpointId}/requests?${params.toString()}`);
    },
    deleteRequest: (id) => request(`/requests/${id}`, { method: 'DELETE' }),
    clearRequests: (endpointId) => request(`/endpoints/${endpointId}/requests`, { method: 'DELETE' }),

    // Replay
    replayRequest: (id, targetUrl) =>
        request(`/requests/${id}/replay`, { method: 'POST', body: JSON.stringify({ target_url: targetUrl }) }),

    // Public URL / tunnel
    getPublicTunnelStatus: () => request('/public-url/status'),
    startPublicTunnel: (targetUrl) =>
        request('/public-url/start', { method: 'POST', body: JSON.stringify({ target_url: targetUrl }) }),
    stopPublicTunnel: () => request('/public-url/stop', { method: 'POST' }),

    // Stats
    getStats: () => request('/stats'),

    exportRequests: async (endpointId) => {
        const response = await fetch(`${BASE_URL}/endpoints/${endpointId}/export.csv`);
        if (!response.ok) {
            let errorMessage = 'Failed to export CSV';
            try {
                const data = await response.json();
                errorMessage = data.error || errorMessage;
            } catch {
                // Ignore JSON parsing failures for CSV responses.
            }
            throw new Error(errorMessage);
        }

        return response.blob();
    },
};

// WebSocket connection
export function createWebSocket(endpointId = null) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const params = endpointId ? `?endpointId=${endpointId}` : '';
    const ws = new WebSocket(`${protocol}//${host}/ws${params}`);
    return ws;
}

// Format helpers
export function formatTime(dateStr) {
    const date = new Date(dateStr + 'Z');
    const now = new Date();
    const diff = now - date;

    if (diff < 5000) return 'just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function getMethodClass(method) {
    return `method-${method}`;
}

export function getStatusClass(status) {
    if (status >= 200 && status < 300) return 'status-2xx';
    if (status >= 300 && status < 400) return 'status-3xx';
    if (status >= 400 && status < 500) return 'status-4xx';
    return 'status-5xx';
}

export function tryParseJSON(str) {
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
}

export function prettyJSON(str) {
    const parsed = tryParseJSON(str);
    if (parsed) return JSON.stringify(parsed, null, 2);
    return str;
}

export function getWebhookUrl(slug) {
    return buildWebhookUrl(window.location.origin, slug);
}

export function buildWebhookUrl(baseUrl, slug) {
    return `${baseUrl.replace(/\/$/, '')}/hook/${slug}`;
}

export function isLocalHostname(hostname) {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
}

export function normalizeRequestPath(path) {
    if (!path || path === '/') return '/';
    return path.startsWith('/') ? path : `/${path}`;
}
