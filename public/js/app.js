const API_BASE = '/api';
let currentUser = null;
let authToken = localStorage.getItem('streamcast_token');

function getToken() { return authToken; }

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('streamcast_token');
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', info: 'info' };
  const colors = { success: '#10B981', error: '#EF4444', warning: '#F59E0B', info: '#2D68FF' };
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg class="toast-icon ${type}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${colors[type]}" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.classList.add('exiting');setTimeout(()=>this.parentElement.remove(),300)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  `;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('exiting'); setTimeout(() => toast.remove(), 300); }, 4000);
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

function openMobileSidebar() {
  document.getElementById('sidebar').classList.add('mobile-open');
  document.getElementById('sidebar-overlay').style.display = 'block';
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').style.display = 'none';
}

const pageHandlers = {};

function registerPageHandler(page, handler) {
  pageHandlers[page] = handler;
}

async function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');
  const titleMap = {
    overview: 'Overview', streams: 'Streams', multistream: 'Multistream', srtla: 'SRT / SRTLA',
    recordings: 'Recordings', player: 'Embed Player', analytics: 'Analytics',
    settings: 'Settings', billing: 'Billing'
  };
  document.getElementById('page-title').textContent = titleMap[page] || 'Dashboard';
  document.getElementById('page-breadcrumb').textContent = page === 'overview' ? 'Dashboard' : `Dashboard / ${titleMap[page] || page}`;
  const area = document.getElementById('content-area');
  area.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:40vh;"><div class="loading-spinner"></div></div>';
  if (pageHandlers[page]) {
    await pageHandlers[page](area);
  }
  closeMobileSidebar();
}

async function initApp() {
  if (!authToken) {
    window.location.href = '/login.html';
    return;
  }
  try {
    const data = await api('/auth/me');
    currentUser = data.user;
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('user-plan').textContent = (currentUser.plan || 'starter').charAt(0).toUpperCase() + (currentUser.plan || 'starter').slice(1) + ' Plan';
    document.getElementById('user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
    const count = await api('/streams');
    const badge = document.getElementById('stream-count');
    if (badge && count.streams) badge.textContent = count.streams.length;
    navigateTo('overview');
  } catch (err) {
    showToast(err.message, 'error');
    localStorage.removeItem('streamcast_token');
    window.location.href = '/login.html';
  }
}

document.addEventListener('DOMContentLoaded', initApp);
