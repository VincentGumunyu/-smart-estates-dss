import React, { useState, useMemo, useEffect } from 'react';
import {
    LayoutDashboard,
    FileText,
    CreditCard,
    ShieldAlert,
    BarChart3,
    Settings,
    Bell,
    Search,
    Calendar,
    Map as MapIcon,
    AlertTriangle,
    CheckCircle2,
    Users,
    DollarSign,
    TrendingUp,
    MapPin,
    Star,
    Award,
    ArrowUpRight,
    ArrowDownRight,
    Info,
    BookOpen,
    HelpCircle
} from 'lucide-react';
import data from './data/data.json';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for Leaflet default icon issue in React
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    ArcElement,
    Title,
    Tooltip,
    Legend
);

const GWERU_CENTER = [-19.46, 29.81];

const App = () => {
    const [activeTab, setActiveTab] = useState('Dashboard');
    const [paymentData, setPaymentData] = useState({
        kioskId: '',
        paymentType: 'Monthly Rent',
        date: '2026-03-09',
        amount: '57.75',
        tenantName: ''
    });

    // Logic to process data
    const tuckshops = useMemo(() => data.tuckshops || [], []);

    const stats = useMemo(() => {
        const total = tuckshops.length;
        const renewed = tuckshops.filter(t => t['LEASE STATUS'] && t['LEASE STATUS'].includes('RENEWED')).length;
        const expired = tuckshops.filter(t => t['LEASE STATUS'] && t['LEASE STATUS'].includes('EXPIRED')).length;
        const operating = tuckshops.filter(t => t['OPERATIONAL STATUS'] === 'OPERATING').length;

        const compliant = tuckshops.filter(t =>
            t['LEASE STATUS'] && t['LEASE STATUS'].includes('RENEWED') &&
            t['OPERATIONAL STATUS'] === 'OPERATING'
        ).length;

        return {
            total,
            occupancy: total > 0 ? Math.round((operating / total) * 100) : 0,
            expired,
            renewed,
            compliant,
            risk: total > 0 ? Math.round((expired / total) * 100) : 0
        };
    }, [tuckshops]);

    // Mock locations for generic center
    const mockMarkers = useMemo(() => {
        const CENTER = [-19.46, 29.81];
        return Array.from({ length: 100 }, (_, i) => {
            const isGolden = i < 25;
            const hasArrears = !isGolden && Math.random() > 0.6;
            return {
                id: i,
                pos: [
                    CENTER[0] + (Math.random() - 0.5) * 0.08,
                    CENTER[1] + (Math.random() - 0.5) * 0.08
                ],
                status: isGolden ? 'Golden' : (hasArrears ? 'Risk' : 'Standard'),
                arrears: hasArrears ? Math.floor(Math.random() * 500) : 0
            };
        });
    }, []);

    const chartData = {
        risk: {
            labels: ['High Risk', 'Medium Risk', 'Model Units (Paid)'],
            datasets: [{
                label: 'Compliance Distribution',
                data: [stats.expired, stats.renewed - stats.compliant, stats.compliant],
                backgroundColor: ['#d32f2f', '#c5a059', '#4caf50'],
                borderWidth: 0,
            }]
        },
        trends: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            datasets: [
                {
                    label: 'Revenue ($)',
                    data: [4500, 4800, 4200, 5100, 4900, 5400, 5600, 5800, 5200, 5900, 6100, 6500],
                    borderColor: '#4caf50',
                    backgroundColor: 'rgba(76, 175, 80, 0.2)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Default Loss ($)',
                    data: [1200, 1100, 1400, 900, 1000, 800, 700, 600, 950, 500, 400, 300],
                    borderColor: '#d32f2f',
                    backgroundColor: 'rgba(211, 47, 47, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        vacancy: {
            labels: ['Occupied', 'Vacant'],
            datasets: [{
                data: [stats.occupancy, 100 - stats.occupancy],
                backgroundColor: ['#4caf50', '#c5a059'],
                hoverOffset: 4
            }]
        }
    };

    const navItems = [
        { name: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { name: 'Leases', icon: <FileText size={20} /> },
        { name: 'Payments', icon: <CreditCard size={20} /> },
        { name: 'Compliance', icon: <CheckCircle2 size={20} /> },
        { name: 'Risk Analysis', icon: <ShieldAlert size={20} /> },
        { name: 'Analytics', icon: <BarChart3 size={20} /> },
        { name: 'About', icon: <Info size={20} /> },
    ];

    const handleAddPayment = () => {
        alert(`Payment of $${paymentData.amount} recorded for Kiosk ${paymentData.kioskId}`);
    };

    const getComplianceData = () => {
        return tuckshops.filter(t => t['LEASE STATUS'] && t['LEASE STATUS'].includes('RENEWED')).slice(0, 50);
    };

    const getNonCompliantData = () => {
        return tuckshops.filter(t => t['LEASE STATUS'] && t['LEASE STATUS'].includes('EXPIRED')).slice(0, 50);
    };

    return (
        <div className="app-container">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <h2>CITY ESTATES<br />INTELLIGENCE</h2>
                </div>
                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <div
                            key={item.name}
                            className={`nav-item ${activeTab === item.name ? 'active' : ''}`}
                            onClick={() => setActiveTab(item.name)}
                        >
                            {item.icon}
                            <span>{item.name}</span>
                        </div>
                    ))}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="main-content">
                <header className="header">
                    <div>
                        <h1>{activeTab}</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Smart Estates Management & DSS / Urban Division</p>
                    </div>
                    <div className="alert-banner">
                        <Bell size={18} />
                        <span>ALERT: {stats.expired} Leases Expired soon! <a href="#" onClick={() => setActiveTab('Risk Analysis')} style={{ color: 'var(--accent-gold)' }}>(View Risk)</a></span>
                    </div>
                </header>

                <div className="view-container">
                    {activeTab === 'Dashboard' && (
                        <>
                            <div className="dashboard-grid">
                                <div className="card">
                                    <div className="card-title">Asset Condition Map</div>
                                    <div className="map-container">
                                        <MapContainer center={GWERU_CENTER} zoom={13} zoomControl={false} scrollWheelZoom={false}>
                                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                            {mockMarkers.map(m => (
                                                <CircleMarker
                                                    key={m.id}
                                                    center={m.pos}
                                                    radius={m.status === 'Golden' ? 10 : 7}
                                                    pathOptions={{
                                                        color: m.status === 'Golden' ? '#ffd700' : (m.status === 'Risk' ? '#d32f2f' : '#4caf50'),
                                                        fillOpacity: 0.7,
                                                        weight: m.status === 'Golden' ? 3 : 1
                                                    }}
                                                >
                                                    <Popup>
                                                        Status: {m.status}<br />
                                                        {m.status === 'Golden' ? "🌟 Model Tenant" : `Arrears: $${m.arrears}`}
                                                    </Popup>
                                                </CircleMarker>
                                            ))}
                                        </MapContainer>
                                    </div>
                                </div>

                                <div className="card" style={{ background: 'linear-gradient(135deg, #0b2212 0%, #1a3a25 100%)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <h3 style={{ color: '#ffd700' }}>Compliance Score</h3>
                                        <Award color="#ffd700" size={32} />
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#fff' }}>{Math.round((stats.compliant / (stats.total || 1)) * 100)}%</div>
                                        <p style={{ color: 'var(--text-secondary)' }}>Overall Portfolio Health</p>
                                    </div>
                                    <div style={{ marginTop: '2rem' }}>
                                        <div style={{ height: '8px', background: '#333', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ width: `${(stats.compliant / (stats.total || 1)) * 100}%`, height: '100%', background: '#ffd700' }}></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="card">
                                    <div className="card-title">Economic Sentiment</div>
                                    <div style={{ height: '180px' }}>
                                        <Line
                                            data={chartData.trends}
                                            options={{
                                                maintainAspectRatio: false,
                                                plugins: { legend: { display: false } },
                                                scales: { x: { display: false } }
                                            }}
                                        />
                                    </div>
                                    <div className="stats-grid" style={{ marginTop: '1rem' }}>
                                        <div className="stat-card">
                                            <div style={{ display: 'flex', alignItems: 'center', color: '#4caf50', gap: '4px' }}>
                                                <ArrowUpRight size={16} /> <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>+12%</span>
                                            </div>
                                            <div className="stat-label">Yield Growth</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="card" style={{ gridColumn: 'span 3' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <div className="card-title" style={{ textAlign: 'left', color: '#ffd700', marginBottom: 0 }}>🌟 Golden Star Kiosks (Model Tenants)</div>
                                        <button onClick={() => setActiveTab('Compliance')} className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>View All</button>
                                    </div>
                                    <div className="lease-carousel">
                                        {getComplianceData().slice(0, 10).map((t, i) => (
                                            <div key={i} className="lease-card" style={{ borderColor: '#ffd700', minWidth: '200px' }}>
                                                <div className="lease-icon" style={{ background: 'rgba(255, 215, 0, 0.1)' }}><Star size={18} color="#ffd700" /></div>
                                                <div className="lease-info">
                                                    <h4 style={{ fontSize: '0.8rem' }}>{t['NAME OF LESSEEE']}</h4>
                                                    <p style={{ fontSize: '0.7rem' }}>Status: Compliant</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="card" style={{ gridColumn: 'span 3' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <div className="card-title" style={{ textAlign: 'left', color: '#d32f2f', marginBottom: 0 }}>⚠️ Critical Non-Compliant Units</div>
                                        <button onClick={() => setActiveTab('Risk Analysis')} className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem', background: '#d32f2f' }}>View All</button>
                                    </div>
                                    <div className="lease-carousel">
                                        {getNonCompliantData().slice(0, 10).map((t, i) => (
                                            <div key={i} className="lease-card" style={{ borderColor: '#d32f2f', minWidth: '200px' }}>
                                                <div className="lease-icon" style={{ background: 'rgba(211, 47, 47, 0.1)' }}><AlertTriangle size={18} color="#d32f2f" /></div>
                                                <div className="lease-info">
                                                    <h4 style={{ fontSize: '0.8rem' }}>{t['NAME OF LESSEEE']}</h4>
                                                    <p style={{ fontSize: '0.7rem', color: '#d32f2f' }}>Lease Expired</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'Payments' && (
                        <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
                            <div className="card payment-management">
                                <h3>Market Entry Receipting</h3>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Issue official city council digital receipts for rent and arrears.</p>
                                <form onSubmit={(e) => { e.preventDefault(); handleAddPayment(); }}>
                                    <div className="form-group">
                                        <label>Kiosk ID / Reference</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. K-1002"
                                            value={paymentData.kioskId}
                                            onChange={(e) => setPaymentData({ ...paymentData, kioskId: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Payment Source</label>
                                        <select
                                            value={paymentData.paymentType}
                                            onChange={(e) => setPaymentData({ ...paymentData, paymentType: e.target.value })}
                                        >
                                            <option>Monthly Rent</option>
                                            <option>Arrears Clear</option>
                                            <option>New Lease Deposit</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Date Received</label>
                                        <input type="date" value={paymentData.date} onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Amount (USD)</label>
                                        <input type="number" value={paymentData.amount} onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })} />
                                    </div>
                                    <button type="submit" className="btn-primary">Process Digital Receipt</button>
                                </form>
                            </div>

                            <div className="card">
                                <h3>Recent Settlement Log</h3>
                                <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
                                    <table className="overview-table">
                                        <thead>
                                            <tr>
                                                <th>Ref</th>
                                                <th>Tenant</th>
                                                <th>Type</th>
                                                <th>Amount</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tuckshops.slice(50, 65).map((t, i) => (
                                                <tr key={i}>
                                                    <td>#{1024 + i}</td>
                                                    <td>{t['NAME OF LESSEEE']}</td>
                                                    <td>Monthly Rent</td>
                                                    <td>$57.50</td>
                                                    <td><span className="status-valid">SETTLED</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Compliance' && (
                        <div className="card">
                            <h2 style={{ color: '#ffd700', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Award size={32} /> Golden Kiosk Honor Roll
                            </h2>
                            <p style={{ marginBottom: '2rem', color: 'var(--text-secondary)' }}>
                                These kiosks are in excellent physical condition, have zero arrears, and are operating in full compliance with city council regulations.
                            </p>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="overview-table">
                                    <thead>
                                        <tr>
                                            <th>Tenant Name</th>
                                            <th>Location</th>
                                            <th>Condition</th>
                                            <th>Payment History</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {getComplianceData().map((t, i) => (
                                            <tr key={i}>
                                                <td>{t['NAME OF LESSEEE']}</td>
                                                <td>{t['LOCATION']}</td>
                                                <td><span style={{ color: '#4caf50' }}>EXCELLENT</span></td>
                                                <td><span style={{ color: '#4caf50' }}>100% CLEAN</span></td>
                                                <td><div style={{ background: '#4caf50', padding: '4px 12px', borderRadius: '15px', color: '#fff', fontSize: '0.8rem', textAlign: 'center' }}>COMPLIANT</div></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Leases' && (
                        <div className="card">
                            <h3 style={{ marginBottom: '1rem' }}>Central Lease Registry</h3>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="overview-table">
                                    <thead>
                                        <tr>
                                            <th>Tenant Name</th>
                                            <th>Kiosk #</th>
                                            <th>Location</th>
                                            <th>Status</th>
                                            <th>Rental</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tuckshops.slice(0, 100).map((t, i) => (
                                            <tr key={i}>
                                                <td>{t['NAME OF LESSEEE']}</td>
                                                <td>{t['KIOSK NUMBER ']}</td>
                                                <td>{t['LOCATION']}</td>
                                                <td className={t['LEASE STATUS'] && t['LEASE STATUS'].includes('EXPIRED') ? 'status-expired' : 'status-valid'}>
                                                    {t['LEASE STATUS']}
                                                </td>
                                                <td>{t['Mothly rental ']}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Risk Analysis' && (
                        <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <div className="card">
                                <h3 style={{ marginBottom: '1.5rem' }}>Portfolio Jeopardy Factor</h3>
                                <div style={{ height: '300px' }}>
                                    <Doughnut
                                        data={chartData.risk}
                                        options={{
                                            maintainAspectRatio: false,
                                            plugins: {
                                                legend: {
                                                    position: 'bottom',
                                                    labels: { color: '#fff', padding: 20 }
                                                }
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="card">
                                <h3 style={{ marginBottom: '1.5rem' }}>High-Default Area Map</h3>
                                <div className="map-container" style={{ height: '300px' }}>
                                    <MapContainer center={GWERU_CENTER} zoom={13} scrollWheelZoom={false}>
                                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                        {mockMarkers.filter(m => m.status === 'Risk').map(m => (
                                            <CircleMarker
                                                key={m.id}
                                                center={m.pos}
                                                radius={12}
                                                pathOptions={{ color: '#d32f2f', fillColor: '#d32f2f', fillOpacity: 0.8 }}
                                            >
                                                <Popup>CRITICAL RISK: Kiosk {m.id}<br />Outstanding: ${m.arrears}</Popup>
                                            </CircleMarker>
                                        ))}
                                    </MapContainer>
                                </div>
                            </div>

                            <div className="card" style={{ gridColumn: 'span 2' }}>
                                <h3 style={{ marginBottom: '1rem' }}>Legal Enforcement List</h3>
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="overview-table">
                                        <thead>
                                            <tr>
                                                <th>Tenant Name</th>
                                                <th>Location</th>
                                                <th>Status</th>
                                                <th>Arrears</th>
                                                <th>Legal Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {getNonCompliantData().slice(0, 10).map((t, i) => (
                                                <tr key={i}>
                                                    <td>{t['NAME OF LESSEEE']}</td>
                                                    <td>{t['LOCATION']}</td>
                                                    <td><span className="status-expired">{t['LEASE STATUS']}</span></td>
                                                    <td><span style={{ color: '#d32f2f', fontWeight: 'bold' }}>$432.50</span></td>
                                                    <td><button className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem', background: '#d32f2f' }}>Issue Final Warning</button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Analytics' && (
                        <div className="dashboard-grid">
                            <div className="card" style={{ gridColumn: 'span 3' }}>
                                <h3>Monthly Summary Matrix</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginTop: '1rem' }}>
                                    {[
                                        { label: 'Total Billed', val: '$46,200', color: '#fff' },
                                        { label: 'Total Collected', val: '$41,400', color: '#4caf50' },
                                        { label: 'Collection Rate', val: '89.6%', color: '#4caf50' },
                                        { label: 'Projected Carry-over', val: '$4,800', color: '#d32f2f' }
                                    ].map((m, idx) => (
                                        <div key={idx} className="stat-card" style={{ padding: '2rem' }}>
                                            <div className="stat-label">{m.label}</div>
                                            <div className="stat-value" style={{ color: m.color, fontSize: '1.8rem' }}>{m.val}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="card" style={{ gridColumn: 'span 2' }}>
                                <h3 style={{ marginBottom: '1.5rem' }}>Revenue Performance vs Historical Average</h3>
                                <div style={{ height: '350px' }}>
                                    <Bar data={chartData.trends} options={{ maintainAspectRatio: false }} />
                                </div>
                            </div>

                            <div className="card">
                                <h3>Inventory Health</h3>
                                <div style={{ height: '250px', marginTop: '2rem' }}>
                                    <Doughnut data={chartData.vacancy} options={{ maintainAspectRatio: false }} />
                                </div>
                                <div className="stats-grid" style={{ marginTop: '2rem' }}>
                                    <div className="stat-card">
                                        <div className="stat-value">{stats.total}</div>
                                        <div className="stat-label">Total Inventory</div>
                                    </div>
                                    <div className="stat-card">
                                        <div className="stat-value">{stats.occupancy}%</div>
                                        <div className="stat-label">Utilized</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'About' && (
                        <div className="card about-section" style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem' }}>
                            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                                <div style={{ background: 'rgba(255, 215, 0, 0.1)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                    <Award size={40} color="#ffd700" />
                                </div>
                                <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Smart Estates Management & DSS</h2>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Advanced Decision Support for Urban Estate Portfolios</p>
                            </div>

                            <div className="about-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem', marginBottom: '4rem' }}>
                                <div className="about-feature">
                                    <h4 style={{ color: '#ffd700', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                                        <MapIcon size={20} /> GIS Spatial Intelligence
                                    </h4>
                                    <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: 'rgba(255,255,255,0.7)' }}>
                                        Interactive mapping system that provides real-time visualization of property locations, current conditions, and financial health across all urban divisions.
                                    </p>
                                </div>
                                <div className="about-feature">
                                    <h4 style={{ color: '#ffd700', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                                        <ShieldAlert size={20} /> Risk Jeopardy Factor
                                    </h4>
                                    <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: 'rgba(255,255,255,0.7)' }}>
                                        Advanced predictive models that identify high-default areas and susceptible assets, allowing proactive administrative intervention before losses occur.
                                    </p>
                                </div>
                                <div className="about-feature">
                                    <h4 style={{ color: '#ffd700', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                                        <BarChart3 size={20} /> Economic Sentiment
                                    </h4>
                                    <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: 'rgba(255,255,255,0.7)' }}>
                                        Strategic financial tracking that monitors the gap between billed revenue and actual collections to gauge the overall economic pulse of the estate.
                                    </p>
                                </div>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '2rem 0' }} />

                            <div style={{ padding: '1rem' }}>
                                <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <BookOpen size={24} color="#4caf50" /> Using the System
                                </h3>
                                <ul style={{ listStyle: 'none', padding: 0 }}>
                                    {[
                                        "Use the Central Lease Registry to track and filter active vs. expired legal standings.",
                                        "Record new settlements directly through the 'Market Entry Receipting' form in the Payments module.",
                                        "Monitor the High-Default Area Map to identify localized clusters of arrears and enforcement priorities.",
                                        "The 'Compliance' Honor Roll highlights 'model' tenants - use this to inform preferential lease renewals."
                                    ].map((step, i) => (
                                        <li key={i} style={{ paddingLeft: '1.5rem', position: 'relative', marginBottom: '1rem', lineHeight: '1.5', color: 'rgba(255,255,255,0.8)' }}>
                                            <span style={{ position: 'absolute', left: 0, color: '#4caf50' }}>•</span>
                                            {step}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div style={{ marginTop: '3rem', padding: '1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', borderLeft: '4px solid #ffd700' }}>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <HelpCircle size={18} /> Need more info? Consult the municipal standard operating procedures (SOP) or contact the Urban Planning Division.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default App;
