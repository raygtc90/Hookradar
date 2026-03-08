import { useEffect, useState } from 'react';
import { Archive, Bell, Briefcase, Database, ExternalLink, Mail, RefreshCw, Save, Send, Workflow } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../utils/api';

const PROVIDER_DEFINITIONS = {
    slack: {
        title: 'Slack alerts',
        description: 'Push a short alert into Slack using an incoming webhook.',
        docsUrl: 'https://api.slack.com/messaging/webhooks',
        fields: [
            { key: 'webhook_url', label: 'Incoming webhook URL', type: 'url', placeholder: 'https://hooks.slack.com/services/...' },
            { key: 'message_template', label: 'Message template', type: 'textarea', rows: 5, mono: true },
            { key: 'attach_payload', label: 'Append payload preview', type: 'checkbox', hint: 'Adds the raw body preview under the alert.' },
        ],
    },
    discord: {
        title: 'Discord alerts',
        description: 'Post incoming webhook alerts into a Discord channel via webhook URL.',
        docsUrl: 'https://discord.com/developers/docs/resources/webhook',
        fields: [
            { key: 'webhook_url', label: 'Webhook URL', type: 'url', placeholder: 'https://discord.com/api/webhooks/...' },
            { key: 'message_template', label: 'Message template', type: 'textarea', rows: 5, mono: true },
            { key: 'attach_payload', label: 'Append payload preview', type: 'checkbox', hint: 'Adds the raw body preview under the alert.' },
        ],
    },
    email: {
        title: 'Email / SMTP',
        description: 'Deliver webhook notifications over SMTP without a third-party workflow tool.',
        docsUrl: 'https://nodemailer.com/smtp/',
        fields: [
            { key: 'host', label: 'SMTP host', type: 'text', placeholder: 'smtp.gmail.com' },
            { key: 'port', label: 'SMTP port', type: 'number', placeholder: '587' },
            { key: 'secure', label: 'Use TLS/SSL', type: 'checkbox', hint: 'Enable for port 465 or any SMTPS provider.' },
            { key: 'username', label: 'SMTP username', type: 'text', placeholder: 'alerts@example.com' },
            { key: 'password', label: 'SMTP password / app password', type: 'password', placeholder: 'app-password' },
            { key: 'from', label: 'From email', type: 'text', placeholder: 'HookRadar <alerts@example.com>' },
            { key: 'to', label: 'To email(s)', type: 'text', placeholder: 'ops@example.com, dev@example.com' },
            { key: 'cc', label: 'CC email(s)', type: 'text', placeholder: 'qa@example.com' },
            { key: 'bcc', label: 'BCC email(s)', type: 'text', placeholder: 'audit@example.com' },
            { key: 'subject_template', label: 'Subject template', type: 'text', mono: true },
            { key: 'text_template', label: 'Text body template', type: 'textarea', rows: 8, mono: true },
            { key: 'html_template', label: 'HTML body template', type: 'textarea', rows: 8, mono: true },
        ],
    },
    airtable: {
        title: 'Airtable sync',
        description: 'Create an Airtable record for each captured webhook.',
        docsUrl: 'https://airtable.com/developers/web/api/create-records',
        fields: [
            { key: 'personal_access_token', label: 'Personal access token', type: 'password', placeholder: 'pat...' },
            { key: 'base_id', label: 'Base ID', type: 'text', placeholder: 'appXXXXXXXXXXXXXX' },
            { key: 'table_name', label: 'Table name', type: 'text', placeholder: 'Webhook Events' },
            { key: 'typecast', label: 'Typecast values', type: 'checkbox', hint: 'Let Airtable coerce strings into field types when possible.' },
            { key: 'fields_template', label: 'Fields template (JSON)', type: 'json', rows: 9 },
        ],
    },
    notion: {
        title: 'Notion sync',
        description: 'Create a page in a Notion database for every webhook event.',
        docsUrl: 'https://developers.notion.com/reference/post-page',
        fields: [
            { key: 'access_token', label: 'Integration token', type: 'password', placeholder: 'secret_...' },
            { key: 'database_id', label: 'Database ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
            { key: 'notion_version', label: 'Notion version', type: 'text', placeholder: '2022-06-28' },
            { key: 'properties_template', label: 'Properties template (JSON)', type: 'json', rows: 12 },
        ],
    },
    zapier: {
        title: 'Zapier connector',
        description: 'Send the captured event into a Zapier catch hook.',
        docsUrl: 'https://zapier.com/blog/webhooks-guide/',
        fields: [
            { key: 'webhook_url', label: 'Catch hook URL', type: 'url', placeholder: 'https://hooks.zapier.com/hooks/catch/...' },
            { key: 'method', label: 'HTTP method', type: 'select', options: ['POST', 'PUT', 'PATCH'] },
            { key: 'headers_template', label: 'Headers template (JSON)', type: 'json', rows: 6 },
            { key: 'body_template', label: 'Body template (JSON)', type: 'json', rows: 10 },
        ],
    },
    make: {
        title: 'Make connector',
        description: 'Relay the event into a Make custom webhook or scenario.',
        docsUrl: 'https://www.make.com/en/help/tools/webhooks',
        fields: [
            { key: 'webhook_url', label: 'Custom webhook URL', type: 'url', placeholder: 'https://hook.eu1.make.com/...' },
            { key: 'method', label: 'HTTP method', type: 'select', options: ['POST', 'PUT', 'PATCH'] },
            { key: 'headers_template', label: 'Headers template (JSON)', type: 'json', rows: 6 },
            { key: 'body_template', label: 'Body template (JSON)', type: 'json', rows: 10 },
        ],
    },
    pabbly: {
        title: 'Pabbly connector',
        description: 'Push the event into a Pabbly Connect webhook trigger.',
        docsUrl: 'https://www.pabbly.com/connect/integrations/webhooks/',
        fields: [
            { key: 'webhook_url', label: 'Webhook URL', type: 'url', placeholder: 'https://connect.pabbly.com/workflow/sendwebhookdata/...' },
            { key: 'method', label: 'HTTP method', type: 'select', options: ['POST', 'PUT', 'PATCH'] },
            { key: 'headers_template', label: 'Headers template (JSON)', type: 'json', rows: 6 },
            { key: 'body_template', label: 'Body template (JSON)', type: 'json', rows: 10 },
        ],
    },
    hubspot: {
        title: 'HubSpot CRM push',
        description: 'Create a CRM object in HubSpot from each incoming webhook.',
        docsUrl: 'https://developers.hubspot.com/docs/api/crm/objects',
        fields: [
            { key: 'access_token', label: 'Private app token', type: 'password', placeholder: 'pat-na1-...' },
            { key: 'object_type', label: 'Object type', type: 'text', placeholder: 'contacts' },
            { key: 'properties_template', label: 'Properties template (JSON)', type: 'json', rows: 9 },
        ],
    },
    salesforce: {
        title: 'Salesforce CRM push',
        description: 'Create a Salesforce object from the webhook payload.',
        docsUrl: 'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/dome_sobject_create.htm',
        fields: [
            { key: 'instance_url', label: 'Instance URL', type: 'url', placeholder: 'https://your-instance.my.salesforce.com' },
            { key: 'access_token', label: 'Access token', type: 'password', placeholder: '00D...' },
            { key: 'api_version', label: 'API version', type: 'text', placeholder: 'v61.0' },
            { key: 'sobject_type', label: 'sObject type', type: 'text', placeholder: 'Lead' },
            { key: 'fields_template', label: 'Fields template (JSON)', type: 'json', rows: 10 },
        ],
    },
    s3: {
        title: 'S3 archive',
        description: 'Archive the raw webhook into S3 or any S3-compatible object storage.',
        docsUrl: 'https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html',
        fields: [
            { key: 'region', label: 'Region', type: 'text', placeholder: 'us-east-1' },
            { key: 'bucket', label: 'Bucket', type: 'text', placeholder: 'hookradar-events' },
            { key: 'access_key_id', label: 'Access key ID', type: 'password', placeholder: 'AKIA...' },
            { key: 'secret_access_key', label: 'Secret access key', type: 'password', placeholder: '••••••••' },
            { key: 'session_token', label: 'Session token', type: 'password', placeholder: 'Optional temporary session token' },
            { key: 'prefix_template', label: 'Key prefix template', type: 'text', mono: true, placeholder: 'webhooks/{{endpoint.slug}}/' },
            { key: 'file_name_template', label: 'File name template', type: 'text', mono: true, placeholder: '{{request.created_at}}-{{request.id}}.json' },
            { key: 'content_mode', label: 'Content mode', type: 'select', options: ['json_envelope', 'raw_body'] },
            { key: 'endpoint_url', label: 'Custom endpoint URL', type: 'url', placeholder: 'https://s3.amazonaws.com or MinIO endpoint' },
            { key: 'force_path_style', label: 'Force path-style requests', type: 'checkbox', hint: 'Enable for MinIO or other S3-compatible storage if required.' },
        ],
    },
    google_drive: {
        title: 'Google Drive archive',
        description: 'Upload the webhook payload into a Drive folder using a service account.',
        docsUrl: 'https://developers.google.com/drive/api/guides/manage-uploads',
        fields: [
            { key: 'credentials_json', label: 'Service account JSON', type: 'textarea', rows: 10, mono: true, placeholder: '{"type":"service_account","client_email":"...","private_key":"..."}' },
            { key: 'folder_id', label: 'Folder ID', type: 'text', placeholder: 'Optional shared folder ID' },
            { key: 'file_name_template', label: 'File name template', type: 'text', mono: true, placeholder: '{{endpoint.slug}}-{{request.id}}.json' },
            { key: 'mime_type', label: 'MIME type', type: 'text', placeholder: 'application/json' },
            { key: 'content_mode', label: 'Content mode', type: 'select', options: ['json_envelope', 'raw_body'] },
        ],
    },
};

const SECTIONS = [
    {
        key: 'alerts',
        title: 'Alerts',
        copy: 'Push incoming webhook activity into chat and inbox channels the moment it lands.',
        icon: Bell,
        providers: ['slack', 'discord', 'email'],
    },
    {
        key: 'sync',
        title: 'Workspace Sync',
        copy: 'Mirror captured requests into structured tables and knowledge hubs.',
        icon: Database,
        providers: ['airtable', 'notion'],
    },
    {
        key: 'connectors',
        title: 'Workflow Connectors',
        copy: 'Trigger automation tools directly from HookRadar without external middleware.',
        icon: Workflow,
        providers: ['zapier', 'make', 'pabbly'],
    },
    {
        key: 'crm',
        title: 'CRM Push',
        copy: 'Convert webhook payloads into CRM records with templated field mapping.',
        icon: Briefcase,
        providers: ['hubspot', 'salesforce'],
    },
    {
        key: 'archive',
        title: 'Payload Archive',
        copy: 'Store complete request payloads in object storage and cloud drives.',
        icon: Archive,
        providers: ['s3', 'google_drive'],
    },
];

function normalizeTimestamp(value) {
    if (!value) return '';
    const normalized = /[zZ]$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-IN');
}

function formatConfigValue(field, value) {
    if (field.type === 'checkbox') {
        return value === true || value === 1;
    }

    if (field.type === 'json') {
        return JSON.stringify(value ?? {}, null, 2);
    }

    return value == null ? '' : String(value);
}

function buildProviderState(providerId, record = null) {
    const definition = PROVIDER_DEFINITIONS[providerId];
    const config = record?.config || {};

    return {
        is_enabled: record?.is_enabled === 1 || record?.is_enabled === true,
        last_synced_at: record?.last_synced_at || null,
        last_error: record?.last_error || null,
        fields: Object.fromEntries(definition.fields.map((field) => [field.key, formatConfigValue(field, config[field.key])])),
    };
}

function renderInput(field, value, onChange) {
    const className = `form-input ${field.mono ? 'mono' : ''}`.trim();

    if (field.type === 'textarea' || field.type === 'json') {
        return (
            <textarea
                className={className}
                rows={field.rows || 6}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={field.placeholder}
            />
        );
    }

    if (field.type === 'select') {
        return (
            <select className={className} value={value} onChange={(event) => onChange(event.target.value)}>
                {field.options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        );
    }

    if (field.type === 'checkbox') {
        return (
            <div className="toggle-row integration-toggle-row">
                <div>
                    <div className="toggle-label">{field.label}</div>
                    {field.hint && <div className="toggle-desc">{field.hint}</div>}
                </div>
                <label className="toggle-switch">
                    <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
                    <span className="toggle-slider" />
                </label>
            </div>
        );
    }

    return (
        <input
            type={field.type}
            className={className}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder}
        />
    );
}

export default function DeliveryIntegrationsPanel({ endpoint }) {
    const [integrations, setIntegrations] = useState({});
    const [loading, setLoading] = useState(true);
    const [savingProvider, setSavingProvider] = useState('');
    const [testingProvider, setTestingProvider] = useState('');

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);

            try {
                const response = await api.getIntegrations(endpoint.id);
                if (!cancelled) {
                    const nextState = Object.fromEntries(
                        Object.keys(PROVIDER_DEFINITIONS).map((providerId) => [
                            providerId,
                            buildProviderState(providerId, response.data[providerId]),
                        ]),
                    );
                    setIntegrations(nextState);
                }
            } catch (err) {
                if (!cancelled) {
                    toast.error(err.message);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [endpoint.id]);

    const handleFieldChange = (providerId, fieldKey, value) => {
        setIntegrations((current) => ({
            ...current,
            [providerId]: {
                ...current[providerId],
                fields: {
                    ...current[providerId].fields,
                    [fieldKey]: value,
                },
            },
        }));
    };

    const handleToggle = (providerId, value) => {
        setIntegrations((current) => ({
            ...current,
            [providerId]: {
                ...current[providerId],
                is_enabled: value,
            },
        }));
    };

    const handleSave = async (providerId) => {
        const integration = integrations[providerId];
        const definition = PROVIDER_DEFINITIONS[providerId];
        const payload = {
            is_enabled: integration.is_enabled ? 1 : 0,
        };

        definition.fields.forEach((field) => {
            payload[field.key] = integration.fields[field.key];
        });

        setSavingProvider(providerId);

        try {
            const response = await api.updateIntegration(endpoint.id, providerId, payload);
            setIntegrations((current) => ({
                ...current,
                [providerId]: buildProviderState(providerId, response.data),
            }));
            toast.success(`${definition.title} saved`);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSavingProvider('');
        }
    };

    const handleTest = async (providerId) => {
        setTestingProvider(providerId);

        try {
            const response = await api.testIntegration(endpoint.id, providerId);
            setIntegrations((current) => ({
                ...current,
                [providerId]: buildProviderState(providerId, response.data),
            }));
            toast.success(`${PROVIDER_DEFINITIONS[providerId].title} test sent`);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setTestingProvider('');
        }
    };

    return (
        <div className="settings-section">
            <div className="integration-section-header">
                <div>
                    <h3>
                        <Workflow size={16} />
                        Delivery integrations
                    </h3>
                    <p className="integration-section-copy">
                        Use tokens like <code>{'{{endpoint.slug}}'}</code>, <code>{'{{request.body_json.email}}'}</code>, and
                        <code>{' {{request.body_json.last_name || "Webhook"}}'}</code> inside templates.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="settings-card integration-empty-state">
                    <p>Loading integrations...</p>
                </div>
            ) : (
                <div className="integration-stack">
                    {SECTIONS.map((section) => {
                        const Icon = section.icon;

                        return (
                            <div key={section.key} className="integration-section-block">
                                <div className="integration-provider-header">
                                    <div>
                                        <h4>
                                            <Icon size={16} />
                                            {section.title}
                                        </h4>
                                        <p>{section.copy}</p>
                                    </div>
                                </div>

                                <div className="integration-provider-grid">
                                    {section.providers.map((providerId) => {
                                        const definition = PROVIDER_DEFINITIONS[providerId];
                                        const integration = integrations[providerId];
                                        const isSaving = savingProvider === providerId;
                                        const isTesting = testingProvider === providerId;

                                        return (
                                            <div key={providerId} className="settings-card integration-provider-card">
                                                <div className="integration-provider-card-header">
                                                    <div className="integration-provider-card-title">
                                                        <strong>{definition.title}</strong>
                                                        <span className={`integration-status-chip ${integration?.is_enabled ? 'active' : 'idle'}`}>
                                                            {integration?.is_enabled ? 'Enabled' : 'Disabled'}
                                                        </span>
                                                    </div>
                                                    <p>{definition.description}</p>
                                                    <a href={definition.docsUrl} target="_blank" rel="noreferrer">
                                                        <ExternalLink size={14} />
                                                        Open docs
                                                    </a>
                                                </div>

                                                <div className="toggle-row">
                                                    <div>
                                                        <div className="toggle-label">Enable {definition.title.toLowerCase()}</div>
                                                        <div className="toggle-desc">HookRadar will fan out each captured event to this provider.</div>
                                                    </div>
                                                    <label className="toggle-switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(integration?.is_enabled)}
                                                            onChange={(event) => handleToggle(providerId, event.target.checked)}
                                                        />
                                                        <span className="toggle-slider" />
                                                    </label>
                                                </div>

                                                <div className="integration-provider-fields">
                                                    {definition.fields.map((field) => (
                                                        <div
                                                            key={field.key}
                                                            className={field.type === 'checkbox' ? 'integration-provider-field integration-provider-field-full' : 'integration-provider-field'}
                                                        >
                                                            {field.type !== 'checkbox' && <label className="form-label">{field.label}</label>}
                                                            {renderInput(field, integration?.fields?.[field.key], (nextValue) => handleFieldChange(providerId, field.key, nextValue))}
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="integration-provider-actions">
                                                    <button className="btn btn-secondary btn-sm" onClick={() => handleTest(providerId)} disabled={isTesting || isSaving}>
                                                        {isTesting ? <RefreshCw className="icon animate-spin" size={14} /> : <Send className="icon" size={14} />}
                                                        {isTesting ? 'Sending...' : 'Send test'}
                                                    </button>
                                                    <button className="btn btn-primary btn-sm" onClick={() => handleSave(providerId)} disabled={isSaving}>
                                                        {isSaving ? <RefreshCw className="icon animate-spin" size={14} /> : <Save className="icon" size={14} />}
                                                        {isSaving ? 'Saving...' : 'Save'}
                                                    </button>
                                                </div>

                                                <div className="integration-status-row">
                                                    {integration?.last_synced_at && (
                                                        <div className="integration-status-copy">Last sync {normalizeTimestamp(integration.last_synced_at)}</div>
                                                    )}
                                                </div>

                                                {integration?.last_error && (
                                                    <div className="integration-error">
                                                        <strong>Last error</strong>
                                                        <p>{integration.last_error}</p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    <div className="settings-card integration-inline-callout">
                        <Mail size={16} />
                        <div>
                            Save first, then use <strong>Send test</strong>. Test events carry a sample payload with email, name, phone, company, and website fields.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
