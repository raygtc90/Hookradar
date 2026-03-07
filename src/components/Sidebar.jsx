import { Radio, LayoutDashboard, Plus, Settings, Webhook, Activity, Moon, Sun } from 'lucide-react';

export default function Sidebar({ endpoints, selectedEndpoint, currentView, stats, theme, toggleTheme, onNavigate, onSelectEndpoint, onCreateEndpoint }) {
    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">
                        <img src="/hookradar-mark.svg" alt="HookRadar Logo" className="sidebar-logo-image" />
                    </div>
                    <div>
                        <div className="sidebar-logo-text">HookRadar</div>
                        <span className="sidebar-logo-badge">Open Source</span>
                    </div>
                </div>
            </div>

            <nav className="sidebar-nav">
                <div className="sidebar-section-title">Navigation</div>

                <button
                    className={`sidebar-link ${currentView === 'dashboard' ? 'active' : ''}`}
                    onClick={() => onNavigate('dashboard')}
                >
                    <LayoutDashboard className="icon" />
                    <span>Dashboard</span>
                </button>

                <button
                    className="sidebar-link"
                    onClick={onCreateEndpoint}
                >
                    <Plus className="icon" />
                    <span>New Endpoint</span>
                </button>

                <div className="sidebar-section-title" style={{ marginTop: 8 }}>
                    Endpoints
                    <span className="sidebar-link-badge" style={{ marginLeft: 'auto' }}>{endpoints.length}</span>
                </div>

                <div className="sidebar-endpoints">
                    {endpoints.length === 0 ? (
                        <div style={{ padding: '12px', fontSize: '0.78rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                            No endpoints yet
                        </div>
                    ) : (
                        endpoints.map(ep => (
                            <div
                                key={ep.id}
                                className={`sidebar-endpoint-item ${selectedEndpoint?.id === ep.id ? 'active' : ''}`}
                                onClick={() => onSelectEndpoint(ep)}
                            >
                                <div className={`sidebar-endpoint-dot ${ep.is_active ? '' : 'inactive'}`} />
                                <span className="sidebar-endpoint-slug">
                                    {ep.name || ep.slug}
                                </span>
                                <span className="sidebar-endpoint-count">{ep.request_count || 0}</span>
                            </div>
                        ))
                    )}
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                    <button
                        className="sidebar-link"
                        onClick={toggleTheme}
                        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                    >
                        {theme === 'dark' ? <Sun className="icon" /> : <Moon className="icon" />}
                        <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>
                </div>
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-stats">
                    <div className="sidebar-stat">
                        <div className="sidebar-stat-value">{stats.total_endpoints}</div>
                        <div className="sidebar-stat-label">Endpoints</div>
                    </div>
                    <div className="sidebar-stat">
                        <div className="sidebar-stat-value">{stats.total_requests}</div>
                        <div className="sidebar-stat-label">Requests</div>
                    </div>
                </div>
            </div>
        </aside>
    );
}
