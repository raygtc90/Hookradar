import { useEffect, useRef, useState } from 'react';
import { Menu, PanelLeftOpen, Plus } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import AuthScreen from './components/AuthScreen';
import CreateEndpointModal from './components/CreateEndpointModal';
import Dashboard from './components/Dashboard';
import EndpointView from './components/EndpointView';
import ResponseConfig from './components/ResponseConfig';
import Sidebar from './components/Sidebar';
import WorkspaceSettingsModal from './components/WorkspaceSettingsModal';
import {
  createDefaultImportantItems,
  normalizeImportantItems,
} from './utils/quickAccess';
import { defaultSectionPreferences, normalizeSectionPreferences } from './utils/layoutPreferences';
import { api, createWebSocket, isLocalHostname } from './utils/api';
import './index.css';

const defaultStats = { total_endpoints: 0, total_requests: 0, requests_today: 0 };
const compactLayoutQuery = '(max-width: 1180px)';
const defaultUiFontSize = 11;
const defaultSidebarSettings = {
  width: 264,
  mode: 'expanded',
  autoClose: true,
  lockOpen: false,
};

function clampSidebarWidth(value) {
  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    return defaultSidebarSettings.width;
  }

  return Math.min(360, Math.max(220, parsed));
}

function normalizeSidebarMode(value) {
  return ['expanded', 'collapsed', 'hidden'].includes(value) ? value : defaultSidebarSettings.mode;
}

function normalizeSidebarSettings(value = {}) {
  return {
    width: clampSidebarWidth(value.width ?? defaultSidebarSettings.width),
    mode: normalizeSidebarMode(value.mode),
    autoClose: typeof value.autoClose === 'boolean' ? value.autoClose : defaultSidebarSettings.autoClose,
    lockOpen: typeof value.lockOpen === 'boolean' ? value.lockOpen : defaultSidebarSettings.lockOpen,
  };
}

function clampUiFontSize(value) {
  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    return defaultUiFontSize;
  }

  return Math.min(16, Math.max(10, parsed));
}

