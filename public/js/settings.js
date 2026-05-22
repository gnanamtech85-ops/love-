async function loadSettings(area) {
  try {
    const user = currentUser;
    const subData = await api('/billing/subscription');
    const sub = subData.subscription || {};
    const plans = await api('/billing/plans');
    const planInfo = plans.plans?.[user.plan] || {};
    area.innerHTML = `
      <div class="page-header"><h1>Settings</h1></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div class="srt-config-section">
          <h4 style="margin-bottom:16px;">Profile</h4>
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" id="settings-name" value="${user.name || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-input" value="${user.email || ''}" disabled style="opacity:0.6;">
          </div>
          <button class="btn btn-primary" onclick="updateProfile()">Save Changes</button>
        </div>
        <div class="srt-config-section">
          <h4 style="margin-bottom:16px;">Subscription</h4>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div>
              <div style="font-size:1.25rem;font-weight:700;text-transform:capitalize;">${user.plan || 'Starter'}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${sub.status || 'active'}</div>
            </div>
            <span class="badge badge-green">${planInfo.price === 0 ? 'Free' : '$' + (planInfo.price || 0) + '/mo'}</span>
          </div>
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
              <span>Bandwidth</span><span>${formatBandwidth(sub.bandwidth_used || 0)} / ${formatBandwidth(sub.bandwidth_limit || 50)}</span>
            </div>
            <div style="height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
              <div style="height:100%;background:var(--gradient-primary);border-radius:3px;width:${Math.min(100, ((sub.bandwidth_used || 0) / (sub.bandwidth_limit || 50)) * 100)}%"></div>
            </div>
          </div>
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
              <span>Stream Hours</span><span>${(sub.stream_hours_used || 0).toFixed(1)} / ${(sub.stream_hours_limit || 20).toFixed(1)} hrs</span>
            </div>
            <div style="height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
              <div style="height:100%;background:var(--gradient-green);border-radius:3px;width:${Math.min(100, ((sub.stream_hours_used || 0) / (sub.stream_hours_limit || 20)) * 100)}%"></div>
            </div>
          </div>
          <button class="btn btn-secondary" onclick="navigateTo('billing')">Manage Plan</button>
        </div>
      </div>`;
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p style="color:var(--accent-red)">${err.message}</p></div>`;
  }
}

async function updateProfile() {
  const name = document.getElementById('settings-name').value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }
  try {
    await api('/auth/profile', { method: 'PUT', body: JSON.stringify({ name }) });
    currentUser.name = name;
    document.getElementById('user-name').textContent = name;
    document.getElementById('user-avatar').textContent = name.charAt(0).toUpperCase();
    showToast('Profile updated');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadBilling(area) {
  try {
    const subData = await api('/billing/subscription');
    const sub = subData.subscription || {};
    const plans = await api('/billing/plans');
    const allPlans = plans.plans || {};
    const user = currentUser;
    area.innerHTML = `
      <div class="page-header"><h1>Billing</h1></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-bottom:24px;">
        ${Object.entries(allPlans).map(([key, p]) => `
          <div class="pricing-card ${key === user.plan ? 'popular' : ''}" style="cursor:default;">
            ${key === 'pro' ? '<div class="pricing-popular-badge">Current</div>' : ''}
            <div class="pricing-plan-name">${p.name}</div>
            <div class="pricing-price"><span class="amount">${p.price === 0 ? 'Free' : '$' + p.price}</span><span class="period">${p.price > 0 ? '/mo' : ''}</span></div>
            <div class="pricing-features">
              <div class="pricing-feature"><svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>${p.streams} stream(s)</div>
              <div class="pricing-feature"><svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>${p.destinations} destination(s)</div>
              <div class="pricing-feature"><svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>${p.bandwidth} GB bandwidth</div>
              <div class="pricing-feature"><svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>${p.streamHours} hrs streaming</div>
            </div>
            ${key !== user.plan ? `<button class="btn ${key === 'starter' ? 'btn-secondary' : 'btn-primary'}" onclick="upgradePlan('${key}')">${p.price === 0 ? 'Downgrade' : 'Upgrade'}</button>` : '<button class="btn btn-secondary" disabled>Current Plan</button>'}
          </div>
        `).join('')}
      </div>`;
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p style="color:var(--accent-red)">${err.message}</p></div>`;
  }
}

