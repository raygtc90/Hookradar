import { JWT } from 'google-auth-library';

const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const GOOGLE_SHEETS_HEADERS = [
    'captured_at',
    'endpoint_slug',
    'method',
    'path',
    'response_status',
    'content_type',
    'ip_address',
    'user_agent',
    'query_params',
    'headers',
    'body',
];

function parseServiceAccountCredentials(rawCredentials) {
    let credentials;

    try {
        credentials = JSON.parse(rawCredentials || '{}');
    } catch {
        throw new Error('Google service account JSON is not valid JSON');
    }

    if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
        throw new Error('Google service account JSON must be an object');
    }

    if (credentials.type !== 'service_account') {
        throw new Error('Google credentials must be a service account key');
    }

    if (!credentials.client_email || !credentials.private_key) {
        throw new Error('Google service account JSON must include client_email and private_key');
    }

    return credentials;
}

function normalizeSpreadsheetId(value) {
    const trimmed = (value || '').trim();
    if (!trimmed) {
        throw new Error('Enter a Google Spreadsheet ID or URL');
    }

    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : trimmed;
}

function normalizeSheetName(value) {
    const trimmed = (value || '').trim();
    return trimmed || 'Webhook Events';
}

function buildAppendRange(sheetName) {
    const escaped = sheetName.replaceAll("'", "''");
    return `'${escaped}'!A:K`;
}

function buildWebhookRow(endpoint, request) {
    return [
        request.created_at || new Date().toISOString(),
        endpoint.slug,
        request.method,
        request.path,
        request.response_status,
        request.content_type || '',
        request.ip_address || '',
        request.user_agent || '',
        request.query_params || '{}',
        request.headers || '{}',
        request.body || '',
    ];
}

async function appendRowsToGoogleSheet(config, rows) {
    const credentials = parseServiceAccountCredentials(config.credentials_json);
    const spreadsheetId = normalizeSpreadsheetId(config.spreadsheet_id);
    const sheetName = normalizeSheetName(config.sheet_name);
    const range = buildAppendRange(sheetName);

    const client = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: [GOOGLE_SHEETS_SCOPE],
    });

    await client.authorize();
    const accessToken = client.credentials.access_token;

    if (!accessToken) {
        throw new Error('Could not obtain a Google access token from the service account');
    }

    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                majorDimension: 'ROWS',
                values: rows,
            }),
        },
    );

    const payload = await response.json();

    if (!response.ok) {
        const message = payload.error?.message || 'Google Sheets append failed';
        throw new Error(message);
    }

    return payload;
}

async function appendWebhookToGoogleSheet(config, endpoint, request) {
    return await appendRowsToGoogleSheet(config, [buildWebhookRow(endpoint, request)]);
}

async function sendGoogleSheetsTestRow(config, endpoint) {
    const sampleRequest = {
        created_at: new Date().toISOString(),
        method: 'POST',
        path: '/google-sheets-test',
        response_status: 200,
        content_type: 'application/json',
        ip_address: '127.0.0.1',
        user_agent: 'HookRadar Google Sheets Test',
        query_params: JSON.stringify({ source: 'test' }),
        headers: JSON.stringify({ 'content-type': 'application/json' }),
        body: JSON.stringify({ ok: true, message: 'HookRadar test row' }),
    };

    if (!config.spreadsheet_id || !config.credentials_json) {
        throw new Error('Save the Google Sheets configuration before sending a test row');
    }

    return await appendWebhookToGoogleSheet(config, endpoint, sampleRequest);
}

export {
    GOOGLE_SHEETS_HEADERS,
    appendWebhookToGoogleSheet,
    normalizeSpreadsheetId,
    normalizeSheetName,
    parseServiceAccountCredentials,
    sendGoogleSheetsTestRow,
};
