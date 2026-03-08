import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { JWT } from 'google-auth-library';
import nodemailer from 'nodemailer';
import { parseServiceAccountCredentials } from './googleSheets.js';

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GENERIC_WEBHOOK_METHODS = new Set(['POST', 'PUT', 'PATCH']);

const PROVIDER_DEFAULTS = Object.freeze({
    slack: {
        webhook_url: '',
        message_template: [
            ':satellite: HookRadar captured a webhook',
            'Endpoint: {{endpoint.slug}}',
            'Method: {{request.method}}',
            'Path: {{request.path}}',
            'Email: {{request.body_json.email || request.query_json.email || "n/a"}}',
        ].join('\n'),
        attach_payload: true,
    },
    discord: {
        webhook_url: '',
        message_template: [
            'HookRadar captured a webhook',
            'Endpoint: {{endpoint.slug}}',
            'Method: {{request.method}}',
            'Path: {{request.path}}',
            'Email: {{request.body_json.email || request.query_json.email || "n/a"}}',
        ].join('\n'),
        attach_payload: true,
    },
    airtable: {
        personal_access_token: '',
        base_id: '',
        table_name: 'Webhook Events',
        typecast: true,
        fields_template: {
            'Received At': '{{request.created_at}}',
            Endpoint: '{{endpoint.slug}}',
            Method: '{{request.method}}',
            Path: '{{request.path}}',
            Email: '{{request.body_json.email || request.query_json.email}}',
            Payload: '{{request.body}}',
        },
    },
    notion: {
        access_token: '',
        database_id: '',
        notion_version: '2022-06-28',
        properties_template: {
            Name: {
                title: [
                    {
                        text: {
                            content: '{{endpoint.slug}} {{request.created_at}}',
                        },
                    },
                ],
            },
            Method: {
                rich_text: [
                    {
                        text: {
                            content: '{{request.method}}',
                        },
                    },
                ],
            },
            Path: {
                rich_text: [
                    {
                        text: {
                            content: '{{request.path}}',
                        },
                    },
                ],
            },
            Email: {
                email: '{{request.body_json.email || request.query_json.email}}',
            },
            Payload: {
                rich_text: [
                    {
                        text: {
                            content: '{{request.body}}',
                        },
                    },
                ],
            },
        },
    },
    zapier: {
        webhook_url: '',
        method: 'POST',
        headers_template: {
            'Content-Type': 'application/json',
        },
        body_template: {
            request_id: '{{request.id}}',
            received_at: '{{request.created_at}}',
            endpoint: '{{endpoint.slug}}',
            method: '{{request.method}}',
            path: '{{request.path}}',
            query: '{{request.query_json}}',
            headers: '{{request.headers_json}}',
            body: '{{request.body_json || request.body}}',
        },
    },
    make: {
        webhook_url: '',
        method: 'POST',
        headers_template: {
            'Content-Type': 'application/json',
        },
        body_template: {
            request_id: '{{request.id}}',
            received_at: '{{request.created_at}}',
            endpoint: '{{endpoint.slug}}',
            method: '{{request.method}}',
            path: '{{request.path}}',
            query: '{{request.query_json}}',
            headers: '{{request.headers_json}}',
            body: '{{request.body_json || request.body}}',
        },
    },
    pabbly: {
        webhook_url: '',
        method: 'POST',
        headers_template: {
            'Content-Type': 'application/json',
        },
        body_template: {
            request_id: '{{request.id}}',
            received_at: '{{request.created_at}}',
            endpoint: '{{endpoint.slug}}',
            method: '{{request.method}}',
            path: '{{request.path}}',
            query: '{{request.query_json}}',
            headers: '{{request.headers_json}}',
            body: '{{request.body_json || request.body}}',
        },
    },
    email: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        username: '',
        password: '',
        from: '',
        to: '',
        cc: '',
        bcc: '',
        subject_template: 'HookRadar {{endpoint.slug}} {{request.method}} {{request.path}}',
        text_template: [
            'HookRadar captured a webhook.',
            '',
            'Endpoint: {{endpoint.slug}}',
            'Method: {{request.method}}',
            'Path: {{request.path}}',
            'Email: {{request.body_json.email || request.query_json.email || "n/a"}}',
            '',
            'Payload:',
            '{{request.body}}',
        ].join('\n'),
        html_template: '',
    },
    hubspot: {
        access_token: '',
        object_type: 'contacts',
        properties_template: {
            email: '{{request.body_json.email || request.query_json.email}}',
            firstname: '{{request.body_json.first_name || request.body_json.firstname}}',
            lastname: '{{request.body_json.last_name || request.body_json.lastname || request.body_json.name || "Webhook"}}',
            phone: '{{request.body_json.phone}}',
            company: '{{request.body_json.company || "HookRadar"}}',
            website: '{{request.body_json.website}}',
            lifecyclestage: 'lead',
        },
    },
    salesforce: {
        instance_url: '',
        access_token: '',
        api_version: 'v61.0',
        sobject_type: 'Lead',
        fields_template: {
            LastName: '{{request.body_json.last_name || request.body_json.lastname || request.body_json.name || "Webhook"}}',
            Company: '{{request.body_json.company || "HookRadar"}}',
            Email: '{{request.body_json.email || request.query_json.email}}',
            Phone: '{{request.body_json.phone}}',
            LeadSource: 'HookRadar',
            Description: '{{request.body}}',
        },
    },
    s3: {
        region: 'us-east-1',
        bucket: '',
        access_key_id: '',
        secret_access_key: '',
        session_token: '',
        prefix_template: 'webhooks/{{endpoint.slug}}/',
        file_name_template: '{{request.created_at}}-{{request.id}}.json',
        content_mode: 'json_envelope',
        endpoint_url: '',
        force_path_style: false,
    },
    google_drive: {
        credentials_json: '',
        folder_id: '',
        file_name_template: '{{endpoint.slug}}-{{request.id}}.json',
        mime_type: 'application/json',
        content_mode: 'json_envelope',
    },
});

