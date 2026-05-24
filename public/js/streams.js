let selectedLatency = { modal: 90, bond: 120, dest: 120 };

function selectLatencyPreset(btn, context) {
  const container = btn.closest('.srt-latency-presets') || btn.parentElement;
  container.querySelectorAll('.latency-preset').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const val = btn.dataset.value;
  selectedLatency[context] = val;
  const customInput = document.getElementById(`${context}-custom-latency`);
  if (customInput) {
    customInput.classList.toggle('visible', val === 'custom');
  }
}

function toggleSRTLatencyInModal() {
  const protocol = document.getElementById('new-stream-protocol').value;
  const section = document.getElementById('modal-srt-latency-section');
  section.style.display = protocol === 'srt' ? 'block' : 'none';
}

async function loadStreams(area) {
  try {
    const data = await api('/streams');
    const streams = data.streams || [];
    if (document.getElementById('stream-count')) {
      document.getElementById('stream-count').textContent = streams.length;
    }
    if (streams.length === 0) {
      area.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <h3>No streams yet</h3>
          <p>Create your first live stream to get started.</p>
          <button class="btn btn-primary" onclick="openCreateStreamModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Create Stream</button>
        </div>`;
      return;
    }
    let html = `<div class="page-header"><h1>Streams</h1><div class="page-header-actions"><button class="btn btn-primary" onclick="openCreateStreamModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Stream</button></div></div>`;
    html += '<div class="stream-grid">';
    for (const s of streams) {
      const isLive = s.status === 'live';
      const stats = s.stats || {};
      html += `
        <div class="stream-card">
          <div class="stream-card-preview">
            <div class="preview-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="${isLive ? '#10B981' : '#4a4a5e'}" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
              <span>${isLive ? 'Streaming...' : 'Offline'}</span>
            </div>
            <div class="stream-status ${s.status}"><span class="dot"></span>${s.status}</div>
            <div class="stream-health">${isLive ? `
              <div class="stream-health-item"><span class="label">📺</span><span class="value">${s.destination_count || 0}</span></div>
              <div class="stream-health-item"><span class="label">⚡</span><span class="value">${s.srt_latency || 120}ms</span></div>
            ` : ''}</div>
          </div>
          <div class="stream-card-body">
            <div class="stream-card-name">${s.name}</div>
            <div class="stream-card-meta">
              <span>📍 ${s.region || 'us-east'}</span>
              <span>🔑 ${s.stream_key ? s.stream_key.substring(0, 8) + '...' : ''}</span>
            </div>
            <div class="stream-card-actions">
              ${isLive ? `<button class="btn-sm live-btn" onclick="stopStream('${s.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>Stop</button>`
                       : `<button class="btn-sm go-live" onclick="startStream('${s.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>Go Live</button>`}
              <button class="btn-sm" onclick="showStreamDetail('${s.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>Details</button>
              <button class="btn-sm" onclick="deleteStream('${s.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
          </div>
        </div>`;
    }
    html += '</div>';
    area.innerHTML = html;
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p style="color:var(--accent-red)">${err.message}</p></div>`;
  }
}

async function createStream() {
  const name = document.getElementById('new-stream-name').value.trim();
  if (!name) { showToast('Stream name is required', 'error'); return; }
  const srtLatency = selectedLatency.modal === 'custom'
    ? parseInt(document.getElementById('modal-custom-latency-value').value) || 120
    : parseInt(selectedLatency.modal);
  try {
    await api('/streams', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: document.getElementById('new-stream-desc').value.trim(),
        region: document.getElementById('new-stream-region').value,
        srt_latency: srtLatency,
        recording_enabled: document.getElementById('new-stream-recording').checked
      })
    });
    closeModal('create-stream-modal');
    showToast('Stream created successfully');
    navigateTo('streams');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function startStream(id) {
  try {
    const data = await api(`/streams/${id}`);
    const s = data.stream;
    showIngestInfo(s);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showIngestInfo(s) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.id = 'ingest-info-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header">
        <h2>🎬 Connect OBS to Stream</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="info-box-success" style="margin-bottom:16px;padding:12px;background:rgba(16,185,129,0.08);border-radius:var(--radius-sm);border-left:3px solid var(--accent-green);font-size:0.85rem;">
          Point your encoder (OBS, vMix, Wirecast) to the RTMP URL below. The stream will auto-detect when you start broadcasting.
        </div>
        <div class="form-group">
          <label class="form-label">RTMP URL</label>
          <div class="stream-key-box">
            <span class="key-value" id="ingest-rtmp-url">${s.ingest_url || s.rtmp_url}</span>
            <button class="key-copy" onclick="copyText('ingest-rtmp-url')">📋</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Stream Key</label>
          <div class="stream-key-box">
            <span class="key-value" id="ingest-stream-key">${s.stream_key}</span>
            <button class="key-copy" onclick="copyText('ingest-stream-key')">📋</button>
          </div>
        </div>
        <div class="form-group" style="margin-top:8px;">
          <label class="form-label">HLS Playback URL</label>
          <div class="stream-key-box">
            <span class="key-value" id="ingest-hls-url">${window.location.origin}${s.hls_url}</span>
            <button class="key-copy" onclick="copyText('ingest-hls-url')">📋</button>
          </div>
        </div>
        <div style="margin-top:16px;padding:16px;background:rgba(45,104,255,0.06);border-radius:var(--radius-sm);font-size:0.85rem;color:var(--text-secondary);">
          <strong style="color:var(--text-primary);">How to set up in OBS:</strong><br>
          1. Open OBS → Settings → Stream<br>
          2. Service: <strong>Custom...</strong><br>
          3. Server: paste the <strong>RTMP URL</strong> above<br>
          4. Stream Key: paste the <strong>Stream Key</strong> above<br>
          5. Click OK → Start Streaming
        </div>
      </div>
      <div class="modal-footer" style="padding:16px 24px;display:flex;justify-content:flex-end;gap:8px;">
        <button class="btn btn-secondary" onclick="document.getElementById('ingest-info-overlay').remove()">Close</button>
        <button class="btn btn-primary" onclick="startStreamDirect('${s.id}')">Mark as Live (Manual)</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function startStreamDirect(id) {
  try {
    await api(`/streams/${id}/start`, { method: 'POST' });
    document.getElementById('ingest-info-overlay').remove();
    showToast('Stream marked as LIVE');
    navigateTo('streams');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function stopStream(id) {
  try {
    await api(`/streams/${id}/stop`, { method: 'POST' });
    showToast('Stream stopped');
    navigateTo('streams');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteStream(id) {
  if (!confirm('Delete this stream permanently?')) return;
  try {
    await api(`/streams/${id}`, { method: 'DELETE' });
    showToast('Stream deleted');
    navigateTo('streams');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function showStreamDetail(id) {
  try {
    const data = await api(`/streams/${id}`);
    const s = data.stream;
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <h1>${s.name}</h1>
        <div class="page-header-actions">
          <button class="btn btn-secondary" onclick="navigateTo('streams')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>Back</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div class="srt-config-section">
          <h4 style="margin-bottom:16px;">Stream Info</h4>
          <div class="stream-key-box"><span class="key-value" id="detail-rtmp">${s.rtmp_url}</span><button class="key-copy" onclick="copyText('detail-rtmp')">📋</button></div>
          <div style="margin-top:8px;" class="stream-key-box"><span class="key-value" id="detail-srt">${s.srt_url}</span><button class="key-copy" onclick="copyText('detail-srt')">📋</button></div>
          <div style="margin-top:16px;"><strong>Stream Key:</strong> <span class="text-mono" style="color:var(--accent-teal);font-size:0.85rem;" id="detail-key">${s.stream_key}</span> <button class="key-copy" onclick="copyText('detail-key')">📋</button></div>
          <div style="margin-top:8px;"><strong>HLS URL:</strong> <span class="text-mono" style="font-size:0.85rem;" id="detail-hls">${window.location.origin}${s.hls_url}</span> <button class="key-copy" onclick="copyText('detail-hls')">📋</button></div>
          <div style="margin-top:12px;display:flex;gap:16px;font-size:0.85rem;color:var(--text-secondary);">
            <span>Status: <strong style="color:${s.status === 'live' ? 'var(--accent-green)' : 'var(--text-muted)'}">${s.status}</strong></span>
            <span>Region: <strong>${s.region}</strong></span>
            <span>SRT Latency: <strong>${s.srt_latency}ms</strong></span>
          </div>
        </div>
        <div class="srt-config-section">
          <h4 style="margin-bottom:16px;">Destinations (${(s.destinations || []).length})</h4>
          <div class="destination-list" id="detail-destinations">
            ${(s.destinations || []).map(d => `
              <div class="destination-row">
                <div class="destination-platform-icon" style="background:${d.platform === 'youtube' ? '#FF0000' : d.platform === 'twitch' ? '#9146FF' : d.platform === 'facebook' ? '#1877F2' : d.platform === 'kick' ? '#53FC18' : '#333'};color:${d.platform === 'kick' ? '#000' : '#fff'}">${d.platform_name.substring(0, 2).toUpperCase()}</div>
                <div class="destination-info"><div class="destination-name">${d.platform_name}</div><div class="destination-url">${d.rtmp_url || d.srt_url || ''}</div></div>
                <div class="destination-status ${d.status}"></div>
              </div>
            `).join('') || '<div style="color:var(--text-muted);font-size:0.85rem;">No destinations configured</div>'}
          </div>
          <button class="btn btn-sm btn-secondary" style="margin-top:12px;" onclick="openAddDestinationModal('${s.id}')">+ Add Destination</button>
        </div>
      </div>`;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function copyText(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const text = el.textContent || el.innerText;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied!')).catch(fallbackCopy);
  } else {
    fallbackCopy(text);
  }
  function fallbackCopy(val) {
    const ta = document.createElement('textarea');
    ta.value = val;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('Copied!'); } catch (e) { showToast('Failed to copy', 'error'); }
    document.body.removeChild(ta);
  }
}

function openCreateStreamModal() {
  document.getElementById('new-stream-name').value = '';
  document.getElementById('new-stream-desc').value = '';
  document.getElementById('new-stream-region').value = 'us-east';
  document.getElementById('new-stream-protocol').value = 'rtmp';
  selectedLatency.modal = 90;
  document.querySelectorAll('#modal-srt-presets .latency-preset').forEach(b => b.classList.remove('active'));
  const defaultPreset = document.querySelector('#modal-srt-presets .latency-preset[data-value="90"]');
  if (defaultPreset) defaultPreset.classList.add('active');
  document.getElementById('modal-custom-latency').classList.remove('visible');
  document.getElementById('modal-srt-latency-section').style.display = 'none';
  document.getElementById('new-stream-recording').checked = true;
  openModal('create-stream-modal');
}

registerPageHandler('streams', loadStreams);
