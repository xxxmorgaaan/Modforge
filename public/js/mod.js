(async function () {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { document.getElementById('mod-hero').innerHTML = '<p>Мод не указан.</p>'; return; }

  let mod;
  try {
    mod = await Forge.api(`/mods/${id}`);
  } catch (e) {
    document.getElementById('mod-hero').innerHTML = `<div class="empty-state"><h3>Мод не найден</h3><p>${Forge.escapeHtml(e.message)}</p></div>`;
    return;
  }

  document.title = `${mod.title} — МОД:ЛАБ`;

  const ownToken = Forge.getModToken(mod.id);
  const alreadyLiked = Forge.isLiked('mod', mod.id);
  const cover = mod.cover_path ? `style="background-image:url('${mod.cover_path}')"` : '';

  document.getElementById('mod-hero').innerHTML = `
    <div>
      <div class="cover-big" ${cover}></div>
      <h1>${Forge.escapeHtml(mod.title)}</h1>
      <div class="mod-tags">
        <span class="badge badge-teal">${Forge.escapeHtml(mod.game_name)}</span>
        ${mod.tags.map((t) => `<span class="badge badge-muted">${Forge.escapeHtml(t)}</span>`).join('')}
        ${mod.featured ? '<span class="badge badge-ember">В витрине</span>' : ''}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
        <button class="btn btn-ember" id="download-btn">Скачать (${Forge.formatSize(mod.file_size)})</button>
        <button class="btn ${alreadyLiked ? 'btn-teal' : 'btn-outline'}" id="like-btn" ${alreadyLiked ? 'disabled' : ''}>♥ ${alreadyLiked ? 'Понравилось' : 'Нравится'} (<span id="like-count">${mod.likes}</span>)</button>
        <button class="btn btn-outline" id="share-btn">Поделиться</button>
        <button class="btn btn-outline" id="report-btn">Пожаловаться</button>
        ${ownToken ? `<a class="btn btn-outline" href="/edit.html?id=${mod.id}">Управлять модом</a>` : ''}
      </div>
    </div>
    <div class="panel">
      <h3 style="font-size:16px;margin-bottom:14px">Информация</h3>
      <div class="side-stats">
        <div class="side-stat-row"><span>Автор</span><b>${Forge.escapeHtml(mod.author_name)}</b></div>
        <div class="side-stat-row"><span>Версия</span><b>${Forge.escapeHtml(mod.version)}</b></div>
        <div class="side-stat-row"><span>Скачиваний</span><b>${mod.downloads}</b></div>
        <div class="side-stat-row"><span>Опубликован</span><b>${Forge.timeAgo(mod.created_at)}</b></div>
        <div class="side-stat-row"><span>Обновлён</span><b>${Forge.timeAgo(mod.updated_at)}</b></div>
        <div class="side-stat-row"><span>Файл</span><b>${Forge.escapeHtml(mod.file_name || '—')}</b></div>
      </div>
    </div>
  `;

  document.getElementById('mod-details').style.display = '';
  document.getElementById('mod-description').textContent = mod.description || 'Автор не оставил описания.';

  if (mod.screenshots.length) {
    document.getElementById('gallery-section').style.display = '';
    document.getElementById('gallery').innerHTML = mod.screenshots.map((s) => `<img src="${s}" data-full="${s}">`).join('');
    document.querySelectorAll('#gallery img').forEach((img) => {
      img.addEventListener('click', () => {
        document.getElementById('lightbox-img').src = img.dataset.full;
        document.getElementById('lightbox').classList.add('open');
      });
    });
  }
  document.getElementById('lightbox-close').addEventListener('click', () => document.getElementById('lightbox').classList.remove('open'));
  document.getElementById('lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') e.currentTarget.classList.remove('open'); });

  document.getElementById('versions').innerHTML = mod.versions.map((v) => `
    <div class="version-item">
      <div><span class="v">v${Forge.escapeHtml(v.version)}</span> — <span class="ch">${Forge.escapeHtml(v.changelog || 'без описания')}</span></div>
      <div class="when">${Forge.timeAgo(v.created_at)}</div>
    </div>
  `).join('') || '<p style="color:var(--text-muted)">Пока только одна версия.</p>';

  document.getElementById('download-btn').addEventListener('click', () => {
    window.location.href = `/api/mods/${mod.id}/download`;
    setTimeout(() => { mod.downloads++; document.getElementById('download-btn').textContent = `Скачать (${Forge.formatSize(mod.file_size)})`; }, 500);
  });

  document.getElementById('share-btn').addEventListener('click', async () => {
    const url = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: mod.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        Forge.toast('Ссылка скопирована', 'success');
      }
    } catch (e) { /* пользователь отменил шаринг — тихо игнорируем */ }
  });

  // ---- Похожие моды (та же игра) ----
  (async () => {
    try {
      const params = new URLSearchParams({ game: mod.game_slug, sort: 'popular' });
      const list = await Forge.api(`/mods?${params.toString()}`);
      const related = list.filter((m) => m.id !== mod.id).slice(0, 4);
      if (!related.length) return;
      document.getElementById('related-section').style.display = '';
      document.getElementById('related-grid').innerHTML = related.map((m) => `
        <a class="mod-card" href="/mod.html?id=${m.id}">
          <div class="cover" ${m.cover_path ? `style="background-image:url('${m.cover_path}')"` : ''}>
            <span class="game-badge">${Forge.escapeHtml(m.game_name)}</span>
          </div>
          <div class="body">
            <h3>${Forge.escapeHtml(m.title)}</h3>
            <div class="meta"><span>${Forge.escapeHtml(m.author_name)}</span><span>v${Forge.escapeHtml(m.version)}</span></div>
            <div class="stats-row"><span>⬇ ${m.downloads}</span><span>♥ ${m.likes}</span></div>
          </div>
        </a>
      `).join('');
    } catch (e) { /* тихо — блок необязателен */ }
  })();

  document.getElementById('like-btn').addEventListener('click', async (e) => {
    if (Forge.isLiked('mod', mod.id)) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await Forge.api(`/mods/${mod.id}/like`, { method: 'POST' });
      document.getElementById('like-count').textContent = res.likes;
      Forge.setLiked('mod', mod.id);
      btn.classList.remove('btn-outline');
      btn.classList.add('btn-teal');
      btn.innerHTML = `♥ Понравилось (<span id="like-count">${res.likes}</span>)`;
    } catch (err) {
      btn.disabled = false;
      Forge.toast(err.message, 'error');
    }
  });

  // ---- Жалобы: открывается как переписка с администрацией ----
  Forge.initReportModal('report-btn', 'report-modal', 'report-modal-inner', 'mod', mod.id);

  // ---- Комментарии ----
  async function loadComments() {
    const comments = await Forge.api(`/mods/${mod.id}/comments`);
    const list = document.getElementById('comments-list');
    list.innerHTML = comments.length
      ? comments.map((c) => `
        <div class="comment">
          <span class="who">${Forge.escapeHtml(c.author_name)}</span><span class="when">${Forge.timeAgo(c.created_at)}</span>
          <p>${Forge.escapeHtml(c.text)}</p>
        </div>`).join('')
      : '<p style="color:var(--text-muted)">Пока нет комментариев — будьте первым.</p>';
  }
  document.getElementById('comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Forge.api(`/mods/${mod.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ author_name: document.getElementById('comment-name').value, text: document.getElementById('comment-text').value }),
      });
      document.getElementById('comment-text').value = '';
      loadComments();
    } catch (err) { Forge.toast(err.message, 'error'); }
  });
  loadComments();
})();