const PROVIDER_IDS = Object.freeze(Object.keys(PROVIDER_DEFAULTS));

function cloneDefaultConfig(provider) {
    return JSON.parse(JSON.stringify(PROVIDER_DEFAULTS[provider]));
}

function normalizeString(value, fallback = '') {
    return value == null ? fallback : String(value).trim();
}

function normalizeBoolean(value, fallback = false) {
    if (value == null) return fallback;
    return value === true || value === 1 || value === '1';
}

function normalizeInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
    const parsed = Number.parseInt(value ?? fallback, 10);
    if (!Number.isInteger(parsed)) {
        throw new Error('Enter a valid number');
    }

    return Math.min(max, Math.max(min, parsed));
}

function parseJsonTemplate(value, fieldLabel, { objectOnly = true, fallback = {} } = {}) {
    if (value == null) {
        return fallback;
    }

    const candidate = typeof value === 'string' ? value.trim() : value;

    if (candidate === '') {
        return fallback;
    }

    let parsed = candidate;

    if (typeof candidate === 'string') {
        try {
            parsed = JSON.parse(candidate);
        } catch {
            throw new Error(`${fieldLabel} must be valid JSON`);
        }
    }

    if (objectOnly && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
        throw new Error(`${fieldLabel} must be a JSON object`);
    }

    return parsed;
}

function normalizeProvider(provider) {
    if (!PROVIDER_IDS.includes(provider)) {
        throw new Error('Unknown integration provider');
    }

    return provider;
}

