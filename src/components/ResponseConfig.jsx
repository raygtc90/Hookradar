import { useState } from 'react';
import { Activity, Clock3, ExternalLink, RotateCcw, Save, ShieldCheck, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';

function getConfigDefaults(endpoint) {
    return {
        status: endpoint?.response_status || 200,
        headers: endpoint?.response_headers || '{"Content-Type": "application/json"}',
        body: endpoint?.response_body || '{"success": true, "message": "Webhook received by HookRadar"}',
        delay: endpoint?.response_delay || 0,
        isActive: endpoint ? endpoint.is_active === 1 || endpoint.is_active === true : true,
        forwardingUrl: endpoint?.forwarding_url || '',
    };
}

function getStatusTone(statusCode) {
    const code = Number(statusCode);
    if (code >= 500) return 'bad';
    if (code >= 400) return 'warn';
    if (code >= 300) return 'info';
    return 'good';
}

export default function ResponseConfig({ endpoint, onUpdate }) {
    const defaults = getConfigDefaults(endpoint);
    const [status, setStatus] = useState(defaults.status);
    const [headers, setHeaders] = useState(defaults.headers);
    const [body, setBody] = useState(defaults.body);
    const [delay, setDelay] = useState(defaults.delay);
    const [isActive, setIsActive] = useState(defaults.isActive);
    const [forwardingUrl, setForwardingUrl] = useState(defaults.forwardingUrl);

    const headerCount = (() => {
        try {
            const parsed = JSON.parse(headers);
            return Object.keys(parsed).length;
        } catch {
            return 0;
        }
    })();

    const handleSave = () => {
        try {
            JSON.parse(headers);
        } catch {
            toast.error('Headers must be valid JSON');
            return;
        }

        if (forwardingUrl && !forwardingUrl.startsWith('http')) {
            toast.error('Forwarding URL must start with http:// or https://');
            return;
        }

        onUpdate(endpoint.id, {
            response_status: parseInt(status, 10),
            response_headers: headers,
            response_body: body,
            response_delay: parseInt(delay, 10),
            is_active: isActive ? 1 : 0,
            forwarding_url: forwardingUrl,
        });
    };

    const handleReset = () => {
        setStatus(defaults.status);
        setHeaders(defaults.headers);
        setBody(defaults.body);
        setDelay(defaults.delay);
        setIsActive(defaults.isActive);
        setForwardingUrl(defaults.forwardingUrl);
    };

    if (!endpoint) {
        return (
            <div className="settings-panel">
                <div className="empty-state">
                    <p>Select an endpoint to configure its response.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="settings-panel">
            <div className="settings-hero">
                <div>
                    <div className="settings-eyebrow">
                        <ShieldCheck size={14} />
                        Response studio
                    </div>
                    <h2>{endpoint.name || endpoint.slug}</h2>
                    <p>
                        Control the exact HTTP response, introduce artificial latency, and mirror traffic into staging or
                        another debugging target.
                    </p>
                </div>

                <div className="settings-hero-actions">
                    <button className="btn btn-primary" onClick={handleSave}>
                        <Save className="icon" />
                        Save configuration
                    </button>
                    <button className="btn btn-secondary" onClick={handleReset}>
                        <RotateCcw className="icon" />
                        Reset defaults
                    </button>
                </div>
            </div>

            <div className="settings-layout">
                <div className="settings-main">
                    <div className="settings-section">
                        <h3>
                            <ExternalLink size={16} />
                            Auto-forwarding
                        </h3>
                        <div className="settings-card">
                            <div className="form-group">
                                <label className="form-label">
                                    Forwarding URL
                                    {forwardingUrl && (
                                        <span className="forwarding-badge-active">
                                            <Zap size={10} />
                                            Active
                                        </span>
                                    )}
                                </label>
                                <input
                                    type="url"
                                    className="form-input mono"
                                    value={forwardingUrl}
                                    onChange={(event) => setForwardingUrl(event.target.value)}
                                    placeholder="https://your-server.com/webhook"
                                />
                                <span className="form-hint">
                                    HookRadar captures the incoming request first, then mirrors it to the target URL. Use this for
                                    staging mirrors, shadow traffic, or downstream debugging.
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="settings-section">
                        <h3>
                            <Activity size={16} />
                            Response profile
                        </h3>
                        <div className="settings-card">
                            <div className="response-config-grid">
                                <div className="form-group">
                                    <label className="form-label">Status code</label>
                                    <select className="form-input" value={status} onChange={(event) => setStatus(event.target.value)}>
                                        <option value="200">200 - OK</option>
                                        <option value="201">201 - Created</option>
                                        <option value="202">202 - Accepted</option>
                                        <option value="204">204 - No Content</option>
                                        <option value="301">301 - Moved Permanently</option>
                                        <option value="302">302 - Found</option>
                                        <option value="400">400 - Bad Request</option>
                                        <option value="401">401 - Unauthorized</option>
                                        <option value="403">403 - Forbidden</option>
                                        <option value="404">404 - Not Found</option>
                                        <option value="500">500 - Internal Server Error</option>
                                        <option value="502">502 - Bad Gateway</option>
                                        <option value="503">503 - Service Unavailable</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Response delay (ms)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={delay}
                                        onChange={(event) => setDelay(event.target.value)}
                                        min="0"
                                        max="30000"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Response headers (JSON)</label>
                                <textarea
                                    className="form-input mono"
                                    value={headers}
                                    onChange={(event) => setHeaders(event.target.value)}
                                    rows={5}
                                    placeholder='{"Content-Type": "application/json"}'
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Response body</label>
                                <textarea
                                    className="form-input mono"
                                    value={body}
                                    onChange={(event) => setBody(event.target.value)}
                                    rows={8}
                                    placeholder="Response body..."
                                />
                            </div>

                            <div className="toggle-row">
                                <div>
                                    <div className="toggle-label">Endpoint active</div>
                                    <div className="toggle-desc">When disabled, the endpoint returns a 410 Gone response.</div>
                                </div>
                                <label className="toggle-switch">
                                    <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                                    <span className="toggle-slider" />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <aside className="settings-sidebar">
                    <div className="settings-preview-card">
                        <div className="settings-preview-header">
                            <span>Current response</span>
                            <span className={`settings-status-badge ${getStatusTone(status)}`}>{status}</span>
                        </div>

                        <div className="settings-preview-grid">
                            <div className="settings-preview-metric">
                                <Clock3 size={15} />
                                <div>
                                    <span>Delay</span>
                                    <strong>{delay || 0}ms</strong>
                                </div>
                            </div>
                            <div className="settings-preview-metric">
                                <Activity size={15} />
                                <div>
                                    <span>Headers</span>
                                    <strong>{headerCount}</strong>
                                </div>
                            </div>
                            <div className="settings-preview-metric">
                                <ShieldCheck size={15} />
                                <div>
                                    <span>Mode</span>
                                    <strong>{isActive ? 'Active' : 'Paused'}</strong>
                                </div>
                            </div>
                            <div className="settings-preview-metric">
                                <ExternalLink size={15} />
                                <div>
                                    <span>Forwarding</span>
                                    <strong>{forwardingUrl ? 'On' : 'Off'}</strong>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="settings-preview-card">
                        <div className="settings-preview-header">
                            <span>Body snapshot</span>
                        </div>
                        <pre className="settings-preview-code">{body || 'No response body configured.'}</pre>
                    </div>

                    <div className="settings-preview-card">
                        <div className="settings-preview-header">
                            <span>Recommended use</span>
                        </div>
                        <div className="dashboard-checklist">
                            <div className="dashboard-checklist-item">
                                <strong>2xx for production parity</strong>
                                <p>Keep providers happy while you capture payloads and mirror them elsewhere.</p>
                            </div>
                            <div className="dashboard-checklist-item">
                                <strong>4xx or 5xx for retry testing</strong>
                                <p>Simulate failure paths to observe provider retry logic and alerting behavior.</p>
                            </div>
                            <div className="dashboard-checklist-item">
                                <strong>Delay for timeout drills</strong>
                                <p>Introduce latency to validate how clients behave under slow downstream conditions.</p>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
