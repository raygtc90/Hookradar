import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, FileSpreadsheet, RefreshCw, Save, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../utils/api';

const DEFAULT_SHEET_NAME = 'Webhook Events';

function parseServiceAccountEmail(credentialsJson) {
    try {
        const parsed = JSON.parse(credentialsJson || '{}');
        return parsed.client_email || '';
    } catch {
        return '';
    }
}

export default function GoogleSheetsPanel({ endpoint }) {
    const [integration, setIntegration] = useState({
        is_enabled: 0,
        spreadsheet_id: '',
        sheet_name: DEFAULT_SHEET_NAME,
        credentials_json: '',
        last_synced_at: null,
        last_error: null,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const loadIntegration = async () => {
            setLoading(true);

            try {
                const response = await api.getGoogleSheetsIntegration(endpoint.id);
                if (!cancelled) {
                    setIntegration({
                        is_enabled: response.data.is_enabled || 0,
                        spreadsheet_id: response.data.spreadsheet_id || '',
                        sheet_name: response.data.sheet_name || DEFAULT_SHEET_NAME,
                        credentials_json: response.data.credentials_json || '',
                        last_synced_at: response.data.last_synced_at || null,
                        last_error: response.data.last_error || null,
                    });
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

        loadIntegration();

        return () => {
            cancelled = true;
        };
    }, [endpoint.id]);

    const serviceAccountEmail = parseServiceAccountEmail(integration.credentials_json);

    const handleChange = (key, value) => {
        setIntegration((current) => ({
            ...current,
            [key]: value,
        }));
    };

    const handleSave = async () => {
        setSaving(true);

        try {
            const response = await api.updateGoogleSheetsIntegration(endpoint.id, integration);
            setIntegration({
                is_enabled: response.data.is_enabled || 0,
                spreadsheet_id: response.data.spreadsheet_id || '',
                sheet_name: response.data.sheet_name || DEFAULT_SHEET_NAME,
                credentials_json: response.data.credentials_json || '',
                last_synced_at: response.data.last_synced_at || null,
                last_error: response.data.last_error || null,
            });
            toast.success('Google Sheets integration saved');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSendTestRow = async () => {
        setTesting(true);

        try {
            const response = await api.testGoogleSheetsIntegration(endpoint.id);
            setIntegration((current) => ({
                ...current,
                last_synced_at: response.data.last_synced_at || null,
                last_error: response.data.last_error || null,
            }));
            toast.success('Test row sent to Google Sheets');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="settings-section">
            <div className="integration-section-header">
                <div>
                    <h3>
                        <FileSpreadsheet size={16} />
                        Google Sheets
                    </h3>
                    <p className="integration-section-copy">
                        Append each captured webhook to a spreadsheet directly from HookRadar, without an Apps Script middle layer.
                    </p>
                </div>

                <div className="integration-section-actions">
                    <button className="btn btn-secondary btn-sm" onClick={handleSendTestRow} disabled={loading || saving || testing}>
                        {testing ? <RefreshCw className="icon animate-spin" size={14} /> : <Send className="icon" size={14} />}
                        {testing ? 'Sending...' : 'Send test row'}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={loading || saving}>
                        {saving ? <RefreshCw className="icon animate-spin" size={14} /> : <Save className="icon" size={14} />}
                        {saving ? 'Saving...' : 'Save integration'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="settings-card integration-empty-state">
                    <p>Loading Google Sheets integration...</p>
                </div>
            ) : (
                <div className="settings-card integration-card">
                    <div className="toggle-row">
                        <div>
                            <div className="toggle-label">Enable Google Sheets sync</div>
                            <div className="toggle-desc">Each incoming webhook will append one row into the target sheet.</div>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={integration.is_enabled === 1 || integration.is_enabled === true}
                                onChange={(event) => handleChange('is_enabled', event.target.checked ? 1 : 0)}
                            />
                            <span className="toggle-slider" />
                        </label>
                    </div>

                    <div className="integration-grid">
                        <div className="form-group">
                            <label className="form-label">Spreadsheet ID or URL</label>
                            <input
                                type="text"
                                className="form-input mono"
                                value={integration.spreadsheet_id}
                                onChange={(event) => handleChange('spreadsheet_id', event.target.value)}
                                placeholder="https://docs.google.com/spreadsheets/d/..."
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Sheet name</label>
                            <input
                                type="text"
                                className="form-input"
                                value={integration.sheet_name}
                                onChange={(event) => handleChange('sheet_name', event.target.value)}
                                placeholder={DEFAULT_SHEET_NAME}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Service account JSON</label>
                        <textarea
                            className="form-input mono"
                            rows={10}
                            value={integration.credentials_json}
                            onChange={(event) => handleChange('credentials_json', event.target.value)}
                            placeholder='{"type":"service_account","client_email":"...","private_key":"..."}'
                        />
                        <span className="form-hint">
                            Create a Google Cloud service account key JSON, then paste the full credentials here.
                        </span>
                    </div>

                    {serviceAccountEmail && (
                        <div className="integration-inline-callout">
                            <CheckCircle2 size={16} />
                            <div>
                                Share your spreadsheet with <code>{serviceAccountEmail}</code> as an Editor.
                            </div>
                        </div>
                    )}

                    <div className="integration-checklist">
                        <div className="dashboard-checklist-item">
                            <strong>1. Enable the Google Sheets API</strong>
                            <p>Use one Google Cloud project, enable the Sheets API, and create a service account key.</p>
                        </div>
                        <div className="dashboard-checklist-item">
                            <strong>2. Share the sheet with the service account</strong>
                            <p>The service account email must have Editor access, otherwise appends will fail.</p>
                        </div>
                        <div className="dashboard-checklist-item">
                            <strong>3. HookRadar appends fixed webhook columns</strong>
                            <p>Rows are appended as: captured_at, endpoint_slug, method, path, response_status, content_type, ip_address, user_agent, query_params, headers, body.</p>
                        </div>
                    </div>

                    <div className="integration-status-row">
                        <div className={`integration-status-chip ${(integration.is_enabled === 1 || integration.is_enabled === true) ? 'active' : 'idle'}`}>
                            {(integration.is_enabled === 1 || integration.is_enabled === true) ? 'Sync enabled' : 'Sync disabled'}
                        </div>
                        {integration.last_synced_at && (
                            <div className="integration-status-copy">Last sync {new Date(`${integration.last_synced_at}Z`).toLocaleString('en-IN')}</div>
                        )}
                    </div>

                    {integration.last_error && (
                        <div className="integration-error">
                            <strong>Last sync error</strong>
                            <p>{integration.last_error}</p>
                        </div>
                    )}

                    <div className="integration-doc-link">
                        <a
                            href="https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/append"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <ExternalLink size={14} />
                            Google Sheets append API reference
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