function normalizeWebhookConnectorConfig(input, existingConfig, providerLabel) {
    const method = normalizeString(input.method ?? existingConfig.method ?? 'POST', 'POST').toUpperCase();
    if (!GENERIC_WEBHOOK_METHODS.has(method)) {
        throw new Error(`${providerLabel} webhook method must be POST, PUT, or PATCH`);
    }

    return {
        webhook_url: normalizeString(input.webhook_url ?? existingConfig.webhook_url),
        method,
        headers_template: parseJsonTemplate(
            input.headers_template ?? existingConfig.headers_template,
            `${providerLabel} headers template`,
            { fallback: cloneDefaultConfig('zapier').headers_template },
        ),
        body_template: parseJsonTemplate(
            input.body_template ?? existingConfig.body_template,
            `${providerLabel} body template`,
            { objectOnly: false, fallback: cloneDefaultConfig('zapier').body_template },
        ),
    };
}

function validateRequired(enabled, fields) {
    if (!enabled) return;

    for (const [value, message] of fields) {
        if (!value) {
            throw new Error(message);
        }
    }
}

function normalizeIntegrationConfig(provider, input = {}, existingConfig = {}) {
    const safeProvider = normalizeProvider(provider);
    const defaults = cloneDefaultConfig(safeProvider);
    const enabledValue = input.is_enabled ?? input.isEnabled ?? existingConfig.is_enabled ?? 0;
    const isEnabled = normalizeBoolean(enabledValue, false) ? 1 : 0;
    let config;

    switch (safeProvider) {
        case 'slack':
        case 'discord':
            config = {
                webhook_url: normalizeString(input.webhook_url ?? existingConfig.webhook_url),
                message_template: String(input.message_template ?? existingConfig.message_template ?? defaults.message_template),
                attach_payload: normalizeBoolean(input.attach_payload ?? existingConfig.attach_payload, defaults.attach_payload),
            };
            validateRequired(isEnabled, [
                [config.webhook_url, `${safeProvider === 'slack' ? 'Slack' : 'Discord'} webhook URL is required when the integration is enabled`],
            ]);
            break;
        case 'airtable':
            config = {
                personal_access_token: normalizeString(input.personal_access_token ?? existingConfig.personal_access_token),
                base_id: normalizeString(input.base_id ?? existingConfig.base_id),
                table_name: normalizeString(input.table_name ?? existingConfig.table_name ?? defaults.table_name),
                typecast: normalizeBoolean(input.typecast ?? existingConfig.typecast, defaults.typecast),
                fields_template: parseJsonTemplate(
                    input.fields_template ?? existingConfig.fields_template,
                    'Airtable fields template',
                    { fallback: defaults.fields_template },
                ),
            };
            validateRequired(isEnabled, [
                [config.personal_access_token, 'Airtable personal access token is required when the integration is enabled'],
                [config.base_id, 'Airtable base ID is required when the integration is enabled'],
                [config.table_name, 'Airtable table name is required when the integration is enabled'],
            ]);
            break;
        case 'notion':
            config = {
                access_token: normalizeString(input.access_token ?? existingConfig.access_token),
                database_id: normalizeString(input.database_id ?? existingConfig.database_id),
                notion_version: normalizeString(input.notion_version ?? existingConfig.notion_version ?? defaults.notion_version),
                properties_template: parseJsonTemplate(
                    input.properties_template ?? existingConfig.properties_template,
                    'Notion properties template',
                    { fallback: defaults.properties_template },
                ),
            };
            validateRequired(isEnabled, [
                [config.access_token, 'Notion integration token is required when the integration is enabled'],
                [config.database_id, 'Notion database ID is required when the integration is enabled'],
            ]);
            break;
        case 'zapier':
        case 'make':
        case 'pabbly':
            config = normalizeWebhookConnectorConfig(input, existingConfig, safeProvider[0].toUpperCase() + safeProvider.slice(1));
            validateRequired(isEnabled, [
                [config.webhook_url, `${safeProvider[0].toUpperCase() + safeProvider.slice(1)} webhook URL is required when the integration is enabled`],
            ]);
            break;
        case 'email':
            config = {
                host: normalizeString(input.host ?? existingConfig.host ?? defaults.host),
                port: normalizeInteger(input.port ?? existingConfig.port ?? defaults.port, defaults.port, { min: 1, max: 65535 }),
                secure: normalizeBoolean(input.secure ?? existingConfig.secure, defaults.secure),
                username: normalizeString(input.username ?? existingConfig.username),
                password: normalizeString(input.password ?? existingConfig.password),
                from: normalizeString(input.from ?? existingConfig.from),
                to: normalizeString(input.to ?? existingConfig.to),
                cc: normalizeString(input.cc ?? existingConfig.cc),
                bcc: normalizeString(input.bcc ?? existingConfig.bcc),
                subject_template: String(input.subject_template ?? existingConfig.subject_template ?? defaults.subject_template),
                text_template: String(input.text_template ?? existingConfig.text_template ?? defaults.text_template),
                html_template: String(input.html_template ?? existingConfig.html_template ?? defaults.html_template),
            };
            validateRequired(isEnabled, [
                [config.host, 'SMTP host is required when email notifications are enabled'],
                [config.port, 'SMTP port is required when email notifications are enabled'],
                [config.from, 'From email is required when email notifications are enabled'],
                [config.to, 'Recipient email is required when email notifications are enabled'],
            ]);
            break;
        case 'hubspot':
            config = {
                access_token: normalizeString(input.access_token ?? existingConfig.access_token),
                object_type: normalizeString(input.object_type ?? existingConfig.object_type ?? defaults.object_type),
                properties_template: parseJsonTemplate(
                    input.properties_template ?? existingConfig.properties_template,
                    'HubSpot properties template',
                    { fallback: defaults.properties_template },
                ),
            };
            validateRequired(isEnabled, [
                [config.access_token, 'HubSpot access token is required when the integration is enabled'],
                [config.object_type, 'HubSpot object type is required when the integration is enabled'],
            ]);
            break;
        case 'salesforce':
            config = {
                instance_url: normalizeString(input.instance_url ?? existingConfig.instance_url),
                access_token: normalizeString(input.access_token ?? existingConfig.access_token),
                api_version: normalizeString(input.api_version ?? existingConfig.api_version ?? defaults.api_version),
                sobject_type: normalizeString(input.sobject_type ?? existingConfig.sobject_type ?? defaults.sobject_type),
                fields_template: parseJsonTemplate(
                    input.fields_template ?? existingConfig.fields_template,
                    'Salesforce fields template',
                    { fallback: defaults.fields_template },
                ),
            };
            validateRequired(isEnabled, [
                [config.instance_url, 'Salesforce instance URL is required when the integration is enabled'],
                [config.access_token, 'Salesforce access token is required when the integration is enabled'],
                [config.api_version, 'Salesforce API version is required when the integration is enabled'],
                [config.sobject_type, 'Salesforce object type is required when the integration is enabled'],
            ]);
            break;
        case 's3':
            config = {
                region: normalizeString(input.region ?? existingConfig.region ?? defaults.region),
                bucket: normalizeString(input.bucket ?? existingConfig.bucket),
                access_key_id: normalizeString(input.access_key_id ?? existingConfig.access_key_id),
                secret_access_key: normalizeString(input.secret_access_key ?? existingConfig.secret_access_key),
                session_token: normalizeString(input.session_token ?? existingConfig.session_token),
                prefix_template: String(input.prefix_template ?? existingConfig.prefix_template ?? defaults.prefix_template),
                file_name_template: String(input.file_name_template ?? existingConfig.file_name_template ?? defaults.file_name_template),
                content_mode: normalizeString(input.content_mode ?? existingConfig.content_mode ?? defaults.content_mode),
                endpoint_url: normalizeString(input.endpoint_url ?? existingConfig.endpoint_url),
                force_path_style: normalizeBoolean(input.force_path_style ?? existingConfig.force_path_style, defaults.force_path_style),
            };
            if (!['json_envelope', 'raw_body'].includes(config.content_mode)) {
                throw new Error('S3 content mode must be json_envelope or raw_body');
            }
            validateRequired(isEnabled, [
                [config.region, 'S3 region is required when the integration is enabled'],
                [config.bucket, 'S3 bucket is required when the integration is enabled'],
                [config.access_key_id, 'S3 access key ID is required when the integration is enabled'],
                [config.secret_access_key, 'S3 secret access key is required when the integration is enabled'],
            ]);
            break;
        case 'google_drive':
            config = {
                credentials_json: String(input.credentials_json ?? existingConfig.credentials_json ?? defaults.credentials_json),
                folder_id: normalizeString(input.folder_id ?? existingConfig.folder_id ?? defaults.folder_id),
                file_name_template: String(input.file_name_template ?? existingConfig.file_name_template ?? defaults.file_name_template),
                mime_type: normalizeString(input.mime_type ?? existingConfig.mime_type ?? defaults.mime_type),
                content_mode: normalizeString(input.content_mode ?? existingConfig.content_mode ?? defaults.content_mode),
            };
            if (!['json_envelope', 'raw_body'].includes(config.content_mode)) {
                throw new Error('Google Drive content mode must be json_envelope or raw_body');
            }
            if (config.credentials_json) {
                parseServiceAccountCredentials(config.credentials_json);
            }
            validateRequired(isEnabled, [
                [config.credentials_json, 'Google Drive service account JSON is required when the integration is enabled'],
            ]);
            break;
        default:
            throw new Error('Unknown integration provider');
    }

    return { is_enabled: isEnabled, config };
}

