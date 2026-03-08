import { useEffect, useState } from 'react';
import { LockKeyhole, LogIn, Moon, Radio, ShieldCheck, Sun, UserPlus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import BrandMark from './BrandMark';
import { api } from '../utils/api';

export default function AuthScreen({ theme, toggleTheme, setupRequired, accountCount = 0, onAuthSuccess }) {
    const hasExistingAccounts = accountCount > 0;
    const [mode, setMode] = useState(hasExistingAccounts ? 'login' : (setupRequired ? 'signup' : 'login'));
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!hasExistingAccounts && setupRequired) {
            setMode('signup');
        }
    }, [hasExistingAccounts, setupRequired]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setLoading(true);

        try {
            const response = mode === 'signup'
                ? await api.signup({ name, email, password })
                : await api.login({ email, password });

            onAuthSuccess(response.data.user);
            toast.success(mode === 'signup' ? 'Account created' : 'Signed in');
        } catch (err) {
            if (mode === 'signup' && err.message === 'An account with this email already exists') {
                setMode('login');
                toast.error('This email already exists. Sign in instead.');
                return;
            }

            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    const submitLabel = loading
        ? (mode === 'signup' ? 'Creating account...' : 'Signing in...')
        : (mode === 'signup' ? 'Create account' : 'Sign in');

    return (
        <div className="auth-shell">
            <button className="btn btn-secondary auth-theme-toggle" onClick={toggleTheme} type="button">
                {theme === 'dark' ? <Sun className="icon" /> : <Moon className="icon" />}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>

            <div className="auth-card">
                <div className="auth-copy">
                    <div className="auth-brand">
                        <div className="auth-brand-icon">
                            <BrandMark size={24} />
                        </div>
                        <div>
                            <h1>HookRadar</h1>
                            <p>Webhook operations, now in a sharper private workspace.</p>
                        </div>
                    </div>

                    <div className="auth-copy-body">
                        <h2>{hasExistingAccounts ? 'Open your webhook control deck' : 'Create the first operator account'}</h2>
                        <p>
                            {hasExistingAccounts
                                ? 'Each account gets its own isolated endpoints, captures, exports, and response settings.'
                                : (
                                    'The first account becomes the owner of existing endpoints and request history on this deployment.'
                                )}
                        </p>
                    </div>

                    <div className="auth-feature-list">
                        <div className="auth-feature-item">
                            <Radio size={16} />
                            Realtime request streams with searchable request history
                        </div>
                        <div className="auth-feature-item">
                            <ShieldCheck size={16} />
                            Custom responses, delays, forwarding, and endpoint state controls
                        </div>
                        <div className="auth-feature-item">
                            <LockKeyhole size={16} />
                            Session-based isolation for shared deployments and team instances
                        </div>
                    </div>
                </div>

                <div className="auth-form-panel">
                    <div className="auth-panel-intro">
                        <h3>{hasExistingAccounts ? 'Sign in to continue' : 'Create the first account'}</h3>
                        <p>
                            {hasExistingAccounts
                                ? 'Use Sign in for existing accounts. Create account only when you want a new workspace user.'
                                : 'This deployment has no users yet, so the first login starts with account creation.'}
                        </p>
                    </div>

                    {hasExistingAccounts && (
                        <div className="auth-mode-switch">
                            <button
                                type="button"
                                className={`auth-mode-btn ${mode === 'login' ? 'active' : ''}`}
                                onClick={() => setMode('login')}
                            >
                                <LogIn size={15} />
                                Sign in
                            </button>
                            <button
                                type="button"
                                className={`auth-mode-btn ${mode === 'signup' ? 'active' : ''}`}
                                onClick={() => setMode('signup')}
                            >
                                <UserPlus size={15} />
                                Create account
                            </button>
                        </div>
                    )}

                    {setupRequired && !hasExistingAccounts && (
                        <div className="auth-setup-note">
                            First-time setup is active. Create the first account once, then this screen will default to Sign in.
                        </div>
                    )}

                    <form className="auth-form" onSubmit={handleSubmit}>
                        {mode === 'signup' && (
                            <div className="form-group">
                                <label className="form-label">Name</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder="Jane Doe"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                />
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">Email</label>
                            <input
                                className="form-input"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                autoFocus
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <input
                                className="form-input"
                                type="password"
                                placeholder="At least 8 characters"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                minLength={8}
                                required
                            />
                        </div>

                        <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
                            {mode === 'signup' ? <UserPlus className="icon" /> : <LogIn className="icon" />}
                            {submitLabel}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
