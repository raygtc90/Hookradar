import cors from 'cors';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketServer } from 'ws';
import {
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
} from './auth.js';
import { db, stmts } from './database.js';
import {
    appendWebhookToGoogleSheet,
    normalizeSheetName,
    normalizeSpreadsheetId,
    parseServiceAccountCredentials,
    sendGoogleSheetsTestRow,
} from './googleSheets.js';
import {
    getInboundEmailStatus,
    normalizeEmailLocalPart,
    startInboundEmailServer,
    stopInboundEmailServer,
} from './inboundEmail.js';
import {
    buildIntegrationMap,
    buildIntegrationRecord,
    dispatchIntegration,
    dispatchIntegrationTest,
    normalizeIntegrationConfig,
    normalizeProvider,
} from './integrations.js';
import { computeNextRunAt, normalizeSchedulePath, runScheduleNow, startScheduler, stopScheduler } from './scheduler.js';
import { getPublicTunnelStatus, startPublicTunnel, stopPublicTunnel } from './tunnel.js';
import { normalizeWorkflowInput, runWorkflow, workflowMatchesRequest } from './workflows.js';

const app = express();
const PORT = process.env.PORT || 3001;
const LEGACY_GLOBAL_CHANNEL = '__legacy__';
const SCHEDULE_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ limit: '10mb', type: 'text/*' }));
app.use(express.raw({ limit: '10mb', type: ['application/octet-stream', 'application/xml', 'application/x-www-form-urlencoded'] }));

function isAuthEnabled() {
    return stmts.countUsers.get().count > 0;
}

function getSessionUserFromCookieHeader(cookieHeader) {
    const token = parseCookies(cookieHeader).hookradar_session;
    if (!token) return null;

    stmts.deleteExpiredSessions.run();
    const session = stmts.getSessionByTokenHash.get(hashSessionToken(token));
    return session ? publicUser(session) : null;
}

function getRequestSessionToken(req) {
    return parseCookies(req.headers.cookie).hookradar_session;
}

function requireAccess(req, res, next) {
    if (!req.authEnabled || req.user) {
        return next();
    }

    return res.status(401).json({ success: false, error: 'Authentication required' });
}

function getEndpointForRequest(req, endpointId) {
    if (req.authEnabled) {
        return stmts.getEndpointByOwner.get(endpointId, req.user.id);
    }

    return stmts.getEndpoint.get(endpointId);
}

function getRequestForRequest(req, requestId) {
    if (req.authEnabled) {
        return stmts.getRequestByOwner.get(requestId, req.user.id);
    }

    return stmts.getRequest.get(requestId);
}

function getScheduleForRequest(req, scheduleId) {
    if (req.authEnabled) {
        return stmts.getScheduleWithEndpointByOwner.get(scheduleId, req.user.id);
    }

    return stmts.getScheduleWithEndpoint.get(scheduleId);
}

function getGoogleSheetsIntegrationForRequest(req, endpointId) {
    if (req.authEnabled) {
        return stmts.getGoogleSheetsIntegrationByEndpointForOwner.get(endpointId, req.user.id);
    }

    return stmts.getGoogleSheetsIntegrationByEndpoint.get(endpointId);
}

function getIntegrationsForRequest(req, endpointId) {
    if (req.authEnabled) {
        return stmts.getIntegrationsByEndpointForOwner.all(endpointId, req.user.id);
    }

    return stmts.getIntegrationsByEndpoint.all(endpointId);
}

function getIntegrationForRequest(req, endpointId, provider) {
    if (req.authEnabled) {
        return stmts.getIntegrationByEndpointAndProviderForOwner.get(endpointId, provider, req.user.id);
    }

    return stmts.getIntegrationByEndpointAndProvider.get(endpointId, provider);
}

function getEmailInboxForRequest(req, endpointId) {
    if (req.authEnabled) {
        return stmts.getEmailInboxByEndpointForOwner.get(endpointId, req.user.id);
    }

    return stmts.getEmailInboxByEndpoint.get(endpointId);
}

function getWorkflowForRequest(req, workflowId) {
    if (req.authEnabled) {
        return stmts.getWorkflowByOwner.get(workflowId, req.user.id);
    }

    return stmts.getWorkflow.get(workflowId);
}

function normalizeSlug(input) {
    return (input || '').trim().toLowerCase();
}

function isValidSlug(slug) {
    return /^[a-z0-9][a-z0-9-_]{2,63}$/.test(slug);
}

function parseScheduleHeaders(input) {
    const rawHeaders = typeof input === 'string'
        ? input.trim()
        : JSON.stringify(input ?? {});

    const parsed = JSON.parse(rawHeaders || '{}');

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Schedule headers must be a JSON object');
    }

    return JSON.stringify(parsed);
}

function normalizeScheduleInput(input, existing = {}) {
    const name = (input.name ?? existing.name ?? '').trim();
    const method = String(input.method ?? existing.method ?? 'POST').trim().toUpperCase();
    const path = normalizeSchedulePath(input.path ?? existing.path ?? '/');
    const body = input.body ?? existing.body ?? '';
    const intervalMinutes = parseInt(input.interval_minutes ?? existing.interval_minutes ?? 5, 10);
    const isActiveValue = input.is_active ?? existing.is_active ?? 1;
    const isActive = isActiveValue === true || isActiveValue === 1 || isActiveValue === '1' ? 1 : 0;

    if (!SCHEDULE_METHODS.has(method)) {
        throw new Error('Choose a valid HTTP method for the schedule');
    }

    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
        throw new Error('Interval must be between 1 and 1440 minutes');
    }

    return {
        name,
        method,
        path,
        headers: parseScheduleHeaders(input.headers ?? existing.headers ?? '{}'),
        body: typeof body === 'string' ? body : JSON.stringify(body),
        interval_minutes: intervalMinutes,
        is_active: isActive,
        next_run_at: isActive ? computeNextRunAt(intervalMinutes) : null,
    };
}