function tryParseJson(value) {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function buildIntegrationContext(endpoint, request) {
    const headersJson = tryParseJson(request.headers) || {};
    const queryJson = tryParseJson(request.query_params) || {};
    const bodyJson = tryParseJson(request.body);
    const endpointSummary = {
        id: endpoint.id,
        slug: endpoint.slug,
        name: endpoint.name || '',
        description: endpoint.description || '',
    };
    const requestSummary = {
        id: request.id,
        created_at: request.created_at,
        method: request.method,
        path: request.path,
        response_status: request.response_status,
        content_type: request.content_type || '',
        ip_address: request.ip_address || '',
        user_agent: request.user_agent || '',
        size: request.size || 0,
        headers_json: headersJson,
        query_json: queryJson,
        body_json: bodyJson,
        body: request.body || '',
        body_text: request.body || '',
        headers: headersJson,
        query: queryJson,
    };

    return {
        endpoint: endpointSummary,
        request: requestSummary,
        meta: {
            received_at: request.created_at,
        },
    };
}

function getPathValue(source, dottedPath) {
    return dottedPath.split('.').reduce((current, segment) => {
        if (current == null) {
            return undefined;
        }

        const key = /^\d+$/.test(segment) ? Number.parseInt(segment, 10) : segment;
        return current[key];
    }, source);
}

function evaluateExpression(expression, context) {
    const branches = expression.split('||').map((segment) => segment.trim()).filter(Boolean);

    for (const branch of branches) {
        if ((branch.startsWith('"') && branch.endsWith('"')) || (branch.startsWith("'") && branch.endsWith("'"))) {
            return branch.slice(1, -1);
        }

        if (branch === 'true') return true;
        if (branch === 'false') return false;
        if (branch === 'null') return null;
        if (/^-?\d+(\.\d+)?$/.test(branch)) return Number(branch);

        const value = getPathValue(context, branch);
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return '';
}

function stringifyInterpolatedValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
}

function resolveTemplateValue(template, context) {
    if (typeof template === 'string') {
        const exactMatch = template.match(/^\s*\{\{(.+?)\}\}\s*$/);
        if (exactMatch) {
            return evaluateExpression(exactMatch[1], context);
        }

        return template.replace(/\{\{(.+?)\}\}/g, (_, expression) => stringifyInterpolatedValue(evaluateExpression(expression.trim(), context)));
    }

    if (Array.isArray(template)) {
        return template.map((item) => resolveTemplateValue(item, context));
    }

    if (template && typeof template === 'object') {
        return Object.fromEntries(
            Object.entries(template).map(([key, value]) => [key, resolveTemplateValue(value, context)]),
        );
    }

    return template;
}

function buildPayloadPreview(context) {
    const rawBody = context.request.body_text || '';
    return rawBody.length > 1500 ? `${rawBody.slice(0, 1497)}...` : rawBody;
}

function buildArchiveEnvelope(endpoint, request, context) {
    return {
        endpoint: context.endpoint,
        request: {
            ...context.request,
            headers_json: context.request.headers_json,
            query_json: context.request.query_json,
            body_json: context.request.body_json,
        },
    };
}

function buildArchiveContent(config, endpoint, request, context) {
    if (config.content_mode === 'raw_body') {
        return {
            body: context.request.body_text || '',
            contentType: context.request.content_type || 'text/plain',
        };
    }

    return {
        body: JSON.stringify(buildArchiveEnvelope(endpoint, request, context), null, 2),
        contentType: 'application/json',
    };
}

function sanitizeFileName(fileName) {
    return Array.from(String(fileName || 'hookradar-event.json'))
        .map((character) => (
            character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character)
                ? '-'
                : character
        ))
        .join('');
}

