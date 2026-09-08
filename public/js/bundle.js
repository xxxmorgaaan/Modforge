(async function () {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { document.getElementById('bundle-hero').innerHTML = '<p>Сборка не указана.</p>'; return; }

  let bundle;
  try {
    bundle = await Forge.api(`/bundles/${id}`);
  } catch (e) {
    document.getElementById('bundle-hero').innerHTML = `<div class="empty-state"><h3>Сборка не найдена</h3><p>${Forge.escapeHtml(e.message)}</p></div>`;
    return;
  }

  document.title = `${bundle.title} — МОД:ЛАБ`;
  const ownToken = Forge.getBundleToken(bundle.id);
  const alreadyLiked = Forge.isLiked('bundle', bundle.id);
  const cover = bundle.cover_path ? `style="background-image:url('${bundle.cover_path}')"` : '';
  const totalSize = bundle.mods.reduce((s, m) => s + (m.file_size || 0), 0);

  document.getElementById('bundle-hero').innerHTML = `
    <div>
      <div class="cover-big" ${cover}></div>
      <h1>${Forge.escapeHtml(bundle.title)}</h1>
      <div class="mod-tags">
        <span class="badge badge-teal">${Forge.escapeHtml(bundle.game_name)}</span>
        <span class="badge badge-muted">${bundle.mods.length} мод.</span>
        ${bundle.tags.map((t) => `<span class="badge badge-muted">${Forge.escapeHtml(t)}</span>`).join('')}
        ${bundle.featured ? '<span class="badge badge-ember">В витрине</span>' : ''}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
        <button class="btn btn-ember" id="download-all-btn">Скачать все моды (${Forge.formatSize(totalSize)})</button>
        <button class="btn ${alreadyLiked ? 'btn-teal' : 'btn-outline'}" id="like-btn" ${alreadyLiked ? 'disabled' : ''}>♥ ${alreadyLiked ? 'Понравилось' : 'Нравится'} (<span id="like-count">${bundle.likes}</span>)</button>
        <button class="btn btn-outline" id="share-btn">Поделиться</button>
        <button class="btn btn-outline" id="report-btn">Пожаловаться</button>
        ${ownToken ? `<a class="btn btn-outline" href="/bundle-edit.html?id=${bundle.id}">Управлять сборкой</a>` : ''}
      </div>
    </div>
    <div class="panel">
      <h3 style="font-size:16px;margin-bottom:14px">Информация</h3>
      <div class="side-stats">
        <div class="side-stat-row"><span>Автор сборки</span><b>${Forge.escapeHtml(bundle.author_name)}</b></div>
        <div class="side-stat-row"><span>Модов внутри</span><b>${bundle.mods.length}</b></div>
        <div class="side-stat-row"><span>Скачиваний</span><b>${bundle.downloads}</b></div>
        <div class="side-stat-row"><span>Опубликована</span><b>${Forge.timeAgo(bundle.created_at)}</b></div>
      </div>
    </div>
  `;

  document.getElementById('bundle-details').style.display = '';
  document.getElementById('bundle-description').textContent = bundle.description || 'Автор не оставил описания.';

  const listEl = document.getElementById('bundle-mods-list');
  if (!bundle.mods.length) {
    listEl.innerHTML = '<p style="color:var(--text-muted)">Все моды из этой сборки были удалены их авторами.</p>';
  } else {
    listEl.innerHTML = bundle.mods.map((m) => `
      <div class="bundle-mod-row">
        ${m.cover_path ? `<img src="${m.cover_path}">` : '<div style="width:56px;height:36px;border-radius:5px;background:var(--bg-raised)"></div>'}
        <div class="grow">
          <div class="t"><a href="/mod.html?id=${m.id}" style="color:var(--text)">${Forge.escapeHtml(m.title)}</a></div>
          <div class="m">⬇ ${m.downloads} · ♥ ${m.likes} · ${Forge.formatSize(m.file_size)}${m.hidden ? ' · <span style="color:var(--danger)">скрыт администрацией</span>' : ''}</div>
        </div>
        <a class="btn btn-outline btn-sm" href="/api/mods/${m.id}/download">Скачать</a>
      </div>
    `).join('');
  }

  document.getElementById('download-all-btn').addEventListener('click', async () => {
    if (!bundle.mods.length) { Forge.toast('В сборке не осталось доступных модов', 'error'); return; }
    try { await Forge.api(`/bundles/${bundle.id}/download`, { method: 'POST' }); } catch (e) { /* тихо */ }
    bundle.mods.forEach((m, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = `/api/mods/${m.id}/download`;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 350);
    });
    Forge.toast(`Начинаем скачивание ${bundle.mods.length} файлов подряд — разрешите загрузку нескольких файлов, если браузер спросит`, 'info');
  });

  document.getElementById('like-btn').addEventListener('click', async (e) => {
    if (Forge.isLiked('bundle', bundle.id)) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await Forge.api(`/bundles/${bundle.id}/like`, { method: 'POST' });
      Forge.setLiked('bundle', bundle.id);
      btn.classList.remove('btn-outline');
      btn.classList.add('btn-teal');
      btn.innerHTML = `♥ Понравилось (<span id="like-count">${res.likes}</span>)`;
    } catch (err) {
      btn.disabled = false;
      Forge.toast(err.message, 'error');
    }
  });

  document.getElementById('share-btn').addEventListener('click', async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: bundle.title, url });
      else { await navigator.clipboard.writeText(url); Forge.toast('Ссылка скопирована', 'success'); }
    } catch (e) { /* отменено пользователем */ }
  });

  Forge.initReportModal('report-btn', 'report-modal', 'report-modal-inner', 'bundle', bundle.id);
})();