function normalizeGoogleSheetsIntegrationInput(input, existing = {}) {
    const enabledValue = input.is_enabled ?? existing.is_enabled ?? 0;
    const isEnabled = enabledValue === true || enabledValue === 1 || enabledValue === '1' ? 1 : 0;
    const spreadsheetId = input.spreadsheet_id ?? existing.spreadsheet_id ?? '';
    const sheetName = input.sheet_name ?? existing.sheet_name ?? 'Webhook Events';
    const credentialsJson = input.credentials_json ?? existing.credentials_json ?? '';

    if (credentialsJson) {
        parseServiceAccountCredentials(credentialsJson);
    }

    if (isEnabled) {
        if (!spreadsheetId) {
            throw new Error('Google Spreadsheet ID or URL is required when Sheets sync is enabled');
        }

        if (!credentialsJson) {
            throw new Error('Google service account JSON is required when Sheets sync is enabled');
        }
    }

    return {
        is_enabled: isEnabled,
        spreadsheet_id: spreadsheetId ? normalizeSpreadsheetId(spreadsheetId) : '',
        sheet_name: normalizeSheetName(sheetName),
        credentials_json: credentialsJson,
    };
}

function normalizeEmailInboxInput(input, endpoint, existing = {}) {
    const enabledValue = input.is_enabled ?? existing.is_enabled ?? 0;
    const isEnabled = enabledValue === true || enabledValue === 1 || enabledValue === '1' ? 1 : 0;
    const requestedLocalPart = input.local_part ?? existing.local_part ?? endpoint.slug;
    const localPart = normalizeEmailLocalPart(requestedLocalPart || endpoint.slug);

    if (isEnabled && !localPart) {
        throw new Error('Choose a valid inbox local-part before enabling email capture');
    }

    return {
        is_enabled: isEnabled,
        local_part: localPart || normalizeEmailLocalPart(endpoint.slug),
        allow_plus_aliases: input.allow_plus_aliases === false || input.allow_plus_aliases === 0 || input.allow_plus_aliases === '0' ? 0 : 1,
        reply_name: (input.reply_name ?? existing.reply_name ?? endpoint.name ?? '').trim(),
    };
}

function parseStoredJson(value, fallback = {}) {
    if (!value || typeof value !== 'string') {
        return fallback;
    }

    try {
        const parsed = JSON.parse(value);
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}

function isHttpRequestMethod(method) {
    return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase());
}

function buildCapturedRequestEnvelope(endpoint, request) {
    return {
        endpoint: {
            id: endpoint.id,
            slug: endpoint.slug,
            name: endpoint.name || '',
        },
        request: {
            ...request,
            headers: parseStoredJson(request.headers, {}),
            query_params: parseStoredJson(request.query_params, {}),
            body_json: parseStoredJson(request.body, null),
        },
    };
}

function persistCapturedRequest(endpoint, requestData) {
    const requestId = uuidv4();

    stmts.createRequest.run(
        requestId,
        endpoint.id,
        requestData.method,
        requestData.path,
        JSON.stringify(requestData.headers || {}),
        JSON.stringify(requestData.query_params || {}),
        requestData.body || '',
        requestData.content_type || '',
        requestData.ip_address || '',
        requestData.user_agent || '',
        requestData.size || Buffer.byteLength(requestData.body || '', 'utf8'),
        requestData.response_status ?? endpoint.response_status,
        requestData.response_time ?? 0,
    );

    return stmts.getRequest.get(requestId);
}

function dispatchForwarding(endpoint, request) {
    if (!endpoint.forwarding_url) {
        return;
    }

    const method = String(request.method || '').toUpperCase();
    const requestHeaders = parseStoredJson(request.headers, {});

    if (isHttpRequestMethod(method)) {
        const forwardHeaders = { ...requestHeaders };
        delete forwardHeaders.host;
        delete forwardHeaders['content-length'];

        fetch(endpoint.forwarding_url, {
            method,
            headers: forwardHeaders,
            body: ['GET', 'HEAD'].includes(method) ? undefined : request.body,
        }).then((fwdRes) => {
            console.log(`📤 Forwarded ${request.method} to ${endpoint.forwarding_url} → ${fwdRes.status}`);
            broadcastToEndpoint(endpoint, {
                type: 'forward_result',
                request_id: request.id,
                status: fwdRes.status,
                url: endpoint.forwarding_url,
            });
        }).catch((fwdErr) => {
            console.error(`📤 Forward failed to ${endpoint.forwarding_url}:`, fwdErr.message);
            broadcastToEndpoint(endpoint, {
                type: 'forward_error',
                request_id: request.id,
                error: fwdErr.message,
                url: endpoint.forwarding_url,
            });
        });

        return;
    }

    fetch(endpoint.forwarding_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-HookRadar-Source': method,
        },
        body: JSON.stringify(buildCapturedRequestEnvelope(endpoint, request)),
    }).then((fwdRes) => {
        console.log(`📤 Forwarded ${request.method} to ${endpoint.forwarding_url} → ${fwdRes.status}`);
        broadcastToEndpoint(endpoint, {
            type: 'forward_result',
            request_id: request.id,
            status: fwdRes.status,
            url: endpoint.forwarding_url,
        });
    }).catch((fwdErr) => {
        console.error(`📤 Forward failed to ${endpoint.forwarding_url}:`, fwdErr.message);
        broadcastToEndpoint(endpoint, {
            type: 'forward_error',
            request_id: request.id,
            error: fwdErr.message,
            url: endpoint.forwarding_url,
        });
    });
}

function dispatchGoogleSheetsSync(endpoint, request) {
    const googleSheetsIntegration = stmts.getGoogleSheetsIntegrationByEndpoint.get(endpoint.id);
    if (!googleSheetsIntegration?.is_enabled) {
        return;
    }

    appendWebhookToGoogleSheet(googleSheetsIntegration, endpoint, request)
        .then(() => {
            stmts.updateGoogleSheetsIntegrationStatus.run(formatSqliteDate(new Date()), null, endpoint.id);
            console.log(`📄 Synced ${request.method} ${request.path} to Google Sheets for ${endpoint.slug}`);
        })
        .catch((syncErr) => {
            stmts.updateGoogleSheetsIntegrationStatus.run(null, syncErr.message, endpoint.id);
            console.error(`📄 Google Sheets sync failed for ${endpoint.slug}:`, syncErr.message);
        });
}

