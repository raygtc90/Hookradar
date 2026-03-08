import { useEffect, useState } from 'react';
import { Play, Plus, Save, Trash2, Workflow } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../utils/api';

const WORKFLOW_METHODS = ['ANY', 'POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'EMAIL'];
const PROVIDER_OPTIONS = [
    { value: 'slack', label: 'Slack' },
    { value: 'discord', label: 'Discord' },
    { value: 'email', label: 'Email / SMTP' },
    { value: 'airtable', label: 'Airtable' },
    { value: 'notion', label: 'Notion' },
    { value: 'zapier', label: 'Zapier' },
    { value: 'make', label: 'Make' },
    { value: 'pabbly', label: 'Pabbly' },
    { value: 'hubspot', label: 'HubSpot' },
    { value: 'salesforce', label: 'Salesforce' },
    { value: 's3', label: 'S3' },
    { value: 'google_drive', label: 'Google Drive' },
];

function safeJsonParse(value, fallback) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function createActionDraft(action = {}) {
    return {
        id: action.id || crypto.randomUUID(),
        type: action.type || 'forward_url',
        target_url: action.target_url || '',
        provider: action.provider || 'slack',
    };
}

function createWorkflowDraft(workflow = {}) {
    const conditions = safeJsonParse(workflow.conditions_json || '{}', {});
    const actions = safeJsonParse(workflow.actions_json || '[]', []);

    return {
        id: workflow.id,
        name: workflow.name || '',
        description: workflow.description || '',
        is_active: workflow.is_active === 0 ? 0 : 1,
        last_run_at: workflow.last_run_at || null,
        last_error: workflow.last_error || null,
        conditions: {
            method: conditions.method || 'ANY',
            path_contains: conditions.path_contains || '',
            header_name: conditions.header_name || '',
            header_value_contains: conditions.header_value_contains || '',
            body_contains: conditions.body_contains || '',
            content_type_contains: conditions.content_type_contains || '',
            email_subject_contains: conditions.email_subject_contains || '',
            email_from_contains: conditions.email_from_contains || '',
        },
        actions: actions.length ? actions.map(createActionDraft) : [createActionDraft()],
    };
}

function buildWorkflowPayload(workflow) {
    const actions = workflow.actions.map((action) => ({
        id: action.id,
        type: action.type,
        ...(action.type === 'forward_url'
            ? { target_url: action.target_url.trim() }
            : { provider: action.provider }),
    }));

    return {
        name: workflow.name.trim(),
        description: workflow.description.trim(),
        is_active: workflow.is_active ? 1 : 0,
        conditions: {
            method: workflow.conditions.method,
            path_contains: workflow.conditions.path_contains.trim(),
            header_name: workflow.conditions.header_name.trim(),
            header_value_contains: workflow.conditions.header_value_contains.trim(),
            body_contains: workflow.conditions.body_contains.trim(),
            content_type_contains: workflow.conditions.content_type_contains.trim(),
            email_subject_contains: workflow.conditions.email_subject_contains.trim(),
            email_from_contains: workflow.conditions.email_from_contains.trim(),
        },
        actions,
    };
}

export default function WorkflowPanel({ endpoint }) {
    const [workflows, setWorkflows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [savingId, setSavingId] = useState('');
    const [testingId, setTestingId] = useState('');
    const [deletingId, setDeletingId] = useState('');

    useEffect(() => {
        let cancelled = false;

        const loadWorkflows = async () => {
            setLoading(true);

            try {
                const response = await api.getWorkflows(endpoint.id);
                if (!cancelled) {
                    setWorkflows(response.data.map(createWorkflowDraft));
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

        loadWorkflows();

        return () => {
            cancelled = true;
        };
    }, [endpoint.id]);

    const handleWorkflowChange = (workflowId, key, value) => {
        setWorkflows((current) => current.map((workflow) => (
            workflow.id === workflowId ? { ...workflow, [key]: value } : workflow
        )));
    };

    const handleConditionChange = (workflowId, key, value) => {
        setWorkflows((current) => current.map((workflow) => (
            workflow.id === workflowId
                ? {
                    ...workflow,
                    conditions: {
                        ...workflow.conditions,
                        [key]: value,
                    },
                }
                : workflow
        )));
    };

    const handleActionChange = (workflowId, actionId, key, value) => {
        setWorkflows((current) => current.map((workflow) => (
            workflow.id === workflowId
                ? {
                    ...workflow,
                    actions: workflow.actions.map((action) => (
                        action.id === actionId ? { ...action, [key]: value } : action
                    )),
                }
                : workflow
        )));
    };

    const handleAddAction = (workflowId, type) => {
        setWorkflows((current) => current.map((workflow) => (
            workflow.id === workflowId
                ? {
                    ...workflow,
                    actions: [
                        ...workflow.actions,
                        createActionDraft(type === 'integration' ? { type: 'integration', provider: 'slack' } : { type: 'forward_url' }),
                    ],
                }
                : workflow
        )));
    };

    const handleRemoveAction = (workflowId, actionId) => {
        setWorkflows((current) => current.map((workflow) => (
            workflow.id === workflowId
                ? {
                    ...workflow,
                    actions: workflow.actions.filter((action) => action.id !== actionId),
                }
                : workflow
        )));
    };

    const handleCreateWorkflow = async () => {
        setCreating(true);

        try {
            const response = await api.createWorkflow(endpoint.id, {
                name: '',
                description: '',
                is_active: 0,
                conditions: { method: 'ANY' },
                actions: [{ type: 'forward_url', target_url: '' }],
            });

            setWorkflows((current) => [createWorkflowDraft(response.data), ...current]);
            toast.success('Workflow created');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setCreating(false);
        }
    };

    const handleSave = async (workflow) => {
        setSavingId(workflow.id);

        try {
            const response = await api.updateWorkflow(workflow.id, buildWorkflowPayload(workflow));
            setWorkflows((current) => current.map((item) => (
                item.id === workflow.id ? createWorkflowDraft(response.data) : item
            )));
            toast.success('Workflow saved');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSavingId('');
        }
    };

    const handleTest = async (workflow) => {
        setTestingId(workflow.id);

        try {
            const response = await api.testWorkflow(workflow.id);
            setWorkflows((current) => current.map((item) => (
                item.id === workflow.id ? createWorkflowDraft(response.data.workflow) : item
            )));
            toast.success(`Workflow ran ${response.data.results.length} action(s)`);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setTestingId('');
        }
    };

    const handleDelete = async (workflow) => {
        if (!confirm(`Delete workflow${workflow.name ? ` "${workflow.name}"` : ''}?`)) {
            return;
        }

        setDeletingId(workflow.id);

        try {
            await api.deleteWorkflow(workflow.id);
            setWorkflows((current) => current.filter((item) => item.id !== workflow.id));
            toast.success('Workflow deleted');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setDeletingId('');
        }
    };

    return (
        <div className="settings-section">
            <div className="schedule-section-header">
                <div>
                    <h3>
                        <Workflow size={16} />
                        Workflow builder
                    </h3>
                    <p className="schedule-section-copy">
                        Run actions automatically when a captured event matches your rules. This works for both webhooks and inbound emails.
                    </p>
                </div>

                <button className="btn btn-secondary btn-sm" onClick={handleCreateWorkflow} disabled={creating}>
                    <Plus className="icon" size={14} />
                    {creating ? 'Creating...' : 'New workflow'}
                </button>
            </div>

            {loading ? (
                <div className="settings-card schedule-empty-state">
                    <p>Loading workflows...</p>
                </div>
            ) : workflows.length === 0 ? (
                <div className="settings-card schedule-empty-state">
                    <Workflow size={18} />
                    <div>
                        <strong>No workflows yet</strong>
                        <p>Create one to route matched events into integrations or custom URLs automatically.</p>
                    </div>
                </div>
            ) : (
                <div className="schedule-list">
                    {workflows.map((workflow) => (
                        <div key={workflow.id} className="settings-card schedule-card">
                            <div className="schedule-card-header">
                                <div>
                                    <div className="schedule-card-title">
                                        <strong>{workflow.name || 'Untitled workflow'}</strong>
                                        <span className={`schedule-state-badge ${workflow.is_active ? 'live' : 'paused'}`}>
                                            {workflow.is_active ? 'Active' : 'Paused'}
                                        </span>
                                    </div>
                                    <div className="schedule-card-meta">
                                        <span>{workflow.conditions.method || 'ANY'}</span>
                                        <span>{workflow.actions.length} action{workflow.actions.length === 1 ? '' : 's'}</span>
                                        <span>{workflow.last_run_at ? `Last ${new Date(`${workflow.last_run_at}Z`).toLocaleString('en-IN')}` : 'Never matched yet'}</span>
                                    </div>
                                </div>

                                <div className="schedule-card-actions">
                                    <button className="btn btn-secondary btn-sm" onClick={() => handleTest(workflow)} disabled={testingId === workflow.id}>
                                        <Play className="icon" size={14} />
                                        {testingId === workflow.id ? 'Testing...' : 'Test latest'}
                                    </button>
                                    <button className="btn btn-primary btn-sm" onClick={() => handleSave(workflow)} disabled={savingId === workflow.id}>
                                        <Save className="icon" size={14} />
                                        {savingId === workflow.id ? 'Saving...' : 'Save'}
                                    </button>
                                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(workflow)} disabled={deletingId === workflow.id}>
                                        <Trash2 className="icon" size={14} />
                                        {deletingId === workflow.id ? 'Deleting...' : 'Delete'}
                                    </button>
                                </div>
                            </div>

                            <div className="schedule-grid">
                                <div className="form-group">
                                    <label className="form-label">Name</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={workflow.name}
                                        onChange={(event) => handleWorkflowChange(workflow.id, 'name', event.target.value)}
                                        placeholder="Route emails with invoices"
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Method</label>
                                    <select
                                        className="form-input"
                                        value={workflow.conditions.method}
                                        onChange={(event) => handleConditionChange(workflow.id, 'method', event.target.value)}
                                    >
                                        {WORKFLOW_METHODS.map((method) => (
                                            <option key={method} value={method}>{method}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={workflow.description}
                                    onChange={(event) => handleWorkflowChange(workflow.id, 'description', event.target.value)}
                                    placeholder="Example: when subject contains invoice, forward to finance tools."
                                />
                            </div>

                            <div className="schedule-grid">
                                <div className="form-group">
                                    <label className="form-label">Path contains</label>
                                    <input
                                        type="text"
                                        className="form-input mono"
                                        value={workflow.conditions.path_contains}
                                        onChange={(event) => handleConditionChange(workflow.id, 'path_contains', event.target.value)}
                                        placeholder="/payments"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Body contains</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={workflow.conditions.body_contains}
                                        onChange={(event) => handleConditionChange(workflow.id, 'body_contains', event.target.value)}
                                        placeholder="invoice_paid"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Header name</label>
                                    <input
                                        type="text"
                                        className="form-input mono"
                                        value={workflow.conditions.header_name}
                                        onChange={(event) => handleConditionChange(workflow.id, 'header_name', event.target.value)}
                                        placeholder="x-provider-event"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Header value contains</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={workflow.conditions.header_value_contains}
                                        onChange={(event) => handleConditionChange(workflow.id, 'header_value_contains', event.target.value)}
                                        placeholder="invoice"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Content type contains</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={workflow.conditions.content_type_contains}
                                        onChange={(event) => handleConditionChange(workflow.id, 'content_type_contains', event.target.value)}
                                        placeholder="json"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email subject contains</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={workflow.conditions.email_subject_contains}
                                        onChange={(event) => handleConditionChange(workflow.id, 'email_subject_contains', event.target.value)}
                                        placeholder="Invoice"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email from contains</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={workflow.conditions.email_from_contains}
                                        onChange={(event) => handleConditionChange(workflow.id, 'email_from_contains', event.target.value)}
                                        placeholder="@vendor.com"
                                    />
                                </div>
                            </div>

                            <div className="schedule-list workflow-action-list">
                                {workflow.actions.map((action) => (
                                    <div key={action.id} className="workflow-action-card">
                                        <div className="schedule-grid">
                                            <div className="form-group">
                                                <label className="form-label">Action type</label>
                                                <select
                                                    className="form-input"
                                                    value={action.type}
                                                    onChange={(event) => handleActionChange(workflow.id, action.id, 'type', event.target.value)}
                                                >
                                                    <option value="forward_url">Forward to URL</option>
                                                    <option value="integration">Use saved integration</option>
                                                </select>
                                            </div>

                                            {action.type === 'forward_url' ? (
                                                <div className="form-group">
                                                    <label className="form-label">Target URL</label>
                                                    <input
                                                        type="url"
                                                        className="form-input mono"
                                                        value={action.target_url}
                                                        onChange={(event) => handleActionChange(workflow.id, action.id, 'target_url', event.target.value)}
                                                        placeholder="https://example.com/webhook"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="form-group">
                                                    <label className="form-label">Integration</label>
                                                    <select
                                                        className="form-input"
                                                        value={action.provider}
                                                        onChange={(event) => handleActionChange(workflow.id, action.id, 'provider', event.target.value)}
                                                    >
                                                        {PROVIDER_OPTIONS.map((provider) => (
                                                            <option key={provider.value} value={provider.value}>{provider.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>

                                        <div className="workflow-action-row">
                                            <button className="btn btn-danger btn-sm" onClick={() => handleRemoveAction(workflow.id, action.id)} disabled={workflow.actions.length === 1}>
                                                <Trash2 className="icon" size={14} />
                                                Remove action
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="workflow-action-row">
                                <button className="btn btn-secondary btn-sm" onClick={() => handleAddAction(workflow.id, 'forward')}>
                                    <Plus className="icon" size={14} />
                                    Add forward action
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => handleAddAction(workflow.id, 'integration')}>
                                    <Plus className="icon" size={14} />
                                    Add integration action
                                </button>
                            </div>

                            <div className="toggle-row">
                                <div>
                                    <div className="toggle-label">Workflow active</div>
                                    <div className="toggle-desc">Only active workflows evaluate incoming events in real time.</div>
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={workflow.is_active === 1 || workflow.is_active === true}
                                        onChange={(event) => handleWorkflowChange(workflow.id, 'is_active', event.target.checked ? 1 : 0)}
                                    />
                                    <span className="toggle-slider" />
                                </label>
                            </div>

                            {workflow.last_error && (
                                <div className="integration-error">
                                    <strong>Last workflow error</strong>
                                    <p>{workflow.last_error}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
