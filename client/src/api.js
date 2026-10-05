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

// Streams a file the API returns as an attachment and hands it to the browser.
async function download(path) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Download failed (${res.status})`);
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'download';
  return { blob: await res.blob(), filename };
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

  parseProof: (message) =>
    request('/proof/parse', { method: 'POST', body: JSON.stringify({ message }) }),

  paymentsMe: () => request('/payments/me'),
  requestPayment: (id, proofMessage) =>
    request(`/payments/${id}/request`, { method: 'POST', body: JSON.stringify({ proof_message: proofMessage }) }),
  updatePaymentProof: (id, proofMessage) =>
    request(`/payments/${id}/proof`, { method: 'PATCH', body: JSON.stringify({ proof_message: proofMessage }) }),

  adminPayments: () => request('/admin/payments'),
  approvePayment: (id) => request(`/admin/payments/${id}/approve`, { method: 'POST' }),
  rejectPayment: (id) => request(`/admin/payments/${id}/reject`, { method: 'POST' }),
  finePayment: (id, amount, reason = '') =>
    request(`/admin/payments/${id}/fine`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason }),
    }),
  setPaymentDueDate: (id, dueDate) =>
    request(`/admin/payments/${id}/due-date`, {
      method: 'PATCH',
      body: JSON.stringify({ due_date: dueDate }),
    }),
  exportMonth: (period) => download(`/admin/payments/export?period=${encodeURIComponent(period)}`),
  exportMyMonth: (period) => download(`/payments/me/export?period=${encodeURIComponent(period)}`),

  contributions: () => request('/contributions'),
  payContribution: (id, proofMessage) =>
    request(`/contributions/${id}/pay`, { method: 'POST', body: JSON.stringify({ proof_message: proofMessage }) }),
  cancelContribution: (id) => request(`/contributions/${id}/cancel`, { method: 'POST' }),
  updateContributionProof: (id, proofMessage) =>
    request(`/contributions/${id}/proof`, { method: 'PATCH', body: JSON.stringify({ proof_message: proofMessage }) }),

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
  smsStatus: () => request('/admin/sms/status'),
  smsReminders: () => request('/admin/sms/reminders'),
  sendSmsReminders: () => request('/admin/sms/send', { method: 'POST' }),

  createMember: (data) => request('/admin/members', { method: 'POST', body: JSON.stringify(data) }),
  setRole: (id, role) =>
    request(`/admin/members/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  setDesignation: (id, designation) =>
    request(`/admin/members/${id}/designation`, {
      method: 'PATCH',
      body: JSON.stringify({ designation }),
    }),
  setMemberPhone: (id, phone) =>
    request(`/admin/members/${id}/phone`, {
      method: 'PATCH',
      body: JSON.stringify({ phone }),
    }),
  setMemberStatus: (id, status) =>
    request(`/admin/members/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  changePassword: (data) =>
    request('/members/me/password', { method: 'POST', body: JSON.stringify(data) }),
};