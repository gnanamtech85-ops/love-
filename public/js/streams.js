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
              <span>📡 ${s.protocol || 'rtmp'}</span>
            </div>
            <div class="stream-card-actions">
              ${isLive
                ? `<button class="btn-sm live-btn" onclick="stopStream('${s.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>Stop</button>
                   <button class="btn-sm" onclick="openLivePreview('${s.id}','${s.name.replace(/'/g,"\\'")}','${s.stream_key}')">▶ Preview</button>`
                : `<button class="btn-sm go-live" onclick="showGoLiveModal('${s.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>Go Live</button>`}
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
  const protocol = document.getElementById('new-stream-protocol').value;
  try {
    await api('/streams', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: document.getElementById('new-stream-desc').value.trim(),
        region: document.getElementById('new-stream-region').value,
        protocol,
        srt_latency: srtLatency,
        srt_overhead: 25,
        srt_encryption: 'none',
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

// Shows the ingest info modal first — user connects OBS, then clicks "Mark as Live"
async function showGoLiveModal(id) {
  try {
    const data = await api(`/streams/${id}`);
    showIngestInfo(data.stream);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showIngestInfo(s) {
  const protocol = s.protocol || 'rtmp';
  // Build the real server host (use server hostname with port 1935 for RTMP)
  const serverHost = window.location.hostname;
  const rtmpUrl = `rtmp://${serverHost}:1935/live`;
  const ingestUrl = protocol === 'srt' ? (s.srt_url || `srt://${serverHost}:9000?streamid=${s.stream_key}`) : rtmpUrl;
  const hlsUrl = `http://${serverHost}:${window.location.port || 3000}/live/${s.stream_key}/index.m3u8`;

  // Remove any existing overlay
  const existing = document.getElementById('ingest-info-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.id = 'ingest-info-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <h2>🎬 Connect OBS to Go Live</h2>
        <button class="modal-close" onclick="document.getElementById('ingest-info-overlay').remove()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div style="padding:12px;background:rgba(16,185,129,0.08);border-radius:var(--radius-sm);border-left:3px solid var(--accent-green);font-size:0.85rem;margin-bottom:16px;">
          <strong>Step 1:</strong> Copy the settings below into OBS.<br>
          <strong>Step 2:</strong> Start streaming in OBS — the server will auto-detect it.<br>
          <strong>Step 3:</strong> Click <strong>"Mark as LIVE"</strong> below after OBS starts streaming.
        </div>
        <div class="form-group">
          <label class="form-label">OBS Server (RTMP URL)</label>
          <div class="stream-key-box">
            <span class="key-value" id="ingest-rtmp-url">${rtmpUrl}</span>
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
        ${protocol === 'srt' ? `
        <div class="form-group">
          <label class="form-label">SRT URL (if using SRT)</label>
          <div class="stream-key-box">
            <span class="key-value" id="ingest-srt-url">${ingestUrl}</span>
            <button class="key-copy" onclick="copyText('ingest-srt-url')">📋</button>
          </div>
        </div>` : ''}
        <div class="form-group">
          <label class="form-label">HLS Playback URL (for viewers)</label>
          <div class="stream-key-box">
            <span class="key-value" id="ingest-hls-url">${hlsUrl}</span>
            <button class="key-copy" onclick="copyText('ingest-hls-url')">📋</button>
          </div>
        </div>
        <div style="margin-top:12px;padding:12px;background:rgba(45,104,255,0.06);border-radius:var(--radius-sm);font-size:0.82rem;color:var(--text-secondary);">
          <strong style="color:var(--text-primary);">OBS Settings:</strong><br>
          Settings → Stream → Service: <strong>Custom...</strong><br>
          Server: <strong>${rtmpUrl}</strong><br>
          Stream Key: <strong>${s.stream_key}</strong>
        </div>
      </div>
      <div class="modal-footer" style="padding:16px 24px;display:flex;justify-content:flex-end;gap:8px;">
        <button class="btn btn-secondary" onclick="document.getElementById('ingest-info-overlay').remove()">Close</button>
        <button class="btn btn-primary" id="mark-live-btn" onclick="markStreamLive('${s.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>
          Mark as LIVE
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function markStreamLive(id) {
  const btn = document.getElementById('mark-live-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Starting...'; }
  try {
    await api(`/streams/${id}/start`, { method: 'POST' });
    const existing = document.getElementById('ingest-info-overlay');
    if (existing) existing.remove();
    showToast('🔴 Stream is now LIVE!', 'success');
    navigateTo('streams');
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Mark as LIVE'; }
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
    const serverHost = window.location.hostname;
    const serverPort = window.location.port || 3000;
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <h1>${s.name}</h1>
        <div class="page-header-actions">
          <button class="btn btn-secondary" onclick="navigateTo('streams')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>Back</button>
          ${s.status === 'live'
            ? `<button class="btn btn-danger" onclick="stopStream('${s.id}')">⏹ Stop Stream</button>`
            : `<button class="btn btn-primary" onclick="showGoLiveModal('${s.id}')">🔴 Go Live</button>`}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div class="srt-config-section">
          <h4 style="margin-bottom:16px;">Stream Info</h4>
          <div style="font-size:0.82rem;margin-bottom:12px;">
            <label class="form-label">RTMP URL (OBS Server)</label>
            <div class="stream-key-box"><span class="key-value" id="detail-rtmp">rtmp://${serverHost}:1935/live</span><button class="key-copy" onclick="copyText('detail-rtmp')">📋</button></div>
          </div>
          <div style="font-size:0.82rem;margin-bottom:12px;">
            <label class="form-label">Stream Key</label>
            <div class="stream-key-box"><span class="key-value" id="detail-key">${s.stream_key}</span><button class="key-copy" onclick="copyText('detail-key')">📋</button></div>
          </div>
          <div style="font-size:0.82rem;margin-bottom:12px;">
            <label class="form-label">SRT URL</label>
            <div class="stream-key-box"><span class="key-value" id="detail-srt">${s.srt_url}</span><button class="key-copy" onclick="copyText('detail-srt')">📋</button></div>
          </div>
          <div style="font-size:0.82rem;margin-bottom:12px;">
            <label class="form-label">HLS Playback URL (for viewers)</label>
            <div class="stream-key-box"><span class="key-value" id="detail-hls">http://${serverHost}:${serverPort}/live/${s.stream_key}/index.m3u8</span><button class="key-copy" onclick="copyText('detail-hls')">📋</button></div>
          </div>
          <div style="margin-top:12px;display:flex;gap:16px;font-size:0.85rem;color:var(--text-secondary);">
            <span>Status: <strong style="color:${s.status === 'live' ? 'var(--accent-green)' : 'var(--text-muted)'}">${s.status}</strong></span>
            <span>Region: <strong>${s.region}</strong></span>
            <span>Protocol: <strong>${(s.protocol || 'rtmp').toUpperCase()}</strong></span>
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
                <button class="btn btn-sm btn-ghost" onclick="removeDestination('${s.id}','${d.id}')" style="color:var(--accent-red);padding:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
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

let streamMonitorSocket = null;

function connectStreamMonitor() {
  if (streamMonitorSocket) streamMonitorSocket.close();
  streamMonitorSocket = io('/stream-monitor');
  streamMonitorSocket.on('stream:started', () => { refreshStreams(); });
  streamMonitorSocket.on('stream:stopped', () => { refreshStreams(); });
}

async function refreshStreams() {
  const area = document.getElementById('content-area');
  const currentPage = document.querySelector('.nav-item.active')?.dataset?.page;
  if (currentPage === 'streams' || currentPage === 'overview') {
    await loadStreams(area);
  }
  const badge = document.getElementById('stream-count');
  try {
    const data = await api('/streams');
    if (badge && data.streams) badge.textContent = data.streams.length;
  } catch (e) {}
}

async function loadOverview(area) {
  try {
    const data = await api('/streams');
    const streams = data.streams || [];
    const liveCount = streams.filter(s => s.status === 'live').length;
    const totalDests = streams.reduce((sum, s) => sum + (s.destination_count || 0), 0);
    const rtmpStreams = streams.filter(s => (s.protocol || 'rtmp') === 'rtmp');
    const srtStreams = streams.filter(s => s.protocol === 'srt');
    const serverHost = window.location.hostname;
    const serverPort = window.location.port || 3000;
    area.innerHTML = `
      <div class="page-header"><h1>Overview</h1></div>
      <div class="stats-grid">
        <div class="stat-card blue">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Streams</span>
            <div class="stat-card-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></div>
          </div>
          <div class="stat-card-value">${streams.length}</div>
          <div style="font-size:0.7rem;color:var(--text-muted);">${liveCount} live, ${streams.length - liveCount} offline</div>
        </div>
        <div class="stat-card green">
          <div class="stat-card-header">
            <span class="stat-card-title">Live Now</span>
            <div class="stat-card-icon green"><span class="dot" style="width:12px;height:12px;background:var(--accent-green);"></span></div>
          </div>
          <div class="stat-card-value">${liveCount}</div>
          <div style="font-size:0.7rem;color:var(--text-muted);">${rtmpStreams.length} RTMP / ${srtStreams.length} SRT</div>
        </div>
        <div class="stat-card purple">
          <div class="stat-card-header">
            <span class="stat-card-title">Destinations</span>
            <div class="stat-card-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
          </div>
          <div class="stat-card-value">${totalDests}</div>
          <div style="font-size:0.7rem;color:var(--text-muted);">Across all streams</div>
        </div>
      </div>
      <div class="srt-config-section" style="margin-top:24px;">
        <h4 style="margin-bottom:16px;">OBS Quick Setup</h4>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px;">
          Configure OBS: Settings → Stream → Service: <strong>Custom...</strong>
        </p>
        <p style="font-size:0.85rem;color:var(--text-secondary);">
          <strong>RTMP Server:</strong> rtmp://${serverHost}:1935/live<br>
          <strong>Stream Key:</strong> (copy from your stream's settings)<br>
          <strong>HLS Viewer URL:</strong> http://${serverHost}:${serverPort}/live/STREAM_KEY/index.m3u8
        </p>
      </div>
      <div class="srt-config-section" style="margin-top:16px;">
        <h4 style="margin-bottom:16px;">Live Streams</h4>
        <div id="overview-stream-list">
          ${liveCount > 0 ? streams.filter(s => s.status === 'live').map(s => `
            <div class="destination-row">
              <div class="destination-info">
                <div class="destination-name">${s.name}</div>
                <div class="destination-url">${s.stream_key ? s.stream_key.substring(0, 16) + '...' : ''}</div>
              </div>
              <div class="destination-status live"></div>
              <button class="btn btn-sm btn-ghost" onclick="openLivePreview('${s.id}','${s.name.replace(/'/g,"\\'")}','${s.stream_key}')">▶ Preview</button>
              <button class="btn btn-sm btn-ghost" onclick="stopStream('${s.id}')" style="color:var(--accent-red);">⏹ Stop</button>
            </div>
          `).join('') : '<div style="color:var(--text-muted);font-size:0.85rem;padding:12px;">No live streams. Go to Streams → Go Live to start.</div>'}
        </div>
      </div>`;
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p style="color:var(--accent-red)">${err.message}</p></div>`;
  }
  connectStreamMonitor();
}

registerPageHandler('streams', loadStreams);
registerPageHandler('overview', loadOverview);
connectStreamMonitor();
