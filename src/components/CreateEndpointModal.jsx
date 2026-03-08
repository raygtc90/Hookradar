import { useMemo, useState } from 'react';
import { ArrowRight, Globe, Sparkles, Webhook, X } from 'lucide-react';
import { isLocalHostname } from '../utils/api';

const SOURCE_PRESETS = [
    {
        id: 'custom',
        label: 'Custom',
        name: 'Custom endpoint',
        description: 'Bring your own workflow, sender, naming, and endpoint setup.',
        slug: 'custom-endpoint',
    },
    {
        id: 'general',
        label: 'General',
        name: 'General webhook',
        description: 'Use this for any app or custom backend that needs a clean capture URL.',
        slug: 'general-webhook',
    },
    {
        id: 'stripe',
        label: 'Stripe',
        name: 'Stripe events',
        description: 'Capture payments, invoices, refunds, and subscription lifecycle events.',
        slug: 'stripe-events',
    },
    {
        id: 'github',
        label: 'GitHub',
        name: 'GitHub webhooks',
        description: 'Inspect pushes, pull requests, deployments, and app callbacks.',
        slug: 'github-webhooks',
    },
    {
        id: 'shopify',
        label: 'Shopify',
        name: 'Shopify orders',
        description: 'Track order, customer, and fulfillment webhooks in one route.',
        slug: 'shopify-orders',
    },
    {
        id: 'internal',
        label: 'Internal API',
        name: 'Internal events',
        description: 'Use this for team tools, queue callbacks, and internal service events.',
        slug: 'internal-events',
    },
];
const DEFAULT_PRESET = SOURCE_PRESETS.find((preset) => preset.id === 'general') || SOURCE_PRESETS[0];

export default function CreateEndpointModal({ onClose, onCreate }) {
    const appIsLocal = isLocalHostname(window.location.hostname);
    const [selectedPresetId, setSelectedPresetId] = useState('general');
    const [name, setName] = useState(DEFAULT_PRESET.name);
    const [description, setDescription] = useState(DEFAULT_PRESET.description);
    const [slug, setSlug] = useState(DEFAULT_PRESET.slug);
    const [exposePublicly, setExposePublicly] = useState(appIsLocal);
    const [loading, setLoading] = useState(false);

    const selectedPreset = useMemo(
        () => SOURCE_PRESETS.find((preset) => preset.id === selectedPresetId) || DEFAULT_PRESET,
        [selectedPresetId],
    );
    const endpointName = name.trim() || selectedPreset.name;
    const endpointDescription = description.trim() || selectedPreset.description;
    const routeSlug = slug.trim() || selectedPreset.slug;
    const previewUrl = `${window.location.origin}/hook/${routeSlug}`;

    const applyPreset = (preset) => {
        setSelectedPresetId(preset.id);
        setName(preset.name);
        setDescription(preset.description);
        setSlug(preset.slug);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setLoading(true);

        try {
            await onCreate({ name, description, slug, expose_publicly: exposePublicly });
        } catch {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-title-group">
                        <div className="modal-title-icon">
                            <Webhook size={18} />
                        </div>
                        <div>
                            <h2>Create a webhook URL</h2>
                            <p>Keep this simple: choose a starter, name it, and HookRadar will open the endpoint right away.</p>
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>
                        <X className="icon" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body modal-split">
                        <div className="modal-form-column">
                            <div className="form-group">
                                <label className="form-label">Starter</label>
                                <div className="template-pill-row">
                                    {SOURCE_PRESETS.map((preset) => (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            className={`template-pill ${selectedPresetId === preset.id ? 'active' : ''}`}
                                            onClick={() => applyPreset(preset)}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="form-hint">This only pre-fills a clean name and description. You can still customize everything later.</div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder={selectedPreset.name}
                                    autoFocus
                                />
                            </div>

                            {appIsLocal ? (
                                <div className="settings-card modal-inline-card">
                                    <div className="toggle-row">
                                        <div>
                                            <div className="toggle-label">
                                                <Globe size={15} />
                                                Start with a public URL
                                            </div>
                                            <div className="toggle-desc">Recommended on localhost so Stripe, GitHub, and other external apps can hit this endpoint immediately.</div>
                                        </div>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                checked={exposePublicly}
                                                onChange={(event) => setExposePublicly(event.target.checked)}
                                            />
                                            <span className="toggle-slider" />
                                        </label>
                                    </div>
                                </div>
                            ) : (
                                <div className="settings-card modal-inline-card modal-inline-card-info">
                                    <strong>This deployment is already public.</strong>
                                    <p>Your new endpoint will be reachable immediately after creation.</p>
                                </div>
                            )}

                            <details className="settings-collapsible modal-collapsible">
                                <summary>
                                    Advanced options
                                </summary>

                                <div className="settings-collapsible-body">
                                    <div className="form-group">
                                        <label className="form-label">Description</label>
                                        <textarea
                                            className="form-input"
                                            value={description}
                                            onChange={(event) => setDescription(event.target.value)}
                                            placeholder={selectedPreset.description}
                                            rows={4}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Custom slug</label>
                                        <input
                                            type="text"
                                            className="form-input mono"
                                            value={slug}
                                            onChange={(event) => setSlug(event.target.value.toLowerCase())}
                                            placeholder={selectedPreset.slug}
                                            pattern="[a-z0-9][a-z0-9-_]{2,63}"
                                        />
                                        <div className="form-hint">Use lowercase letters, numbers, dashes, or underscores. Leave blank for an auto-generated slug.</div>
                                    </div>
                                </div>
                            </details>
                        </div>

                        <div className="modal-preview-column">
                            <div className="modal-preview-card">
                                <div className="modal-preview-header">
                                    <Sparkles size={15} />
                                    URL preview
                                </div>
                                <h3>{endpointName}</h3>
                                <p>{endpointDescription}</p>
                                <code>{previewUrl}</code>
                                <div className="modal-preview-badges">
                                    <span className="dashboard-hero-badge">{appIsLocal && exposePublicly ? 'Public URL on create' : 'Ready right after create'}</span>
                                    <span className="dashboard-hero-badge">Realtime capture</span>
                                </div>
                            </div>

                            <div className="modal-preview-card">
                                <div className="modal-preview-header">
                                    <ArrowRight size={15} />
                                    What happens next
                                </div>
                                <div className="dashboard-checklist">
                                    <div className="dashboard-checklist-item">
                                        <strong>1. Share the URL</strong>
                                        <p>Copy the webhook URL and paste it directly into Stripe, GitHub, Shopify, or any custom sender.</p>
                                    </div>
                                    <div className="dashboard-checklist-item">
                                        <strong>2. Watch requests live</strong>
                                        <p>Every HTTP request sent to this URL appears in the live request feed.</p>
                                    </div>
                                    <div className="dashboard-checklist-item">
                                        <strong>3. Open advanced tools only when needed</strong>
                                        <p>Responses, forwarding, schedules, spreadsheets, alerts, CRM pushes, and archives stay available after the endpoint is live.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Creating...' : 'Create endpoint'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
