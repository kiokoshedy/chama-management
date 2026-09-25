const API = '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export const api = {
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/auth/me'),
  updateMe: (data) => request('/members/me', { method: 'PATCH', body: JSON.stringify(data) }),
  members: () => request('/members'),
  memberProfile: (id) => request(`/members/${id}`),
  constitution: () => request('/constitution'),
  constitutionFile: async () => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/constitution/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return { blob: await res.blob(), mime: res.headers.get('Content-Type') || '' };
  },
  uploadConstitution: async (file) => {
    const token = localStorage.getItem('token');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API}/admin/constitution`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error || `Upload failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return body;
  },

  paymentsMe: () => request('/payments/me'),
  requestPayment: (id) => request(`/payments/${id}/request`, { method: 'POST' }),

  adminPayments: () => request('/admin/payments'),
  approvePayment: (id) => request(`/admin/payments/${id}/approve`, { method: 'POST' }),
  rejectPayment: (id) => request(`/admin/payments/${id}/reject`, { method: 'POST' }),
  finePayment: (id, amount, reason = '') =>
    request(`/admin/payments/${id}/fine`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason }),
    }),

  contributions: () => request('/contributions'),
  payContribution: (id) => request(`/contributions/${id}/pay`, { method: 'POST' }),
  cancelContribution: (id) => request(`/contributions/${id}/cancel`, { method: 'POST' }),

  adminContributions: () => request('/admin/contributions'),
  createContribution: (data) =>
    request('/admin/contributions', { method: 'POST', body: JSON.stringify(data) }),
  updateContribution: (id, data) =>
    request(`/admin/contributions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  approveContributionPayment: (cid, pid) =>
    request(`/admin/contributions/${cid}/payments/${pid}/approve`, { method: 'POST' }),
  resetContributionPayment: (cid, pid) =>
    request(`/admin/contributions/${cid}/payments/${pid}/reset`, { method: 'POST' }),

  settings: () => request('/admin/settings'),
  saveSettings: (data) =>
    request('/admin/settings', { method: 'PUT', body: JSON.stringify(data) }),

  createMember: (data) => request('/admin/members', { method: 'POST', body: JSON.stringify(data) }),
  setRole: (id, role) =>
    request(`/admin/members/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  setDesignation: (id, designation) =>
    request(`/admin/members/${id}/designation`, {
      method: 'PATCH',
      body: JSON.stringify({ designation }),
    }),
  setMemberStatus: (id, status) =>
    request(`/admin/members/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  changePassword: (data) =>
    request('/members/me/password', { method: 'POST', body: JSON.stringify(data) }),
};