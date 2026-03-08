import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Mail, RefreshCw, Save, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../utils/api';

function copyToClipboard(text) {
    return navigator.clipboard.writeText(text);
}

export default function EmailInboxPanel({ endpoint }) {
    const [inbox, setInbox] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);

            try {
                const response = await api.getEmailInbox(endpoint.id);
                if (!cancelled) {
                    setInbox(response.data);
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

    const handleChange = (key, value) => {
        setInbox((current) => ({
            ...current,
            [key]: value,
        }));
    };

    const handleSave = async () => {
        setSaving(true);

        try {
            const response = await api.updateEmailInbox(endpoint.id, inbox);
            setInbox(response.data);
            toast.success('Email inbox settings saved');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);

        try {
            const response = await api.testEmailInbox(endpoint.id);
            setInbox(response.data.inbox);
            toast.success('Sample email captured');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setTesting(false);
        }
    };

    const handleCopyAddress = async () => {
        if (!inbox?.email_address) {
            return;
        }

        try {
            await copyToClipboard(inbox.email_address);
            setCopied(true);
            toast.success('Email address copied');
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy email address');
        }
    };

    if (loading || !inbox) {
        return (
            <div className="settings-section">
                <div className="settings-card integration-empty-state">
                    <p>Loading email inbox settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="settings-section">
            <div className="integration-section-header">
                <div>
                    <h3>
                        <Mail size={16} />
                        Email inbox endpoint
                    </h3>
                    <p className="integration-section-copy">
                        Capture emails directly into this endpoint. HookRadar stores each incoming email in the live request feed and
                        runs the same integrations and workflows on top of it.
                    </p>
                </div>

                <div className="integration-section-actions">
                    <button className="btn btn-secondary btn-sm" onClick={handleTest} disabled={testing || saving}>
                        {testing ? <RefreshCw className="icon animate-spin" size={14} /> : <Send className="icon" size={14} />}
                        {testing ? 'Sending...' : 'Send sample email'}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                        {saving ? <RefreshCw className="icon animate-spin" size={14} /> : <Save className="icon" size={14} />}
                        {saving ? 'Saving...' : 'Save inbox'}
                    </button>
                </div>
            </div>

            <div className="settings-card integration-card">
                <div className="toggle-row">
                    <div>
                        <div className="toggle-label">Enable email capture</div>
                        <div className="toggle-desc">Incoming emails for this inbox will appear in the same request feed as webhook traffic.</div>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={inbox.is_enabled === 1 || inbox.is_enabled === true}
                            onChange={(event) => handleChange('is_enabled', event.target.checked ? 1 : 0)}
                        />
                        <span className="toggle-slider" />
                    </label>
                </div>

                <div className="integration-grid">
                    <div className="form-group">
                        <label className="form-label">Inbox local-part</label>
                        <input
                            type="text"
                            className="form-input mono"
                            value={inbox.local_part || ''}
                            onChange={(event) => handleChange('local_part', event.target.value)}
                            placeholder={endpoint.slug}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Reply name</label>
                        <input
                            type="text"
                            className="form-input"
                            value={inbox.reply_name || ''}
                            onChange={(event) => handleChange('reply_name', event.target.value)}
                            placeholder={endpoint.name || 'HookRadar inbox'}
                        />
                    </div>
                </div>

                <div className="toggle-row">
                    <div>
                        <div className="toggle-label">Allow plus aliases</div>
                        <div className="toggle-desc">`orders+vip@your-domain.com` will map to this same inbox if enabled.</div>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={inbox.allow_plus_aliases === 1 || inbox.allow_plus_aliases === true}
                            onChange={(event) => handleChange('allow_plus_aliases', event.target.checked ? 1 : 0)}
                        />
                        <span className="toggle-slider" />
                    </label>
                </div>

                {inbox.email_address ? (
                    <div className="endpoint-url-bar endpoint-url-bar-public ready">
                        <span className="endpoint-url-method endpoint-url-method-public">EMAIL</span>
                        <span className="endpoint-url-text">{inbox.email_address}</span>
                        <button className="copy-btn" onClick={handleCopyAddress}>
                            {copied ? <CheckCircle2 className="icon" size={14} /> : <Copy className="icon" size={14} />}
                            {copied ? 'Copied' : 'Copy inbox'}
                        </button>
                    </div>
                ) : (
                    <div className="integration-error">
                        <strong>Inbound email domain not configured</strong>
                        <p>Set `INBOUND_EMAIL_DOMAIN` or `MAIL_DOMAIN`, point MX records to this app, and expose SMTP port {inbox.smtp_port} to receive real email.</p>
                    </div>
                )}

                <div className="integration-checklist">
                    <div className="dashboard-checklist-item">
                        <strong>1. Configure a mail domain</strong>
                        <p>Use `INBOUND_EMAIL_DOMAIN` and route MX records for that domain to the machine running HookRadar.</p>
                    </div>
                    <div className="dashboard-checklist-item">
                        <strong>2. Expose SMTP port {inbox.smtp_port}</strong>
                        <p>HookRadar listens for SMTP on <code>{inbox.smtp_host}:{inbox.smtp_port}</code> when the domain is configured.</p>
                    </div>
                    <div className="dashboard-checklist-item">
                        <strong>3. Test locally first</strong>
                        <p>The built-in sample email button lets you validate the inbox route before pointing real DNS at it.</p>
                    </div>
                </div>

                <div className="integration-status-row">
                    <div className={`integration-status-chip ${inbox.inbox_enabled ? 'active' : 'idle'}`}>
                        {inbox.inbox_enabled ? 'SMTP ready for domain' : 'Domain missing'}
                    </div>
                    {inbox.last_email_at && (
                        <div className="integration-status-copy">Last email {new Date(`${inbox.last_email_at}Z`).toLocaleString('en-IN')}</div>
                    )}
                </div>

                {inbox.last_error && (
                    <div className="integration-error">
                        <strong>Last email error</strong>
                        <p>{inbox.last_error}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