function joinPathSegments(prefix, fileName) {
    const normalizedPrefix = String(prefix || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
    return normalizedPrefix ? `${normalizedPrefix}/${fileName}` : fileName;
}

function normalizeHeaders(headers) {
    return Object.fromEntries(
        Object.entries(headers || {})
            .filter(([, value]) => value !== undefined && value !== null && value !== '')
            .map(([key, value]) => [key, String(value)]),
    );
}

async function parseHttpError(response, fallbackMessage) {
    const raw = await response.text();

    try {
        const parsed = JSON.parse(raw);
        return parsed.error?.message || parsed.message || parsed.error_description || parsed.error || fallbackMessage;
    } catch {
        return raw || fallbackMessage;
    }
}

async function postJson(url, payload, { headers = {}, method = 'POST' } = {}) {
    const response = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(await parseHttpError(response, 'Remote API request failed'));
    }

    return response;
}

async function sendSlack(config, context) {
    let text = resolveTemplateValue(config.message_template, context);

    if (config.attach_payload) {
        text = `${text}\n\n\`\`\`\n${buildPayloadPreview(context)}\n\`\`\``;
    }

    await postJson(config.webhook_url, { text });
}

async function sendDiscord(config, context) {
    let content = resolveTemplateValue(config.message_template, context);

    if (config.attach_payload) {
        content = `${content}\n\n\`\`\`\n${buildPayloadPreview(context)}\n\`\`\``;
    }

    await postJson(config.webhook_url, { content });
}

