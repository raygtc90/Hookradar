import { useEffect, useState } from 'react';
import {
    ArrowUpRight,
    Check,
    Clock,
    Code2,
    Copy,
    FileText,
    Globe,
    Send,
    TimerReset,
    Trash2,
} from 'lucide-react';
import { api, getMethodClass, getStatusClass, formatTime, formatBytes, normalizeRequestPath, prettyJSON, tryParseJSON } from '../utils/api';
import { toast } from 'react-hot-toast';

export default function RequestDetail({ request, onDelete, webhookUrl }) {
    const [activeTab, setActiveTab] = useState('headers');
    const [showReplay, setShowReplay] = useState(false);
    const [replayUrl, setReplayUrl] = useState('');
    const [replayResult, setReplayResult] = useState(null);
    const [replaying, setReplaying] = useState(false);
    const [copied, setCopied] = useState('');

    const headers = tryParseJSON(request.headers) || {};
    const queryParams = tryParseJSON(request.query_params) || {};
    const headerEntries = Object.entries(headers);
    const queryEntries = Object.entries(queryParams);
    const requestPath = normalizeRequestPath(request.path);
    const isHttpRequest = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(request.method);

    const overviewCards = [
        { icon: Clock, label: 'Captured', value: formatTime(request.created_at) },
        { icon: FileText, label: 'Payload size', value: formatBytes(request.size) },
        { icon: Globe, label: 'Source IP', value: request.ip_address || 'Unknown' },
        { icon: Code2, label: 'Content type', value: request.content_type || 'Raw payload' },
        { icon: TimerReset, label: 'Response time', value: request.response_time > 0 ? `${request.response_time}ms` : 'Instant' },
    ];

    const tabs = [
        { id: 'headers', label: 'Headers', count: headerEntries.length },
        { id: 'body', label: 'Body', count: request.body ? 1 : 0 },
        { id: 'query', label: 'Query', count: queryEntries.length },
        ...(isHttpRequest ? [{ id: 'curl', label: 'cURL', count: null }] : []),
    ];

    useEffect(() => {
        if (!isHttpRequest && activeTab === 'curl') {
            setActiveTab('headers');
        }
    }, [activeTab, isHttpRequest]);

    const handleCopy = async (text, key) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            window.setTimeout(() => setCopied(''), 2000);
        } catch {
            toast.error('Failed to copy');
        }
    };

    const handleReplay = async () => {
        if (!replayUrl) {
            toast.error('Enter a target URL');
            return;
        }

        setReplaying(true);

        try {
            const response = await api.replayRequest(request.id, replayUrl);
            setReplayResult(response.data);
            toast.success('Request replayed successfully');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setReplaying(false);
        }
    };

    const generateCurlCommand = () => {
        let command = `curl -X ${request.method}`;

        ['content-type', 'authorization', 'x-api-key', 'accept'].forEach((header) => {
            if (headers[header]) {
                command += ` \\\n  -H "${header}: ${headers[header]}"`;
            }
        });

        if (request.body && !['GET', 'HEAD'].includes(request.method)) {
            command += ` \\\n  -d '${request.body.replace(/'/g, "\\'")}'`;
        }

        command += ` \\\n  "${webhookUrl}${requestPath !== '/' ? requestPath : ''}"`;
        return command;
    };

    return (
        <div className="request-detail-shell">
            <div className="request-detail-header">
                <div className="request-detail-heading">
                    <div className="request-detail-kicker">Captured event</div>
                    <div className="request-detail-title">
                        <span className={`request-method ${getMethodClass(request.method)}`}>{request.method}</span>
                        <span className="request-detail-path">{requestPath}</span>
                        <span className={`request-status ${getStatusClass(request.response_status)}`}>{request.response_status}</span>
                    </div>
                    <div className="request-detail-pills">
                        <span className="request-pill">ID {request.id.slice(0, 8)}</span>
                        <span className="request-pill">{headerEntries.length} headers</span>
                        <span className="request-pill">{queryEntries.length} query params</span>
                    </div>
                </div>

                <div className="request-detail-actions">
                    {isHttpRequest && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowReplay((current) => !current)} title="Replay request">
                            <Send className="icon" size={14} />
                            Replay
                        </button>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={() => onDelete(request.id)} title="Delete request">
                        <Trash2 className="icon" size={14} />
                        Delete
                    </button>
                </div>
            </div>

            {showReplay && isHttpRequest && (
                <div className="request-replay-panel">
                    <div className="request-replay-header">
                        <ArrowUpRight size={14} />
                        Forward this exact request to another URL
                    </div>
                    <div className="request-replay-row">
                        <input
                            type="url"
                            placeholder="https://example.com/webhook"
                            value={replayUrl}
                            onChange={(event) => setReplayUrl(event.target.value)}
                            className="form-input mono"
                        />
                        <button className="btn btn-primary btn-sm" onClick={handleReplay} disabled={replaying}>
                            {replaying ? 'Sending...' : 'Send'}
                        </button>
                    </div>

                    {replayResult && (
                        <div className="replay-result">
                            <div className="replay-result-status">
                                <span className={`request-status ${getStatusClass(replayResult.status)}`}>{replayResult.status}</span>
                                Response received
                            </div>
                            <div className="replay-result-body">{prettyJSON(replayResult.body)}</div>
                        </div>
                    )}
                </div>
            )}

            <div className="request-summary-grid">
                {overviewCards.map((card) => (
                    <div key={card.label} className="request-summary-card">
                        <div className="request-summary-icon">
                            <card.icon size={15} />
                        </div>
                        <div>
                            <span>{card.label}</span>
                            <strong>{card.value}</strong>
                        </div>
                    </div>
                ))}
            </div>

            <div className="detail-tabs">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        className={`detail-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                        {tab.count !== null && tab.count > 0 && <span className="detail-tab-badge">{tab.count}</span>}
                    </button>
                ))}
            </div>

            <div className="detail-content">
                {activeTab === 'headers' && (
                    headerEntries.length > 0 ? (
                        <table className="kv-table">
                            <tbody>
                                {headerEntries.map(([key, value]) => {
                                    const renderedValue = typeof value === 'string' ? value : JSON.stringify(value);

                                    return (
                                        <tr key={key}>
                                            <td>{key}</td>
                                            <td>
                                                {renderedValue}
                                                <button
                                                    className="copy-btn"
                                                    onClick={() => handleCopy(renderedValue, key)}
                                                >
                                                    {copied === key ? <Check className="icon" size={12} /> : <Copy className="icon" size={12} />}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <div className="empty-state compact">
                            <p>No headers were captured for this request.</p>
                        </div>
                    )
                )}

                {activeTab === 'body' && (
                    request.body ? (
                        <div className="code-block">
                            <div className="code-block-header">
                                <span>{request.content_type || 'Raw body'}</span>
                                <button className="copy-btn" onClick={() => handleCopy(prettyJSON(request.body), 'body')}>
                                    {copied === 'body' ? <Check className="icon" /> : <Copy className="icon" />}
                                    {copied === 'body' ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            <pre className="code-block-body">{prettyJSON(request.body)}</pre>
                        </div>
                    ) : (
                        <div className="empty-state compact">
                            <p>No request body was sent.</p>
                        </div>
                    )
                )}

                {activeTab === 'query' && (
                    queryEntries.length > 0 ? (
                        <table className="kv-table">
                            <tbody>
                                {queryEntries.map(([key, value]) => (
                                    <tr key={key}>
                                        <td>{key}</td>
                                        <td>{typeof value === 'string' ? value : JSON.stringify(value)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="empty-state compact">
                            <p>No query parameters were captured.</p>
                        </div>
                    )
                )}

                {activeTab === 'curl' && (
                    <div className="code-block">
                        <div className="code-block-header">
                            <span>Generated cURL command</span>
                            <button className="copy-btn" onClick={() => handleCopy(generateCurlCommand(), 'curl')}>
                                {copied === 'curl' ? <Check className="icon" /> : <Copy className="icon" />}
                                {copied === 'curl' ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        <pre className="code-block-body">{generateCurlCommand()}</pre>
                    </div>
                )}
            </div>
        </div>
    );
}
