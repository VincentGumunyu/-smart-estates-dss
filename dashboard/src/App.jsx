import React, { useState, useMemo, useEffect } from 'react';
import {
    LayoutDashboard,
    FileText,
    CreditCard,
    ShieldAlert,
    BarChart3,
    Bell,
    AlertTriangle,
    CheckCircle2,
    Star,
    Award,
    ArrowUpRight,
    ArrowDownRight,
    Menu,
    X,
    Sparkles,
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
    Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { MapContainer, TileLayer, Popup, CircleMarker } from 'react-leaflet';
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
    Legend,
    Filler
);

const GWERU_CENTER = [-19.46, 29.81];

/** City-wide standard legal tuckshop monthly rent (USD) */
const STANDARD_KIOSK_MONTHLY_RENT_USD = 57.5;
const formatStandardMonthlyRental = () => `$${STANDARD_KIOSK_MONTHLY_RENT_USD.toFixed(2)}`;

/** Monthly revenue vs default loss — Analytics matrix and charts share this series */
const TREND_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TREND_REVENUE_USD = [4500, 4800, 4200, 5100, 4900, 5400, 5600, 5800, 5200, 5900, 6100, 6500];
const TREND_DEFAULT_LOSS_USD = [1200, 1100, 1400, 900, 1000, 800, 700, 600, 950, 500, 400, 300];

const sumArr = (arr) => arr.reduce((a, b) => a + b, 0);
const fmtUsdInt = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Positive arrears amount in USD, or null if missing / not parseable */
const parseArrearsUsd = (record) => {
    const raw = record['Arrears'] ?? record['ARREARS'] ?? record['arrears'];
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const n = Number(s.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(n) && n > 0) return n;
    return null;
};

const CHART_TOOLTIP_DEFAULTS = {
    backgroundColor: 'rgba(11, 34, 18, 0.96)',
    titleColor: '#ffd700',
    bodyColor: '#e8e8e8',
    borderColor: '#c5a059',
    borderWidth: 1,
    padding: 12,
    displayColors: true,
};

const darkCartesianScales = {
    x: {
        ticks: { color: '#9aba9a' },
        grid: { color: 'rgba(197, 160, 89, 0.08)' },
        border: { display: false },
    },
    y: {
        ticks: { color: '#9aba9a' },
        grid: { color: 'rgba(197, 160, 89, 0.08)' },
        border: { display: false },
    },
};

