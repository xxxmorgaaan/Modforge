(async function () {
  const loginScreen = document.getElementById('login-screen');
  const dashboard = document.getElementById('dashboard');
  let myRole = null;
  let myUsername = null;

  async function checkSession() {
    const me = await Forge.api('/admin/me');
    if (me.isAdmin) {
      myRole = me.role;
      myUsername = me.username;
      loginScreen.style.display = 'none';
      dashboard.style.display = '';
      document.getElementById('admin-username-label').textContent = `${me.username} (${me.role === 'owner' ? 'владелец' : 'модератор'})`;
      applyRoleVisibility();
      initDashboard();
    }
  }

  function applyRoleVisibility() {
    const ownerOnlyTabs = ['games', 'admins'];
    if (myRole !== 'owner') {
      document.querySelectorAll('.tab-btn').forEach((btn) => {
        if (ownerOnlyTabs.includes(btn.dataset.tab)) btn.style.display = 'none';
      });
      // модератор по умолчанию попадает на вкладку «Моды», а не «Игры»
      document.querySelector('.tab-btn[data-tab="games"]').classList.remove('active');
      document.querySelector('.tab-btn[data-tab="mods"]').classList.add('active');
      document.getElementById('tab-games').style.display = 'none';
      document.getElementById('tab-mods').style.display = '';
    }
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Forge.api('/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          username: document.getElementById('login-username').value,
          password: document.getElementById('login-password').value,
        }),
      });
      checkSession();
    } catch (err) { Forge.toast(err.message, 'error'); }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await Forge.api('/admin/logout', { method: 'POST' });
    location.reload();
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((p) => { p.style.display = 'none'; });
      document.getElementById(`tab-${btn.dataset.tab}`).style.display = '';
    });
  });

  let initDone = false;
  async function initDashboard() {
    if (initDone) return;
    initDone = true;
    const tasks = [loadStats(), loadMods(), loadBundles(), loadReports()];
    if (myRole === 'owner') { tasks.push(loadGames()); tasks.push(loadAdmins()); }
    await Promise.all(tasks);
  }

  async function loadStats() {
    const s = await Forge.api('/admin/stats');
    document.getElementById('stats-cards').innerHTML = `
      <div class="panel"><div class="display" style="font-size:26px;color:var(--ember-hot)">${s.mods}</div><div style="color:var(--text-muted);font-size:13px">модов</div></div>
      <div class="panel"><div class="display" style="font-size:26px;color:var(--teal)">${s.bundles}</div><div style="color:var(--text-muted);font-size:13px">сборок</div></div>
      <div class="panel"><div class="display" style="font-size:26px;color:var(--ember-hot)">${s.games}</div><div style="color:var(--text-muted);font-size:13px">игр</div></div>
      <div class="panel"><div class="display" style="font-size:26px;color:var(--teal)">${s.downloads}</div><div style="color:var(--text-muted);font-size:13px">скачиваний</div></div>
      <div class="panel"><div class="display" style="font-size:26px;color:${s.pendingReports ? 'var(--danger)' : 'var(--text-muted)'}">${s.pendingReports}</div><div style="color:var(--text-muted);font-size:13px">жалоб на рассмотрении</div></div>
    `;
    const badge = document.getElementById('reports-badge');
    badge.textContent = s.pendingReports ? `(${s.pendingReports})` : '';
    badge.style.color = s.pendingReports ? 'var(--danger)' : 'inherit';
  }

  // ---------------- ИГРЫ (только владелец) ----------------
  async function loadGames() {
    const games = await Forge.api('/games');
    document.getElementById('games-table').innerHTML = games.map((g) => `
      <tr>
        <td>${g.cover_path ? `<img class="game-cover-thumb" src="${g.cover_path}">` : '<div class="game-cover-thumb"></div>'}</td>
        <td>${Forge.escapeHtml(g.name)}</td>
        <td>${g.mod_count}</td>
        <td>${Forge.timeAgo(g.created_at)}</td>
        <td class="table-actions"><button class="btn btn-danger btn-sm" data-del-game="${g.id}">Удалить</button></td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="color:var(--text-muted)">Игр пока нет</td></tr>';
    document.querySelectorAll('[data-del-game]').forEach((btn) => btn.addEventListener('click', () => deleteGame(btn.dataset.delGame)));
  }

  async function deleteGame(id, force) {
    try {
      await Forge.api(`/games/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
      Forge.toast('Игра удалена', 'success');
      loadGames(); loadMods(); loadStats();
    } catch (err) {
      if (err.data && err.data.modCount) {
        if (confirm(`${err.data.error}\n\nУдалить игру вместе со всеми ${err.data.modCount} модами?`)) deleteGame(id, true);
      } else { Forge.toast(err.message, 'error'); }
    }
  }

  document.getElementById('game-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('name', document.getElementById('g-name').value);
    fd.append('description', document.getElementById('g-description').value);
    const cover = document.getElementById('g-cover').files[0];
    if (cover) fd.append('cover', cover);
    try {
      await Forge.api('/games', { method: 'POST', body: fd });
      Forge.toast('Игра добавлена', 'success');
      e.target.reset();
      loadGames(); loadStats();
    } catch (err) { Forge.toast(err.message, 'error'); }
  });

  // ---------------- МОДЫ ----------------
  let allMods = [];
  async function loadMods() {
    allMods = await Forge.api('/mods?includeHidden=true&sort=newest');
    renderModsTable();
  }
  function renderModsTable() {
    const q = document.getElementById('mods-search').value.trim().toLowerCase();
    const filtered = q ? allMods.filter((m) => m.title.toLowerCase().includes(q) || m.author_name.toLowerCase().includes(q)) : allMods;
    document.getElementById('mods-table').innerHTML = filtered.map((m) => `
      <tr>
        <td><a href="/mod.html?id=${m.id}" target="_blank" style="color:var(--teal)">${Forge.escapeHtml(m.title)}</a></td>
        <td>${Forge.escapeHtml(m.game_name)}</td>
        <td>${Forge.escapeHtml(m.author_name)}</td>
        <td>${m.downloads}</td>
        <td>${m.likes}</td>
        <td>
          ${m.featured ? '<span class="badge badge-ember">Витрина</span>' : ''}
          ${m.hidden ? '<span class="badge badge-muted">Скрыт</span>' : ''}
        </td>
        <td class="table-actions">
          ${myRole === 'owner' ? `<button class="btn btn-outline btn-sm" data-feature="${m.id}">${m.featured ? 'Убрать из витрины' : 'В витрину'}</button>
          <button class="btn btn-outline btn-sm" data-hide="${m.id}">${m.hidden ? 'Показать' : 'Скрыть'}</button>` : ''}
          <button class="btn btn-danger btn-sm" data-del-mod="${m.id}">Удалить</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7" style="color:var(--text-muted)">Ничего не найдено</td></tr>';

    document.querySelectorAll('[data-feature]').forEach((btn) => btn.addEventListener('click', async () => {
      await Forge.api(`/admin/mods/${btn.dataset.feature}/feature`, { method: 'POST' });
      loadMods();
    }));
    document.querySelectorAll('[data-hide]').forEach((btn) => btn.addEventListener('click', async () => {
      await Forge.api(`/admin/mods/${btn.dataset.hide}/hide`, { method: 'POST' });
      loadMods();
    }));
    document.querySelectorAll('[data-del-mod]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Удалить мод безвозвратно?')) return;
      try {
        await Forge.api(`/mods/${btn.dataset.delMod}`, { method: 'DELETE' });
        Forge.toast('Мод удалён', 'success');
        loadMods(); loadStats(); loadBundles();
      } catch (err) { Forge.toast(err.message, 'error'); }
    }));
  }
  document.getElementById('mods-search').addEventListener('input', renderModsTable);

  document.getElementById('export-csv-btn').addEventListener('click', () => {
    if (!allMods.length) { Forge.toast('Нет модов для экспорта', 'error'); return; }
    const headers = ['ID', 'Название', 'Игра', 'Автор', 'Версия', 'Скачиваний', 'Лайков', 'Витрина', 'Скрыт', 'Опубликован'];
    const rows = allMods.map((m) => [m.id, m.title, m.game_name, m.author_name, m.version, m.downloads, m.likes, m.featured ? 'да' : 'нет', m.hidden ? 'да' : 'нет', m.created_at]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `modlab-mods-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---------------- СБОРКИ ----------------
  let allBundles = [];
  async function loadBundles() {
    allBundles = await Forge.api('/bundles?includeHidden=true&sort=newest');
    renderBundlesTable();
  }
  function renderBundlesTable() {
    const q = document.getElementById('bundles-search').value.trim().toLowerCase();
    const filtered = q ? allBundles.filter((b) => b.title.toLowerCase().includes(q) || b.author_name.toLowerCase().includes(q)) : allBundles;
    document.getElementById('bundles-table').innerHTML = filtered.map((b) => `
      <tr>
        <td><a href="/bundle.html?id=${b.id}" target="_blank" style="color:var(--teal)">${Forge.escapeHtml(b.title)}</a></td>
        <td>${Forge.escapeHtml(b.game_name)}</td>
        <td>${Forge.escapeHtml(b.author_name)}</td>
        <td>${b.mod_count}</td>
        <td>
          ${b.featured ? '<span class="badge badge-ember">Витрина</span>' : ''}
          ${b.hidden ? '<span class="badge badge-muted">Скрыта</span>' : ''}
        </td>
        <td class="table-actions">
          ${myRole === 'owner' ? `<button class="btn btn-outline btn-sm" data-feature-b="${b.id}">${b.featured ? 'Убрать из витрины' : 'В витрину'}</button>
          <button class="btn btn-outline btn-sm" data-hide-b="${b.id}">${b.hidden ? 'Показать' : 'Скрыть'}</button>` : ''}
          <button class="btn btn-danger btn-sm" data-del-bundle="${b.id}">Удалить</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6" style="color:var(--text-muted)">Сборок пока нет</td></tr>';

    document.querySelectorAll('[data-feature-b]').forEach((btn) => btn.addEventListener('click', async () => {
      await Forge.api(`/admin/bundles/${btn.dataset.featureB}/feature`, { method: 'POST' });
      loadBundles();
    }));
    document.querySelectorAll('[data-hide-b]').forEach((btn) => btn.addEventListener('click', async () => {
      await Forge.api(`/admin/bundles/${btn.dataset.hideB}/hide`, { method: 'POST' });
      loadBundles();
    }));
    document.querySelectorAll('[data-del-bundle]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Удалить сборку безвозвратно?')) return;
      try {
        await Forge.api(`/bundles/${btn.dataset.delBundle}`, { method: 'DELETE' });
        Forge.toast('Сборка удалена', 'success');
        loadBundles(); loadStats();
      } catch (err) { Forge.toast(err.message, 'error'); }
    }));
  }
  document.getElementById('bundles-search').addEventListener('input', renderBundlesTable);

  // ---------------- ЖАЛОБЫ (чат) ----------------
  let activeReportId = null;
  async function loadReports() {
    const includeResolved = document.getElementById('reports-show-resolved').checked;
    const reports = await Forge.api(`/admin/reports?includeResolved=${includeResolved}`);
    const list = document.getElementById('reports-list');
    list.innerHTML = reports.length ? reports.map((r) => `
      <div class="comment" style="cursor:pointer; border-radius:8px; padding:10px; ${activeReportId === r.id ? 'background:var(--bg-raised)' : ''}" data-open-report="${r.id}" data-type="${r.subject_type}" data-subject="${r.subject_id}">
        <div style="display:flex;justify-content:space-between;gap:8px">
          <span class="who">${Forge.escapeHtml(r.subject_title)} <span style="color:var(--text-faint); font-weight:400">(${r.subject_type === 'mod' ? 'мод' : 'сборка'})</span></span>
          ${r.resolved ? '<span class="badge badge-muted">решено</span>' : '<span class="badge badge-ember">открыто</span>'}
        </div>
        <p style="-webkit-line-clamp:1; display:-webkit-box; overflow:hidden; -webkit-box-orient:vertical">${Forge.escapeHtml(r.last_message)}</p>
        <span class="when">${Forge.timeAgo(r.last_at)}</span>
      </div>
    `).join('') : '<p style="color:var(--text-muted)">Обращений нет.</p>';

    list.querySelectorAll('[data-open-report]').forEach((el) => {
      el.addEventListener('click', () => openReportChat(Number(el.dataset.openReport), el.dataset.type, Number(el.dataset.subject)));
    });
  }
  document.getElementById('reports-show-resolved').addEventListener('change', loadReports);

  async function openReportChat(reportId, subjectType, subjectId) {
    activeReportId = reportId;
    loadReports();
    const panel = document.getElementById('report-chat-panel');
    panel.innerHTML = '<p style="color:var(--text-muted)">Загрузка…</p>';
    try {
      const data = await Forge.api(`/reports/${reportId}`);
      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;margin-bottom:12px">
          <div>
            <h3 style="font-size:15px">${Forge.escapeHtml(data.subject_title)}</h3>
            <a href="/${subjectType === 'mod' ? 'mod' : 'bundle'}.html?id=${subjectId}" target="_blank" style="color:var(--teal); font-size:12.5px">Открыть страницу →</a>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" id="rc-resolve">${data.resolved ? 'Открыть снова' : 'Решено'}</button>
            <button class="btn btn-danger btn-sm" id="rc-delete-subject">Удалить ${subjectType === 'mod' ? 'мод' : 'сборку'}</button>
          </div>
        </div>
        <div class="chat-thread" id="admin-chat-thread" style="max-height:280px"></div>
        <form id="admin-reply-form" style="margin-top:12px;display:flex;gap:8px">
          <input type="text" id="admin-reply-text" placeholder="Ответить…" required maxlength="2000" style="flex:1">
          <button class="btn btn-teal btn-sm" type="submit">Отправить</button>
        </form>
      `;
      renderThread(data.messages);

      document.getElementById('rc-resolve').addEventListener('click', async () => {
        await Forge.api(`/admin/reports/${reportId}/resolve`, { method: 'POST' });
        Forge.toast('Статус обновлён', 'success');
        loadReports(); loadStats();
        openReportChat(reportId, subjectType, subjectId);
      });
      document.getElementById('rc-delete-subject').addEventListener('click', async () => {
        if (!confirm(`Удалить ${subjectType === 'mod' ? 'мод' : 'сборку'} безвозвратно?`)) return;
        const endpoint = subjectType === 'mod' ? `/mods/${subjectId}` : `/bundles/${subjectId}`;
        try {
          await Forge.api(endpoint, { method: 'DELETE' });
          Forge.toast('Удалено', 'success');
          loadMods(); loadBundles(); loadStats();
        } catch (err) { Forge.toast(err.message, 'error'); }
      });
      document.getElementById('admin-reply-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('admin-reply-text');
        const text = input.value.trim();
        if (!text) return;
        try {
          await Forge.api(`/reports/${reportId}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
          input.value = '';
          const fresh = await Forge.api(`/reports/${reportId}`);
          renderThread(fresh.messages);
        } catch (err) { Forge.toast(err.message, 'error'); }
      });
    } catch (err) {
      panel.innerHTML = `<p style="color:var(--danger)">${Forge.escapeHtml(err.message)}</p>`;
    }
  }

  function renderThread(messages) {
    const thread = document.getElementById('admin-chat-thread');
    if (!thread) return;
    thread.innerHTML = messages.map((m) => `
      <div class="chat-msg ${m.sender}">
        <span class="who">${m.sender === 'admin' ? (m.sender_name || 'Администрация') : 'Заявитель'}</span>
        <p>${Forge.escapeHtml(m.text)}</p>
        <span class="when">${Forge.timeAgo(m.created_at)}</span>
      </div>
    `).join('');
    thread.scrollTop = thread.scrollHeight;
  }

  // ---------------- АДМИНЫ (только владелец) ----------------
  async function loadAdmins() {
    const admins = await Forge.api('/admin/admins');
    document.getElementById('admins-table').innerHTML = admins.map((a) => `
      <tr>
        <td>${Forge.escapeHtml(a.username)}</td>
        <td>${a.role === 'owner' ? '<span class="badge badge-ember">владелец</span>' : '<span class="badge badge-teal">модератор</span>'}</td>
        <td>${Forge.timeAgo(a.created_at)}</td>
        <td class="table-actions">
          ${a.role !== 'owner' ? `
            <button class="btn btn-outline btn-sm" data-reset-admin="${a.id}">Сбросить пароль</button>
            <button class="btn btn-danger btn-sm" data-del-admin="${a.id}">Удалить</button>
          ` : ''}
        </td>
      </tr>
    `).join('');
    document.querySelectorAll('[data-reset-admin]').forEach((btn) => btn.addEventListener('click', async () => {
      const newPassword = prompt('Новый пароль для этого администратора (минимум 6 символов):');
      if (!newPassword) return;
      try {
        await Forge.api(`/admin/admins/${btn.dataset.resetAdmin}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
        Forge.toast('Пароль обновлён', 'success');
      } catch (err) { Forge.toast(err.message, 'error'); }
    }));
    document.querySelectorAll('[data-del-admin]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Удалить этого администратора?')) return;
      try {
        await Forge.api(`/admin/admins/${btn.dataset.delAdmin}`, { method: 'DELETE' });
        Forge.toast('Администратор удалён', 'success');
        loadAdmins();
      } catch (err) { Forge.toast(err.message, 'error'); }
    }));
  }

  document.getElementById('admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Forge.api('/admin/admins', {
        method: 'POST',
        body: JSON.stringify({
          username: document.getElementById('a-username').value,
          password: document.getElementById('a-password').value,
        }),
      });
      Forge.toast('Модератор добавлен', 'success');
      e.target.reset();
      loadAdmins();
    } catch (err) { Forge.toast(err.message, 'error'); }
  });

  // ---------------- НАСТРОЙКИ ----------------
  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Forge.api('/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: document.getElementById('p-current').value,
          newPassword: document.getElementById('p-new').value,
        }),
      });
      Forge.toast('Пароль обновлён', 'success');
      e.target.reset();
    } catch (err) { Forge.toast(err.message, 'error'); }
  });

  checkSession();
})();
