// Projects — live projects first (5 per view), then closed and deleted
// projects greyed out at the bottom. Excel export of everything.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';
import { stageLabel } from '../utils/stages.js';
import { IconDownload, IconChevronDown, IconChevronRight } from '../icons.jsx';

const money = (n) => `₹ ${formatINR(n)}`;
const PAGE = 5; // list limit in a single view

const emptyForm = () => ({ name: '', customerName: '', supplierName: '', supplierPayable: '', owner1Share: 50, notes: '' });

function ProjectCard({ p, dim, onOpen, onRestore }) {
  return (
    <div className={`proj-card ${dim ? 'proj-dim' : ''}`} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="proj-card-head">
        <div>
          <div className="proj-name">{p.name}</div>
          <div className="proj-sub">{p.code}{p.customerName ? ` · ${p.customerName}` : ''} · split {p.summary.owner1Share}／{p.summary.owner2Share}</div>
        </div>
        <div className="proj-badges">
          {p.deletedAt
            ? <span className="badge badge-red" style={{ marginLeft: 0 }}>deleted</span>
            : <span className={`badge ${p.summary.closed ? 'badge-slate' : 'badge-blue'}`} style={{ marginLeft: 0 }}>{stageLabel(p.stage)}</span>}
        </div>
      </div>
      <div className="proj-stats">
        <div><em>Invoiced</em><b>{money(p.summary.invoiced)}</b></div>
        <div><em>Receivable</em><b style={{ color: p.summary.receivable > 0 ? 'var(--orange-dark)' : 'var(--green)' }}>{money(p.summary.receivable)}</b></div>
        <div><em>Supplier bal.</em><b>{money(p.summary.supplierBalance)}</b></div>
        <div><em>P&amp;L</em><b style={{ color: p.summary.pnl < 0 ? 'var(--red)' : 'var(--green)' }}>{money(p.summary.pnl)}</b></div>
      </div>
      {p.deletedAt && (
        <div className="proj-deleted-note">
          <span>Reason: {p.deletedReason || '—'}{p.deletedBy ? ` · by ${p.deletedBy}` : ''}</span>
          <button className="mini-btn" onClick={(e) => { e.stopPropagation(); onRestore(); }}>Restore</button>
        </div>
      )}
    </div>
  );
}

// Kept at module scope so it isn't re-created (and re-mounted) on every
// render of the page.
function Section({ title, list, page, setPage, dim, count, onOpen, onRestore }) {
  const shown = list.slice(0, page * PAGE);
  return (
    <>
      <div className="section-head">
        <h2>{title} <span className="muted h-sub">{count}</span></h2>
      </div>
      <div className="proj-grid">
        {shown.map((p) => (
          <ProjectCard key={p.id} p={p} dim={dim} onOpen={() => onOpen(p)} onRestore={() => onRestore(p)} />
        ))}
      </div>
      {list.length > shown.length && (
        <div className="more-row">
          <button className="btn btn-ghost" onClick={() => setPage(page + 1)}>
            Show {Math.min(PAGE, list.length - shown.length)} more ({list.length - shown.length} hidden)
          </button>
        </div>
      )}
    </>
  );
}

export default function Projects() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [livePage, setLivePage] = useState(1);
  const [closedPage, setClosedPage] = useState(1);
  const [delPage, setDelPage] = useState(1);
  const [showClosed, setShowClosed] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);

  const load = async (filters = {}) => {
    setLoading(true);
    try { setRows(await api.projects({ include: 'all', ...filters })); setError(''); } catch (e) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => {
    load();
    api.settings().then(setSettings).catch(() => {});
  }, []);

  const o1 = settings?.owner1Name || 'Pradeep';
  const o2 = settings?.owner2Name || 'Sony John';

  const { live, closed, deleted } = useMemo(() => ({
    live: rows.filter((p) => !p.deletedAt && !p.summary.closed),
    closed: rows.filter((p) => !p.deletedAt && p.summary.closed),
    deleted: rows.filter((p) => p.deletedAt),
  }), [rows]);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const p = await api.createProject(form);
      setForm(emptyForm());
      setShowForm(false);
      navigate(`/projects/${p.id}`);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const restore = async (p) => {
    if (!window.confirm(`Restore "${p.name}"?`)) return;
    try { await api.restoreProject(p.id); await load({ q }); } catch (e) { setError(e.message); }
  };

  const exportXlsx = async () => {
    try { await api.downloadProjects(); } catch (e) { setError(e.message); }
  };

  const section = (title, list, page, setPage, dim, count) => (
    <Section
      title={title} list={list} page={page} setPage={setPage} dim={dim} count={count}
      onOpen={(p) => navigate(`/projects/${p.id}`)} onRestore={restore}
    />
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Projects</h1>
        <div className="page-actions">
          <button className="btn" onClick={exportXlsx}><IconDownload /> Excel</button>
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : '+ New Project'}</button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      {showForm && (
        <div className="card">
          <h2>New Project</h2>
          <div className="form-grid">
            <label>Project name <span className="req">*</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Salem plant conveyor install" autoFocus />
            </label>
            <label>Customer
              <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="who this project is for" />
            </label>
            <label>Supplier
              <input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} placeholder="main supplier (optional)" />
            </label>
            <label>Total payable to supplier (₹)
              <input type="number" min="0" step="any" value={form.supplierPayable} onChange={(e) => setForm({ ...form, supplierPayable: e.target.value })} />
            </label>
            <label>{o1}'s share of P&amp;L (%)
              <input type="number" min="0" max="100" step="any" value={form.owner1Share} onChange={(e) => setForm({ ...form, owner1Share: e.target.value })} />
            </label>
            <div className="hint">{o2} gets the remaining {Math.round((100 - (Number(form.owner1Share) || 0)) * 100) / 100}% — editable later from the project page.</div>
            <label className="span2">Notes
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
            </label>
          </div>
          <div className="page-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={create} disabled={busy || !form.name.trim()}>{busy ? 'Creating…' : 'Create Project'}</button>
          </div>
        </div>
      )}

      <div className="card filter-bar">
        <input className="filter-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load({ q })} placeholder="Search project / customer / supplier" />
        <button className="btn" onClick={() => load({ q })}>Search</button>
        <button className="btn btn-ghost" onClick={() => { setQ(''); load(); }}>Clear</button>
      </div>

      {!loading && rows.length === 0 && (
        <div className="card"><div className="muted empty-row" style={{ textAlign: 'center' }}>No projects yet — create your first one; invoices and payments all hang off projects.</div></div>
      )}

      {live.length > 0 && section('Active projects', live, livePage, setLivePage, false, `${live.length} running`)}

      {closed.length > 0 && (
        <div className="closed-block">
          <button className="section-toggle" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? <IconChevronDown /> : <IconChevronRight />} Completed projects ({closed.length})
          </button>
          {showClosed && section('Completed', closed, closedPage, setClosedPage, true, `${closed.length} closed`)}
        </div>
      )}

      {deleted.length > 0 && (
        <div className="closed-block">
          <button className="section-toggle" onClick={() => setShowDeleted((v) => !v)}>
            {showDeleted ? <IconChevronDown /> : <IconChevronRight />} Deleted projects ({deleted.length})
          </button>
          {showDeleted && section('Deleted', deleted, delPage, setDelPage, true, `${deleted.length} removed — kept for the record`)}
        </div>
      )}
    </div>
  );
}
