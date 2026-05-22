let hlsInstances = [];

function destroyHlsInstances() {
  hlsInstances.forEach(h => { try { h.destroy(); } catch(e) {} });
  hlsInstances = [];
}

function openLivePreview(streamId, streamName) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.id = 'live-preview-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:800px;">
      <div class="modal-header">
        <h2>📺 ${streamName} <span class="badge badge-green" style="margin-left:8px;">LIVE</span></h2>
        <div style="display:flex;gap:12px;align-items:center;">
          <span id="preview-latency" class="badge badge-primary" style="font-size:0.7rem;">SRT: — ms</span>
          <button class="modal-close" onclick="closeLivePreview()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <div class="modal-body">
        <div class="embed-player-preview" id="hls-player-container" style="aspect-ratio:16/9;background:#000;border-radius:var(--radius-md);overflow:hidden;position:relative;">
          <video id="hls-video" controls style="width:100%;height:100%;object-fit:contain;background:#000;" poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' viewBox='0 0 400 225'%3E%3Crect width='400' height='225' fill='%231a1a35'/%3E%3Ctext x='200' y='115' text-anchor='middle' fill='%236b6b80' font-family='Inter' font-size='18'%3ELive Preview Loading...%3C/text%3E%3C/svg%3E"></video>
          <div id="preview-health-overlay" style="position:absolute;bottom:50px;left:12px;display:flex;gap:12px;font-size:0.7rem;font-family:var(--font-mono);">
            <span style="background:rgba(0,0,0,0.7);padding:4px 10px;border-radius:6px;color:var(--accent-green);" id="preview-bitrate">— kbps</span>
            <span style="background:rgba(0,0,0,0.7);padding:4px 10px;border-radius:6px;color:var(--accent-blue);" id="preview-fps">— fps</span>
            <span style="background:rgba(0,0,0,0.7);padding:4px 10px;border-radius:6px;color:var(--accent-purple);" id="preview-viewers">— viewers</span>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:12px;align-items:center;">
          <span style="font-size:0.8rem;color:var(--text-muted);">HLS URL:</span>
          <div class="stream-key-box" style="flex:1;">
            <span class="key-value" id="preview-hls-url">https://streamcast.io/hls/${streamId}/index.m3u8</span>
            <button class="key-copy" onclick="copyText('preview-hls-url')">📋</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  initHlsPlayer(streamId);
  startPreviewHealthMonitor(streamId);
}

function closeLivePreview() {
  destroyHlsInstances();
  const overlay = document.getElementById('live-preview-overlay');
  if (overlay) overlay.remove();
  const monitor = document.getElementById('preview-health-monitor');
  if (monitor) clearInterval(monitor._interval);
}

function initHlsPlayer(streamId) {
  const video = document.getElementById('hls-video');
  if (!video) return;
  const hlsUrl = `https://streamcast.io/hls/${streamId}/index.m3u8`;
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
    hlsInstances.push(hls);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = hlsUrl;
    video.addEventListener('loadedmetadata', () => {
      video.play().catch(() => {});
    });
  }
}

