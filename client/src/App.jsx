import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { api, getStoredUser, getToken, clearAuth } from './api.js';
import { Logo } from './logo.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import InvoiceEditor from './pages/InvoiceEditor.jsx';
import Invoices from './pages/Invoices.jsx';
import InvoiceView from './pages/InvoiceView.jsx';
import Settings from './pages/Settings.jsx';
import Purchases from './pages/Purchases.jsx';
import Accounts from './pages/Accounts.jsx';
import Projects from './pages/Projects.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import Payments from './pages/Payments.jsx';
import ProfitShare from './pages/ProfitShare.jsx';
import Reports from './pages/Reports.jsx';
import AdminConfig from './pages/AdminConfig.jsx';

// ── Sidebar icons (white stroke SVGs) ──
const I = ({ children }) => (
  <svg className="nav-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const IcHome = () => <I><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></I>;
const IcNew = () => <I><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M12 9v6M9 12h6" /></I>;
const IcList = () => <I><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></I>;
const IcGear = () => <I><circle cx="12" cy="12" r="3.2" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" /></I>;
const IcCart = () => <I><circle cx="9" cy="20" r="1.6" /><circle cx="17" cy="20" r="1.6" /><path d="M3 4h2l2.6 12h10.2l2.2-8H6.2" /></I>;
const IcChart = () => <I><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7" y="11" width="3" height="6" rx="0.5" /><rect x="12" y="7" width="3" height="10" rx="0.5" /><rect x="17" y="13" width="3" height="4" rx="0.5" /></I>;
const IcShield = () => <I><path d="M12 3 5 6v5c0 5 3.2 8.4 7 10 3.8-1.6 7-5 7-10V6l-7-3Z" /><path d="M9.5 12l2 2 3.5-4" /></I>;
const IcWallet = () => <I><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 9.5h18" /><circle cx="16.5" cy="14.5" r="1.2" /></I>;
const IcFolder = () => <I><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></I>;
const IcPay = () => <I><rect x="3" y="7" width="18" height="11" rx="2" /><circle cx="12" cy="12.5" r="2.2" /><path d="M6.4 10.5h.01M17.6 14.5h.01" /></I>;
const IcPie = () => <I><path d="M12 3a9 9 0 1 0 9 9h-9V3Z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15V3.5Z" /></I>;

function Sidebar({ open, onNavigate }) {
  const link = ({ isActive }) => 'nav-link' + (isActive ? ' active' : '');
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand">
        <div className="brand-plate"><Logo /></div>
      </div>
      <nav onClick={onNavigate}>
        <div className="nav-group">Overview</div>
        <NavLink to="/" end className={link}><IcHome />Dashboard</NavLink>
        <div className="nav-group">Projects</div>
        <NavLink to="/projects" className={link}><IcFolder />Projects</NavLink>
        <NavLink to="/payments" className={link}><IcPay />Payments</NavLink>
        <NavLink to="/profit-share" className={link}><IcPie />Profit Share</NavLink>
        <div className="nav-group">Invoicing</div>
        <NavLink to="/invoices/new" className={link}><IcNew />New Invoice</NavLink>
        <NavLink to="/invoices" end className={link}><IcList />Invoices</NavLink>
        <div className="nav-group">Configuration</div>
        <NavLink to="/settings" className={link}><IcGear />Invoice Settings</NavLink>
        <div className="nav-group">Accounts</div>
        <NavLink to="/purchases" className={link}><IcCart />Purchases</NavLink>
        <NavLink to="/accounts" className={link}><IcWallet />Accounts</NavLink>
        <NavLink to="/reports" className={link}><IcChart />Reports</NavLink>
        <div className="nav-group">Administration</div>
        <NavLink to="/admin" className={link}><IcShield />Admin Config</NavLink>
      </nav>
      <div className="sidebar-foot">Amazeon ERP v1.0</div>
    </aside>
  );
}

export default function App() {
  const [user, setUser] = useState(getStoredUser());
  const [menuOpen, setMenuOpen] = useState(false);
  // View mode: the app is phone-first — a small toggle in the topbar
  // switches between Mobile and Desktop layouts (persisted per device).
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('amz_view') || (window.innerWidth < 860 ? 'mobile' : 'desktop'),
  );
  const navigate = useNavigate();

  // Validate stored token on load; a dead token drops back to login.
  useEffect(() => {
    if (!getToken()) return;
    api.me().then((r) => setUser(r.user)).catch(() => { clearAuth(); setUser(null); });
  }, []);

  // Persist the choice and drive the viewport meta so "Desktop" on a
  // phone behaves like the browser's Desktop-site mode (zoomed-out page).
  useEffect(() => {
    localStorage.setItem('amz_view', viewMode);
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.setAttribute('content', viewMode === 'desktop' ? 'width=1160' : 'width=device-width, initial-scale=1.0');
    }
  }, [viewMode]);

  if (!user) return <Login onLogin={setUser} />;

  const logout = () => {
    clearAuth();
    setUser(null);
    navigate('/');
  };

  const isMobile = viewMode === 'mobile';

  return (
    <div className={`app-root ${isMobile ? 'is-mobile' : 'is-desktop'}`}>
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <div className="main-col">
        <header className="topbar">
          <button className="hamburger" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">☰</button>
          <div className="topbar-title">Amazeon Shopping · ERP</div>
          <div className="topbar-right">
            <button
              className="view-toggle"
              onClick={() => setViewMode(isMobile ? 'desktop' : 'mobile')}
              title={isMobile ? 'Switch to Desktop view' : 'Switch to Mobile view'}
            >
              {isMobile ? '🖥️' : '📱'}
              <span className="view-toggle-label">{isMobile ? 'Desktop' : 'Mobile'}</span>
            </button>
            <span className="user-chip">👤 {user.username}</span>
            <button className="btn-logout" onClick={logout}>Logout</button>
          </div>
        </header>
        <main className="content">
          <div className="content-inner">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/profit-share" element={<ProfitShare />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/invoices/new" element={<InvoiceEditor />} />
              <Route path="/invoices/:id" element={<InvoiceView />} />
              <Route path="/invoices/:id/edit" element={<InvoiceEditor />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/purchases" element={<Purchases />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/admin" element={<AdminConfig user={user} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}
