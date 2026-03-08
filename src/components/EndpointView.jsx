import { useState, useEffect, useCallback } from 'react';
import {
    Activity,
    ArrowRight,
    Brain,
    Check,
    Clock,
    Copy,
    Download,
    ExternalLink,
    Gauge,
    Hash,
    Inbox,
    Radio,
    RefreshCw,
    Search,
    Settings,
    SlidersHorizontal,
    Sparkles,
    Trash2,
    Webhook,
    X,
} from 'lucide-react';
import RequestDetail from './RequestDetail';
import ResponseConfig from './ResponseConfig';
import AIAnalysisPanel from './AIAnalysisPanel';
import {
    api,
    buildWebhookUrl,
    formatTime,
    getMethodClass,
    getStatusClass,
    getWebhookUrl,
    isLocalHostname,
    normalizeRequestPath,
} from '../utils/api';
import { toast } from 'react-hot-toast';
import { CollapsedPanel, HiddenSectionsTray, SectionVisibilityButtons } from './SectionVisibility';
import { endpointLayoutSections } from '../utils/layoutPreferences';

const isEndpointActive = (endpoint) => endpoint.is_active === 1 || endpoint.is_active === true;
const getHostedPublicState = (origin) => ({
    provider: 'hosted',
    installed: true,
    running: true,
    public_base_url: origin,
    target_url: origin,
    source: 'app_origin',
    started_at: null,
    error: null,
    install_url: null,
});

