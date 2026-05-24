let selectedBondMode = 'aggregate';

function selectBondMode(btn) {
  document.querySelectorAll('.bond-mode-select').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedBondMode = btn.dataset.mode;
}

let srtlaSocket = null;

async function loadSrtla(area) {
  try {
    const data = await api('/srtla/bonds');
    const bonds = data.bonds || [];
    if (bonds.length === 0) {
      area.innerHTML = `
        <div class="page-header"><h1>SRT / SRTLA</h1><div class="page-header-actions"><button class="btn btn-primary" onclick="openCreateBondModal()">+ Create Bond</button></div></div>
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          <h3>No SRTLA bonds</h3>
          <p>Create a bond to aggregate multiple network connections for resilient streaming.</p>
        </div>`;
      return;
    }
    let html = `<div class="page-header"><h1>SRT / SRTLA</h1><div class="page-header-actions"><button class="btn btn-primary" onclick="openCreateBondModal()">+ Create Bond</button></div></div>`;
    html += '<div class="bond-grid">';
    for (const b of bonds) {
      html += `
        <div class="bond-card">
          <div class="bond-card-header">
            <div class="bond-card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-teal)" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              ${b.name}
            </div>
            <span class="bond-mode-badge ${b.mode}">${b.mode}</span>
          </div>
          <div class="bond-card-body">
            <div style="display:flex;gap:16px;margin-bottom:12px;font-size:0.75rem;color:var(--text-muted);">
              <span>⚡ ${b.active_interfaces || 0}/${b.interface_count || 0} active</span>
              <span>⏱ ${b.srt_latency || 120}ms latency</span>
              <span>🔒 ${b.srt_encryption || 'none'}</span>
            </div>
            <div id="bond-interfaces-${b.id}">
              <div style="font-size:0.75rem;color:var(--text-muted);text-align:center;padding:8px;">Loading interfaces...</div>
            </div>
            <div style="margin-top:12px;display:flex;gap:8px;">
              <button class="btn btn-sm btn-secondary" onclick="refreshBondStats('${b.id}')">⟳ Refresh</button>
              <button class="btn btn-sm btn-danger" onclick="deleteBond('${b.id}')">Delete</button>
            </div>
          </div>
          <div class="bond-aggregate" id="bond-aggregate-${b.id}">
            <span class="bond-aggregate-label">Aggregate Throughput</span>
            <span class="bond-aggregate-value" id="bond-total-${b.id}">— Mbps</span>
          </div>
        </div>`;
    }
    html += '</div>';
    area.innerHTML = html;
    for (const b of bonds) {
      refreshBondStats(b.id);
    }
    setupSrtlaSocket(bonds.map(b => b.id));
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p style="color:var(--accent-red)">${err.message}</p></div>`;
  }
}

function setupSrtlaSocket(bondIds) {
  if (srtlaSocket) { srtlaSocket.close(); }
  srtlaSocket = io('/srtla-monitor');
  bondIds.forEach(bondId => {
    srtlaSocket.emit('srtla:join', { bondId });
  });
  srtlaSocket.on('srtla:bond-stats', (stats) => {
    const el = document.getElementById(`bond-interfaces-${stats.bondId}`);
    const totalEl = document.getElementById(`bond-total-${stats.bondId}`);
    if (!el || !stats.interfaces) return;
    const typeColors = { cellular: 'var(--accent-red)', wifi: 'var(--accent-blue)', ethernet: 'var(--accent-green)', vpn: 'var(--accent-purple)' };
    el.innerHTML = stats.interfaces.map(iface => `
      <div class="interface-item" style="${!iface.enabled ? 'opacity:0.4;' : ''}">
        <div class="interface-type-icon ${iface.type}">
          ${iface.type === 'cellular' ? '📱' : iface.type === 'wifi' ? '📶' : iface.type === 'ethernet' ? '🔌' : '🔒'}
        </div>
        <div class="interface-info">
          <div class="interface-name">${iface.name}</div>
          <div class="interface-details">
            <span>📡 ${iface.latency}ms</span>
            <span>📉 ${iface.packetLoss}% loss</span>
            <span>🔀 ${iface.jitter}ms jitter</span>
          </div>
          <div class="interface-throughput-bar">
            <div class="interface-throughput-fill ${iface.type}" style="width:${Math.min(100, (iface.throughput / 50) * 100)}%"></div>
          </div>
        </div>
        <div class="interface-stats">
          <span class="throughput" style="color:${iface.status === 'active' ? 'var(--accent-green)' : 'var(--accent-orange)'}">${iface.throughput} Mbps</span>
          <span class="latency">${iface.status}</span>
        </div>
      </div>
    `).join('');
    if (totalEl) totalEl.textContent = stats.srtLatency ? `${stats.srtLatency}ms latency` : `${stats.totalThroughput} Mbps`;
  });
}

async function refreshBondStats(bondId) {
  try {
    const data = await api(`/srtla/bonds/${bondId}`);
    const bond = data.bond;
    if (!bond) return;
    const el = document.getElementById(`bond-interfaces-${bondId}`);
    const totalEl = document.getElementById(`bond-total-${bondId}`);
    if (!el) return;
    const interfaces = bond.interfaces || [];
    if (interfaces.length === 0) {
      el.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);text-align:center;padding:8px;">No interfaces</div>';
      return;
    }
    el.innerHTML = interfaces.map(iface => `
      <div class="interface-item" style="${!iface.enabled ? 'opacity:0.4;' : ''}">
        <div class="interface-type-icon ${iface.type}">
          ${iface.type === 'cellular' ? '📱' : iface.type === 'wifi' ? '📶' : iface.type === 'ethernet' ? '🔌' : '🔒'}
        </div>
        <div class="interface-info">
          <div class="interface-name">${iface.name}</div>
          <div class="interface-details">
            <span>Priority: ${iface.priority}</span>
            <span>${iface.ip_address || 'No IP'}</span>
          </div>
        </div>
        <div class="interface-stats">
          <span class="throughput" style="color:${iface.enabled ? 'var(--accent-green)' : 'var(--text-muted)'}">${iface.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>
    `).join('');
    if (totalEl) totalEl.textContent = `${bond.srt_latency || 120}ms latency`;
  } catch (err) {
    // Socket.IO will handle real-time updates
  }
}

async function openCreateBondModal() {
  selectedBondMode = 'aggregate';
  document.querySelectorAll('.bond-mode-select').forEach(b => b.classList.remove('active'));
  const defaultMode = document.querySelector('.bond-mode-select[data-mode="aggregate"]');
  if (defaultMode) defaultMode.classList.add('active');
  document.getElementById('bond-name').value = '';
  document.getElementById('bond-overhead').value = 25;
  document.getElementById('bond-encryption').value = 'aes-256';
  selectedLatency.bond = 120;
  document.querySelectorAll('#bond-srt-presets .latency-preset').forEach(b => b.classList.remove('active'));
  const defaultPreset = document.querySelector('#bond-srt-presets .latency-preset[data-value="120"]');
  if (defaultPreset) defaultPreset.classList.add('active');
  document.getElementById('bond-custom-latency').classList.remove('visible');
  const select = document.getElementById('bond-stream-select');
  try {
    const data = await api('/streams');
    select.innerHTML = '<option value="">Select a stream...</option>' + (data.streams || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  } catch {
    select.innerHTML = '<option value="">No streams available</option>';
  }
  openModal('create-bond-modal');
}

async function createBond() {
  const name = document.getElementById('bond-name').value.trim();
  const streamId = document.getElementById('bond-stream-select').value;
  if (!name) { showToast('Bond name is required', 'error'); return; }
  if (!streamId) { showToast('Select a stream', 'error'); return; }
  const srtLatency = selectedLatency.bond === 'custom'
    ? parseInt(document.getElementById('bond-custom-latency-value').value) || 120
    : parseInt(selectedLatency.bond);
  try {
    await api('/srtla/bonds', {
      method: 'POST',
      body: JSON.stringify({
        stream_id: streamId,
        name,
        mode: selectedBondMode,
        srt_latency: srtLatency,
        srt_overhead: parseInt(document.getElementById('bond-overhead').value) || 25,
        srt_encryption: document.getElementById('bond-encryption').value
      })
    });
    closeModal('create-bond-modal');
    showToast('Bond created');
    navigateTo('srtla');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteBond(id) {
  if (!confirm('Delete this bond?')) return;
  try {
    await api(`/srtla/bonds/${id}`, { method: 'DELETE' });
    showToast('Bond deleted');
    navigateTo('srtla');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

registerPageHandler('srtla', loadSrtla);
