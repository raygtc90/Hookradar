import { randomUUID } from 'crypto';
import { dispatchIntegration, PROVIDER_IDS } from './integrations.js';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const WORKFLOW_METHODS = new Set(['ANY', ...HTTP_METHODS, 'EMAIL']);
const WORKFLOW_ACTION_TYPES = new Set(['forward_url', 'integration']);

function parseStoredJson(value, fallback = {}) {
    if (!value || typeof value !== 'string') {
        return fallback;
    }

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function normalizeString(value, fallback = '') {
    return value == null ? fallback : String(value).trim();
}

function normalizeWorkflowConditions(input = {}, existing = {}) {
    return {
        method: normalizeString(input.method ?? existing.method ?? 'ANY', 'ANY').toUpperCase(),
        path_contains: normalizeString(input.path_contains ?? existing.path_contains),
        header_name: normalizeString(input.header_name ?? existing.header_name).toLowerCase(),
        header_value_contains: normalizeString(input.header_value_contains ?? existing.header_value_contains),
        body_contains: normalizeString(input.body_contains ?? existing.body_contains),
        content_type_contains: normalizeString(input.content_type_contains ?? existing.content_type_contains),
        email_subject_contains: normalizeString(input.email_subject_contains ?? existing.email_subject_contains),
        email_from_contains: normalizeString(input.email_from_contains ?? existing.email_from_contains),
    };
}

function normalizeWorkflowActions(input = [], existing = []) {
    const source = Array.isArray(input) ? input : existing;

    return source.map((action) => {
        const type = normalizeString(action.type, '').toLowerCase();
        if (!WORKFLOW_ACTION_TYPES.has(type)) {
            throw new Error('Workflow action must be either forward_url or integration');
        }

        if (type === 'forward_url') {
            const targetUrl = normalizeString(action.target_url);
            return {
                id: normalizeString(action.id, randomUUID()),
                type,
                target_url: targetUrl,
            };
        }

        const provider = normalizeString(action.provider, '').toLowerCase();
        if (!PROVIDER_IDS.includes(provider)) {
            throw new Error('Workflow integration action must reference a saved integration provider');
        }

        return {
            id: normalizeString(action.id, randomUUID()),
            type,
            provider,
        };
    });
}

function normalizeWorkflowInput(input = {}, existing = {}) {
    const name = normalizeString(input.name ?? existing.name);
    const description = normalizeString(input.description ?? existing.description);
    const isActiveValue = input.is_active ?? existing.is_active ?? 1;
    const isActive = isActiveValue === true || isActiveValue === 1 || isActiveValue === '1' ? 1 : 0;
    const existingConditions = parseStoredJson(existing.conditions_json, {});
    const existingActions = parseStoredJson(existing.actions_json, []);
    const conditions = normalizeWorkflowConditions(input.conditions ?? existingConditions, existingConditions);

    if (!WORKFLOW_METHODS.has(conditions.method)) {
        throw new Error('Workflow method must be ANY, an HTTP method, or EMAIL');
    }

    const actions = normalizeWorkflowActions(input.actions ?? existingActions, existingActions);

    if (isActive && actions.length === 0) {
        throw new Error('Add at least one workflow action before enabling it');
    }

    if (isActive) {
        for (const action of actions) {
            if (action.type === 'forward_url' && !action.target_url.startsWith('http://') && !action.target_url.startsWith('https://')) {
                throw new Error('Workflow forward URL must start with http:// or https://');
            }
        }
    }

    return {
        name,
        description,
        is_active: isActive,
        conditions_json: JSON.stringify(conditions),
        actions_json: JSON.stringify(actions),
        conditions,
        actions,
    };
}

function containsCaseInsensitive(haystack, needle) {
    return String(haystack || '').toLowerCase().includes(String(needle || '').toLowerCase());
}

function getEmailMeta(headers) {
    return {
        subject: headers['x-hookradar-email-subject'] || '',
        from: headers['x-hookradar-email-from'] || '',
    };
}

function workflowMatchesRequest(workflow, request) {
    const conditions = typeof workflow.conditions_json === 'string'
        ? parseStoredJson(workflow.conditions_json, {})
        : (workflow.conditions_json || workflow.conditions || {});
    const requestHeaders = parseStoredJson(request.headers, {});
    const method = String(request.method || '').toUpperCase();
    const emailMeta = getEmailMeta(requestHeaders);

    if (conditions.method && conditions.method !== 'ANY' && method !== conditions.method) {
        return false;
    }

    if (conditions.path_contains && !containsCaseInsensitive(request.path, conditions.path_contains)) {
        return false;
    }

    if (conditions.header_name) {
        const headerValue = requestHeaders[conditions.header_name];
        if (headerValue == null) {
            return false;
        }

        if (conditions.header_value_contains && !containsCaseInsensitive(headerValue, conditions.header_value_contains)) {
            return false;
        }
    }

    if (conditions.body_contains && !containsCaseInsensitive(request.body, conditions.body_contains)) {
        return false;
    }

    if (conditions.content_type_contains && !containsCaseInsensitive(request.content_type, conditions.content_type_contains)) {
        return false;
    }

    if (conditions.email_subject_contains && !containsCaseInsensitive(emailMeta.subject, conditions.email_subject_contains)) {
        return false;
    }

    if (conditions.email_from_contains && !containsCaseInsensitive(emailMeta.from, conditions.email_from_contains)) {
        return false;
    }

    return true;
}

function buildRequestEnvelope(endpoint, request) {
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

async function forwardWorkflowRequest(targetUrl, endpoint, request) {
    const method = String(request.method || '').toUpperCase();
    const headers = parseStoredJson(request.headers, {});

    if (HTTP_METHODS.has(method)) {
        const forwardHeaders = { ...headers };
        delete forwardHeaders.host;
        delete forwardHeaders['content-length'];

        const response = await fetch(targetUrl, {
            method,
            headers: forwardHeaders,
            body: ['GET', 'HEAD'].includes(method) ? undefined : request.body,
        });

        if (!response.ok) {
            throw new Error(`Workflow forward returned ${response.status}`);
        }

        return { type: 'forward_url', status: response.status, target_url: targetUrl };
    }

    const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-HookRadar-Source': method,
        },
        body: JSON.stringify(buildRequestEnvelope(endpoint, request)),
    });

    if (!response.ok) {
        throw new Error(`Workflow forward returned ${response.status}`);
    }

    return { type: 'forward_url', status: response.status, target_url: targetUrl };
}