export default function EndpointView({
    endpoint,
    onUpdate,
    onChangeSectionMode,
    sectionPreferences,
    newRequestTrigger,
}) {
    const appOrigin = window.location.origin;
    const appIsLocal = isLocalHostname(window.location.hostname);
    const [requests, setRequests] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [totalRequests, setTotalRequests] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [copied, setCopied] = useState(false);
    const [publicCopied, setPublicCopied] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const [showAI, setShowAI] = useState(false);
    const [loading, setLoading] = useState(true);
    const [publicTunnel, setPublicTunnel] = useState(() => (appIsLocal ? null : getHostedPublicState(appOrigin)));
    const [publicTunnelLoading, setPublicTunnelLoading] = useState(appIsLocal);
    const [publicTunnelAction, setPublicTunnelAction] = useState('');
    const [sampleCurlCopied, setSampleCurlCopied] = useState(false);
    const [sendingSample, setSendingSample] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState({
        method: '',
        status: '',
        content_type: '',
        date_from: '',
        date_to: '',
    });

    const activeFilterCount = Object.values(filters).filter((value) => value !== '').length;
    const getSectionMode = (sectionId) => sectionPreferences?.[sectionId] || 'expanded';
    const setSectionMode = (sectionId, mode) => onChangeSectionMode(sectionId, mode);
    const hiddenSections = endpointLayoutSections.filter((section) => getSectionMode(section.id) === 'hidden');
    const localWebhookUrl = getWebhookUrl(endpoint.slug);
    const isActive = isEndpointActive(endpoint);
    const latestRequest = requests[0] || null;
    const successfulRequests = requests.filter((request) => request.response_status >= 200 && request.response_status < 400).length;
    const successRate = requests.length ? Math.round((successfulRequests / requests.length) * 100) : 0;
    const averageLatency = requests.length
        ? Math.round(requests.reduce((sum, request) => sum + (request.response_time || 0), 0) / requests.length)
        : 0;
    const methodCount = new Set(requests.map((request) => request.method)).size;
    const publicBaseUrl = publicTunnel?.public_base_url || '';
    const publicWebhookUrl = publicBaseUrl ? buildWebhookUrl(publicBaseUrl, endpoint.slug) : '';
    const requestWebhookUrl = publicWebhookUrl || localWebhookUrl;
    const browserTestWebhookUrl = localWebhookUrl;
    const publicUrlReady = Boolean(publicWebhookUrl);
    const shouldShowPublicUrlBar = appIsLocal || Boolean(publicTunnel?.error) || Boolean(publicTunnel && publicWebhookUrl !== localWebhookUrl);
    const publicUrlBusy = publicTunnelLoading || Boolean(publicTunnelAction);

    const loadRequests = useCallback(async () => {
        setLoading(true);

        try {
            const response = await api.getRequests(endpoint.id, 50, 0, {
                ...filters,
                search: searchQuery,
            });

            setRequests(response.data);
            setTotalRequests(response.total);
        } catch (err) {
            console.error('Failed to load requests:', err);
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    }, [endpoint.id, filters, searchQuery]);

    const loadPublicTunnelStatus = useCallback(async ({ silent = false } = {}) => {
        if (!appIsLocal) {
            setPublicTunnel(getHostedPublicState(appOrigin));
            setPublicTunnelLoading(false);
            return;
        }

        setPublicTunnelLoading(true);

        try {
            const response = await api.getPublicTunnelStatus();
            setPublicTunnel(response.data);
        } catch (err) {
            if (!silent) {
                toast.error(err.message);
            }
        } finally {
            setPublicTunnelLoading(false);
        }
    }, [appIsLocal, appOrigin]);

    useEffect(() => {
        loadRequests();
    }, [loadRequests]);

    useEffect(() => {
        loadPublicTunnelStatus({ silent: true });
    }, [loadPublicTunnelStatus]);

    useEffect(() => {
        if (newRequestTrigger > 0) {
            loadRequests();
        }
    }, [newRequestTrigger, loadRequests]);

    useEffect(() => {
        if (!requests.length) {
            setSelectedRequest(null);
            return;
        }

        setSelectedRequest((current) => requests.find((request) => request.id === current?.id) || requests[0]);
    }, [requests]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(localWebhookUrl);
            setCopied(true);
            toast.success('URL copied to clipboard');
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy');
        }
    };

    const handleCopyPublic = async () => {
        if (!publicWebhookUrl) return;

        try {
            await navigator.clipboard.writeText(publicWebhookUrl);
            setPublicCopied(true);
            toast.success('Public URL copied to clipboard');
            window.setTimeout(() => setPublicCopied(false), 2000);
        } catch {
            toast.error('Failed to copy');
        }
    };

    const handleStartPublicUrl = async () => {
        if (!appIsLocal) return;

        if (publicTunnel?.installed === false) {
            if (publicTunnel.install_url) {
                window.open(publicTunnel.install_url, '_blank', 'noopener,noreferrer');
            }
            return;
        }

        setPublicTunnelAction('start');

        try {
            const response = await api.startPublicTunnel(appOrigin);
            setPublicTunnel(response.data);
            toast.success('Public URL started');
        } catch (err) {
            toast.error(err.message);
            await loadPublicTunnelStatus({ silent: true });
        } finally {
            setPublicTunnelAction('');
        }
    };

    const handleStopPublicUrl = async () => {
        setPublicTunnelAction('stop');

        try {
            const response = await api.stopPublicTunnel();
            setPublicTunnel(response.data);
            toast.success('Public URL stopped');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setPublicTunnelAction('');
        }
    };

    const handleClearRequests = async () => {
        if (!confirm('Clear all requests for this endpoint?')) return;

        try {
            await api.clearRequests(endpoint.id);
            setRequests([]);
            setTotalRequests(0);
            setSelectedRequest(null);
            toast.success('Requests cleared');
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleDeleteRequest = async (id) => {
        try {
            await api.deleteRequest(id);
            setRequests((current) => current.filter((request) => request.id !== id));
            setTotalRequests((current) => Math.max(0, current - 1));
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleExportCsv = async () => {
        try {
            const blob = await api.exportRequests(endpoint.id);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');

            link.href = url;
            link.download = `${endpoint.slug}-requests.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('CSV export downloaded');
        } catch (err) {
            toast.error(err.message);
        }
    };

    const clearFilters = () => {
        setFilters({ method: '', status: '', content_type: '', date_from: '', date_to: '' });
        setSearchQuery('');
    };

    const summaryCards = [
        {
            icon: Inbox,
            label: 'Captured',
            value: totalRequests,
            note: 'requests in the current window',
        },
        {
            icon: Sparkles,
            label: 'Healthy',
            value: `${successRate}%`,
            note: requests.length ? '2xx and 3xx responses' : 'no samples yet',
        },
        {
            icon: Gauge,
            label: 'Avg latency',
            value: requests.length ? `${averageLatency}ms` : '0ms',
            note: 'based on visible requests',
        },
        {
            icon: Webhook,
            label: 'Methods',
            value: methodCount || 0,
            note: 'distinct HTTP verbs detected',
        },
    ];
    const renderLocalUrlBar = () => (
        <div className="endpoint-url-bar">
            <span className={`endpoint-url-method ${getMethodClass('POST')}`}>LOCAL</span>
            <span className="endpoint-url-text">{localWebhookUrl}</span>
            <button className="copy-btn" onClick={handleCopy}>
                {copied ? <Check className="icon" /> : <Copy className="icon" />}
                {copied ? 'Copied' : 'Copy URL'}
            </button>
        </div>
    );

    const renderPublicUrlBar = () => {
        if (!shouldShowPublicUrlBar) {
            return null;
        }

        const showInstall = appIsLocal && publicTunnel?.installed === false && !publicUrlReady;
        const canStop = publicTunnel?.source === 'quick_tunnel' && publicTunnel?.running;
        const publicHint = !appIsLocal
            ? 'This workspace is already on a public origin. Share the current URL directly.'
            : publicUrlReady
                ? publicTunnel?.source === 'env'
                    ? 'Managed by PUBLIC_BASE_URL, so the public base stays stable across restarts.'
                    : 'Temporary Cloudflare quick tunnel is active. Your localhost URL still works too.'
                : publicTunnel?.error
                    ? publicTunnel.error
                    : showInstall
                        ? 'Install cloudflared to generate a temporary public URL from localhost.'
                        : 'Start a temporary public URL without removing your localhost webhook.';

        return (
            <>
                <div className={`endpoint-url-bar endpoint-url-bar-public ${publicUrlReady ? 'ready' : ''}`}>
                    <span className="endpoint-url-method endpoint-url-method-public">PUBLIC</span>
                    <span className={`endpoint-url-text ${publicUrlReady ? '' : 'endpoint-url-text-muted'}`}>
                        {publicUrlReady
                            ? publicWebhookUrl
                            : (publicTunnelLoading ? 'Checking public URL availability...' : 'No public URL yet')}
                    </span>
                    <div className="endpoint-url-actions">
                        {publicUrlBusy ? (
                            <button className="copy-btn" disabled>
                                <RefreshCw className="icon animate-spin" />
                                {publicTunnelAction === 'stop' ? 'Stopping' : 'Starting'}
                            </button>
                        ) : publicUrlReady ? (
                            <>
                                <button className="copy-btn" onClick={handleCopyPublic}>
                                    {publicCopied ? <Check className="icon" /> : <Copy className="icon" />}
                                    {publicCopied ? 'Copied' : 'Copy URL'}
                                </button>
                                {canStop && (
                                    <button className="copy-btn" onClick={handleStopPublicUrl}>
                                        Stop
                                    </button>
                                )}
                            </>
                        ) : showInstall ? (
                            <button
                                className="copy-btn"
                                onClick={() => window.open(publicTunnel.install_url, '_blank', 'noopener,noreferrer')}
                            >
                                <ExternalLink className="icon" />
                                Install
                            </button>
                        ) : (
                            <button className="copy-btn" onClick={handleStartPublicUrl}>
                                <Radio className="icon" />
                                Start
                            </button>
                        )}
                    </div>
                </div>
                <div className={`endpoint-public-hint ${publicTunnel?.error && !publicUrlReady ? 'error' : ''}`}>{publicHint}</div>
            </>
        );
    };

    const samplePayload = JSON.stringify({
        source: 'hookradar',
        event: 'sample.delivery',
        email: 'demo@example.com',
        sent_at: new Date().toISOString(),
    }, null, 2);

    const sampleCurlCommand = `curl -X POST "${requestWebhookUrl}" -H "Content-Type: application/json" -d '${samplePayload.replace(/'/g, "'\\''")}'`;

    const handleCopySampleCurl = async () => {
        try {
            await navigator.clipboard.writeText(sampleCurlCommand);
            setSampleCurlCopied(true);
            toast.success('Sample cURL copied');
            window.setTimeout(() => setSampleCurlCopied(false), 2000);
        } catch {
            toast.error('Failed to copy sample cURL');
        }
    };

    const handleSendSampleWebhook = async () => {
        setSendingSample(true);

        try {
            const response = await fetch(browserTestWebhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-HookRadar-Test': 'true',
                },
                body: samplePayload,
            });

            if (!response.ok) {
                throw new Error(`Sample webhook returned ${response.status}`);
            }

            toast.success('Sample webhook sent');
            window.setTimeout(() => {
                loadRequests();
            }, 250);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSendingSample(false);
        }
    };

    const renderQuickTester = () => (
        <div className="endpoint-quick-tester">
            <div>
                <strong>Quick test</strong>
                <p>Send a sample webhook or copy a ready-to-paste cURL command. Use the public URL in external apps and this button for instant local testing.</p>
            </div>
            <div className="endpoint-quick-tester-actions">
                <button className="btn btn-secondary btn-sm" onClick={handleCopySampleCurl}>
                    {sampleCurlCopied ? <Check className="icon" size={14} /> : <Copy className="icon" size={14} />}
                    {sampleCurlCopied ? 'Copied' : 'Copy sample cURL'}
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleSendSampleWebhook} disabled={sendingSample}>
                    {sendingSample ? <RefreshCw className="icon animate-spin" size={14} /> : <ArrowRight className="icon" size={14} />}
                    {sendingSample ? 'Sending...' : 'Send sample webhook'}
                </button>
            </div>
        </div>
    );

    if (showConfig) {
        return (
            <div className="endpoint-view">
                <div className="endpoint-header endpoint-header-compact">
                    <div className="endpoint-header-copy">
                        <div className="endpoint-eyebrow">
                            <Settings size={14} />
                            Response studio
                        </div>
                        <h1>{endpoint.name || endpoint.slug}</h1>
                        <p>Shape how this endpoint responds, delays, and mirrors traffic downstream.</p>
                        <div className="endpoint-url-stack">
                            {renderLocalUrlBar()}
                            {renderPublicUrlBar()}
                        </div>
                        {renderQuickTester()}
                    </div>

                    <div className="endpoint-toolbar">
                        <button className="btn btn-secondary" onClick={() => setShowConfig(false)}>
                            <ArrowRight className="icon rotate-180" />
                            Back to live feed
                        </button>
                    </div>
                </div>

                <ResponseConfig
                    key={`${endpoint.id}:${endpoint.updated_at}`}
                    endpoint={endpoint}
                    sectionPreferences={sectionPreferences}
                    onUpdate={onUpdate}
                    onChangeSectionMode={onChangeSectionMode}
                />
            </div>
        );
    }

    return (
        <div className="endpoint-view">
            <HiddenSectionsTray
                sections={hiddenSections}
                onRestore={(sectionId) => setSectionMode(sectionId, 'expanded')}
                className="endpoint-hidden-sections"
            />

            {(getSectionMode('endpoint.overview') !== 'hidden' || getSectionMode('endpoint.metrics') !== 'hidden') && (
                <div className={`endpoint-header ${(getSectionMode('endpoint.overview') === 'hidden' || getSectionMode('endpoint.metrics') === 'hidden') ? 'endpoint-header-single' : ''}`}>
                    {getSectionMode('endpoint.overview') === 'collapsed' ? (
                        <CollapsedPanel
                            className="endpoint-header-copy endpoint-section-panel"
                            kicker="Live endpoint workspace"
                            title={endpoint.name || endpoint.slug}
                            summary={latestRequest?.created_at ? `Last event ${formatTime(latestRequest.created_at)}` : 'Waiting for the first request to arrive.'}
                            mode={getSectionMode('endpoint.overview')}
                            onChangeMode={(mode) => setSectionMode('endpoint.overview', mode)}
                        >
                            <div className="section-collapsed-pill-row">
                                <span className="request-pill">/hook/{endpoint.slug}</span>
                                <span className="request-pill">{isActive ? 'Active' : 'Paused'}</span>
                            </div>
                        </CollapsedPanel>
                    ) : getSectionMode('endpoint.overview') !== 'hidden' && (
                        <div className="endpoint-header-copy">
                            <div className="section-heading-row">
                                <div className="endpoint-eyebrow">
                                    <Radio size={14} />
                                    Live endpoint workspace
                                </div>
                                <SectionVisibilityButtons
                                    mode={getSectionMode('endpoint.overview')}
                                    onChangeMode={(mode) => setSectionMode('endpoint.overview', mode)}
                                />
                            </div>

                            <div className="endpoint-title-row">
                                <h1>{endpoint.name || endpoint.slug}</h1>
                                <span className={`endpoint-state-badge ${isActive ? 'live' : 'paused'}`}>
                                    {isActive ? 'Active' : 'Paused'}
                                </span>
                            </div>

                            <p className="endpoint-description">
                                {endpoint.description || 'Capture inbound webhooks, inspect payloads, replay requests, and fine-tune the response layer from one live console.'}
                            </p>

                            <div className="endpoint-url-stack">
                                {renderLocalUrlBar()}
                                {renderPublicUrlBar()}
                            </div>
                            {renderQuickTester()}

                            <div className="endpoint-meta">
                                <div className="endpoint-meta-item">
                                    <Hash className="icon" />
                                    /hook/{endpoint.slug}
                                </div>
                                <div className="endpoint-meta-item">
                                    <Clock className="icon" />
                                    Created {formatTime(endpoint.created_at)}
                                </div>
                                <div className="endpoint-meta-item">
                                    <Activity className="icon" />
                                    {latestRequest?.created_at ? `Last event ${formatTime(latestRequest.created_at)}` : 'Waiting for first event'}
                                </div>
                                {endpoint.forwarding_url && (
                                    <div className="endpoint-meta-item forwarding-active">
                                        <ExternalLink className="icon" size={12} />
                                        Forwarding enabled
                                    </div>
                                )}
                                {activeFilterCount > 0 && (
                                    <div className="endpoint-meta-item info-chip">
                                        <SlidersHorizontal className="icon" size={12} />
                                        {activeFilterCount} active filters
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {getSectionMode('endpoint.metrics') === 'collapsed' ? (
                        <CollapsedPanel
                            className="endpoint-header-summary endpoint-section-panel"
                            kicker="Tools and metrics"
                            title="Endpoint controls"
                            summary={`${totalRequests} requests • ${successRate}% healthy • ${averageLatency}ms average latency`}
                            mode={getSectionMode('endpoint.metrics')}
                            onChangeMode={(mode) => setSectionMode('endpoint.metrics', mode)}
                        >
                            <div className="section-collapsed-pill-row">
                                <span className="request-pill">{methodCount || 0} methods</span>
                                <span className="request-pill">{showAI ? 'AI open' : 'AI closed'}</span>
                            </div>
                        </CollapsedPanel>
                    ) : getSectionMode('endpoint.metrics') !== 'hidden' && (
                        <div className="endpoint-header-summary">
                            <div className="section-heading-row section-heading-row-end">
                                <div className="endpoint-eyebrow">
                                    <Brain size={14} />
                                    Metrics and tools
                                </div>
                                <SectionVisibilityButtons
                                    mode={getSectionMode('endpoint.metrics')}
                                    onChangeMode={(mode) => setSectionMode('endpoint.metrics', mode)}
                                />
                            </div>

                            <div className="endpoint-summary-grid">
                                {summaryCards.map((card) => (
                                    <div key={card.label} className="endpoint-summary-card">
                                        <div className="endpoint-summary-icon">
                                            <card.icon size={16} />
                                        </div>
                                        <div>
                                            <span>{card.label}</span>
                                            <strong>{card.value}</strong>
                                            <p>{card.note}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="endpoint-toolbar">
                                <button className={`btn btn-sm ${showAI ? 'btn-ai-active' : 'btn-secondary'}`} onClick={() => setShowAI((current) => !current)}>
                                    <Brain className="icon" size={14} />
                                    AI analysis
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowConfig(true)}>
                                    <Settings className="icon" size={14} />
                                    Response studio
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={loadRequests}>
                                    <RefreshCw className="icon" size={14} />
                                    Refresh
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
                                    <Download className="icon" size={14} />
                                    Export CSV
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={handleClearRequests}>
                                    <Trash2 className="icon" size={14} />
                                    Clear feed
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="endpoint-body">
                {getSectionMode('endpoint.requestList') === 'collapsed' ? (
                    <CollapsedPanel
                        className="request-list-panel endpoint-section-panel"
                        kicker="Requests"
                        title="Incoming events"
                        summary={requests.length
                            ? `${requests.length} request${requests.length === 1 ? '' : 's'} currently visible in the feed.`
                            : 'No requests are visible in the current feed.'}
                        mode={getSectionMode('endpoint.requestList')}
                        onChangeMode={(mode) => setSectionMode('endpoint.requestList', mode)}
                    >
                        <div className="section-collapsed-pill-row">
                            <span className="request-pill">{activeFilterCount} filters</span>
                            <span className="request-pill">{searchQuery ? 'Search active' : 'No search'}</span>
                        </div>
                    </CollapsedPanel>
                ) : getSectionMode('endpoint.requestList') !== 'hidden' && (
                    <div className="request-list-panel">
                        <div className="request-list-header">
                            <div>
                                <div className="request-list-title">
                                    <Inbox size={16} />
                                    Incoming events
                                    {totalRequests > 0 && <span className="request-list-count">{totalRequests}</span>}
                                </div>
                                <div className="request-list-subtitle">
                                    {activeFilterCount || searchQuery
                                        ? 'Filtered view of the latest webhook activity'
                                        : 'Newest 50 requests streamed in real time'}
                                </div>
                            </div>

                            <div className="request-list-header-actions">
                                <button
                                    className={`btn-filter-toggle ${showFilters ? 'active' : ''} ${activeFilterCount > 0 ? 'has-filters' : ''}`}
                                    onClick={() => setShowFilters((current) => !current)}
                                    title="Advanced filters"
                                >
                                    <SlidersHorizontal size={14} />
                                    Filters
                                    {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
                                </button>
                                <div className="live-indicator">
                                    <div className="live-dot" />
                                    Live
                                </div>
                                <SectionVisibilityButtons
                                    mode={getSectionMode('endpoint.requestList')}
                                    onChangeMode={(mode) => setSectionMode('endpoint.requestList', mode)}
                                />
                            </div>
                        </div>

                        <div className="request-list-search">
                            <div className="search-input-wrapper">
                                <Search size={14} className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search path, method, payload, or header values"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                />
                                {searchQuery && (
                                    <button className="search-clear" onClick={() => setSearchQuery('')}>
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {showFilters && (
                            <div className="filter-panel">
                                <div className="filter-row">
                                    <div className="filter-group">
                                        <label>Method</label>
                                        <select
                                            value={filters.method}
                                            onChange={(event) => setFilters((current) => ({ ...current, method: event.target.value }))}
                                        >
                                            <option value="">All methods</option>
                                            <option value="GET">GET</option>
                                            <option value="POST">POST</option>
                                            <option value="PUT">PUT</option>
                                            <option value="PATCH">PATCH</option>
                                            <option value="DELETE">DELETE</option>
                                            <option value="HEAD">HEAD</option>
                                            <option value="OPTIONS">OPTIONS</option>
                                            <option value="EMAIL">EMAIL</option>
                                        </select>
                                    </div>

                                    <div className="filter-group">
                                        <label>Status</label>
                                        <select
                                            value={filters.status}
                                            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                                        >
                                            <option value="">All status classes</option>
                                            <option value="200">2xx success</option>
                                            <option value="300">3xx redirect</option>
                                            <option value="400">4xx client error</option>
                                            <option value="500">5xx server error</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="filter-row">
                                    <div className="filter-group">
                                        <label>Content type</label>
                                        <select
                                            value={filters.content_type}
                                            onChange={(event) => setFilters((current) => ({ ...current, content_type: event.target.value }))}
                                        >
                                            <option value="">All content types</option>
                                            <option value="json">application/json</option>
                                            <option value="xml">application/xml</option>
                                            <option value="form">form-urlencoded</option>
                                            <option value="multipart">multipart/form-data</option>
                                            <option value="text">text/plain</option>
                                        </select>
                                    </div>

                                    <div className="filter-group">
                                        <label>From</label>
                                        <input
                                            type="date"
                                            value={filters.date_from}
                                            onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="filter-row">
                                    <div className="filter-group">
                                        <label>To</label>
                                        <input
                                            type="date"
                                            value={filters.date_to}
                                            onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))}
                                        />
                                    </div>

                                    <div className="filter-group filter-group-actions">
                                        {activeFilterCount > 0 && (
                                            <button className="filter-clear-btn" onClick={clearFilters}>
                                                <X size={12} />
                                                Clear filters
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeFilterCount > 0 && !showFilters && (
                            <div className="filter-chips">
                                {filters.method && (
                                    <span className="filter-chip">
                                        {filters.method}
                                        <button onClick={() => setFilters((current) => ({ ...current, method: '' }))}>
                                            <X size={10} />
                                        </button>
                                    </span>
                                )}
                                {filters.status && (
                                    <span className="filter-chip">
                                        {filters.status}xx
                                        <button onClick={() => setFilters((current) => ({ ...current, status: '' }))}>
                                            <X size={10} />
                                        </button>
                                    </span>
                                )}
                                {filters.content_type && (
                                    <span className="filter-chip">
                                        {filters.content_type}
                                        <button onClick={() => setFilters((current) => ({ ...current, content_type: '' }))}>
                                            <X size={10} />
                                        </button>
                                    </span>
                                )}
                                {filters.date_from && (
                                    <span className="filter-chip">
                                        From {filters.date_from}
                                        <button onClick={() => setFilters((current) => ({ ...current, date_from: '' }))}>
                                            <X size={10} />
                                        </button>
                                    </span>
                                )}
                                {filters.date_to && (
                                    <span className="filter-chip">
                                        To {filters.date_to}
                                        <button onClick={() => setFilters((current) => ({ ...current, date_to: '' }))}>
                                            <X size={10} />
                                        </button>
                                    </span>
                                )}
                            </div>
                        )}

                        <div className="request-list-items">
                            {loading ? (
                                <div className="empty-state compact">
                                    <RefreshCw className="icon animate-spin" size={24} />
                                    <p>Loading requests...</p>
                                </div>
                            ) : requests.length === 0 ? (
                                <div className="empty-state compact">
                                    <Inbox className="icon" size={36} />
                                    <h3>{activeFilterCount > 0 || searchQuery ? 'No matching requests' : 'No requests yet'}</h3>
                                    <p>
                                        {activeFilterCount > 0 || searchQuery
                                            ? 'Try broadening the filters or clearing the search query.'
                                            : 'Send any webhook to this endpoint and it will appear here instantly.'}
                                    </p>
                                    <div className="empty-state-actions">
                                        {(activeFilterCount > 0 || searchQuery) ? (
                                            <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
                                                Clear filters
                                            </button>
                                        ) : (
                                            <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
                                                <Copy className="icon" />
                                                Copy endpoint URL
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                requests.map((request, index) => (
                                    <button
                                        key={request.id}
                                        className={`request-item ${selectedRequest?.id === request.id ? 'active' : ''} ${index === 0 ? 'new-request' : ''}`}
                                        onClick={() => setSelectedRequest(request)}
                                    >
                                        <span className={`request-method ${getMethodClass(request.method)}`}>
                                            {request.method}
                                        </span>
                                        <div className="request-info">
                                            <div className="request-path">{normalizeRequestPath(request.path)}</div>
                                            <div className="request-time">
                                                {formatTime(request.created_at)}
                                                {request.content_type ? ` • ${request.content_type}` : ''}
                                            </div>
                                        </div>
                                        <span className={`request-status ${getStatusClass(request.response_status)}`}>
                                            {request.response_status}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {getSectionMode('endpoint.requestDetail') === 'collapsed' ? (
                    <CollapsedPanel
                        className="request-detail endpoint-section-panel"
                        kicker="Inspector"
                        title="Request detail"
                        summary={selectedRequest
                            ? `${selectedRequest.method} ${normalizeRequestPath(selectedRequest.path)} is ready to inspect.`
                            : 'Select a request to inspect headers, body, query params, and replay actions.'}
                        mode={getSectionMode('endpoint.requestDetail')}
                        onChangeMode={(mode) => setSectionMode('endpoint.requestDetail', mode)}
                    >
                        <div className="section-collapsed-pill-row">
                            <span className="request-pill">{showAI ? 'AI analysis' : 'Raw request detail'}</span>
                        </div>
                    </CollapsedPanel>
                ) : getSectionMode('endpoint.requestDetail') !== 'hidden' && (
                    <div className="request-detail request-detail-panel">
                        <div className="request-detail-panel-header">
                            <div>
                                <div className="request-list-title">
                                    <Brain size={16} />
                                    Inspector
                                </div>
                                <div className="request-list-subtitle">
                                    {showAI ? 'AI analysis for the selected request set' : 'Headers, payload, replay, and generated cURL'}
                                </div>
                            </div>

                            <SectionVisibilityButtons
                                mode={getSectionMode('endpoint.requestDetail')}
                                onChangeMode={(mode) => setSectionMode('endpoint.requestDetail', mode)}
                            />
                        </div>

                        <div className="request-detail-panel-body">
                            {showAI ? (
                                <AIAnalysisPanel request={selectedRequest} requests={requests} />
                            ) : selectedRequest ? (
                                <RequestDetail request={selectedRequest} onDelete={handleDeleteRequest} webhookUrl={requestWebhookUrl} />
                            ) : (
                                <div className="request-detail-empty">
                                    <ArrowRight className="icon" size={44} />
                                    <h3>Pick an event from the left rail</h3>
                                    <p>Inspect headers, payload, query params, replay targets, and generated cURL commands here.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
