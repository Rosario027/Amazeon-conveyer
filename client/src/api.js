// API client — attaches the bearer token, funnels 401s to re-login, and
// handles blob downloads (PDF / Excel / stored purchase documents).
const TOKEN_KEY = 'amz_token';
const USER_KEY = 'amz_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const getStoredUser = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
};
export const storeAuth = (token, user) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};
export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401 && token) {
    clearAuth();
    window.location.reload();
    throw new Error('Session expired.');
  }
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new Error(payload?.error || `Request failed (${res.status})`);
  return payload;
}

async function download(path, fallbackName) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const dispo = res.headers.get('content-disposition') || '';
  const match = dispo.match(/filename="?([^";]+)"?/);
  const name = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const qs = (params) => {
  const clean = Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : '';
};

export const api = {
  // auth
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/api/auth/me'),
  changePassword: (currentPassword, newPassword) => request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  // users (admin)
  users: () => request('/api/users'),
  createUser: (data) => request('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  resetPassword: (id, password) => request(`/api/users/${id}/reset-password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  deleteUser: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),
  // settings
  settings: () => request('/api/settings'),
  saveSettings: (data) => request('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
  // customers
  customers: (q) => request(`/api/customers${qs({ q })}`),
  customer: (id) => request(`/api/customers/${id}`),
  // invoices
  invoices: (filters) => request(`/api/invoices${qs(filters)}`),
  invoice: (id) => request(`/api/invoices/${id}`),
  nextInvoiceNo: () => request('/api/invoices/next-number'),
  createInvoice: (data) => request('/api/invoices', { method: 'POST', body: JSON.stringify(data) }),
  updateInvoice: (id, data) => request(`/api/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  cancelInvoice: (id) => request(`/api/invoices/${id}`, { method: 'DELETE' }),
  downloadInvoicePdf: (id, no) => download(`/api/invoices/${id}/pdf`, `${no || 'invoice'}.pdf`),
  // purchases
  purchases: (filters) => request(`/api/purchases${qs(filters)}`),
  createPurchase: (data) => request('/api/purchases', { method: 'POST', body: JSON.stringify(data) }),
  updatePurchase: (id, data) => request(`/api/purchases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePurchase: (id) => request(`/api/purchases/${id}`, { method: 'DELETE' }),
  addPurchaseFiles: (id, files) => request(`/api/purchases/${id}/files`, { method: 'POST', body: JSON.stringify({ files }) }),
  downloadPurchaseFile: (purchaseId, fileId, name) => download(`/api/purchases/${purchaseId}/files/${fileId}`, name || 'document'),
  deletePurchaseFile: (purchaseId, fileId) => request(`/api/purchases/${purchaseId}/files/${fileId}`, { method: 'DELETE' }),
  // accounts (inflow/outflow ledger)
  ledger: (from, to) => request(`/api/accounts/ledger${qs({ from, to })}`),
  createEntry: (data) => request('/api/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateEntry: (id, data) => request(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEntry: (id) => request(`/api/accounts/${id}`, { method: 'DELETE' }),
  downloadLedger: (from, to) => download(`/api/accounts/ledger.xlsx${qs({ from, to })}`, `Accounts-${from}-to-${to}.xlsx`),
  commissions: (from, to) => request(`/api/accounts/commissions${qs({ from, to })}`),
  // agents (referral commission)
  agents: () => request('/api/agents'),
  createAgent: (data) => request('/api/agents', { method: 'POST', body: JSON.stringify(data) }),
  updateAgent: (id, data) => request(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAgent: (id) => request(`/api/agents/${id}`, { method: 'DELETE' }),
  // reports
  gstSummary: (from, to) => request(`/api/reports/gst-summary${qs({ from, to })}`),
  downloadGstReport: (from, to) => download(`/api/reports/gst.xlsx${qs({ from, to })}`, `GST-Report-${from}-to-${to}.xlsx`),
  // dashboard
  dashboard: () => request('/api/dashboard'),
};

export default api;
