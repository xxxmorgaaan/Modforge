(function () {
  const params = new URLSearchParams(location.search);
  const idFromUrl = params.get('id');
  let bundle = null;
  let token = null;
  let modsForGame = [];
  let selected = new Set();

  if (idFromUrl) {
    document.getElementById('gate-id').value = idFromUrl;
    const saved = Forge.getBundleToken(idFromUrl);
    if (saved) document.getElementById('gate-token').value = saved;
  }

  function renderPickList() {
    const list = document.getElementById('mod-pick-list');
    if (!modsForGame.length) {
      list.innerHTML = '<p style="color:var(--text-muted); padding:10px">У этой игры нет опубликованных модов.</p>';
      return;
    }
    list.innerHTML = modsForGame.map((m) => `
      <div class="mod-pick-item ${selected.has(m.id) ? 'selected' : ''}" data-id="${m.id}">
        <input type="checkbox" ${selected.has(m.id) ? 'checked' : ''}>
        ${m.cover_path ? `<img src="${m.cover_path}">` : '<div style="width:46px;height:30px;background:var(--bg-raised);border-radius:4px"></div>'}
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
      });
    });
  }

  async function openEditor(id, tok) {
    try {
      bundle = await Forge.api(`/bundles/${id}`);
    } catch (e) {
      Forge.toast('Сборка не найдена', 'error');
      return;
    }
    token = tok;
    document.getElementById('token-gate').style.display = 'none';
    document.getElementById('edit-area').style.display = '';
    document.getElementById('e-title').value = bundle.title;
    document.getElementById('e-author').value = bundle.author_name;
    document.getElementById('e-tags').value = bundle.tags.join(', ');
    document.getElementById('e-description').value = bundle.description;
    selected = new Set(bundle.mod_ids);

    try {
      modsForGame = await Forge.api(`/mods?game=${encodeURIComponent(bundle.game_slug)}&sort=az`);
    } catch (e) { modsForGame = []; }
    renderPickList();
  }

  document.getElementById('gate-btn').addEventListener('click', () => {
    const id = document.getElementById('gate-id').value.trim();
    const tok = document.getElementById('gate-token').value.trim();
    if (!id || !tok) { Forge.toast('Заполните ID сборки и код управления', 'error'); return; }
    openEditor(id, tok);
  });

  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (selected.size < 2) { Forge.toast('Выберите минимум 2 мода', 'error'); return; }
    const fd = new FormData();
    fd.append('token', token);
    fd.append('title', document.getElementById('e-title').value);
    fd.append('author_name', document.getElementById('e-author').value);
    fd.append('tags', document.getElementById('e-tags').value);
    fd.append('description', document.getElementById('e-description').value);
    fd.append('mod_ids', JSON.stringify(Array.from(selected)));
    const cover = document.getElementById('e-cover').files[0];
    if (cover) fd.append('cover', cover);

    try {
      await Forge.api(`/bundles/${bundle.id}`, { method: 'PUT', body: fd });
      Forge.toast('Изменения сохранены', 'success');
    } catch (err) { Forge.toast(err.message, 'error'); }
  });

  document.getElementById('delete-btn').addEventListener('click', async () => {
    if (!confirm('Удалить сборку безвозвратно? Сами моды затронуты не будут.')) return;
    try {
      await Forge.api(`/bundles/${bundle.id}?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
      Forge.toast('Сборка удалена', 'success');
      setTimeout(() => { location.href = '/bundles.html'; }, 1000);
    } catch (err) { Forge.toast(err.message, 'error'); }
  });

  if (idFromUrl && document.getElementById('gate-token').value) {
    openEditor(idFromUrl, document.getElementById('gate-token').value);
  }
})();