function dispatchSavedIntegrations(endpoint, request) {
    const enabledIntegrations = stmts.getEnabledIntegrationsByEndpoint.all(endpoint.id);
    for (const integration of enabledIntegrations) {
        const config = integration.config_json ? JSON.parse(integration.config_json) : {};

        dispatchIntegration(integration.provider, config, endpoint, request)
            .then(() => {
                stmts.updateIntegrationStatus.run(formatSqliteDate(new Date()), null, endpoint.id, integration.provider);
                console.log(`🔌 Delivered ${request.method} ${request.path} to ${integration.provider} for ${endpoint.slug}`);
            })
            .catch((integrationErr) => {
                stmts.updateIntegrationStatus.run(null, integrationErr.message, endpoint.id, integration.provider);
                console.error(`🔌 ${integration.provider} delivery failed for ${endpoint.slug}:`, integrationErr.message);
            });
    }
}

function dispatchWorkflows(endpoint, request) {
    const activeWorkflows = stmts.getActiveWorkflowsByEndpoint.all(endpoint.id);

    for (const workflow of activeWorkflows) {
        if (!workflowMatchesRequest(workflow, request)) {
            continue;
        }

        runWorkflow(workflow, endpoint, request, {
            resolveIntegrationConfig(provider) {
                return stmts.getIntegrationByEndpointAndProvider.get(endpoint.id, provider);
            },
        }).then(() => {
            stmts.updateWorkflowRuntime.run(formatSqliteDate(new Date()), null, workflow.id);
            console.log(`🧠 Workflow "${workflow.name || workflow.id}" ran for ${endpoint.slug}`);
        }).catch((workflowErr) => {
            stmts.updateWorkflowRuntime.run(formatSqliteDate(new Date()), workflowErr.message, workflow.id);
            console.error(`🧠 Workflow "${workflow.name || workflow.id}" failed for ${endpoint.slug}:`, workflowErr.message);
        });
    }
}

function triggerPostCaptureAutomation(endpoint, request) {
    dispatchForwarding(endpoint, request);
    dispatchGoogleSheetsSync(endpoint, request);
    dispatchSavedIntegrations(endpoint, request);
    dispatchWorkflows(endpoint, request);
}

function decorateEmailInbox(emailInbox, endpoint) {
    const inboxStatus = getInboundEmailStatus();
    const localPart = emailInbox?.local_part || normalizeEmailLocalPart(endpoint.slug);

    return {
        endpoint_id: endpoint.id,
        owner_user_id: emailInbox?.owner_user_id ?? endpoint.owner_user_id ?? null,
        is_enabled: emailInbox?.is_enabled ?? 0,
        local_part: localPart,
        allow_plus_aliases: emailInbox?.allow_plus_aliases ?? 1,
        reply_name: emailInbox?.reply_name ?? endpoint.name ?? '',
        last_email_at: emailInbox?.last_email_at ?? null,
        last_error: emailInbox?.last_error ?? null,
        inbox_domain: inboxStatus.domain,
        inbox_enabled: inboxStatus.enabled,
        inbox_active: inboxStatus.active,
        smtp_host: inboxStatus.host,
        smtp_port: inboxStatus.port,
        email_address: inboxStatus.domain ? `${localPart}@${inboxStatus.domain}` : null,
        supports_plus_aliases: emailInbox?.allow_plus_aliases !== 0,
    };
}

function extractRecipientLocalPart(address) {
    const raw = String(address || '').trim().toLowerCase();
    const value = raw.includes('@') ? raw.split('@')[0] : raw;
    const [base] = value.split('+');
    return {
        full: normalizeEmailLocalPart(value),
        base: normalizeEmailLocalPart(base),
    };
}

function serializeEmailAddressList(value) {
    if (!value?.value) {
        return [];
    }

    return value.value.map((entry) => ({
        name: entry.name || '',
        address: entry.address || '',
    }));
}

function resolveEmailInboxByAddress(address) {
    const { full, base } = extractRecipientLocalPart(address);

    if (!full) {
        return null;
    }

    const exactMatch = stmts.getEmailInboxByLocalPart.get(full);
    if (exactMatch) {
        return exactMatch;
    }

    if (base && base !== full) {
        const baseMatch = stmts.getEmailInboxByLocalPart.get(base);
        if (baseMatch?.allow_plus_aliases) {
            return baseMatch;
        }
    }

    return null;
}

function captureEmailMessage(endpoint, emailInbox, { parsed, recipientAddress, session }) {
    const emailHeaders = {
        'x-hookradar-email-subject': parsed.subject || '',
        'x-hookradar-email-from': parsed.from?.text || '',
        'x-hookradar-email-to': parsed.to?.text || '',
        'x-hookradar-email-message-id': parsed.messageId || '',
        'x-hookradar-email-source': 'smtp',
        'x-hookradar-email-recipient': recipientAddress || '',
    };
    const body = JSON.stringify({
        subject: parsed.subject || '',
        from: serializeEmailAddressList(parsed.from),
        to: serializeEmailAddressList(parsed.to),
        cc: serializeEmailAddressList(parsed.cc),
        bcc: serializeEmailAddressList(parsed.bcc),
        date: parsed.date ? parsed.date.toISOString() : null,
        text: parsed.text || '',
        html: parsed.html ? String(parsed.html) : '',
        attachments: (parsed.attachments || []).map((attachment) => ({
            filename: attachment.filename || '',
            contentType: attachment.contentType || '',
            size: attachment.size || 0,
        })),
    }, null, 2);
    const savedRequest = persistCapturedRequest(endpoint, {
        method: 'EMAIL',
        path: `/email/${emailInbox.local_part}`,
        headers: emailHeaders,
        query_params: {},
        body,
        content_type: 'message/rfc822+json',
        ip_address: session?.remoteAddress || '',
        user_agent: 'Inbound SMTP',
        response_status: 202,
        response_time: 0,
    });

    stmts.updateEmailInboxStatus.run(formatSqliteDate(new Date()), null, endpoint.id);
    broadcastToEndpoint(endpoint, {
        type: 'new_request',
        endpoint_id: endpoint.id,
        request: savedRequest,
    });
    triggerPostCaptureAutomation(endpoint, savedRequest);

    return savedRequest;
}

function escapeCsvValue(value) {
    const str = value == null ? '' : String(value);
    return `"${str.replaceAll('"', '""')}"`;
}

