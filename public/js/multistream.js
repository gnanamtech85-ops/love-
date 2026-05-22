let selectedStreamId = null;
let selectedPlatform = null;

function selectPlatform(btn) {
  document.querySelectorAll('.platform-select-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedPlatform = btn.dataset.platform;
  document.getElementById('dest-rtmp-fields').style.display = (selectedPlatform === 'custom_srt') ? 'none' : 'block';
  document.getElementById('dest-srt-fields').style.display = (selectedPlatform === 'custom_srt') ? 'block' : 'none';
}

function openAddDestinationModal(streamId) {
  selectedStreamId = streamId;
  selectedPlatform = null;
  document.querySelectorAll('.platform-select-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('dest-rtmp-url').value = '';
  document.getElementById('dest-stream-key').value = '';
  document.getElementById('dest-srt-url').value = '';
  document.getElementById('dest-display-name').value = '';
  document.getElementById('dest-rtmp-fields').style.display = 'block';
  document.getElementById('dest-srt-fields').style.display = 'none';
  openModal('add-destination-modal');
}

async function addDestination() {
  if (!selectedPlatform) { showToast('Please select a platform', 'error'); return; }
  try {
    await api(`/platforms/streams/${selectedStreamId}/destinations`, {
      method: 'POST',
      body: JSON.stringify({
        platform: selectedPlatform,
        rtmp_url: document.getElementById('dest-rtmp-url').value.trim(),
        stream_key: document.getElementById('dest-stream-key').value.trim(),
        srt_url: document.getElementById('dest-srt-url').value.trim()
      })
    });
    closeModal('add-destination-modal');
    showToast('Destination added');
    showStreamDetail(selectedStreamId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeDestination(streamId, destId) {
  if (!confirm('Remove this destination?')) return;
  try {
    await api(`/platforms/streams/${streamId}/destinations/${destId}`, { method: 'DELETE' });
    showToast('Destination removed');
    showStreamDetail(streamId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadMultistream(area) {
  try {
    const data = await api('/streams');
    const streams = data.streams || [];
    if (streams.length === 0) {
      area.innerHTML = `<div class="empty-state"><h3>No streams</h3><p>Create a stream first to configure multistream destinations.</p></div>`;
      return;
    }
    let html = `<div class="page-header"><h1>Multistream</h1></div>`;
    for (const s of streams) {
      const detail = await api(`/streams/${s.id}`);
      const dests = detail.stream.destinations || [];
      html += `
        <div class="srt-config-section" style="margin-bottom:16px;">
          <div class="srt-config-header">
            <h3>${s.name} <span class="badge badge-${s.status === 'live' ? 'green' : 'primary'}" style="font-size:0.6rem;">${s.status}</span></h3>
            <button class="btn btn-sm btn-secondary" onclick="openAddDestinationModal('${s.id}')">+ Add</button>
          </div>
          <div class="destination-list">
            ${dests.length === 0 ? '<div style="color:var(--text-muted);font-size:0.85rem;padding:12px;text-align:center;">No destinations configured</div>' : ''}
            ${dests.map(d => `
              <div class="destination-row">
                <div class="destination-platform-icon" style="background:${d.platform === 'youtube' ? '#FF0000' : d.platform === 'twitch' ? '#9146FF' : d.platform === 'facebook' ? '#1877F2' : d.platform === 'kick' ? '#53FC18' : d.platform === 'instagram' ? '#E4405F' : '#333'};color:${d.platform === 'kick' ? '#000' : '#fff'}">${d.platform_name.substring(0, 2).toUpperCase()}</div>
                <div class="destination-info"><div class="destination-name">${d.platform_name}</div><div class="destination-url">${d.rtmp_url || d.srt_url || '—'}</div></div>
                <label class="toggle-switch" style="margin-right:8px;">
                  <input type="checkbox" ${d.enabled ? 'checked' : ''} onchange="toggleDestination('${s.id}','${d.id}')">
                  <span class="toggle-slider"></span>
                </label>
                <div class="destination-status ${d.status}" title="${d.status}"></div>
                <button class="btn btn-sm btn-ghost" onclick="removeDestination('${s.id}','${d.id}')" style="color:var(--accent-red);padding:4px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            `).join('')}
          </div>
        </div>`;
    }
    area.innerHTML = html;
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p style="color:var(--accent-red)">${err.message}</p></div>`;
  }
}

async function toggleDestination(streamId, destId) {
  try {
    await api(`/platforms/streams/${streamId}/destinations/${destId}/toggle`, { method: 'PUT' });
    showToast('Destination toggled');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

registerPageHandler('multistream', loadMultistream);
