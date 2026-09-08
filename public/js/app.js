// Общие утилиты, подключаются на каждой странице

const Forge = (() => {
  async function api(path, opts = {}) {
    const hasBody = opts.body !== undefined && opts.body !== null;
    const headers = opts.body instanceof FormData
      ? opts.headers
      : hasBody ? { 'Content-Type': 'application/json', ...opts.headers } : opts.headers;
    const res = await fetch(`/api${path}`, { credentials: 'same-origin', ...opts, headers });
    let data = null;
    try { data = await res.json(); } catch { /* пустой ответ, например скачивание */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Ошибка запроса (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function toast(message, type = 'info') {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function timeAgo(iso) {
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'только что';
    if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} дн назад`;
    return d.toLocaleDateString('ru-RU');
  }

  function formatSize(bytes) {
    if (!bytes) return '—';
    const units = ['Б', 'КБ', 'МБ', 'ГБ'];
    let i = 0; let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  // ---- Роль (без регистрации — просто локальный выбор режима отображения) ----
  function getRole() { return localStorage.getItem('forge_role') || 'player'; }
  function setRole(role) { localStorage.setItem('forge_role', role); renderHeader(); }

  // ---- Токены управления модами/сборками хранятся локально на устройстве публикации ----
  function saveModToken(modId, token) {
    const map = JSON.parse(localStorage.getItem('forge_tokens') || '{}');
    map[modId] = token;
    localStorage.setItem('forge_tokens', JSON.stringify(map));
  }
  function getModToken(modId) {
    const map = JSON.parse(localStorage.getItem('forge_tokens') || '{}');
    return map[modId] || null;
  }
  function saveBundleToken(bundleId, token) {
    const map = JSON.parse(localStorage.getItem('forge_bundle_tokens') || '{}');
    map[bundleId] = token;
    localStorage.setItem('forge_bundle_tokens', JSON.stringify(map));
  }
  function getBundleToken(bundleId) {
    const map = JSON.parse(localStorage.getItem('forge_bundle_tokens') || '{}');
    return map[bundleId] || null;
  }

  // ---- Лайки — один раз с браузера на объект ----
  function isLiked(type, id) { return !!localStorage.getItem(`liked_${type}_${id}`); }
  function setLiked(type, id) { localStorage.setItem(`liked_${type}_${id}`, '1'); }

  // ---- Закрытие любых модалок кликом по фону ----
  document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('open');
    }
  });

  // ---- Жалобы как переписка: общая логика для модов и сборок ----
  // resourceType: 'mod' | 'bundle'
  function initReportModal(triggerBtnId, backdropId, innerId, resourceType, resourceId) {
    const backdrop = document.getElementById(backdropId);
    const inner = document.getElementById(innerId);
    const trigger = document.getElementById(triggerBtnId);
    if (!backdrop || !inner || !trigger) return;
    const storeKey = `${resourceType}_${resourceId}`;

    function getAccess() {
      const map = JSON.parse(localStorage.getItem('forge_report_access') || '{}');
      return map[storeKey] || null;
    }
    function saveAccess(reportId, token) {
      const map = JSON.parse(localStorage.getItem('forge_report_access') || '{}');
      map[storeKey] = { reportId, token };
      localStorage.setItem('forge_report_access', JSON.stringify(map));
    }

    function renderStart() {
      inner.innerHTML = `
        <h3>Сообщить о проблеме</h3>
        <p style="color:var(--text-muted); font-size:13px; margin:-6px 0 14px">После отправки здесь же откроется переписка с администрацией — сможете дописать детали или посмотреть ответ.</p>
        <form id="rc-start-form">
          <div class="form-row">
            <label>Опишите проблему</label>
            <textarea id="rc-reason" required placeholder="Вредоносный файл, плагиат, оскорбительный контент…"></textarea>
          </div>
          <div style="display:flex;gap:10px">
            <button type="submit" class="btn btn-danger btn-block">Отправить</button>
            <button type="button" class="btn btn-outline" id="rc-cancel">Отмена</button>
          </div>
        </form>
      `;
      document.getElementById('rc-cancel').addEventListener('click', () => backdrop.classList.remove('open'));
      document.getElementById('rc-start-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const body = { reason: document.getElementById('rc-reason').value };
          body[resourceType === 'mod' ? 'mod_id' : 'bundle_id'] = resourceId;
          const result = await api('/reports', { method: 'POST', body: JSON.stringify(body) });
          saveAccess(result.reportId, result.token);
          toast('Обращение отправлено', 'success');
          renderChat(result.reportId, result.token);
        } catch (err) { toast(err.message, 'error'); }
      });
    }

    let pollTimer = null;
    function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

    async function renderChat(reportId, token) {
      inner.innerHTML = `
        <h3>Переписка с администрацией</h3>
        <div class="chat-thread" id="rc-thread"><p style="color:var(--text-muted)">Загрузка…</p></div>
        <form id="rc-reply-form" style="margin-top:12px;display:flex;gap:8px">
          <input type="text" id="rc-reply-text" placeholder="Написать сообщение…" required maxlength="2000" style="flex:1">
          <button class="btn btn-teal btn-sm" type="submit">Отправить</button>
        </form>
      `;
      async function refresh() {
        const thread = document.getElementById('rc-thread');
        if (!thread) { stopPolling(); return; }
        try {
          const data = await api(`/reports/${reportId}?token=${encodeURIComponent(token)}`);
          thread.innerHTML = data.messages.map((m) => `
            <div class="chat-msg ${m.sender}">
              <span class="who">${m.sender === 'admin' ? 'Администрация' : 'Вы'}</span>
              <p>${escapeHtml(m.text)}</p>
              <span class="when">${timeAgo(m.created_at)}</span>
            </div>`).join('');
          thread.scrollTop = thread.scrollHeight;
        } catch (err) { thread.innerHTML = `<p style="color:var(--danger)">${escapeHtml(err.message)}</p>`; }
      }
      await refresh();
      stopPolling();
      pollTimer = setInterval(() => {
        if (!backdrop.classList.contains('open')) { stopPolling(); return; }
        refresh();
      }, 7000);

      document.getElementById('rc-reply-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('rc-reply-text');
        const text = input.value.trim();
        if (!text) return;
        try {
          await api(`/reports/${reportId}/messages`, { method: 'POST', body: JSON.stringify({ token, text }) });
          input.value = '';
          refresh();
        } catch (err) { toast(err.message, 'error'); }
      });
    }

    trigger.addEventListener('click', () => {
      backdrop.classList.add('open');
      const access = getAccess();
      if (access) renderChat(access.reportId, access.token);
      else renderStart();
    });
  }

  function renderHeader() {
    const mount = document.getElementById('site-header');
    if (!mount) return;
    const role = getRole();
    const path = location.pathname;
    const isActive = (frag) => (path.includes(frag) ? 'active' : '');
    const navLinks = `
      <a href="/" class="${path === '/' || path === '/index.html' ? 'active' : ''}">Каталог</a>
      <a href="/bundles.html" class="${isActive('bundles') && !path.includes('upload') ? 'active' : ''}">Сборки</a>
      <a href="/upload.html" class="${path.includes('upload.html') ? 'active' : ''}">Загрузить мод</a>
      <a href="/bundle-upload.html" class="${isActive('bundle-upload') ? 'active' : ''}">Собрать сборку</a>
      <a href="/manage.html" class="${isActive('edit') || isActive('manage') ? 'active' : ''}">Управление</a>
    `;
    mount.innerHTML = `
      <div class="wrap">
        <a href="/" class="brand">МОД<span class="mark">:ЛАБ</span></a>
        <nav class="main-nav">${navLinks}</nav>
        <div class="header-right">
          <div class="role-switch" title="Режим отображения — не требует регистрации">
            <button data-role="player" class="${role === 'player' ? 'active' : ''}">Игрок</button>
            <button data-role="developer" class="${role === 'developer' ? 'active' : ''}">Разраб</button>
          </div>
          <button class="nav-toggle" id="nav-toggle" aria-label="Меню">☰</button>
        </div>
      </div>
      <div class="nav-drawer" id="nav-drawer">${navLinks}</div>
    `;
    mount.querySelectorAll('.role-switch button').forEach((btn) => {
      btn.addEventListener('click', () => setRole(btn.dataset.role));
    });
    const toggle = document.getElementById('nav-toggle');
    const drawer = document.getElementById('nav-drawer');
    toggle.addEventListener('click', () => drawer.classList.toggle('open'));
  }

  function renderFooter() {
    const mount = document.getElementById('site-footer');
    if (!mount) return;
    mount.innerHTML = `
      <div class="wrap">
        <span class="footer-text" id="footer-text">МОД:ЛАБ — некоммерческая площадка сообщества</span>
      </div>
    `;
    // Скрытый вход в панель администратора: 5 быстрых нажатий по тексту подвала —
    // никакой видимой кнопки нет специально, чтобы вход не бросался в глаза.
    let clicks = 0;
    let clickTimer = null;
    document.getElementById('footer-text').addEventListener('click', () => {
      clicks += 1;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { clicks = 0; }, 2500);
      if (clicks >= 5) {
        clicks = 0;
        location.href = '/admin.html';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderHeader();
    renderFooter();
  });

  return {
    api, toast, escapeHtml, timeAgo, formatSize, getRole, setRole,
    saveModToken, getModToken, saveBundleToken, getBundleToken,
    isLiked, setLiked, initReportModal,
  };
})();