function requestsToCsv(rows) {
    const headers = [
        'created_at',
        'method',
        'path',
        'response_status',
        'response_time',
        'content_type',
        'size',
        'ip_address',
        'user_agent',
        'query_params',
        'headers',
        'body',
    ];

    const lines = [
        headers.join(','),
        ...rows.map(row => headers.map(key => escapeCsvValue(row[key])).join(',')),
    ];

    return lines.join('\n');
}

function setSessionCookie(res, req, token) {
    res.setHeader('Set-Cookie', serializeSessionCookie(token, req));
}

function clearSessionCookie(res, req) {
    res.setHeader('Set-Cookie', serializeExpiredSessionCookie(req));
}

app.use((req, res, next) => {
    req.authEnabled = isAuthEnabled();
    req.user = req.authEnabled ? getSessionUserFromCookieHeader(req.headers.cookie) : null;
    next();
});

app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        auth_enabled: req.authEnabled,
    });
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });
const endpointClients = new Map();
const globalClients = new Map();

function addClient(map, key, ws) {
    if (!map.has(key)) {
        map.set(key, new Set());
    }
    map.get(key).add(ws);
}

function removeClient(map, key, ws) {
    const bucket = map.get(key);
    if (!bucket) return;
    bucket.delete(ws);
    if (bucket.size === 0) {
        map.delete(key);
    }
}

function sendToBucket(bucket, message) {
    if (!bucket) return;
    bucket.forEach(ws => {
        if (ws.readyState === ws.OPEN) {
            ws.send(message);
        }
    });
}

function broadcastToEndpoint(endpoint, data) {
    const message = JSON.stringify(data);
    sendToBucket(endpointClients.get(endpoint.id), message);

    const globalKey = endpoint.owner_user_id || LEGACY_GLOBAL_CHANNEL;
    sendToBucket(globalClients.get(globalKey), message);
}

wss.on('connection', (ws, req) => {
    const authEnabled = isAuthEnabled();
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const endpointId = url.searchParams.get('endpointId');
    const user = authEnabled ? getSessionUserFromCookieHeader(req.headers.cookie) : null;

    if (authEnabled && !user) {
        ws.close(1008, 'Authentication required');
        return;
    }

    if (endpointId) {
        if (authEnabled) {
            const endpoint = stmts.getEndpointByOwner.get(endpointId, user.id);
            if (!endpoint) {
                ws.close(1008, 'Endpoint not found');
                return;
            }
        }

        addClient(endpointClients, endpointId, ws);
        ws.on('close', () => removeClient(endpointClients, endpointId, ws));
        return;
    }

    const globalKey = authEnabled ? user.id : LEGACY_GLOBAL_CHANNEL;
    addClient(globalClients, globalKey, ws);
    ws.on('close', () => removeClient(globalClients, globalKey, ws));
});

// ==================== Auth Routes ====================

app.get('/api/auth/session', (req, res) => {
    const userCount = stmts.countUsers.get().count;

    res.json({
        success: true,
        data: {
            authenticated: Boolean(req.user),
            auth_enabled: req.authEnabled,
            setup_required: userCount === 0,
            user_count: userCount,
            user: req.user,
        },
    });
});

