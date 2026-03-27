import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { configureSupabase, getSupabase, hasSupabaseConfig } from './lib/supabaseClient.js';

const toMoney = (v) => {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    return Number.isFinite(n) ? `$${n.toFixed(2)}` : String(v);
};

const mapDbRowToLegacy = (row) => ({
    'NAME OF LESSEEE': row.lessee_name ?? '',
    'KIOSK NUMBER ': row.kiosk_number ?? '',
    ' DATE SIGNED ': row.date_signed ?? '',
    LOCATION: row.location ?? '',
    'OPERATIONAL STATUS': row.operational_status ?? '',
    'LEASE STATUS': row.lease_status ?? '',
    'Mothly rental ': toMoney(row.monthly_rental_usd),
    Arrears: toMoney(row.arrears_usd),
    'Account Number': row.account_number ?? '',
    Comments: row.comments ?? '',
    kiosk_id: row.kiosk_id ?? '',
    tenant_name: row.tenant_name ?? '',
    payment_date: row.payment_date ?? '',
    amount_paid: row.amount_paid ?? '',
});

function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const onLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        const supabase = getSupabase();
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) setError(loginError.message);
        setLoading(false);
    };

    return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#051109', padding: '1rem' }}>
            <form onSubmit={onLogin} style={{ width: '100%', maxWidth: 420, background: '#0b2212', border: '1px solid #1a3321', borderRadius: 12, padding: '1.2rem' }}>
                <h2 style={{ color: '#ffd700', marginBottom: '0.75rem' }}>Smart Estates Login</h2>
                <p style={{ color: '#9aba9a', fontSize: 14, marginBottom: '1rem' }}>Sign in to access the dashboard.</p>
                <label style={{ display: 'block', marginBottom: 8, color: '#cfcfcf', fontSize: 13 }}>Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #355241', background: '#091a0e', color: '#e8e8e8', marginBottom: 12 }} />
                <label style={{ display: 'block', marginBottom: 8, color: '#cfcfcf', fontSize: 13 }}>Password</label>
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #355241', background: '#091a0e', color: '#e8e8e8', marginBottom: 12 }} />
                {error && <div style={{ color: '#ffb4b4', fontSize: 13, marginBottom: 10 }}>{error}</div>}
                <button disabled={loading} type="submit" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', background: '#c5a059', color: '#051109', fontWeight: 700, cursor: 'pointer' }}>
                    {loading ? 'Signing in...' : 'Sign in'}
                </button>
                <p style={{ color: '#9aba9a', fontSize: 12, marginTop: 10 }}>Create users in Supabase Auth dashboard (Email provider).</p>
            </form>
        </div>
    );
}

function RootApp() {
    const [session, setSession] = useState(null);
    const [loadingSession, setLoadingSession] = useState(true);
    const [supabaseReady, setSupabaseReady] = useState(false);
    const [rows, setRows] = useState([]);
    const [rowsError, setRowsError] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Render injects env vars at runtime; fetch public config from the API.
                const res = await fetch('/api/config');
                if (res.ok) {
                    const cfg = await res.json();
                    configureSupabase({
                        supabaseUrl: cfg?.supabaseUrl || '',
                        supabaseAnonKey: cfg?.supabaseAnonKey || '',
                    });
                }
            } catch {
                // ignore
            } finally {
                if (!cancelled) setSupabaseReady(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!supabaseReady || !hasSupabaseConfig()) {
            setLoadingSession(false);
            return;
        }
        const supabase = getSupabase();
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session ?? null);
            setLoadingSession(false);
        });
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession ?? null);
        });
        return () => subscription.unsubscribe();
    }, [supabaseReady]);

    useEffect(() => {
        if (!supabaseReady || !hasSupabaseConfig() || !session) return;
        const supabase = getSupabase();
        (async () => {
            setRowsError('');
            const { data, error } = await supabase
                .from('tuckshops')
                .select('*')
                .order('kiosk_number', { ascending: true, nullsFirst: false });
            if (error) {
                setRows([]);
                setRowsError(error.message);
                return;
            }
            setRows((data || []).map(mapDbRowToLegacy));
        })();
    }, [session, supabaseReady]);

    const topBar = useMemo(() => {
        if (!hasSupabaseConfig() || !session) return null;
        const supabase = getSupabase();
        return (
            <div style={{ position: 'fixed', right: 12, top: 10, zIndex: 9999, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#b4d0b4', background: 'rgba(0,0,0,0.35)', padding: '6px 10px', borderRadius: 8 }}>
                    {session.user?.email || 'Signed in'}
                </span>
                <button
                    type="button"
                    onClick={() => supabase.auth.signOut()}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #355241', background: '#0b2212', color: '#e8e8e8', cursor: 'pointer' }}
                >
                    Sign out
                </button>
            </div>
        );
    }, [session]);

    if (!supabaseReady) {
        return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#cfcfcf' }}>Starting…</div>;
    }

    if (!hasSupabaseConfig()) {
        return (
            <>
                <div style={{ position: 'fixed', left: 12, top: 10, zIndex: 9999, background: 'rgba(197,160,89,0.12)', border: '1px solid #c5a059', color: '#ffe6a7', padding: '8px 10px', borderRadius: 8, fontSize: 12 }}>
                    Supabase not configured. Using local JSON data.
                </div>
                <App />
            </>
        );
    }

    if (loadingSession) {
        return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#cfcfcf' }}>Checking session...</div>;
    }

    if (!session) return <LoginPage />;

    return (
        <>
            {topBar}
            {rowsError && (
                <div style={{ position: 'fixed', left: 12, top: 10, zIndex: 9999, background: 'rgba(211,47,47,0.16)', border: '1px solid #d32f2f', color: '#ffcdd2', padding: '8px 10px', borderRadius: 8, fontSize: 12 }}>
                    Supabase query failed: {rowsError}. Showing local fallback data.
                </div>
            )}
            <App tuckshopsData={rows.length ? rows : null} />
        </>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <RootApp />
    </React.StrictMode>,
);
