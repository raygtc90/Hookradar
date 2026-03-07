import { useState } from 'react';
import { X, Webhook } from 'lucide-react';

export default function CreateEndpointModal({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [slug, setSlug] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onCreate({ name, description, slug });
        } catch {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 'var(--radius-md)',
                            background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Webhook size={18} />
                        </div>
                        New Webhook Endpoint
                    </h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>
                        <X className="icon" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Name (optional)</label>
                            <input
                                type="text"
                                className="form-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g., Stripe Payments, GitHub Actions..."
                                autoFocus
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Description (optional)</label>
                            <textarea
                                className="form-input"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="What is this endpoint for?"
                                rows={3}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Custom slug (optional)</label>
                            <input
                                type="text"
                                className="form-input mono"
                                value={slug}
                                onChange={e => setSlug(e.target.value.toLowerCase())}
                                placeholder="stripe-payments"
                                pattern="[a-z0-9][a-z0-9-_]{2,63}"
                            />
                            <div className="form-hint">Use lowercase letters, numbers, dashes, or underscores.</div>
                        </div>

                        <div style={{
                            padding: '14px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-primary)',
                            fontSize: '0.82rem',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.6
                        }}>
                            <strong style={{ color: 'var(--text-primary)' }}>💡 How it works:</strong>
                            <ul style={{ marginTop: '6px', paddingLeft: '16px' }}>
                                <li>A unique webhook URL will be generated for you</li>
                                <li>Send any HTTP request (GET, POST, PUT, etc.) to that URL</li>
                                <li>Inspect headers, body, query params in real-time</li>
                                <li>Customize what response the endpoint returns</li>
                            </ul>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Creating...' : 'Create Endpoint'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
