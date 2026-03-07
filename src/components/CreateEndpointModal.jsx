import { useState } from 'react';
import { ArrowRight, Sparkles, Webhook, X } from 'lucide-react';

export default function CreateEndpointModal({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [slug, setSlug] = useState('');
    const [loading, setLoading] = useState(false);

    const endpointName = name.trim() || 'New webhook route';
    const endpointDescription = description.trim() || 'Realtime webhook capture, replay, and response simulation.';
    const routeSlug = slug.trim() || 'auto-generated-slug';
    const previewUrl = `${window.location.origin}/hook/${routeSlug}`;

    const handleSubmit = async (event) => {
        event.preventDefault();
        setLoading(true);

        try {
            await onCreate({ name, description, slug });
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
                            <h2>Launch a new endpoint</h2>
                            <p>Give the route a clear identity now so it stays easy to find once traffic grows.</p>
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
                                <label className="form-label">Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder="Stripe payments, GitHub builds, internal queue..."
                                    autoFocus
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <textarea
                                    className="form-input"
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                    placeholder="Describe what should hit this endpoint and why."
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
                                    placeholder="stripe-payments"
                                    pattern="[a-z0-9][a-z0-9-_]{2,63}"
                                />
                                <div className="form-hint">Use lowercase letters, numbers, dashes, or underscores. Leave blank for an auto-generated slug.</div>
                            </div>
                        </div>

                        <div className="modal-preview-column">
                            <div className="modal-preview-card">
                                <div className="modal-preview-header">
                                    <Sparkles size={15} />
                                    Route preview
                                </div>
                                <h3>{endpointName}</h3>
                                <p>{endpointDescription}</p>
                                <code>{previewUrl}</code>
                            </div>

                            <div className="modal-preview-card">
                                <div className="modal-preview-header">
                                    <ArrowRight size={15} />
                                    What happens next
                                </div>
                                <div className="dashboard-checklist">
                                    <div className="dashboard-checklist-item">
                                        <strong>Instant capture</strong>
                                        <p>Every HTTP request sent to this URL appears in the live request feed.</p>
                                    </div>
                                    <div className="dashboard-checklist-item">
                                        <strong>Response control</strong>
                                        <p>Configure status codes, headers, body, delay, and endpoint state after creation.</p>
                                    </div>
                                    <div className="dashboard-checklist-item">
                                        <strong>Replay and export</strong>
                                        <p>Forward captured requests elsewhere and download CSV archives when needed.</p>
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
