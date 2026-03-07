import { useState, useEffect, useCallback } from 'react';
import {
    Activity, Copy, Check, Download, Trash2, Settings, Clock, Hash,
    Search, Inbox, ArrowRight, RefreshCw, ExternalLink, Brain,
    X, SlidersHorizontal
} from 'lucide-react';
import RequestDetail from './RequestDetail';
import ResponseConfig from './ResponseConfig';
import AIAnalysisPanel from './AIAnalysisPanel';
import { api, formatTime, getMethodClass, getStatusClass, getWebhookUrl, normalizeRequestPath } from '../utils/api';
import { toast } from 'react-hot-toast';

export default function EndpointView({ endpoint, onUpdate, newRequestTrigger }) {
    const [requests, setRequests] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [totalRequests, setTotalRequests] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [copied, setCopied] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const [showAI, setShowAI] = useState(false);
    const [loading, setLoading] = useState(true);

    // Advanced Filters
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState({
        method: '',
        status: '',
        content_type: '',
        date_from: '',
        date_to: '',
    });
    const activeFilterCount = Object.values(filters).filter(value => value !== '').length;

    const webhookUrl = getWebhookUrl(endpoint.slug);

    // Load requests with filters
    const loadRequests = useCallback(async () => {
        try {
            const res = await api.getRequests(endpoint.id, 50, 0, {
                ...filters,
                search: searchQuery,
            });
            setRequests(res.data);
            setTotalRequests(res.total);
        } catch (err) {
            console.error('Failed to load requests:', err);
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    }, [endpoint.id, filters, searchQuery]);

    useEffect(() => {
        loadRequests();
    }, [loadRequests]);

    // Reload when new request comes in
    useEffect(() => {
        if (newRequestTrigger > 0) {
            loadRequests();
        }
    }, [newRequestTrigger, loadRequests]);

    // Copy webhook URL
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(webhookUrl);
            setCopied(true);
            toast.success('URL copied to clipboard!');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy');
        }
    };

    // Clear all requests
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

    // Delete single request
    const handleDeleteRequest = async (id) => {
        try {
            await api.deleteRequest(id);
            setRequests(prev => prev.filter(r => r.id !== id));
            setTotalRequests(prev => prev - 1);
            if (selectedRequest?.id === id) setSelectedRequest(null);
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

    // Clear all filters
    const clearFilters = () => {
        setFilters({ method: '', status: '', content_type: '', date_from: '', date_to: '' });
        setSearchQuery('');
    };

    if (showConfig) {
        return (
            <div className="endpoint-view">
                {/* Header */}
                <div className="endpoint-header">
                    <div className="endpoint-url-bar">
                        <span className="endpoint-url-method method-POST" style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)' }}>ANY</span>
                        <span className="endpoint-url-text">
                            {window.location.origin}/hook/<span>{endpoint.slug}</span>
                        </span>
                        <button className="copy-btn" onClick={handleCopy}>
                            {copied ? <Check className="icon" /> : <Copy className="icon" />}
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                </div>

                <div className="top-bar">
                    <div className="top-bar-title">
                        <Settings className="icon" size={18} />
                        Response Configuration
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowConfig(false)}>
                        ← Back to Requests
                    </button>
                </div>

                <ResponseConfig key={`${endpoint.id}:${endpoint.updated_at}`} endpoint={endpoint} onUpdate={onUpdate} />
            </div>
        );
    }

    return (
        <div className="endpoint-view">
            {/* Header */}
            <div className="endpoint-header">
                <div className="endpoint-url-bar">
                    <span className="endpoint-url-method method-POST" style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)' }}>ANY</span>
                    <span className="endpoint-url-text">
                        {window.location.origin}/hook/<span>{endpoint.slug}</span>
                    </span>
                    <button className="copy-btn" onClick={handleCopy}>
                        {copied ? <Check className="icon" /> : <Copy className="icon" />}
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>

                <div className="endpoint-meta">
                    <div className="endpoint-meta-item">
                        <Hash className="icon" />
                        {endpoint.name || endpoint.slug}
                    </div>
                    <div className="endpoint-meta-item">
                        <Clock className="icon" />
                        Created {formatTime(endpoint.created_at)}
                    </div>
                    <div className="endpoint-meta-item">
                        <Activity className="icon" />
                        {totalRequests} requests
                    </div>
                    {endpoint.forwarding_url && (
                        <div className="endpoint-meta-item forwarding-active">
                            <ExternalLink className="icon" size={12} />
                            Forwarding
                        </div>
                    )}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                        <button
                            className={`btn btn-sm ${showAI ? 'btn-ai-active' : 'btn-ghost'}`}
                            onClick={() => setShowAI(!showAI)}
                        >
                            <Brain className="icon" size={14} />
                            AI
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowConfig(true)}>
                            <Settings className="icon" size={14} />
                            Configure
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={loadRequests}>
                            <RefreshCw className="icon" size={14} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={handleExportCsv}>
                            <Download className="icon" size={14} />
                            Export CSV
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={handleClearRequests}>
                            <Trash2 className="icon" size={14} />
                            Clear
                        </button>
                    </div>
                </div>
            </div>

            {/* Body: Request List + Detail/AI */}
            <div className="endpoint-body">
                {/* Request List Panel */}
                <div className="request-list-panel">
                    <div className="request-list-header">
                        <div className="request-list-title">
                            <Inbox size={16} />
                            Incoming Requests
                            {totalRequests > 0 && (
                                <span className="request-list-count">{totalRequests}</span>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                                className={`btn-filter-toggle ${showFilters ? 'active' : ''} ${activeFilterCount > 0 ? 'has-filters' : ''}`}
                                onClick={() => setShowFilters(!showFilters)}
                                title="Advanced filters"
                            >
                                <SlidersHorizontal size={14} />
                                {activeFilterCount > 0 && (
                                    <span className="filter-badge">{activeFilterCount}</span>
                                )}
                            </button>
                            <div className="live-indicator">
                                <div className="live-dot" />
                                Live
                            </div>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="request-list-search">
                        <div className="search-input-wrapper">
                            <Search size={14} className="search-icon" />
                            <input
                                type="text"
                                placeholder="Search method, path, body..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button className="search-clear" onClick={() => setSearchQuery('')}>
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Advanced Filters Panel */}
                    {showFilters && (
                        <div className="filter-panel">
                            <div className="filter-row">
                                <div className="filter-group">
                                    <label>Method</label>
                                    <select
                                        value={filters.method}
                                        onChange={e => setFilters(f => ({ ...f, method: e.target.value }))}
                                    >
                                        <option value="">All Methods</option>
                                        <option value="GET">GET</option>
                                        <option value="POST">POST</option>
                                        <option value="PUT">PUT</option>
                                        <option value="PATCH">PATCH</option>
                                        <option value="DELETE">DELETE</option>
                                        <option value="HEAD">HEAD</option>
                                        <option value="OPTIONS">OPTIONS</option>
                                    </select>
                                </div>
                                <div className="filter-group">
                                    <label>Status</label>
                                    <select
                                        value={filters.status}
                                        onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                                    >
                                        <option value="">All Status</option>
                                        <option value="200">2xx Success</option>
                                        <option value="300">3xx Redirect</option>
                                        <option value="400">4xx Client Error</option>
                                        <option value="500">5xx Server Error</option>
                                    </select>
                                </div>
                            </div>
                            <div className="filter-row">
                                <div className="filter-group">
                                    <label>Content-Type</label>
                                    <select
                                        value={filters.content_type}
                                        onChange={e => setFilters(f => ({ ...f, content_type: e.target.value }))}
                                    >
                                        <option value="">All Types</option>
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
                                        onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
                                    />
                                </div>
                            </div>
                            {activeFilterCount > 0 && (
                                <button className="filter-clear-btn" onClick={clearFilters}>
                                    <X size={12} />
                                    Clear all filters
                                </button>
                            )}
                        </div>
                    )}

                    {/* Active filter chips */}
                    {activeFilterCount > 0 && !showFilters && (
                        <div className="filter-chips">
                            {filters.method && (
                                <span className="filter-chip">
                                    {filters.method}
                                    <button onClick={() => setFilters(f => ({ ...f, method: '' }))}><X size={10} /></button>
                                </span>
                            )}
                            {filters.status && (
                                <span className="filter-chip">
                                    {filters.status}xx
                                    <button onClick={() => setFilters(f => ({ ...f, status: '' }))}><X size={10} /></button>
                                </span>
                            )}
                            {filters.content_type && (
                                <span className="filter-chip">
                                    {filters.content_type}
                                    <button onClick={() => setFilters(f => ({ ...f, content_type: '' }))}><X size={10} /></button>
                                </span>
                            )}
                            {filters.date_from && (
                                <span className="filter-chip">
                                    From: {filters.date_from}
                                    <button onClick={() => setFilters(f => ({ ...f, date_from: '' }))}><X size={10} /></button>
                                </span>
                            )}
                        </div>
                    )}

                    <div className="request-list-items">
                        {loading ? (
                            <div className="empty-state" style={{ padding: '32px' }}>
                                <RefreshCw className="icon animate-spin" size={24} />
                                <p>Loading requests...</p>
                            </div>
                        ) : requests.length === 0 ? (
                            <div className="empty-state" style={{ padding: '32px' }}>
                                <Inbox className="icon" size={36} />
                                <h3>{activeFilterCount > 0 || searchQuery ? 'No matching requests' : 'No requests yet'}</h3>
                                <p>
                                    {activeFilterCount > 0 || searchQuery
                                        ? 'Try adjusting your filters or search query'
                                        : 'Send a webhook to your URL to see it appear here in real-time'
                                    }
                                </p>
                                {(activeFilterCount > 0 || searchQuery) && (
                                    <button className="btn btn-secondary btn-sm" style={{ marginTop: '12px' }} onClick={clearFilters}>
                                        Clear filters
                                    </button>
                                )}
                            </div>
                        ) : (
                            requests.map((req, index) => (
                                <div
                                    key={req.id}
                                    className={`request-item ${selectedRequest?.id === req.id ? 'active' : ''} ${index === 0 ? 'new-request' : ''}`}
                                    onClick={() => setSelectedRequest(req)}
                                >
                                    <span className={`request-method ${getMethodClass(req.method)}`}>
                                        {req.method}
                                    </span>
                                    <div className="request-info">
                                        <div className="request-path">{normalizeRequestPath(req.path)}</div>
                                        <div className="request-time">{formatTime(req.created_at)}</div>
                                    </div>
                                    <span className={`request-status ${getStatusClass(req.response_status)}`}>
                                        {req.response_status}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Request Detail / AI Panel */}
                <div className="request-detail">
                    {showAI ? (
                        <AIAnalysisPanel
                            request={selectedRequest}
                            requests={requests}
                        />
                    ) : selectedRequest ? (
                        <RequestDetail
                            request={selectedRequest}
                            onDelete={handleDeleteRequest}
                            webhookUrl={webhookUrl}
                        />
                    ) : (
                        <div className="request-detail-empty">
                            <ArrowRight className="icon" size={48} />
                            <p>Select a request to view its details</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