async function sendGenericWebhook(config, context) {
    const method = config.method || 'POST';
    const resolvedHeaders = normalizeHeaders(resolveTemplateValue(config.headers_template, context));
    const resolvedBody = resolveTemplateValue(config.body_template, context);
    const isBodyAllowed = !['GET', 'HEAD'].includes(method);
    let body;

    if (isBodyAllowed) {
        if (typeof resolvedBody === 'string') {
            body = resolvedBody;
        } else {
            body = JSON.stringify(resolvedBody);
            if (!resolvedHeaders['Content-Type'] && !resolvedHeaders['content-type']) {
                resolvedHeaders['Content-Type'] = 'application/json';
            }
        }
    }

    const response = await fetch(config.webhook_url, {
        method,
        headers: resolvedHeaders,
        body: isBodyAllowed ? body : undefined,
    });

    if (!response.ok) {
        throw new Error(await parseHttpError(response, 'Webhook connector delivery failed'));
    }
}

async function sendAirtable(config, context) {
    const fields = resolveTemplateValue(config.fields_template, context);
    const response = await fetch(
        `https://api.airtable.com/v0/${encodeURIComponent(config.base_id)}/${encodeURIComponent(config.table_name)}`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.personal_access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                records: [{ fields }],
                typecast: Boolean(config.typecast),
            }),
        },
    );

    if (!response.ok) {
        throw new Error(await parseHttpError(response, 'Airtable record creation failed'));
    }
}

