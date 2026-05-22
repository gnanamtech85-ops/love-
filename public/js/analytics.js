let activeCharts = [];

function destroyCharts() {
  activeCharts.forEach(c => c.destroy?.());
  activeCharts = [];
}

async function loadAnalytics(area) {
  destroyCharts();
  try {
    const data = await api('/analytics');
    const analytics = data.analytics || [];
    if (analytics.length === 0) {
      area.innerHTML = `
        <div class="page-header"><h1>Analytics</h1></div>
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          <h3>No analytics data</h3>
          <p>Start a stream to see analytics.</p>
        </div>`;
      return;
    }
    let html = `<div class="page-header"><h1>Analytics</h1></div>`;
    html += `<div class="stats-grid">`;
    for (const a of analytics) {
      html += `
        <div class="stat-card blue">
          <div class="stat-card-header">
            <span class="stat-card-title">${a.name}</span>
            <div class="stat-card-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></div>
          </div>
          <div class="stat-card-value">${a.latest ? formatNumber(a.latest.viewer_count) : '—'}</div>
          <div style="font-size:0.7rem;color:var(--text-muted);display:flex;justify-content:space-between;">
            <span>Peak: ${a.peak_viewers ? formatNumber(a.peak_viewers) : '—'}</span>
            <span>Avg: ${a.avg_bitrate ? Math.round(a.avg_bitrate).toLocaleString() + ' kbps' : '—'}</span>
          </div>
        </div>`;
    }
    html += `</div>`;
    const streamSelect = analytics.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    html += `
      <div class="srt-config-section">
        <div class="srt-config-header">
          <h3>Viewer & Bitrate Trends</h3>
          <div class="chart-time-selector">
            <button class="chart-time-btn" data-range="1h" onclick="loadAnalyticsChart('${analytics[0]?.id}', '1h')">1H</button>
            <button class="chart-time-btn active" data-range="6h" onclick="loadAnalyticsChart('${analytics[0]?.id}', '6h')">6H</button>
            <button class="chart-time-btn" data-range="24h" onclick="loadAnalyticsChart('${analytics[0]?.id}', '24h')">24H</button>
            <button class="chart-time-btn" data-range="7d" onclick="loadAnalyticsChart('${analytics[0]?.id}', '7d')">7D</button>
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:16px;">
          <select class="form-select" id="analytics-stream-select" style="flex:1;" onchange="loadAnalyticsChart(this.value)">
            ${streamSelect}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="chart-container"><div class="chart-header"><h3>Viewers</h3></div><canvas class="chart-canvas" id="chart-viewers" height="200"></canvas></div>
          <div class="chart-container"><div class="chart-header"><h3>Bitrate (kbps)</h3></div><canvas class="chart-canvas" id="chart-bitrate" height="200"></canvas></div>
        </div>
      </div>`;
    area.innerHTML = html;
    if (analytics.length > 0) {
      loadAnalyticsChart(analytics[0].id, '6h');
    }
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p style="color:var(--accent-red)">${err.message}</p></div>`;
  }
}

async function loadAnalyticsChart(streamId, range = '6h') {
  if (!streamId) return;
  document.querySelectorAll('.chart-time-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.range === range);
  });
  try {
    const data = await api(`/analytics/${streamId}?range=${range}`);
    const events = data.events || [];
    if (events.length === 0) return;
    const labels = events.map(e => {
      const d = new Date(e.timestamp);
      return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    });
    const viewers = events.map(e => e.viewer_count || 0);
    const bitrates = events.map(e => e.bitrate || 0);
    const canvasV = document.getElementById('chart-viewers');
    const canvasB = document.getElementById('chart-bitrate');
    if (canvasV) {
      const chart = new LineChart(canvasV);
      chart.setData(labels, viewers);
    }
    if (canvasB) {
      const chart = new LineChart(canvasB, { lineColor: '#7C3AED', fillColor: 'rgba(124,58,237,0.12)' });
      chart.setData(labels, bitrates);
    }
  } catch (err) {
    console.error('Chart load error:', err);
  }
}

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

registerPageHandler('analytics', loadAnalytics);