export default function App() {
  const [endpoints, setEndpoints] = useState([]);
  const [stats, setStats] = useState(defaultStats);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [newRequestTrigger, setNewRequestTrigger] = useState(0);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [uiFontSize, setUiFontSize] = useState(() => clampUiFontSize(localStorage.getItem('uiFontSize') || defaultUiFontSize));
  const [sidebarSettings, setSidebarSettings] = useState(() => {
    try {
      return normalizeSidebarSettings(JSON.parse(localStorage.getItem('sidebarSettings') || '{}'));
    } catch {
      return defaultSidebarSettings;
    }
  });
  const [importantItems, setImportantItems] = useState(() => {
    try {
      const savedValue = localStorage.getItem('workspaceImportantItems');

      if (savedValue === null) {
        return createDefaultImportantItems();
      }

      return normalizeImportantItems(JSON.parse(savedValue));
    } catch {
      return createDefaultImportantItems();
    }
  });
  const [sectionPreferences, setSectionPreferences] = useState(() => {
    try {
      return normalizeSectionPreferences(JSON.parse(localStorage.getItem('workspaceSectionPreferences') || '{}'));
    } catch {
      return defaultSectionPreferences;
    }
  });
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [accountCount, setAccountCount] = useState(0);
  const [isCompactLayout, setIsCompactLayout] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia(compactLayoutQuery).matches : false
  ));
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const wsRef = useRef(null);
  const isSidebarOverlayMode = isCompactLayout || sidebarSettings.mode === 'hidden';
  const isSidebarCollapsed = !isCompactLayout && sidebarSettings.mode === 'collapsed';
  const isSidebarRenderedOpen = isCompactLayout ? isSidebarOpen : (sidebarSettings.mode === 'hidden' ? isSidebarOpen : true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${uiFontSize}px`;
    localStorage.setItem('uiFontSize', String(uiFontSize));
  }, [uiFontSize]);

  useEffect(() => {
    localStorage.setItem('sidebarSettings', JSON.stringify(sidebarSettings));
  }, [sidebarSettings]);

  useEffect(() => {
    localStorage.setItem('workspaceImportantItems', JSON.stringify(importantItems));
  }, [importantItems]);

  useEffect(() => {
    localStorage.setItem('workspaceSectionPreferences', JSON.stringify(sectionPreferences));
  }, [sectionPreferences]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(compactLayoutQuery);
    const handleChange = (event) => {
      setIsCompactLayout(event.matches);
      if (!event.matches) {
        setIsSidebarOpen(false);
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSidebarOverlayMode || !isSidebarOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSidebarOpen, isSidebarOverlayMode]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  const closeSidebar = () => setIsSidebarOpen(false);
  const openSidebar = () => setIsSidebarOpen(true);

  const closeSidebarAfterNavigation = () => {
    if (!isSidebarOverlayMode) {
      return;
    }

    if (sidebarSettings.lockOpen) {
      return;
    }

    if (sidebarSettings.autoClose) {
      closeSidebar();
    }
  };

  const openCreateModal = () => {
    setShowCreateModal(true);
    closeSidebar();
  };
  const openWorkspaceSettings = () => {
    setShowWorkspaceSettings(true);
    closeSidebar();
  };
  const handleNavigate = (view) => {
    setCurrentView(view);
    closeSidebarAfterNavigation();
  };

  const resetWorkspaceState = () => {
    setEndpoints([]);
    setStats(defaultStats);
    setSelectedEndpoint(null);
    setCurrentView('dashboard');
    setShowCreateModal(false);
  };

  useEffect(() => {
    let cancelled = false;

    api.getSession()
      .then((session) => {
        if (cancelled) return;
        setAuthUser(session.data.user || null);
        setSetupRequired(Boolean(session.data.setup_required));
        setAccountCount(Number(session.data.user_count) || 0);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load session:', err);
      })
      .finally(() => {
        if (!cancelled) {
          setSessionLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authUser) return;

    let cancelled = false;

    Promise.all([
      api.getEndpoints(),
      api.getStats(),
    ]).then(([endpointsRes, statsRes]) => {
      if (cancelled) return;
      setEndpoints(endpointsRes.data);
      setStats(statsRes.data);
    }).catch((err) => {
      if (cancelled) return;
      console.error('Failed to load data:', err);
      if (err.message === 'Authentication required') {
        resetWorkspaceState();
        setAuthUser(null);
      } else {
        toast.error(err.message);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      wsRef.current?.close();
      wsRef.current = null;
      return undefined;
    }

    let reconnectTimer = null;
    let disposed = false;

    const connect = () => {
      const ws = createWebSocket();
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'new_request') {
            setEndpoints(prev => prev.map(ep => {
              if (ep.id === data.endpoint_id) {
                return {
                  ...ep,
                  request_count: (ep.request_count || 0) + 1,
                  last_request_at: data.request?.created_at,
                };
              }
              return ep;
            }));

            setStats(prev => ({
              ...prev,
              total_requests: prev.total_requests + 1,
              requests_today: prev.requests_today + 1,
            }));

            setNewRequestTrigger(prev => prev + 1);
          }
        } catch (err) {
          console.error('WS message error:', err);
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          if (!disposed) {
            connect();
          }
        }, 3000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [authUser]);

  const handleAuthSuccess = (user) => {
    setAuthUser(user);
    setSetupRequired(false);
    setAccountCount((previous) => Math.max(previous, 1));
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      closeSidebar();
      resetWorkspaceState();
      setAuthUser(null);
      toast.success('Signed out');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCreateEndpoint = async (data) => {
    const { expose_publicly, ...endpointData } = data;
    const appIsLocal = isLocalHostname(window.location.hostname);

    try {
      const res = await api.createEndpoint(endpointData);
      let publicTunnelError = null;

      if (expose_publicly && appIsLocal) {
        try {
          await api.startPublicTunnel(window.location.origin);
        } catch (err) {
          publicTunnelError = err.message;
        }
      }

      setEndpoints(prev => [res.data, ...prev]);
      setStats(prev => ({ ...prev, total_endpoints: prev.total_endpoints + 1 }));
      setShowCreateModal(false);
      setSelectedEndpoint(res.data);
      setCurrentView('endpoint');
      toast.success(expose_publicly && (!appIsLocal || !publicTunnelError) ? 'Endpoint created with a public URL' : 'Endpoint created');
      if (publicTunnelError) {
        toast.error(`Endpoint created, but public URL could not start: ${publicTunnelError}`);
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteEndpoint = async (id) => {
    try {
      await api.deleteEndpoint(id);
      setEndpoints(prev => prev.filter(ep => ep.id !== id));
      setStats(prev => ({ ...prev, total_endpoints: Math.max(0, prev.total_endpoints - 1) }));
      if (selectedEndpoint?.id === id) {
        setSelectedEndpoint(null);
        setCurrentView('dashboard');
      }
      toast.success('Endpoint deleted');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleUpdateEndpoint = async (id, data) => {
    try {
      const res = await api.updateEndpoint(id, data);
      setEndpoints(prev => prev.map(ep => ep.id === id ? { ...ep, ...res.data } : ep));
      setSelectedEndpoint(prev => prev?.id === id ? { ...prev, ...res.data } : prev);
      toast.success('Endpoint updated');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSelectEndpoint = (endpoint) => {
    setSelectedEndpoint(endpoint);
    setCurrentView('endpoint');
    closeSidebarAfterNavigation();
  };

  const handleApplyWorkspaceSettings = ({
    fontSize,
    sidebar,
    importantItems: nextImportantItems,
    sectionPreferences: nextSectionPreferences,
  }) => {
    const nextFontSize = clampUiFontSize(fontSize);
    const nextSidebarSettings = normalizeSidebarSettings(sidebar);
    const normalizedImportantItems = normalizeImportantItems(nextImportantItems);
    const normalizedSectionPreferences = normalizeSectionPreferences(nextSectionPreferences);

    setUiFontSize(nextFontSize);
    setSidebarSettings(nextSidebarSettings);
    setImportantItems(normalizedImportantItems);
    setSectionPreferences(normalizedSectionPreferences);

    if (!isCompactLayout && nextSidebarSettings.mode !== 'hidden') {
      closeSidebar();
    }

    toast.success('Workspace settings updated');
  };

  const handleChangeSectionMode = (sectionId, mode) => {
    setSectionPreferences((previous) => ({
      ...previous,
      [sectionId]: mode,
    }));
  };

  const currentPanelTitle = currentView === 'settings'
    ? 'Response studio'
    : currentView === 'endpoint'
      ? (selectedEndpoint?.name || selectedEndpoint?.slug || 'Endpoint workspace')
      : 'Workspace overview';

  const currentPanelMeta = currentView === 'settings'
    ? 'Tune headers, status, delay, and forwarding'
    : currentView === 'endpoint'
      ? `/hook/${selectedEndpoint?.slug || 'route'}`
      : `${stats.total_endpoints} routes and ${stats.total_requests} events`;

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard
            stats={stats}
            endpoints={endpoints}
            sectionPreferences={sectionPreferences}
            onCreateEndpoint={openCreateModal}
            onChangeSectionMode={handleChangeSectionMode}
            onSelectEndpoint={handleSelectEndpoint}
            onDeleteEndpoint={handleDeleteEndpoint}
          />
        );
      case 'endpoint':
        return selectedEndpoint ? (
          <EndpointView
            key={selectedEndpoint.id}
            endpoint={selectedEndpoint}
            sectionPreferences={sectionPreferences}
            onUpdate={handleUpdateEndpoint}
            onChangeSectionMode={handleChangeSectionMode}
            newRequestTrigger={newRequestTrigger}
          />
        ) : null;
      case 'settings':
        return (
          <ResponseConfig
            key={selectedEndpoint ? `${selectedEndpoint.id}:${selectedEndpoint.updated_at}` : 'settings'}
            endpoint={selectedEndpoint}
            sectionPreferences={sectionPreferences}
            onUpdate={handleUpdateEndpoint}
            onChangeSectionMode={handleChangeSectionMode}
          />
        );
      default:
        return (
          <Dashboard
            stats={stats}
            endpoints={endpoints}
            sectionPreferences={sectionPreferences}
            onCreateEndpoint={openCreateModal}
            onChangeSectionMode={handleChangeSectionMode}
            onSelectEndpoint={handleSelectEndpoint}
            onDeleteEndpoint={handleDeleteEndpoint}
          />
        );
    }
  };

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'toast-custom',
          duration: 3000,
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '0.85rem',
          },
        }}
      />

      {sessionLoading ? (
        <div className="auth-loading-screen">
          <div className="auth-loading-card">
            <div className="spinner" />
            <p>Loading workspace...</p>
          </div>
        </div>
      ) : !authUser ? (
        <AuthScreen
          theme={theme}
          toggleTheme={toggleTheme}
          setupRequired={setupRequired}
          accountCount={accountCount}
          onAuthSuccess={handleAuthSuccess}
        />
      ) : (
        <>
          <div
            className={`app-layout ${sidebarSettings.mode === 'hidden' && !isCompactLayout ? 'app-layout-sidebar-hidden' : ''}`}
            style={{
              '--sidebar-width': `${sidebarSettings.width}px`,
              '--sidebar-collapsed-width': `${Math.max(72, Math.min(112, Math.round(sidebarSettings.width * 0.34)))}px`,
            }}
          >
            {isSidebarOverlayMode && (
              <button
                className={`sidebar-backdrop ${isSidebarRenderedOpen ? 'visible' : ''}`}
                onClick={closeSidebar}
                aria-label="Close navigation"
              />
            )}

            <Sidebar
              currentUser={authUser}
              endpoints={endpoints}
              selectedEndpoint={selectedEndpoint}
              currentView={currentView}
              stats={stats}
              theme={theme}
              uiFontSize={uiFontSize}
              sidebarSettings={sidebarSettings}
              importantItems={importantItems}
              toggleTheme={toggleTheme}
              isCompactLayout={isCompactLayout}
              isOpen={isSidebarRenderedOpen}
              isOverlayMode={isSidebarOverlayMode}
              isCollapsed={isSidebarCollapsed}
              onClose={closeSidebar}
              onNavigate={handleNavigate}
              onSelectEndpoint={handleSelectEndpoint}
              onCreateEndpoint={openCreateModal}
              onOpenWorkspaceSettings={openWorkspaceSettings}
              onLogout={handleLogout}
            />

            <main className="main-content">
              {!isCompactLayout && sidebarSettings.mode === 'hidden' && !isSidebarRenderedOpen && (
                <button
                  className="desktop-shell-menu"
                  onClick={openSidebar}
                  aria-label="Open sidebar"
                >
                  <PanelLeftOpen size={16} />
                  Sidebar
                </button>
              )}

              {isCompactLayout && (
                <div className="mobile-shell-bar">
                  <button
                    className="mobile-shell-menu"
                    onClick={openSidebar}
                    aria-label="Open navigation"
                  >
                    <Menu size={18} />
                  </button>

                  <div className="mobile-shell-context">
                    <span className="mobile-shell-label">HookRadar</span>
                    <strong>{currentPanelTitle}</strong>
                    <span>{currentPanelMeta}</span>
                  </div>

                  <button className="mobile-shell-create" onClick={openCreateModal}>
                    <Plus size={16} />
                    New
                  </button>
                </div>
              )}

              {renderContent()}
            </main>
          </div>

          {showCreateModal && (
            <CreateEndpointModal
              onClose={() => setShowCreateModal(false)}
              onCreate={handleCreateEndpoint}
            />
          )}

          {showWorkspaceSettings && (
            <WorkspaceSettingsModal
              currentFontSize={uiFontSize}
              currentSectionPreferences={sectionPreferences}
              currentSidebarSettings={sidebarSettings}
              currentImportantItems={importantItems}
              endpoints={endpoints}
              selectedEndpoint={selectedEndpoint}
              onClose={() => setShowWorkspaceSettings(false)}
              onApply={handleApplyWorkspaceSettings}
            />
          )}
        </>
      )}
    </>
  );
}