async function sendNotion(config, context) {
    const properties = resolveTemplateValue(config.properties_template, context);
    const response = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.access_token}`,
            'Content-Type': 'application/json',
            'Notion-Version': config.notion_version || '2022-06-28',
        },
        body: JSON.stringify({
            parent: {
                database_id: config.database_id,
            },
            properties,
        }),
    });

    if (!response.ok) {
        throw new Error(await parseHttpError(response, 'Notion page creation failed'));
    }
}

async function sendEmail(config, context) {
    const transportConfig = {
        host: config.host,
        port: config.port,
        secure: Boolean(config.secure),
    };

    if (config.username || config.password) {
        transportConfig.auth = {
            user: config.username,
            pass: config.password,
        };
    }

    const transporter = nodemailer.createTransport(transportConfig);

    await transporter.sendMail({
        from: resolveTemplateValue(config.from, context),
        to: resolveTemplateValue(config.to, context),
        cc: resolveTemplateValue(config.cc, context) || undefined,
        bcc: resolveTemplateValue(config.bcc, context) || undefined,
        subject: resolveTemplateValue(config.subject_template, context),
        text: resolveTemplateValue(config.text_template, context),
        html: config.html_template ? resolveTemplateValue(config.html_template, context) : undefined,
    });
}

async function sendHubSpot(config, context) {
    const properties = resolveTemplateValue(config.properties_template, context);
    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/${encodeURIComponent(config.object_type)}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.access_token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
        throw new Error(await parseHttpError(response, 'HubSpot object creation failed'));
    }
}

async function sendSalesforce(config, context) {
    const fields = resolveTemplateValue(config.fields_template, context);
    const baseUrl = config.instance_url.replace(/\/$/, '');
    const response = await fetch(
        `${baseUrl}/services/data/${encodeURIComponent(config.api_version)}/sobjects/${encodeURIComponent(config.sobject_type)}/`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(fields),
        },
    );

    if (!response.ok) {
        throw new Error(await parseHttpError(response, 'Salesforce object creation failed'));
    }
}

async function sendS3Archive(config, endpoint, request, context) {
    const archive = buildArchiveContent(config, endpoint, request, context);
    const fileName = sanitizeFileName(resolveTemplateValue(config.file_name_template, context));
    const prefix = resolveTemplateValue(config.prefix_template, context);
    const key = joinPathSegments(prefix, fileName);
    const client = new S3Client({
        region: config.region,
        credentials: {
            accessKeyId: config.access_key_id,
            secretAccessKey: config.secret_access_key,
            sessionToken: config.session_token || undefined,
        },
        endpoint: config.endpoint_url || undefined,
        forcePathStyle: Boolean(config.force_path_style),
    });

    await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: archive.body,
        ContentType: archive.contentType,
        Metadata: {
            endpoint: endpoint.slug,
            requestid: String(request.id),
        },
    }));
}

async function getGoogleDriveAccessToken(credentialsJson) {
    const credentials = parseServiceAccountCredentials(credentialsJson);
    const client = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: [GOOGLE_DRIVE_SCOPE],
    });

    await client.authorize();

    if (!client.credentials.access_token) {
        throw new Error('Could not obtain a Google Drive access token');
    }

    return client.credentials.access_token;
}

async function sendGoogleDriveArchive(config, endpoint, request, context) {
    const archive = buildArchiveContent(config, endpoint, request, context);
    const fileName = sanitizeFileName(resolveTemplateValue(config.file_name_template, context));
    const accessToken = await getGoogleDriveAccessToken(config.credentials_json);
    const metadata = {
        name: fileName,
    };

    if (config.folder_id) {
        metadata.parents = [config.folder_id];
    }

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([archive.body], { type: config.mime_type || archive.contentType }), fileName);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        body: form,
    });

    if (!response.ok) {
        throw new Error(await parseHttpError(response, 'Google Drive upload failed'));
    }
}

async function sendProviderEvent(provider, config, endpoint, request) {
    const context = buildIntegrationContext(endpoint, request);

    switch (provider) {
        case 'slack':
            await sendSlack(config, context);
            return;
        case 'discord':
            await sendDiscord(config, context);
            return;
        case 'airtable':
            await sendAirtable(config, context);
            return;
        case 'notion':
            await sendNotion(config, context);
            return;
        case 'zapier':
        case 'make':
        case 'pabbly':
            await sendGenericWebhook(config, context);
            return;
        case 'email':
            await sendEmail(config, context);
            return;
        case 'hubspot':
            await sendHubSpot(config, context);
            return;
        case 'salesforce':
            await sendSalesforce(config, context);
            return;
        case 's3':
            await sendS3Archive(config, endpoint, request, context);
            return;
        case 'google_drive':
            await sendGoogleDriveArchive(config, endpoint, request, context);
            return;
        default:
            throw new Error('Unknown integration provider');
    }
}

function buildTestRequest() {
    return {
        id: 'test-event',
        created_at: new Date().toISOString(),
        method: 'POST',
        path: '/integration-test',
        response_status: 200,
        content_type: 'application/json',
        ip_address: '127.0.0.1',
        user_agent: 'HookRadar Integration Test',
        size: 0,
        headers: JSON.stringify({ 'content-type': 'application/json', 'x-hookradar-test': 'true' }),
        query_params: JSON.stringify({ source: 'test' }),
        body: JSON.stringify({
            email: 'operator@example.com',
            first_name: 'Jane',
            last_name: 'Doe',
            company: 'Acme Inc',
            phone: '+1 555 0100',
            website: 'https://example.com',
            hookradar: true,
        }),
    };
}

function buildIntegrationRecord(endpointId, ownerUserId, provider, record = null) {
    const defaults = cloneDefaultConfig(provider);
    const parsedConfig = record?.config_json ? parseJsonTemplate(record.config_json, 'Stored integration config', { objectOnly: true, fallback: {} }) : {};

    return {
        endpoint_id: endpointId,
        provider,
        owner_user_id: record?.owner_user_id ?? ownerUserId ?? null,
        is_enabled: record?.is_enabled ?? 0,
        config: {
            ...defaults,
            ...parsedConfig,
        },
        last_synced_at: record?.last_synced_at ?? null,
        last_error: record?.last_error ?? null,
        created_at: record?.created_at ?? null,
        updated_at: record?.updated_at ?? null,
    };
}

function buildIntegrationMap(endpointId, ownerUserId, records = []) {
    const map = Object.fromEntries(PROVIDER_IDS.map((provider) => [provider, buildIntegrationRecord(endpointId, ownerUserId, provider)]));

    for (const record of records) {
        map[record.provider] = buildIntegrationRecord(endpointId, ownerUserId, record.provider, record);
    }

    return map;
}

async function dispatchIntegration(provider, config, endpoint, request) {
    await sendProviderEvent(provider, config, endpoint, request);
}

async function dispatchIntegrationTest(provider, config, endpoint) {
    await sendProviderEvent(provider, config, endpoint, buildTestRequest());
}

export {
    PROVIDER_IDS,
    buildIntegrationMap,
    buildIntegrationRecord,
    cloneDefaultConfig,
    dispatchIntegration,
    dispatchIntegrationTest,
    normalizeIntegrationConfig,
    normalizeProvider,
};