async function upgradePlan(plan) {
  try {
    await api('/billing/upgrade', { method: 'POST', body: JSON.stringify({ plan }) });
    currentUser.plan = plan;
    showToast(`Upgraded to ${plan}`);
    navigateTo('billing');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function formatBandwidth(gb) {
  if (!gb) return '0 GB';
  return gb.toFixed(1) + ' GB';
}

async function loadOverview(area) {
  try {
    const [streamData, analyticsData, recData, subData] = await Promise.all([
      api('/streams'), api('/analytics'), api('/recordings'), api('/billing/subscription')
    ]);
    const streams = streamData.streams || [];
    const liveCount = streams.filter(s => s.status === 'live').length;
    const totalViewers = analyticsData.analytics?.reduce((sum, a) => sum + (a.latest?.viewer_count || 0), 0) || 0;
    const totalBandwidth = analyticsData.analytics?.reduce((sum, a) => sum + (a.total_bandwidth || 0), 0) || 0;
    const sub = subData.subscription || {};
    area.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card blue">
          <div class="stat-card-header"><span class="stat-card-title">Live Streams</span><div class="stat-card-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></div></div>
          <div class="stat-card-value">${liveCount}</div>
          <div class="stat-card-change ${liveCount > 0 ? 'positive' : ''}">${liveCount > 0 ? '🔴 Live' : 'All offline'}</div>
        </div>
        <div class="stat-card green">
          <div class="stat-card-header"><span class="stat-card-title">Total Streams</span><div class="stat-card-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div></div>
          <div class="stat-card-value">${streams.length}</div>
          <div class="stat-card-change">${streams.length} configured</div>
        </div>
        <div class="stat-card orange">
          <div class="stat-card-header"><span class="stat-card-title">Viewers</span><div class="stat-card-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div></div>
          <div class="stat-card-value">${formatNumber(totalViewers)}</div>
          <div class="stat-card-change positive">Current viewers</div>
        </div>
        <div class="stat-card red">
          <div class="stat-card-header"><span class="stat-card-title">Bandwidth</span><div class="stat-card-icon red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div></div>
          <div class="stat-card-value">${totalBandwidth.toFixed(1)}</div>
          <div class="stat-card-change">GB used</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div class="srt-config-section">
          <div class="srt-config-header"><h3>Recent Streams</h3><button class="btn btn-sm btn-ghost" onclick="navigateTo('streams')">View All</button></div>
          ${streams.slice(0, 3).map(s => `
            <div class="destination-row" style="cursor:pointer;" onclick="navigateTo('streams')">
              <div class="destination-platform-icon" style="background:${s.status === 'live' ? 'var(--accent-green)' : 'var(--bg-tertiary)'};">${s.status === 'live' ? '🔴' : '⏹'}</div>
              <div class="destination-info"><div class="destination-name">${s.name}</div><div class="destination-url">${s.region || 'us-east'} · ${s.srt_latency || 120}ms latency</div></div>
              <span class="badge badge-${s.status === 'live' ? 'green' : 'primary'}">${s.status}</span>
            </div>
          `).join('')}
        </div>
        <div class="srt-config-section">
          <div class="srt-config-header"><h3>Usage</h3></div>
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
              <span>Bandwidth</span><span>${formatBandwidth(sub.bandwidth_used || 0)} / ${formatBandwidth(sub.bandwidth_limit || 50)}</span>
            </div>
            <div style="height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
              <div style="height:100%;background:var(--gradient-primary);border-radius:3px;width:${Math.min(100, ((sub.bandwidth_used || 0) / (sub.bandwidth_limit || 50)) * 100)}%"></div>
            </div>
          </div>
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
              <span>Storage</span><span>${formatBandwidth(sub.storage_used || 0)} / ${formatBandwidth(sub.storage_limit || 10)}</span>
            </div>
            <div style="height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
              <div style="height:100%;background:var(--gradient-green);border-radius:3px;width:${Math.min(100, ((sub.storage_used || 0) / (sub.storage_limit || 10)) * 100)}%"></div>
            </div>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="navigateTo('billing')">View Plan</button>
        </div>
      </div>`;
  } catch (err) {
    area.innerHTML = `<div class="empty-state"><p style="color:var(--accent-red)">${err.message}</p></div>`;
  }
}

registerPageHandler('overview', loadOverview);
registerPageHandler('settings', loadSettings);
registerPageHandler('billing', loadBilling);
