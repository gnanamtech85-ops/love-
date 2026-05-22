async function loadRecordings(area) {
  try {
    const data = await api('/recordings');
    const recordings = data.recordings || [];
    if (recordings.length === 0) {
      area.innerHTML = `
        <div class="page-header"><h1>Recordings</h1></div>
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
          <h3>No recordings</h3>
          <p>Recordings from your live streams will appear here.</p>
        </div>`;
      return;
    }
    let html = `<div class="page-header"><h1>Recordings</h1><span style="color:var(--text-muted);font-size:0.85rem;">${recordings.length} recordings</span></div>`;
    for (const r of recordings) {
      const dur = r.duration ? formatDuration(r.duration) : '—';
      const size = r.size ? formatSize(r.size) : '—';
      html += `
        <div class="recording-card" style="margin-bottom:12px;">
          <div class="recording-thumbnail">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
          </div>
          <div class="recording-info">
            <div class="recording-title">${r.filename}</div>
            <div class="recording-meta">
              <span>📺 ${r.stream_name || '—'}</span>
              <span>⏱ ${dur}</span>
              <span>💾 ${size}</span>
              <span>📁 ${r.format || 'mp4'}</span>
            </div>
            <div style="margin-top:8px;display:flex;gap:8px;">
              <button class="btn btn-sm btn-secondary" onclick="playRecording('${r.id}')">▶ Play</button>
              <button class="btn btn-sm btn-ghost" onclick="deleteRecording('${r.id}')" style="color:var(--accent-red);">Delete</button>
            </div>
          </div>
        </div>`;
    }
    area.innerHTML = html;
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p style="color:var(--accent-red)">${err.message}</p></div>`;
  }
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const gb = bytes / 1073741824;
  if (gb > 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1048576;
  if (mb > 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function playRecording(id) {
  showToast('Playback: ' + id, 'info');
}

async function deleteRecording(id) {
  if (!confirm('Delete this recording?')) return;
  try {
    await api(`/recordings/${id}`, { method: 'DELETE' });
    showToast('Recording deleted');
    navigateTo('recordings');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

registerPageHandler('recordings', loadRecordings);