const App = () => {
    const [activeTab, setActiveTab] = useState('Dashboard');
    const [leaseQuery, setLeaseQuery] = useState('');
    const [complianceQuery, setComplianceQuery] = useState('');
    const [riskSliceDetail, setRiskSliceDetail] = useState(null);
    /** Inventory Health doughnut: null = no selection; 0 = occupied; 1 = vacant / not operating */
    const [inventoryHealthSliceIndex, setInventoryHealthSliceIndex] = useState(null);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [aiQuestion, setAiQuestion] = useState('');
    const [aiReply, setAiReply] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState('');
    /** null = not checked yet; object = last /api/ai/status response */
    const [aiApiStatus, setAiApiStatus] = useState(null);

    const goToTab = (tab) => {
        setActiveTab(tab);
        setMobileNavOpen(false);
    };

    /** null = year aggregate; 0–11 = single month (drives Monthly Summary Matrix from bar chart) */
    const [analyticsMonthIndex, setAnalyticsMonthIndex] = useState(null);
    const [paymentData, setPaymentData] = useState({
        kioskId: '',
        paymentType: 'Monthly Rent',
        date: '2026-03-09',
        amount: String(STANDARD_KIOSK_MONTHLY_RENT_USD),
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

    const inventoryHealthBreakdown = useMemo(() => {
        const total = tuckshops.length;
        const operating = tuckshops.filter((t) => t['OPERATIONAL STATUS'] === 'OPERATING').length;
        const vacant = Math.max(0, total - operating);
        const occPct = total > 0 ? Math.round((operating / total) * 100) : 0;
        const vacPct = Math.max(0, 100 - occPct);
        return { total, operating, vacant, occPct, vacPct };
    }, [tuckshops]);

    const recordsWithArrears = useMemo(() => {
        return tuckshops.filter((t) => {
            const raw = t['Arrears'] ?? t['ARREARS'] ?? t['arrears'];
            if (raw === null || raw === undefined) return false;
            const s = String(raw).trim();
            if (!s) return false;
            const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
            if (Number.isFinite(n)) return n > 0;
            return /\d/.test(s);
        });
    }, [tuckshops]);

    const renewedRecords = useMemo(
        () => tuckshops.filter((t) => t['LEASE STATUS'] && t['LEASE STATUS'].includes('RENEWED')),
        [tuckshops]
    );

    const filteredComplianceRows = useMemo(() => {
        const q = complianceQuery.trim().toLowerCase();
        if (!q) return renewedRecords;
        return renewedRecords.filter(
            (t) =>
                String(t['NAME OF LESSEEE'] || '')
                    .toLowerCase()
                    .includes(q) ||
                String(t['LOCATION'] || '')
                    .toLowerCase()
                    .includes(q)
        );
    }, [renewedRecords, complianceQuery]);

    const filteredLeaseRows = useMemo(() => {
        const q = leaseQuery.trim().toLowerCase();
        if (!q) return tuckshops;
        return tuckshops.filter(
            (t) =>
                String(t['NAME OF LESSEEE'] || '')
                    .toLowerCase()
                    .includes(q) ||
                String(t['LOCATION'] || '')
                    .toLowerCase()
                    .includes(q) ||
                String(t['KIOSK NUMBER '] ?? '').includes(q)
        );
    }, [tuckshops, leaseQuery]);

    const analyticsMatrixValues = useMemo(() => {
        let revenue;
        let defLoss;
        if (analyticsMonthIndex === null) {
            revenue = sumArr(TREND_REVENUE_USD);
            defLoss = sumArr(TREND_DEFAULT_LOSS_USD);
        } else {
            revenue = TREND_REVENUE_USD[analyticsMonthIndex] ?? 0;
            defLoss = TREND_DEFAULT_LOSS_USD[analyticsMonthIndex] ?? 0;
        }
        const billed = revenue + defLoss;
        const collected = revenue;
        const ratePct = billed > 0 ? (collected / billed) * 100 : 0;
        return {
            periodLabel:
                analyticsMonthIndex === null
                    ? 'Year aggregate (all months)'
                    : `${TREND_MONTH_LABELS[analyticsMonthIndex]}`,
            totalBilled: billed,
            totalCollected: collected,
            collectionRatePct: ratePct,
            carryOver: defLoss,
        };
    }, [analyticsMonthIndex]);

    /** Top lessees by arrears for AI ranking questions (internal use). */
    const lesseeArrearsRanking = useMemo(() => {
        return tuckshops
            .map((t) => {
                const arrearsUsd = parseArrearsUsd(t);
                return {
                    lessee: String(t['NAME OF LESSEEE'] || '').trim() || 'Unknown',
                    kioskNumber: t['KIOSK NUMBER '] ?? '',
                    arrearsUsd,
                    location: String(t['LOCATION'] || '').slice(0, 120),
                    leaseStatus: String(t['LEASE STATUS'] || '').trim(),
                };
            })
            .filter((r) => r.arrearsUsd != null)
            .sort((a, b) => b.arrearsUsd - a.arrearsUsd)
            .slice(0, 30)
            .map((r) => ({
                lessee: r.lessee,
                kioskNumber: r.kioskNumber,
                arrearsUsd: Math.round(r.arrearsUsd * 100) / 100,
                location: r.location,
                leaseStatus: r.leaseStatus,
            }));
    }, [tuckshops]);

    /** Sent to the AI API: aggregates + lessee arrears ranking. */
    const aiDecisionContext = useMemo(() => {
        let totalArrearsUsd = 0;
        for (const t of recordsWithArrears) {
            const n = parseArrearsUsd(t);
            if (n != null) totalArrearsUsd += n;
        }
        const byArea = {};
        for (const t of recordsWithArrears) {
            const loc = String(t['LOCATION'] || 'Unknown').split(',')[0].trim().slice(0, 80) || 'Unknown';
            byArea[loc] = (byArea[loc] || 0) + 1;
        }
        const topAreasByArrearCount = Object.entries(byArea)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([area, count]) => ({ area, kiosksWithArrears: count }));

        return {
            scope: 'Legal tuckshop / kiosk portfolio (decision-support context)',
            dataSensitivity:
                'Internal DSS only. Context includes lessee names in lesseeArrearsRanking — handle per your privacy policy.',
            standardMonthlyRentUsd: STANDARD_KIOSK_MONTHLY_RENT_USD,
            portfolio: {
                totalKiosks: stats.total,
                operatingCount: tuckshops.filter((t) => t['OPERATIONAL STATUS'] === 'OPERATING').length,
                occupancyPercent: stats.occupancy,
                renewedLeases: stats.renewed,
                expiredLeases: stats.expired,
                compliantOperating: stats.compliant,
                riskPercentExpired: stats.risk,
            },
            arrears: {
                unitsWithPositiveArrears: recordsWithArrears.length,
                estimatedTotalOutstandingUsd: Math.round(totalArrearsUsd * 100) / 100,
                topAreasByArrearCount,
            },
            analytics: {
                periodLabel: analyticsMatrixValues.periodLabel,
                totalBilledUsd: analyticsMatrixValues.totalBilled,
                totalCollectedUsd: analyticsMatrixValues.totalCollected,
                collectionRatePercent: Math.round(analyticsMatrixValues.collectionRatePct * 10) / 10,
                projectedCarryOverUsd: analyticsMatrixValues.carryOver,
            },
            lesseeArrearsRanking,
        };
    }, [stats, tuckshops, recordsWithArrears, analyticsMatrixValues, lesseeArrearsRanking]);

    const analyticsBarChartData = useMemo(() => {
        const dimG = 'rgba(76, 175, 80, 0.3)';
        const dimR = 'rgba(211, 47, 47, 0.3)';
        const fullG = 'rgba(76, 175, 80, 0.82)';
        const fullR = 'rgba(211, 47, 47, 0.78)';
        const selG = 'rgba(255, 215, 0, 0.92)';
        const selR = 'rgba(255, 152, 0, 0.88)';
        const revBg = TREND_MONTH_LABELS.map((_, i) => {
            if (analyticsMonthIndex === null) return fullG;
            return i === analyticsMonthIndex ? selG : dimG;
        });
        const defBg = TREND_MONTH_LABELS.map((_, i) => {
            if (analyticsMonthIndex === null) return fullR;
            return i === analyticsMonthIndex ? selR : dimR;
        });
        return {
            labels: [...TREND_MONTH_LABELS],
            datasets: [
                {
                    label: 'Revenue ($)',
                    data: [...TREND_REVENUE_USD],
                    backgroundColor: revBg,
                    borderColor: '#4caf50',
                    borderWidth: 1,
                },
                {
                    label: 'Default Loss ($)',
                    data: [...TREND_DEFAULT_LOSS_USD],
                    backgroundColor: defBg,
                    borderColor: '#d32f2f',
                    borderWidth: 1,
                },
            ],
        };
    }, [analyticsMonthIndex]);

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

    const chartData = useMemo(
        () => ({
            risk: {
                labels: ['High Risk', 'Medium Risk', 'Model Units (Paid)'],
                datasets: [
                    {
                        label: 'Compliance Distribution',
                        data: [
                            stats.expired,
                            Math.max(0, stats.renewed - stats.compliant),
                            stats.compliant,
                        ],
                        backgroundColor: ['#d32f2f', '#c5a059', '#4caf50'],
                        borderWidth: 0,
                        hoverOffset: 12,
                    },
                ],
            },
            trends: {
                labels: [...TREND_MONTH_LABELS],
                datasets: [
                    {
                        label: 'Revenue ($)',
                        data: [...TREND_REVENUE_USD],
                        borderColor: '#4caf50',
                        backgroundColor: 'rgba(76, 175, 80, 0.2)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 8,
                    },
                    {
                        label: 'Default Loss ($)',
                        data: [...TREND_DEFAULT_LOSS_USD],
                        borderColor: '#d32f2f',
                        backgroundColor: 'rgba(211, 47, 47, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 8,
                    },
                ],
            },
        }),
        [stats]
    );

    const lineChartOptions = useMemo(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: '#cfcfcf', usePointStyle: true, padding: 16 },
                },
                tooltip: {
                    ...CHART_TOOLTIP_DEFAULTS,
                },
            },
            scales: darkCartesianScales,
        }),
        []
    );

    const barChartOptions = useMemo(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: '#cfcfcf', usePointStyle: true, padding: 16 },
                },
                tooltip: { ...CHART_TOOLTIP_DEFAULTS },
            },
            scales: darkCartesianScales,
        }),
        []
    );

    const analyticsBarChartOptions = useMemo(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: (_, elements) => {
                if (!elements.length) return;
                const idx = elements[0].index;
                setAnalyticsMonthIndex((prev) => (prev === idx ? null : idx));
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: '#cfcfcf', usePointStyle: true, padding: 16 },
                },
                tooltip: {
                    ...CHART_TOOLTIP_DEFAULTS,
                    callbacks: {
                        footer: () => 'Click bars to update matrix above (same month again = year view)',
                    },
                },
            },
            scales: darkCartesianScales,
        }),
        []
    );

    const riskDoughnutOptions = useMemo(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            cutout: '56%',
            interaction: { mode: 'nearest', intersect: true },
            onClick: (_, elements) => {
                if (!elements.length) {
                    setRiskSliceDetail(null);
                    return;
                }
                const idx = elements[0].index;
                const labels = [
                    'High risk (expired leases)',
                    'Medium (renewed, not fully operating)',
                    'Model units (compliant & operating)',
                ];
                const dataVals = [
                    stats.expired,
                    Math.max(0, stats.renewed - stats.compliant),
                    stats.compliant,
                ];
                setRiskSliceDetail({ label: labels[idx], value: dataVals[idx] });
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#e8e8e8', padding: 18, usePointStyle: true },
                },
                tooltip: {
                    ...CHART_TOOLTIP_DEFAULTS,
                    callbacks: {
                        footer: (items) => {
                            const v = items[0]?.parsed;
                            if (v == null || !stats.total) return '';
                            return `${Math.round((v / stats.total) * 100)}% of portfolio (${stats.total} units)`;
                        },
                    },
                },
            },
        }),
        [stats]
    );

    const inventoryHealthChartData = useMemo(() => {
        const { occPct, vacPct } = inventoryHealthBreakdown;
        const dimG = 'rgba(76, 175, 80, 0.28)';
        const dimA = 'rgba(197, 160, 89, 0.28)';
        const fullG = 'rgba(76, 175, 80, 0.9)';
        const fullA = 'rgba(197, 160, 89, 0.88)';
        const selG = '#ffd700';
        const selA = '#ffb74d';
        const bg = [
            inventoryHealthSliceIndex === null ? fullG : inventoryHealthSliceIndex === 0 ? selG : dimG,
            inventoryHealthSliceIndex === null ? fullA : inventoryHealthSliceIndex === 1 ? selA : dimA,
        ];
        const hoverOffset = [inventoryHealthSliceIndex === 0 ? 20 : 14, inventoryHealthSliceIndex === 1 ? 20 : 14];
        return {
            labels: ['Occupied (operating)', 'Vacant / not operating'],
            datasets: [
                {
                    data: [occPct, vacPct],
                    backgroundColor: bg,
                    borderColor: ['#1b5e20', '#6d4c41'],
                    borderWidth: 2,
                    hoverOffset,
                },
            ],
        };
    }, [inventoryHealthBreakdown, inventoryHealthSliceIndex]);

    const inventoryHealthChartOptions = useMemo(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            cutout: '52%',
            interaction: { mode: 'nearest', intersect: true },
            animation: { animateRotate: true, animateScale: true },
            onClick: (_, elements) => {
                if (!elements.length) return;
                const idx = elements[0].index;
                setInventoryHealthSliceIndex((prev) => (prev === idx ? null : idx));
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#e8e8e8', padding: 14, usePointStyle: true },
                    onClick: (_e, legendItem) => {
                        const idx = legendItem.index;
                        setInventoryHealthSliceIndex((prev) => (prev === idx ? null : idx));
                    },
                },
                tooltip: {
                    ...CHART_TOOLTIP_DEFAULTS,
                    callbacks: {
                        label: (ctx) => {
                            const pct = ctx.parsed;
                            const units =
                                ctx.dataIndex === 0
                                    ? inventoryHealthBreakdown.operating
                                    : inventoryHealthBreakdown.vacant;
                            return ` ${ctx.label}: ${pct}% (~${units} kiosks)`;
                        },
                        footer: () => 'Click slice or legend to lock / unlock detail below',
                    },
                },
            },
        }),
        [inventoryHealthBreakdown]
    );

    const navItems = [
        { name: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { name: 'Leases', icon: <FileText size={20} /> },
        { name: 'Payments', icon: <CreditCard size={20} /> },
        { name: 'Compliance', icon: <CheckCircle2 size={20} /> },
        { name: 'Risk Analysis', icon: <ShieldAlert size={20} /> },
        { name: 'Analytics', icon: <BarChart3 size={20} /> },
        { name: 'AI Assistant', icon: <Sparkles size={20} /> },
    ];

    const runAiInsights = async () => {
        setAiLoading(true);
        setAiError('');
        try {
            const res = await fetch('/api/ai/insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userQuestion: aiQuestion.trim() || undefined,
                    context: aiDecisionContext,
                }),
            });
            let data = {};
            try {
                data = await res.json();
            } catch {
                data = {};
            }
            if (!res.ok) {
                const d = data.detail;
                const msg =
                    typeof d === 'string'
                        ? d
                        : Array.isArray(d)
                          ? d.map((x) => x.msg || JSON.stringify(x)).join('; ')
                          : d && typeof d === 'object'
                            ? JSON.stringify(d)
                            : data.message || res.statusText || 'Request failed';
                throw new Error(msg);
            }
            setAiReply(typeof data.reply === 'string' ? data.reply : '');
        } catch (e) {
            setAiError(e?.message || String(e));
            setAiReply('');
        } finally {
            setAiLoading(false);
        }
    };

    const handleAddPayment = () => {
        alert(`Payment of $${paymentData.amount} recorded for Kiosk ${paymentData.kioskId}`);
    };

    useEffect(() => {
        if (mobileNavOpen) {
            document.body.classList.add('nav-open-lock');
        } else {
            document.body.classList.remove('nav-open-lock');
        }
        return () => document.body.classList.remove('nav-open-lock');
    }, [mobileNavOpen]);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 901px)');
        const closeIfDesktop = () => {
            if (mq.matches) setMobileNavOpen(false);
        };
        mq.addEventListener('change', closeIfDesktop);
        closeIfDesktop();
        return () => mq.removeEventListener('change', closeIfDesktop);
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') setMobileNavOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        if (activeTab !== 'AI Assistant') return undefined;
        let cancelled = false;
        setAiApiStatus(null);
        (async () => {
            try {
                const res = await fetch('/api/ai/status');
                if (!res.ok) throw new Error('bad status');
                const j = await res.json();
                if (!cancelled) setAiApiStatus({ ...j, unreachable: false });
            } catch {
                if (!cancelled) {
                    setAiApiStatus({
                        ok: false,
                        openaiConfigured: false,
                        envFileExists: false,
                        unreachable: true,
                        hint: 'Start uvicorn: python -m uvicorn ai_api:app --host 127.0.0.1 --port 8765',
                        model: '',
                    });
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [activeTab]);

    const formatRegistryArrears = (record) => {
        const raw = record['Arrears'] ?? record['ARREARS'] ?? record['arrears'];
        if (raw === null || raw === undefined) return '—';
        const s = String(raw).trim();
        if (!s) return '—';
        if (s.startsWith('$')) return s;
        const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
        if (!Number.isFinite(n)) return s;
        return `$${n.toFixed(2)}`;
    };

    return (
        <div className="app-container">
            <div
                className={`sidebar-backdrop ${mobileNavOpen ? 'sidebar-backdrop--visible' : ''}`}
                aria-hidden="true"
                onClick={() => setMobileNavOpen(false)}
            />
            {/* Sidebar */}
            <aside className={`sidebar ${mobileNavOpen ? 'sidebar--open' : ''}`}>
                <button
                    type="button"
                    className="sidebar-close-btn"
                    aria-label="Close menu"
                    onClick={() => setMobileNavOpen(false)}
                >
                    <X size={22} strokeWidth={2} />
                </button>
                <div className="sidebar-logo">
                    <h2>CITY ESTATES<br />INTELLIGENCE</h2>
                </div>
                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <div
                            key={item.name}
                            className={`nav-item ${activeTab === item.name ? 'active' : ''}`}
                            onClick={() => goToTab(item.name)}
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
                    <div className="header-main">
                        <button
                            type="button"
                            className="mobile-menu-btn"
                            aria-label="Open menu"
                            aria-expanded={mobileNavOpen}
                            onClick={() => setMobileNavOpen(true)}
                        >
                            <Menu size={24} strokeWidth={2} />
                        </button>
                        <div className="header-titles">
                            <h1>{activeTab}</h1>
                            <p className="header-subtitle">Smart Estates Management & DSS / Urban Division</p>
                        </div>
                    </div>
                    <div className="alert-banner">
                        <Bell size={18} />
                        <span>
                            ALERT: {stats.expired} Leases Expired soon!{' '}
                            <button
                                type="button"
                                onClick={() => goToTab('Risk Analysis')}
                                style={{ color: 'var(--accent-gold)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}
                            >
                                (View Risk)
                            </button>
                        </span>
                    </div>
                </header>

                <div className="view-container">
                    {activeTab === 'Dashboard' && (
                        <>
                            <div className="dashboard-grid">
                                <div className="card">
                                    <div className="card-title">Asset Condition Map</div>
                                    <div className="map-container">
                                        <MapContainer center={GWERU_CENTER} zoom={13} zoomControl scrollWheelZoom>
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
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                        Hover points for values; click legend to show or hide Revenue vs Default Loss.
                                    </p>
                                    <div style={{ height: 'min(240px, 28vw)', minHeight: '180px' }} className="chart-surface">
                                        <Line data={chartData.trends} options={lineChartOptions} />
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

                                <div className="card" style={{ gridColumn: '1 / -1' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <div className="card-title" style={{ textAlign: 'left', color: '#ffd700', marginBottom: 0 }}>🌟 Golden Star Kiosks (Model Tenants)</div>
                                        <button onClick={() => goToTab('Compliance')} className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>View All</button>
                                    </div>
                                    <div className="lease-carousel">
                                        {renewedRecords.slice(0, 10).map((t, i) => (
                                            <div
                                                key={i}
                                                role="button"
                                                tabIndex={0}
                                                className="lease-card lease-card--interactive"
                                                style={{ borderColor: '#ffd700', minWidth: '200px' }}
                                                onClick={() => goToTab('Compliance')}
                                                onKeyDown={(e) => e.key === 'Enter' && goToTab('Compliance')}
                                            >
                                                <div className="lease-icon" style={{ background: 'rgba(255, 215, 0, 0.1)' }}><Star size={18} color="#ffd700" /></div>
                                                <div className="lease-info">
                                                    <h4 style={{ fontSize: '0.8rem' }}>{t['NAME OF LESSEEE']}</h4>
                                                    <p style={{ fontSize: '0.7rem' }}>Status: Compliant</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="card" style={{ gridColumn: '1 / -1' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <div className="card-title" style={{ textAlign: 'left', color: '#d32f2f', marginBottom: 0 }}>⚠️ Units with outstanding arrears</div>
                                        <button onClick={() => goToTab('Risk Analysis')} className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem', background: '#d32f2f' }}>View All</button>
                                    </div>
                                    <div className="lease-carousel">
                                        {recordsWithArrears.map((t, i) => (
                                            <div
                                                key={`${t['KIOSK NUMBER ']}-${i}`}
                                                role="button"
                                                tabIndex={0}
                                                className="lease-card lease-card--interactive"
                                                style={{ borderColor: '#d32f2f', minWidth: '200px' }}
                                                onClick={() => goToTab('Risk Analysis')}
                                                onKeyDown={(e) => e.key === 'Enter' && goToTab('Risk Analysis')}
                                            >
                                                <div className="lease-icon" style={{ background: 'rgba(211, 47, 47, 0.1)' }}><AlertTriangle size={18} color="#d32f2f" /></div>
                                                <div className="lease-info">
                                                    <h4 style={{ fontSize: '0.8rem' }}>{t['NAME OF LESSEEE']}</h4>
                                                    <p style={{ fontSize: '0.7rem', color: '#d32f2f' }}>{formatRegistryArrears(t)} outstanding</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'Payments' && (
                        <div className="dashboard-grid dashboard-grid--split-payment">
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
                                                    <td>{formatStandardMonthlyRental()}</td>
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
                            <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                                These kiosks are in excellent physical condition, have zero arrears, and are operating in full compliance with city council regulations.
                            </p>
                            <div className="form-group" style={{ maxWidth: '420px', marginBottom: '1.25rem' }}>
                                <label htmlFor="compliance-search">Search tenant or location</label>
                                <input
                                    id="compliance-search"
                                    type="search"
                                    placeholder="Type to filter…"
                                    value={complianceQuery}
                                    onChange={(e) => setComplianceQuery(e.target.value)}
                                    autoComplete="off"
                                />
                            </div>
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
                                        {filteredComplianceRows.map((t, i) => (
                                            <tr key={`${t['KIOSK NUMBER ']}-${i}`}>
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
                            <div className="form-group" style={{ maxWidth: '420px', marginBottom: '1.25rem' }}>
                                <label htmlFor="lease-search">Search tenant, kiosk, or location</label>
                                <input
                                    id="lease-search"
                                    type="search"
                                    placeholder="Type to filter…"
                                    value={leaseQuery}
                                    onChange={(e) => setLeaseQuery(e.target.value)}
                                    autoComplete="off"
                                />
                            </div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                                Showing {filteredLeaseRows.length} of {tuckshops.length} leases
                            </p>
                            <div style={{ overflowX: 'auto', maxHeight: '65vh', overflowY: 'auto' }}>
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
                                        {filteredLeaseRows.map((t, i) => (
                                            <tr key={`${t['KIOSK NUMBER ']}-${i}`}>
                                                <td>{t['NAME OF LESSEEE']}</td>
                                                <td>{t['KIOSK NUMBER ']}</td>
                                                <td>{t['LOCATION']}</td>
                                                <td className={t['LEASE STATUS'] && t['LEASE STATUS'].includes('EXPIRED') ? 'status-expired' : 'status-valid'}>
                                                    {t['LEASE STATUS']}
                                                </td>
                                                <td>{formatStandardMonthlyRental()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Risk Analysis' && (
                        <div className="dashboard-grid dashboard-grid--split-risk">
                            <div className="card">
                                <h3 style={{ marginBottom: '0.5rem' }}>Portfolio Jeopardy Factor</h3>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                    Hover for tooltips, click legend labels to hide series, click a slice for details below.
                                </p>
                                <div style={{ height: '300px' }} className="chart-surface">
                                    <Doughnut data={chartData.risk} options={riskDoughnutOptions} />
                                </div>
                                {riskSliceDetail && (
                                    <div
                                        style={{
                                            marginTop: '1rem',
                                            padding: '0.75rem 1rem',
                                            background: 'rgba(255,215,0,0.08)',
                                            borderRadius: '8px',
                                            borderLeft: '3px solid #ffd700',
                                            fontSize: '0.9rem',
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                        }}
                                    >
                                        <span>
                                            <strong style={{ color: '#ffd700' }}>{riskSliceDetail.label}</strong>
                                            <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                                — {riskSliceDetail.value} units
                                            </span>
                                        </span>
                                        <button type="button" className="btn-text-clear" onClick={() => setRiskSliceDetail(null)}>
                                            Clear
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="card">
                                <h3 style={{ marginBottom: '1.5rem' }}>High-Default Area Map</h3>
                                <div className="map-container" style={{ height: '300px' }}>
                                    <MapContainer center={GWERU_CENTER} zoom={13} zoomControl scrollWheelZoom>
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

                            <div className="card" style={{ gridColumn: '1 / -1' }}>
                                <h3 style={{ marginBottom: '1rem' }}>Legal Enforcement List ({recordsWithArrears.length} with arrears)</h3>
                                <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
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
                                            {recordsWithArrears.map((t, i) => {
                                                const arrearsLabel = formatRegistryArrears(t);
                                                return (
                                                <tr key={`${t['KIOSK NUMBER ']}-${t['NAME OF LESSEEE']}-${i}`}>
                                                    <td>{t['NAME OF LESSEEE']}</td>
                                                    <td>{t['LOCATION']}</td>
                                                    <td><span className="status-expired">{t['LEASE STATUS']}</span></td>
                                                    <td>
                                                        <span style={{
                                                            color: arrearsLabel === '—' ? 'var(--text-secondary)' : '#d32f2f',
                                                            fontWeight: 'bold'
                                                        }}>
                                                            {arrearsLabel}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className="btn-primary"
                                                            style={{ padding: '4px 12px', fontSize: '0.8rem', background: '#d32f2f' }}
                                                            onClick={() =>
                                                                window.alert(
                                                                    `Final warning queued for ${t['NAME OF LESSEEE']} (${arrearsLabel} outstanding).`
                                                                )
                                                            }
                                                        >
                                                            Issue Final Warning
                                                        </button>
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'AI Assistant' && (
                        <div className="dashboard-grid">
                            <div className="card" style={{ gridColumn: '1 / -1' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                    <Sparkles size={22} color="#ffd700" />
                                    <h3 style={{ margin: 0 }}>AI Assistant</h3>
                                </div>
                                {aiApiStatus?.unreachable && (
                                    <div
                                        style={{
                                            marginBottom: '1rem',
                                            padding: '0.65rem 0.9rem',
                                            borderRadius: '8px',
                                            fontSize: '0.82rem',
                                            background: 'rgba(211, 47, 47, 0.12)',
                                            borderLeft: '3px solid #d32f2f',
                                            color: '#ffcdd2',
                                        }}
                                    >
                                        {aiApiStatus.hint}
                                    </div>
                                )}
                                <label htmlFor="ai-question" style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                                    Question (optional)
                                </label>
                                <textarea
                                    id="ai-question"
                                    className="ai-assistant-input"
                                    rows={3}
                                    placeholder="Leave blank for a general briefing, or ask something specific."
                                    value={aiQuestion}
                                    onChange={(e) => setAiQuestion(e.target.value)}
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(197, 160, 89, 0.35)',
                                        background: 'rgba(0,0,0,0.25)',
                                        color: '#e8e8e8',
                                        fontFamily: 'inherit',
                                        fontSize: '0.9rem',
                                        resize: 'vertical',
                                        marginBottom: '0.75rem',
                                    }}
                                />
                                <button
                                    type="button"
                                    className="btn-primary"
                                    disabled={aiLoading}
                                    onClick={() => runAiInsights()}
                                >
                                    {aiLoading ? 'Thinking…' : 'Run briefing'}
                                </button>
                                {aiError && (
                                    <div
                                        style={{
                                            marginTop: '1rem',
                                            padding: '0.75rem 1rem',
                                            borderRadius: '8px',
                                            background: 'rgba(211, 47, 47, 0.12)',
                                            borderLeft: '3px solid #d32f2f',
                                            color: '#ffcdd2',
                                            fontSize: '0.88rem',
                                            whiteSpace: 'pre-wrap',
                                        }}
                                    >
                                        {aiError}
                                    </div>
                                )}
                                {aiReply && (
                                    <div style={{ marginTop: '1.25rem' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                                            Response
                                        </div>
                                        <div
                                            className="ai-insights-output"
                                            style={{
                                                padding: '1rem 1.25rem',
                                                borderRadius: '8px',
                                                background: 'rgba(11, 34, 18, 0.55)',
                                                border: '1px solid rgba(197, 160, 89, 0.2)',
                                                color: '#e8e8e8',
                                                fontSize: '0.9rem',
                                                lineHeight: 1.55,
                                                whiteSpace: 'pre-wrap',
                                            }}
                                        >
                                            {aiReply}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'Analytics' && (
                        <div className="dashboard-grid">
                            <div className="card" style={{ gridColumn: '1 / -1' }}>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                    The bar chart below updates this matrix when you select a month. Other charts: use legends and doughnut clicks as before.
                                </p>
                                <h3>Monthly Summary Matrix</h3>
                                <div
                                    style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        marginTop: '0.75rem',
                                        marginBottom: '0.5rem',
                                    }}
                                >
                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                        Period:{' '}
                                        <strong style={{ color: '#ffd700' }}>{analyticsMatrixValues.periodLabel}</strong>
                                    </span>
                                    {analyticsMonthIndex !== null && (
                                        <button
                                            type="button"
                                            className="btn-text-clear"
                                            onClick={() => setAnalyticsMonthIndex(null)}
                                        >
                                            Show year aggregate
                                        </button>
                                    )}
                                </div>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                    Total billed = Revenue + Default loss for the period. Total collected = Revenue. Collection rate = collected ÷ billed. Projected carry-over ≈ default loss.
                                </p>
                                <div
                                    className="analytics-kpi-grid"
                                    style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '1rem', marginTop: '0.25rem', width: '100%' }}
                                >
                                    {[
                                        {
                                            label: 'Total Billed',
                                            val: fmtUsdInt(analyticsMatrixValues.totalBilled),
                                            color: '#fff',
                                        },
                                        {
                                            label: 'Total Collected',
                                            val: fmtUsdInt(analyticsMatrixValues.totalCollected),
                                            color: '#4caf50',
                                        },
                                        {
                                            label: 'Collection Rate',
                                            val: `${analyticsMatrixValues.collectionRatePct.toFixed(1)}%`,
                                            color: '#4caf50',
                                        },
                                        {
                                            label: 'Projected Carry-over',
                                            val: fmtUsdInt(analyticsMatrixValues.carryOver),
                                            color: '#d32f2f',
                                        },
                                    ].map((m, idx) => (
                                        <div key={idx} className="stat-card" style={{ padding: '2rem' }}>
                                            <div className="stat-label">{m.label}</div>
                                            <div className="stat-value" style={{ color: m.color, fontSize: '1.8rem' }}>{m.val}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="card" style={{ gridColumn: 'span 2' }}>
                                <h3 style={{ marginBottom: '0.5rem' }}>Revenue Performance vs Historical Average</h3>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                    Click a month on the chart to drive the matrix above. The selected month is highlighted in gold / orange. Click the same month again, or use &quot;Show year aggregate&quot;, to restore full-year totals.
                                </p>
                                <div style={{ height: 'min(380px, 42vw)', minHeight: '280px' }} className="chart-surface">
                                    <Bar data={analyticsBarChartData} options={analyticsBarChartOptions} />
                                </div>
                            </div>

                            <div className="card">
                                <h3>Inventory Health</h3>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                                    Hover for counts. Click a slice or its legend label to highlight it and show detail; click again to clear. Use the stat tiles below for quick focus.
                                </p>
                                <div style={{ height: 'min(280px, 32vw)', minHeight: '220px', marginTop: '1rem' }} className="chart-surface">
                                    <Doughnut data={inventoryHealthChartData} options={inventoryHealthChartOptions} />
                                </div>
                                {inventoryHealthSliceIndex !== null && (
                                    <div
                                        style={{
                                            marginTop: '1rem',
                                            padding: '0.75rem 1rem',
                                            background:
                                                inventoryHealthSliceIndex === 0
                                                    ? 'rgba(76, 175, 80, 0.12)'
                                                    : 'rgba(255, 183, 77, 0.1)',
                                            borderRadius: '8px',
                                            fontSize: '0.88rem',
                                            color: 'var(--text-secondary)',
                                            borderLeft:
                                                inventoryHealthSliceIndex === 0
                                                    ? '3px solid #4caf50'
                                                    : '3px solid #ffb74d',
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                                            <span>
                                                <strong
                                                    style={{
                                                        color: inventoryHealthSliceIndex === 0 ? '#4caf50' : '#ffb74d',
                                                    }}
                                                >
                                                    {inventoryHealthSliceIndex === 0
                                                        ? 'Occupied (operating)'
                                                        : 'Vacant / not operating'}
                                                </strong>
                                                :{' '}
                                                {inventoryHealthSliceIndex === 0
                                                    ? inventoryHealthBreakdown.occPct
                                                    : inventoryHealthBreakdown.vacPct}
                                                % of portfolio (
                                                {inventoryHealthSliceIndex === 0
                                                    ? inventoryHealthBreakdown.operating
                                                    : inventoryHealthBreakdown.vacant}{' '}
                                                kiosks of {inventoryHealthBreakdown.total})
                                            </span>
                                            <button
                                                type="button"
                                                className="btn-text-clear"
                                                onClick={() => setInventoryHealthSliceIndex(null)}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div className="stats-grid stats-grid--inventory" style={{ marginTop: '1.5rem' }}>
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        className={`stat-card stat-card--clickable${inventoryHealthSliceIndex === null ? ' stat-card--clickable-active' : ''}`}
                                        onClick={() => setInventoryHealthSliceIndex(null)}
                                        onKeyDown={(e) => e.key === 'Enter' && setInventoryHealthSliceIndex(null)}
                                    >
                                        <div className="stat-value">{inventoryHealthBreakdown.total}</div>
                                        <div className="stat-label">Total inventory</div>
                                    </div>
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        className={`stat-card stat-card--clickable${inventoryHealthSliceIndex === 0 ? ' stat-card--clickable-active' : ''}`}
                                        onClick={() =>
                                            setInventoryHealthSliceIndex((i) => (i === 0 ? null : 0))
                                        }
                                        onKeyDown={(e) =>
                                            e.key === 'Enter' &&
                                            setInventoryHealthSliceIndex((i) => (i === 0 ? null : 0))
                                        }
                                    >
                                        <div className="stat-value">{inventoryHealthBreakdown.operating}</div>
                                        <div className="stat-label">Operating ({inventoryHealthBreakdown.occPct}%)</div>
                                    </div>
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        className={`stat-card stat-card--clickable${inventoryHealthSliceIndex === 1 ? ' stat-card--clickable-active' : ''}`}
                                        onClick={() =>
                                            setInventoryHealthSliceIndex((i) => (i === 1 ? null : 1))
                                        }
                                        onKeyDown={(e) =>
                                            e.key === 'Enter' &&
                                            setInventoryHealthSliceIndex((i) => (i === 1 ? null : 1))
                                        }
                                    >
                                        <div className="stat-value">{inventoryHealthBreakdown.vacant}</div>
                                        <div className="stat-label">Not operating ({inventoryHealthBreakdown.vacPct}%)</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
};

export default App;