async function runWorkflow(workflow, endpoint, request, options = {}) {
    const actions = typeof workflow.actions_json === 'string'
        ? parseStoredJson(workflow.actions_json, [])
        : (workflow.actions_json || workflow.actions || []);
    const results = [];
    const resolveIntegrationConfig = options.resolveIntegrationConfig || (() => null);

    for (const action of actions) {
        if (action.type === 'forward_url') {
            results.push(await forwardWorkflowRequest(action.target_url, endpoint, request));
            continue;
        }

        if (action.type === 'integration') {
            const integration = await resolveIntegrationConfig(action.provider);
            if (!integration) {
                throw new Error(`Workflow integration "${action.provider}" is not configured`);
            }

             if (integration.is_enabled === 0 || integration.is_enabled === false) {
                throw new Error(`Workflow integration "${action.provider}" is disabled`);
            }

            const config = integration.config_json ? JSON.parse(integration.config_json) : integration.config;
            if (!config) {
                throw new Error(`Workflow integration "${action.provider}" is missing config`);
            }

            await dispatchIntegration(action.provider, config, endpoint, request);
            results.push({ type: 'integration', provider: action.provider, status: 'sent' });
        }
    }

    return results;
}

export {
    normalizeWorkflowInput,
    runWorkflow,
    workflowMatchesRequest,
};