app.post('/api/auth/signup', (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        const email = (req.body.email || '').trim().toLowerCase();
        const password = req.body.password || '';
        const existingUserCount = stmts.countUsers.get().count;

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, error: 'Enter a valid email address' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        }

        if (stmts.getUserByEmail.get(email)) {
            return res.status(409).json({ success: false, error: 'An account with this email already exists' });
        }

        const userId = uuidv4();
        const passwordHash = hashPassword(password);

        stmts.createUser.run(userId, email, name, passwordHash, 'free');

        if (existingUserCount === 0) {
            stmts.adoptUnownedEndpoints.run(userId);
            stmts.adoptUnownedSchedules.run(userId);
            stmts.adoptUnownedGoogleSheetsIntegrations.run(userId);
            stmts.adoptUnownedEndpointIntegrations.run(userId);
            stmts.adoptUnownedEmailInboxes.run(userId);
            stmts.adoptUnownedWorkflows.run(userId);
        }

        const sessionToken = createSessionToken();
        stmts.createSession.run(
            uuidv4(),
            userId,
            hashSessionToken(sessionToken),
            formatSqliteDate(getSessionExpiryDate()),
        );

        setSessionCookie(res, req, sessionToken);

        const user = stmts.getUserById.get(userId);
        res.status(201).json({ success: true, data: { user: publicUser(user) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/auth/login', (req, res) => {
    try {
        if (!isAuthEnabled()) {
            return res.status(400).json({ success: false, error: 'Create the first account before logging in' });
        }

        const email = (req.body.email || '').trim().toLowerCase();
        const password = req.body.password || '';
        const user = stmts.getUserByEmail.get(email);

        if (!user || !verifyPassword(password, user.password_hash)) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        const sessionToken = createSessionToken();
        stmts.createSession.run(
            uuidv4(),
            user.id,
            hashSessionToken(sessionToken),
            formatSqliteDate(getSessionExpiryDate()),
        );

        setSessionCookie(res, req, sessionToken);

        res.json({ success: true, data: { user: publicUser(user) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/auth/logout', (req, res) => {
    try {
        const token = getRequestSessionToken(req);
        if (token) {
            stmts.deleteSessionByTokenHash.run(hashSessionToken(token));
        }
        clearSessionCookie(res, req);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== API Routes ====================

app.get('/api/public-url/status', requireAccess, (req, res) => {
    res.json({ success: true, data: getPublicTunnelStatus() });
});

app.post('/api/public-url/start', requireAccess, async (req, res) => {
    try {
        const targetUrl = (req.body.target_url || '').trim();
        const status = await startPublicTunnel(targetUrl);
        res.json({ success: true, data: status });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/public-url/stop', requireAccess, async (req, res) => {
    try {
        const status = await stopPublicTunnel();
        res.json({ success: true, data: status });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/endpoints', requireAccess, (req, res) => {
    try {
        const endpoints = req.authEnabled
            ? stmts.getAllEndpointsByOwner.all(req.user.id)
            : stmts.getAllEndpoints.all();

        res.json({ success: true, data: endpoints });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/endpoints', requireAccess, (req, res) => {
    try {
        const requestedSlug = normalizeSlug(req.body.slug);
        const slug = requestedSlug || nanoid(10).toLowerCase();
        const id = uuidv4();
        const ownerUserId = req.authEnabled ? req.user.id : null;
        const {
            name = '',
            description = '',
            response_status = 200,
            response_headers,
            response_body,
            response_delay = 0,
        } = req.body;

        if (requestedSlug && !isValidSlug(requestedSlug)) {
            return res.status(400).json({
                success: false,
                error: 'Slug must be 3-64 characters using lowercase letters, numbers, dashes, or underscores',
            });
        }

        if (stmts.getEndpointBySlug.get(slug)) {
            return res.status(409).json({ success: false, error: 'This slug is already in use' });
        }

        const headers = response_headers || JSON.stringify({ 'Content-Type': 'application/json' });
        const body = response_body || JSON.stringify({ success: true, message: 'Webhook received by HookRadar' });

        stmts.createEndpoint.run(
            id,
            ownerUserId,
            slug,
            name,
            description,
            response_status,
            headers,
            body,
            response_delay,
        );

        const endpoint = stmts.getEndpoint.get(id);
        res.status(201).json({ success: true, data: endpoint });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/endpoints/:id', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }
        res.json({ success: true, data: endpoint });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/endpoints/:id', requireAccess, (req, res) => {
    try {
        const existing = getEndpointForRequest(req, req.params.id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const {
            name = existing.name,
            description = existing.description,
            response_status = existing.response_status,
            response_headers = existing.response_headers,
            response_body = existing.response_body,
            response_delay = existing.response_delay,
            is_active = existing.is_active,
            forwarding_url = existing.forwarding_url || '',
        } = req.body;

        if (req.authEnabled) {
            stmts.updateEndpointByOwner.run(
                name,
                description,
                response_status,
                response_headers,
                response_body,
                response_delay,
                is_active,
                forwarding_url,
                req.params.id,
                req.user.id,
            );
        } else {
            stmts.updateEndpoint.run(
                name,
                description,
                response_status,
                response_headers,
                response_body,
                response_delay,
                is_active,
                forwarding_url,
                req.params.id,
            );
        }

        const updated = getEndpointForRequest(req, req.params.id);
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/endpoints/:id', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        if (req.authEnabled) {
            stmts.deleteEmailInboxByEndpointForOwner.run(req.params.id, req.user.id);
            stmts.deleteGoogleSheetsIntegrationByEndpointForOwner.run(req.params.id, req.user.id);
            stmts.deleteIntegrationsByEndpointForOwner.run(req.params.id, req.user.id);
            stmts.deleteWorkflowsByEndpointByOwner.run(req.params.id, req.user.id);
            stmts.deleteSchedulesByEndpointByOwner.run(req.params.id, req.user.id);
            stmts.deleteRequestsByEndpointByOwner.run(req.params.id, req.user.id);
            stmts.deleteEndpointByOwner.run(req.params.id, req.user.id);
        } else {
            stmts.deleteEmailInboxByEndpoint.run(req.params.id);
            stmts.deleteGoogleSheetsIntegrationByEndpoint.run(req.params.id);
            stmts.deleteIntegrationsByEndpoint.run(req.params.id);
            stmts.deleteWorkflowsByEndpoint.run(req.params.id);
            stmts.deleteSchedulesByEndpoint.run(req.params.id);
            stmts.deleteRequestsByEndpoint.run(req.params.id);
            stmts.deleteEndpoint.run(req.params.id);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/endpoints/:id/email-inbox', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const inbox = getEmailInboxForRequest(req, req.params.id);
        res.json({ success: true, data: decorateEmailInbox(inbox, endpoint) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/endpoints/:id/email-inbox', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const existing = getEmailInboxForRequest(req, req.params.id) || {};
        const input = normalizeEmailInboxInput(req.body, endpoint, existing);
        const ownerUserId = req.authEnabled ? req.user.id : null;
        const conflictingInbox = stmts.getEmailInboxByLocalPart.get(input.local_part);

        if (conflictingInbox && conflictingInbox.endpoint_id !== endpoint.id) {
            return res.status(409).json({ success: false, error: 'This inbox address is already in use by another endpoint' });
        }

        stmts.upsertEmailInbox.run(
            endpoint.id,
            ownerUserId,
            input.is_enabled,
            input.local_part,
            input.allow_plus_aliases,
            input.reply_name,
        );

        const inbox = getEmailInboxForRequest(req, req.params.id);
        res.json({ success: true, data: decorateEmailInbox(inbox, endpoint) });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/endpoints/:id/email-inbox/test', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const inbox = getEmailInboxForRequest(req, req.params.id);
        if (!inbox) {
            return res.status(404).json({ success: false, error: 'Save the inbox settings before sending a sample email' });
        }

        const inboxDetails = decorateEmailInbox(inbox, endpoint);
        const parsed = {
            subject: 'HookRadar sample email',
            from: {
                text: 'HookRadar <demo@hookradar.dev>',
                value: [{ name: 'HookRadar', address: 'demo@hookradar.dev' }],
            },
            to: {
                text: inboxDetails.email_address || inbox.local_part,
                value: [{ name: inbox.reply_name || endpoint.name || endpoint.slug, address: inboxDetails.email_address || `${inbox.local_part}@example.test` }],
            },
            cc: { value: [] },
            bcc: { value: [] },
            date: new Date(),
            text: 'This is a sample inbound email generated by HookRadar.',
            html: '<p>This is a sample inbound email generated by <strong>HookRadar</strong>.</p>',
            attachments: [],
            messageId: `<${uuidv4()}@hookradar.test>`,
        };

        const savedRequest = captureEmailMessage(endpoint, inbox, {
            parsed,
            recipientAddress: inboxDetails.email_address || inbox.local_part,
            session: { remoteAddress: '127.0.0.1' },
        });

        const refreshedInbox = getEmailInboxForRequest(req, req.params.id);
        res.json({ success: true, data: { inbox: decorateEmailInbox(refreshedInbox, endpoint), request: savedRequest } });
    } catch (err) {
        stmts.updateEmailInboxStatus.run(null, err.message, req.params.id);
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/endpoints/:id/google-sheets', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const integration = getGoogleSheetsIntegrationForRequest(req, req.params.id) || {
            endpoint_id: req.params.id,
            owner_user_id: req.authEnabled ? req.user.id : null,
            is_enabled: 0,
            spreadsheet_id: '',
            sheet_name: 'Webhook Events',
            credentials_json: '',
            last_synced_at: null,
            last_error: null,
        };

        res.json({ success: true, data: integration });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/endpoints/:id/google-sheets', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const existing = getGoogleSheetsIntegrationForRequest(req, req.params.id) || {};
        const integrationInput = normalizeGoogleSheetsIntegrationInput(req.body, existing);
        const ownerUserId = req.authEnabled ? req.user.id : null;

        stmts.upsertGoogleSheetsIntegration.run(
            req.params.id,
            ownerUserId,
            integrationInput.is_enabled,
            integrationInput.spreadsheet_id,
            integrationInput.sheet_name,
            integrationInput.credentials_json,
        );

        const integration = getGoogleSheetsIntegrationForRequest(req, req.params.id);
        res.json({ success: true, data: integration });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/endpoints/:id/google-sheets/test', requireAccess, async (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const integration = getGoogleSheetsIntegrationForRequest(req, req.params.id);
        if (!integration) {
            return res.status(404).json({ success: false, error: 'Google Sheets integration is not configured yet' });
        }

        await sendGoogleSheetsTestRow(integration, endpoint);
        stmts.updateGoogleSheetsIntegrationStatus.run(formatSqliteDate(new Date()), null, req.params.id);

        const updated = getGoogleSheetsIntegrationForRequest(req, req.params.id);
        res.json({ success: true, data: updated });
    } catch (err) {
        stmts.updateGoogleSheetsIntegrationStatus.run(null, err.message, req.params.id);
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/endpoints/:id/integrations', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const rows = getIntegrationsForRequest(req, req.params.id);
        const integrations = buildIntegrationMap(req.params.id, req.authEnabled ? req.user.id : null, rows);
        res.json({ success: true, data: integrations });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/endpoints/:id/integrations/:provider', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const provider = normalizeProvider(req.params.provider);
        const existing = getIntegrationForRequest(req, req.params.id, provider);
        const existingConfig = existing?.config_json ? JSON.parse(existing.config_json) : undefined;
        const integrationInput = normalizeIntegrationConfig(provider, req.body, existingConfig);
        const ownerUserId = req.authEnabled ? req.user.id : null;

        stmts.upsertIntegration.run(
            req.params.id,
            provider,
            ownerUserId,
            integrationInput.is_enabled,
            JSON.stringify(integrationInput.config),
        );

        const integration = getIntegrationForRequest(req, req.params.id, provider);
        res.json({
            success: true,
            data: buildIntegrationRecord(req.params.id, ownerUserId, provider, integration),
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/endpoints/:id/integrations/:provider/test', requireAccess, async (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const provider = normalizeProvider(req.params.provider);
        const integration = getIntegrationForRequest(req, req.params.id, provider);
        if (!integration) {
            return res.status(404).json({ success: false, error: 'Save this integration before sending a test event' });
        }

        const config = integration.config_json ? JSON.parse(integration.config_json) : {};
        await dispatchIntegrationTest(provider, config, endpoint);
        stmts.updateIntegrationStatus.run(formatSqliteDate(new Date()), null, req.params.id, provider);

        const updated = getIntegrationForRequest(req, req.params.id, provider);
        res.json({
            success: true,
            data: buildIntegrationRecord(req.params.id, req.authEnabled ? req.user.id : null, provider, updated),
        });
    } catch (err) {
        stmts.updateIntegrationStatus.run(null, err.message, req.params.id, req.params.provider);
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/endpoints/:id/workflows', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const workflows = req.authEnabled
            ? stmts.getWorkflowsByEndpointByOwner.all(req.params.id, req.user.id)
            : stmts.getWorkflowsByEndpoint.all(req.params.id);

        res.json({ success: true, data: workflows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/endpoints/:id/workflows', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const workflowId = uuidv4();
        const ownerUserId = req.authEnabled ? req.user.id : null;
        const workflowInput = normalizeWorkflowInput(req.body);

        stmts.createWorkflow.run(
            workflowId,
            ownerUserId,
            endpoint.id,
            workflowInput.name,
            workflowInput.description,
            workflowInput.is_active,
            workflowInput.conditions_json,
            workflowInput.actions_json,
        );

        const workflow = getWorkflowForRequest(req, workflowId);
        res.status(201).json({ success: true, data: workflow });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.put('/api/workflows/:id', requireAccess, (req, res) => {
    try {
        const existing = getWorkflowForRequest(req, req.params.id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Workflow not found' });
        }

        const workflowInput = normalizeWorkflowInput(req.body, existing);

        if (req.authEnabled) {
            stmts.updateWorkflowByOwner.run(
                workflowInput.name,
                workflowInput.description,
                workflowInput.is_active,
                workflowInput.conditions_json,
                workflowInput.actions_json,
                req.params.id,
                req.user.id,
            );
        } else {
            stmts.updateWorkflow.run(
                workflowInput.name,
                workflowInput.description,
                workflowInput.is_active,
                workflowInput.conditions_json,
                workflowInput.actions_json,
                req.params.id,
            );
        }

        const updated = getWorkflowForRequest(req, req.params.id);
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/workflows/:id/test', requireAccess, async (req, res) => {
    try {
        const workflow = getWorkflowForRequest(req, req.params.id);
        if (!workflow) {
            return res.status(404).json({ success: false, error: 'Workflow not found' });
        }

        const endpoint = getEndpointForRequest(req, workflow.endpoint_id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const latestRequest = stmts.getRequestsByEndpoint.all(endpoint.id, 1, 0)[0];
        if (!latestRequest) {
            return res.status(400).json({ success: false, error: 'Capture at least one request before testing this workflow' });
        }

        const matched = workflowMatchesRequest(workflow, latestRequest);
        if (!matched) {
            return res.status(400).json({ success: false, error: 'Latest request does not match this workflow yet' });
        }

        const results = await runWorkflow(workflow, endpoint, latestRequest, {
            resolveIntegrationConfig(provider) {
                return stmts.getIntegrationByEndpointAndProvider.get(endpoint.id, provider);
            },
        });
        stmts.updateWorkflowRuntime.run(formatSqliteDate(new Date()), null, workflow.id);

        const updated = getWorkflowForRequest(req, req.params.id);
        res.json({ success: true, data: { workflow: updated, results } });
    } catch (err) {
        stmts.updateWorkflowRuntime.run(formatSqliteDate(new Date()), err.message, req.params.id);
        res.status(400).json({ success: false, error: err.message });
    }
});

app.delete('/api/workflows/:id', requireAccess, (req, res) => {
    try {
        const workflow = getWorkflowForRequest(req, req.params.id);
        if (!workflow) {
            return res.status(404).json({ success: false, error: 'Workflow not found' });
        }

        if (req.authEnabled) {
            stmts.deleteWorkflowByOwner.run(req.params.id, req.user.id);
        } else {
            stmts.deleteWorkflow.run(req.params.id);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/endpoints/:id/schedules', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const schedules = req.authEnabled
            ? stmts.getSchedulesByEndpointByOwner.all(req.params.id, req.user.id)
            : stmts.getSchedulesByEndpoint.all(req.params.id);

        res.json({ success: true, data: schedules });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/endpoints/:id/schedules', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const scheduleId = uuidv4();
        const ownerUserId = req.authEnabled ? req.user.id : null;
        const scheduleInput = normalizeScheduleInput(req.body);

        stmts.createSchedule.run(
            scheduleId,
            ownerUserId,
            req.params.id,
            scheduleInput.name,
            scheduleInput.method,
            scheduleInput.path,
            scheduleInput.headers,
            scheduleInput.body,
            scheduleInput.interval_minutes,
            scheduleInput.is_active,
            scheduleInput.next_run_at,
        );

        const schedule = req.authEnabled
            ? stmts.getScheduleByOwner.get(scheduleId, req.user.id)
            : stmts.getSchedule.get(scheduleId);

        res.status(201).json({ success: true, data: schedule });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.put('/api/schedules/:id', requireAccess, (req, res) => {
    try {
        const existing = getScheduleForRequest(req, req.params.id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Schedule not found' });
        }

        const scheduleInput = normalizeScheduleInput(req.body, existing);

        if (req.authEnabled) {
            stmts.updateScheduleByOwner.run(
                scheduleInput.name,
                scheduleInput.method,
                scheduleInput.path,
                scheduleInput.headers,
                scheduleInput.body,
                scheduleInput.interval_minutes,
                scheduleInput.is_active,
                scheduleInput.next_run_at,
                req.params.id,
                req.user.id,
            );
        } else {
            stmts.updateSchedule.run(
                scheduleInput.name,
                scheduleInput.method,
                scheduleInput.path,
                scheduleInput.headers,
                scheduleInput.body,
                scheduleInput.interval_minutes,
                scheduleInput.is_active,
                scheduleInput.next_run_at,
                req.params.id,
            );
        }

        const updated = req.authEnabled
            ? stmts.getScheduleByOwner.get(req.params.id, req.user.id)
            : stmts.getSchedule.get(req.params.id);

        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/schedules/:id/run', requireAccess, async (req, res) => {
    try {
        const schedule = getScheduleForRequest(req, req.params.id);
        if (!schedule) {
            return res.status(404).json({ success: false, error: 'Schedule not found' });
        }

        const result = await runScheduleNow(schedule);
        const updated = req.authEnabled
            ? stmts.getScheduleByOwner.get(req.params.id, req.user.id)
            : stmts.getSchedule.get(req.params.id);

        res.json({ success: true, data: { ...result, schedule: updated } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/schedules/:id', requireAccess, (req, res) => {
    try {
        const schedule = getScheduleForRequest(req, req.params.id);
        if (!schedule) {
            return res.status(404).json({ success: false, error: 'Schedule not found' });
        }

        if (req.authEnabled) {
            stmts.deleteScheduleByOwner.run(req.params.id, req.user.id);
        } else {
            stmts.deleteSchedule.run(req.params.id);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/endpoints/:id/requests', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const limit = parseInt(req.query.limit, 10) || 50;
        const offset = parseInt(req.query.offset, 10) || 0;
        const { method, status, content_type, date_from, date_to, search } = req.query;

        const conditions = ['endpoint_id = ?'];
        const params = [req.params.id];

        if (method) {
            conditions.push('method = ?');
            params.push(method.toUpperCase());
        }

        if (status) {
            const statusNum = parseInt(status, 10);
            if (statusNum >= 100 && statusNum < 200) {
                conditions.push('response_status >= 100 AND response_status < 200');
            } else if (statusNum >= 200 && statusNum < 300) {
                conditions.push('response_status >= 200 AND response_status < 300');
            } else if (statusNum >= 300 && statusNum < 400) {
                conditions.push('response_status >= 300 AND response_status < 400');
            } else if (statusNum >= 400 && statusNum < 500) {
                conditions.push('response_status >= 400 AND response_status < 500');
            } else if (statusNum >= 500) {
                conditions.push('response_status >= 500');
            }
        }

        if (content_type) {
            conditions.push('content_type LIKE ?');
            params.push(`%${content_type}%`);
        }

        if (date_from) {
            conditions.push('created_at >= ?');
            params.push(date_from);
        }

        if (date_to) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(date_to)) {
                conditions.push("created_at < datetime(?, '+1 day')");
            } else {
                conditions.push('created_at <= ?');
            }
            params.push(date_to);
        }

        if (search) {
            conditions.push('(method LIKE ? OR path LIKE ? OR body LIKE ?)');
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        const whereClause = conditions.join(' AND ');
        const dataQuery = db.prepare(`SELECT * FROM requests WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`);
        const countQuery = db.prepare(`SELECT COUNT(*) as count FROM requests WHERE ${whereClause}`);

        const requests = dataQuery.all(...params, limit, offset);
        const countResult = countQuery.get(...params);

        res.json({
            success: true,
            data: requests,
            total: countResult.count,
            limit,
            offset,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/endpoints/:id/export.csv', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const rows = stmts.getRequestsByEndpointForExport.all(req.params.id);
        const csv = requestsToCsv(rows);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${endpoint.slug}-requests.csv"`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/requests/:id', requireAccess, (req, res) => {
    try {
        const request = getRequestForRequest(req, req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        if (req.authEnabled) {
            stmts.deleteRequestByOwner.run(req.params.id, req.user.id);
        } else {
            stmts.deleteRequest.run(req.params.id);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/endpoints/:id/requests', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        if (req.authEnabled) {
            stmts.deleteRequestsByEndpointByOwner.run(req.params.id, req.user.id);
        } else {
            stmts.deleteRequestsByEndpoint.run(req.params.id);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/stats', requireAccess, (req, res) => {
    try {
        const stats = req.authEnabled
            ? stmts.getStatsByOwner.get(req.user.id, req.user.id, req.user.id)
            : stmts.getStats.get();

        res.json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/requests/:id/replay', requireAccess, async (req, res) => {
    try {
        const request = getRequestForRequest(req, req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        const { target_url } = req.body;
        if (!target_url) {
            return res.status(400).json({ success: false, error: 'target_url is required' });
        }

        const headers = JSON.parse(request.headers);
        let response;

        if (isHttpRequestMethod(request.method)) {
            delete headers.host;
            delete headers['content-length'];

            response = await fetch(target_url, {
                method: request.method,
                headers,
                body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
            });
        } else {
            response = await fetch(target_url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-HookRadar-Source': request.method,
                },
                body: JSON.stringify({
                    request: {
                        ...request,
                        headers,
                        query_params: parseStoredJson(request.query_params, {}),
                        body_json: parseStoredJson(request.body, null),
                    },
                }),
            });
        }

        const responseBody = await response.text();

        res.json({
            success: true,
            data: {
                status: response.status,
                headers: Object.fromEntries(response.headers.entries()),
                body: responseBody,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/requests/:id/analyze', requireAccess, (req, res) => {
    try {
        const request = getRequestForRequest(req, req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        res.json({ success: true, data: request });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/endpoints/:id/analysis', requireAccess, (req, res) => {
    try {
        const endpoint = getEndpointForRequest(req, req.params.id);
        if (!endpoint) {
            return res.status(404).json({ success: false, error: 'Endpoint not found' });
        }

        const limit = parseInt(req.query.limit, 10) || 100;
        const requests = stmts.getRequestsByEndpoint.all(req.params.id, limit, 0);
        res.json({ success: true, data: requests });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Handle all webhook requests
const webhookHandler = async (req, res) => {
    const slug = req.params.slug;
    const subpath = req.params[0] ? `/${req.params[0]}` : '/';

    try {
        const endpoint = stmts.getEndpointBySlug.get(slug);
        if (!endpoint) {
            return res.status(404).json({ error: 'Webhook endpoint not found' });
        }

        if (!endpoint.is_active) {
            return res.status(410).json({ error: 'Webhook endpoint is inactive' });
        }

        const startTime = Date.now();
        let body = '';

        if (req.body) {
            if (Buffer.isBuffer(req.body)) {
                body = req.body.toString('utf-8');
            } else if (typeof req.body === 'string') {
                body = req.body;
            } else {
                body = JSON.stringify(req.body);
            }
        }

        if (endpoint.response_delay > 0) {
            await new Promise(resolve => setTimeout(resolve, endpoint.response_delay));
        }

        const responseTime = Date.now() - startTime;
        const contentType = req.headers['content-type'] || '';
        const ipAddress = req.ip || req.connection.remoteAddress || '';
        const userAgent = req.headers['user-agent'] || '';
        const savedRequest = persistCapturedRequest(endpoint, {
            method: req.method,
            path: subpath,
            headers: req.headers,
            query_params: req.query,
            body,
            content_type: contentType,
            ip_address: ipAddress,
            user_agent: userAgent,
            response_status: endpoint.response_status,
            response_time: responseTime,
        });

        broadcastToEndpoint(endpoint, {
            type: 'new_request',
            endpoint_id: endpoint.id,
            request: savedRequest,
        });

        triggerPostCaptureAutomation(endpoint, savedRequest);

        const responseHeaders = JSON.parse(endpoint.response_headers);
        Object.entries(responseHeaders).forEach(([key, value]) => {
            res.setHeader(key, value);
        });

        res.status(endpoint.response_status).send(endpoint.response_body);
    } catch (err) {
        console.error('Webhook handler error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

app.all('/hook/:slug', webhookHandler);
app.all('/hook/:slug/*', webhookHandler);

async function handleInboundEmailMessage({ parsed, session }) {
    const recipientAddresses = (session?.envelope?.rcptTo || [])
        .map((recipient) => recipient.address || '')
        .filter(Boolean);
    const inboxDomain = getInboundEmailStatus().domain;
    const routedEndpointIds = new Set();
    let deliveredCount = 0;

    for (const recipientAddress of recipientAddresses) {
        const [rawLocalPart, rawDomain] = recipientAddress.toLowerCase().split('@');
        if (inboxDomain && rawDomain && rawDomain !== inboxDomain) {
            continue;
        }

        const inbox = resolveEmailInboxByAddress(rawLocalPart);
        if (!inbox?.is_enabled) {
            continue;
        }

        const endpoint = stmts.getEndpoint.get(inbox.endpoint_id);
        if (!endpoint || !endpoint.is_active || routedEndpointIds.has(endpoint.id)) {
            continue;
        }

        captureEmailMessage(endpoint, inbox, {
            parsed,
            recipientAddress,
            session,
        });
        routedEndpointIds.add(endpoint.id);
        deliveredCount += 1;
    }

    if (deliveredCount === 0) {
        throw new Error('No enabled email inbox matched this recipient');
    }
}

// Serve static frontend in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');

if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('📦 Serving static frontend from /dist');
}

server.on('close', () => {
    stopScheduler();
    stopInboundEmailServer();
});

process.once('exit', () => {
    stopScheduler();
    stopInboundEmailServer();
});

server.listen(PORT, () => {
    startScheduler({ port: PORT });
    console.log(`\n🚀 HookRadar Server running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket available at ws://localhost:${PORT}/ws`);
    console.log(`🪝 Webhook endpoints at http://localhost:${PORT}/hook/<slug>\n`);

    startInboundEmailServer({ onMessage: handleInboundEmailMessage })
        .then((status) => {
            if (status.enabled) {
                console.log(`📮 Inbound email server listening on ${status.host}:${status.port} for *@${status.domain}`);
            }
        })
        .catch((error) => {
            console.error('📮 Inbound email server failed to start:', error.message);
        });
});
