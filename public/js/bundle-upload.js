(async function () {
  const selected = new Set();
  let modsForGame = [];

  const games = await Forge.api('/games').catch(() => []);
  const gameSel = document.getElementById('f-game');
  if (!games.length) {
    gameSel.innerHTML = '<option value="">Пока нет ни одной игры</option>';
  } else {
    gameSel.innerHTML = '<option value="">Выберите игру…</option>' + games.map((g) => `<option value="${g.id}" data-slug="${g.slug}">${Forge.escapeHtml(g.name)}</option>`).join('');
  }

  function renderPickList() {
    const list = document.getElementById('mod-pick-list');
    if (!modsForGame.length) {
      list.innerHTML = '<p style="color:var(--text-muted); padding:10px">У этой игры пока нет опубликованных модов.</p>';
      return;
    }
    list.innerHTML = modsForGame.map((m) => `
      <div class="mod-pick-item ${selected.has(m.id) ? 'selected' : ''}" data-id="${m.id}">
        <input type="checkbox" ${selected.has(m.id) ? 'checked' : ''}>
        ${m.cover_path ? `<img src="${m.cover_path}">` : '<div class="mod-pick-item-noimg" style="width:46px;height:30px;background:var(--bg-raised);border-radius:4px"></div>'}
        <div class="info">
          <div class="t">${Forge.escapeHtml(m.title)}</div>
          <div class="m">${Forge.escapeHtml(m.author_name)} · v${Forge.escapeHtml(m.version)}</div>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.mod-pick-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = Number(item.dataset.id);
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        renderPickList();
        updateCount();
      });
    });
  }

  function updateCount() {
    document.getElementById('selected-count').textContent = selected.size ? `(выбрано: ${selected.size})` : '';
  }

  gameSel.addEventListener('change', async () => {
    selected.clear();
    updateCount();
    const gameId = gameSel.value;
    if (!gameId) { modsForGame = []; renderPickList(); return; }
    const slug = gameSel.selectedOptions[0].dataset.slug;
    try {
      modsForGame = await Forge.api(`/mods?game=${encodeURIComponent(slug)}&sort=az`);
      renderPickList();
    } catch (e) { Forge.toast(e.message, 'error'); }
  });

  document.getElementById('cover-drop').addEventListener('click', () => document.getElementById('f-cover').click());
  document.getElementById('f-cover').addEventListener('change', (e) => {
    document.getElementById('cover-list').textContent = e.target.files[0]?.name || '';
  });

  document.getElementById('bundle-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!gameSel.value) { Forge.toast('Выберите игру', 'error'); return; }
    if (selected.size < 2) { Forge.toast('Выберите минимум 2 мода', 'error'); return; }

    const fd = new FormData();
    fd.append('game_id', gameSel.value);
    fd.append('title', document.getElementById('f-title').value);
    fd.append('description', document.getElementById('f-description').value);
    fd.append('author_name', document.getElementById('f-author').value);
    fd.append('tags', document.getElementById('f-tags').value);
    fd.append('mod_ids', JSON.stringify(Array.from(selected)));
    const cover = document.getElementById('f-cover').files[0];
    if (cover) fd.append('cover', cover);

    const btn = document.getElementById('submit-btn');
    btn.disabled = true; btn.textContent = 'Публикуем…';
    try {
      const result = await Forge.api('/bundles', { method: 'POST', body: fd });
      Forge.saveBundleToken(result.bundle.id, result.token);
      document.getElementById('token-value').textContent = result.token;
      document.getElementById('goto-bundle').href = `/bundle.html?id=${result.bundle.id}`;
      document.getElementById('token-modal').classList.add('open');
      document.getElementById('copy-token').addEventListener('click', () => {
        navigator.clipboard.writeText(result.token);
        Forge.toast('Код скопирован', 'success');
      });
    } catch (err) {
      Forge.toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Опубликовать сборку';
    }
  });
})();
