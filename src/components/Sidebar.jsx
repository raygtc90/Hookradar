import { LayoutDashboard, LogOut, Moon, Plus, Sun } from 'lucide-react';

export default function Sidebar({
    currentUser,
    endpoints,
    selectedEndpoint,
    currentView,
    stats,
    theme,
    toggleTheme,
    onNavigate,
    onSelectEndpoint,
    onCreateEndpoint,
    onLogout,
}) {
    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">
                        <img src="/hookradar-logo-cropped.webp" alt="HookRadar Logo" className="sidebar-logo-image" />
                    </div>
                    <div>
                        <div className="sidebar-logo-text">HookRadar</div>
                        <span className="sidebar-logo-badge">Workspace</span>
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

                <button className="sidebar-link" onClick={onCreateEndpoint}>
                    <Plus className="icon" />
                    <span>New Endpoint</span>
                </button>

                <div className="sidebar-section-title" style={{ marginTop: 8 }}>
                    Endpoints
                    <span className="sidebar-link-badge" style={{ marginLeft: 'auto' }}>{endpoints.length}</span>
                </div>

                <div className="sidebar-endpoints">
                    {endpoints.length === 0 ? (
                        <div className="sidebar-empty-copy">
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

                <div className="sidebar-account-card">
                    <div className="sidebar-account-label">Signed in as</div>
                    <div className="sidebar-account-name">{currentUser.name || currentUser.email}</div>
                    <div className="sidebar-account-email">{currentUser.email}</div>
                    <div className="sidebar-account-plan">{currentUser.plan || 'free'} plan</div>
                </div>

                <div className="sidebar-account-actions">
                    <button
                        className="sidebar-link"
                        onClick={toggleTheme}
                        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                    >
                        {theme === 'dark' ? <Sun className="icon" /> : <Moon className="icon" />}
                        <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>

                    <button className="sidebar-link" onClick={onLogout}>
                        <LogOut className="icon" />
                        <span>Sign Out</span>
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