function startPreviewHealthMonitor(streamId) {
  const socket = io('/live-preview');
  socket.emit('preview:join', { streamId });
  socket.on('preview:health', (data) => {
    const bitrateEl = document.getElementById('preview-bitrate');
    const fpsEl = document.getElementById('preview-fps');
    const viewersEl = document.getElementById('preview-viewers');
    const latencyEl = document.getElementById('preview-latency');
    if (bitrateEl) bitrateEl.textContent = `${data.bitrate || 0} kbps`;
    if (fpsEl) fpsEl.textContent = `${data.fps || 0} fps`;
    if (viewersEl) viewersEl.textContent = `${data.viewers || 0} viewers`;
    if (latencyEl && data.srtLatency) latencyEl.textContent = `SRT: ${data.srtLatency}ms`;
  });
  const previewEl = document.getElementById('live-preview-overlay');
  if (previewEl) {
    const observer = new MutationObserver(() => {
      if (!document.body.contains(previewEl)) {
        socket.close();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true });
  }
}

async function loadPlayer(area) {
  try {
    const data = await api('/streams');
    const streams = data.streams || [];
    const liveStreams = streams.filter(s => s.status === 'live');
    let html = `<div class="page-header"><h1>Embed Player</h1></div>`;
    html += `<div class="embed-preview">
      <div class="embed-player-preview" id="embed-player-area" style="aspect-ratio:16/9;background:linear-gradient(135deg,rgba(45,104,255,0.08),rgba(124,58,237,0.08));display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        <span style="color:var(--text-muted);font-size:0.85rem;">Select a stream to preview</span>
      </div>
      <div class="embed-controls">
        <div class="form-group">
          <label class="form-label">Select Stream</label>
          <select class="form-select" id="embed-stream-select" onchange="updateEmbedPreview()">
            <option value="">Choose a stream...</option>
            ${streams.map(s => `<option value="${s.id}" data-latency="${s.srt_latency || 120}">${s.name} (${s.status})</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Autoplay</label>
            <select class="form-select" id="embed-autoplay"><option value="1">Yes</option><option value="0">No</option></select>
          </div>
          <div class="form-group">
            <label class="form-label">Mute</label>
            <select class="form-select" id="embed-mute"><option value="1">Yes</option><option value="0">No</option></select>
          </div>
          <div class="form-group">
            <label class="form-label">Theme</label>
            <select class="form-select" id="embed-theme"><option value="dark">Dark</option><option value="light">Light</option></select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Embed Code</label>
          <div class="embed-code-box" id="embed-code-output">&lt;!-- Select a stream --&gt;</div>
          <button class="btn btn-sm btn-secondary" style="margin-top:8px;" onclick="copyText('embed-code-output')">📋 Copy Code</button>
        </div>
        ${liveStreams.length > 0 ? `<div style="margin-top:12px;padding:12px;background:rgba(16,185,129,0.08);border-radius:var(--radius-sm);border:1px solid rgba(16,185,129,0.2);">
          <strong style="font-size:0.85rem;">🔴 Live Now</strong>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
            ${liveStreams.map(s => `<button class="btn btn-sm btn-success" onclick="openLivePreview('${s.id}','${s.name}')">📺 ${s.name}</button>`).join('')}
          </div>
        </div>` : ''}
      </div>
    </div>`;
    area.innerHTML = html;
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p style="color:var(--accent-red)">${err.message}</p></div>`;
  }
}

function updateEmbedPreview() {
  const select = document.getElementById('embed-stream-select');
  const streamId = select.value;
  const output = document.getElementById('embed-code-output');
  const preview = document.getElementById('embed-player-area');
  if (!streamId) {
    output.textContent = '<!-- Select a stream -->';
    return;
  }
  const autoplay = document.getElementById('embed-autoplay').value === '1';
  const mute = document.getElementById('embed-mute').value === '1';
  const theme = document.getElementById('embed-theme').value;
  preview.innerHTML = `
    <video id="embed-video-preview" controls style="width:100%;height:100%;object-fit:contain;background:#000;" poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225'%3E%3Crect width='400' height='225' fill='%231a1a35'/%3E%3Ctext x='200' y='115' text-anchor='middle' fill='%236b6b80' font-family='Inter' font-size='18'%3E${select.options[select.selectedIndex].text}%3C/text%3E%3C/svg%3E"></video>`;
  const code = `<iframe src="${window.location.origin}/embed/${streamId}?autoplay=${autoplay ? 1 : 0}&mute=${mute ? 1 : 0}&theme=${theme}" width="100%" height="100%" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="aspect-ratio:16/9;border-radius:8px;"></iframe>`;
  output.textContent = code;
}

registerPageHandler('player', loadPlayer);
