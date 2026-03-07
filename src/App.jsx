import { useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import AuthScreen from './components/AuthScreen';
import CreateEndpointModal from './components/CreateEndpointModal';
import Dashboard from './components/Dashboard';
import EndpointView from './components/EndpointView';
import ResponseConfig from './components/ResponseConfig';
import Sidebar from './components/Sidebar';
import { api, createWebSocket } from './utils/api';
import './index.css';

const defaultStats = { total_endpoints: 0, total_requests: 0, requests_today: 0 };

export default function App() {
  const [endpoints, setEndpoints] = useState([]);
  const [stats, setStats] = useState(defaultStats);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRequestTrigger, setNewRequestTrigger] = useState(0);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

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
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      resetWorkspaceState();
      setAuthUser(null);
      toast.success('Signed out');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCreateEndpoint = async (data) => {
    try {
      const res = await api.createEndpoint(data);
      setEndpoints(prev => [res.data, ...prev]);
      setStats(prev => ({ ...prev, total_endpoints: prev.total_endpoints + 1 }));
      setShowCreateModal(false);
      setSelectedEndpoint(res.data);
      setCurrentView('endpoint');
      toast.success('Endpoint created');
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
  };

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard
            stats={stats}
            endpoints={endpoints}
            onCreateEndpoint={() => setShowCreateModal(true)}
            onSelectEndpoint={handleSelectEndpoint}
            onDeleteEndpoint={handleDeleteEndpoint}
          />
        );
      case 'endpoint':
        return selectedEndpoint ? (
          <EndpointView
            key={selectedEndpoint.id}
            endpoint={selectedEndpoint}
            onUpdate={handleUpdateEndpoint}
            newRequestTrigger={newRequestTrigger}
          />
        ) : null;
      case 'settings':
        return (
          <ResponseConfig
            key={selectedEndpoint ? `${selectedEndpoint.id}:${selectedEndpoint.updated_at}` : 'settings'}
            endpoint={selectedEndpoint}
            onUpdate={handleUpdateEndpoint}
          />
        );
      default:
        return (
          <Dashboard
            stats={stats}
            endpoints={endpoints}
            onCreateEndpoint={() => setShowCreateModal(true)}
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
            fontFamily: "'Inter', sans-serif",
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
          onAuthSuccess={handleAuthSuccess}
        />
      ) : (
        <>
          <div className="app-layout">
            <Sidebar
              currentUser={authUser}
              endpoints={endpoints}
              selectedEndpoint={selectedEndpoint}
              currentView={currentView}
              stats={stats}
              theme={theme}
              toggleTheme={toggleTheme}
              onNavigate={setCurrentView}
              onSelectEndpoint={handleSelectEndpoint}
              onCreateEndpoint={() => setShowCreateModal(true)}
              onLogout={handleLogout}
            />

            <main className="main-content">
              {renderContent()}
            </main>
          </div>

          {showCreateModal && (
            <CreateEndpointModal
              onClose={() => setShowCreateModal(false)}
              onCreate={handleCreateEndpoint}
            />
          )}
        </>
      )}
    </>
  );
}
