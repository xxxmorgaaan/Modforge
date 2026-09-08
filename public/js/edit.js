(function () {
  const params = new URLSearchParams(location.search);
  const idFromUrl = params.get('id');
  let mod = null;
  let token = null;

  if (idFromUrl) {
    document.getElementById('gate-id').value = idFromUrl;
    const saved = Forge.getModToken(idFromUrl);
    if (saved) document.getElementById('gate-token').value = saved;
  }

  async function openEditor(id, tok) {
    try {
      mod = await Forge.api(`/mods/${id}`);
    } catch (e) {
      Forge.toast('Мод не найден', 'error');
      return;
    }
    token = tok;
    document.getElementById('token-gate').style.display = 'none';
    document.getElementById('edit-area').style.display = '';
    document.getElementById('e-title').value = mod.title;
    document.getElementById('e-version').value = mod.version;
    document.getElementById('e-author').value = mod.author_name;
    document.getElementById('e-tags').value = mod.tags.join(', ');
    document.getElementById('e-description').value = mod.description;
  }

  document.getElementById('gate-btn').addEventListener('click', () => {
    const id = document.getElementById('gate-id').value.trim();
    const tok = document.getElementById('gate-token').value.trim();
    if (!id || !tok) { Forge.toast('Заполните ID мода и код управления', 'error'); return; }
    openEditor(id, tok);
  });

  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('token', token);
    fd.append('title', document.getElementById('e-title').value);
    fd.append('version', document.getElementById('e-version').value);
    fd.append('author_name', document.getElementById('e-author').value);
    fd.append('tags', document.getElementById('e-tags').value);
    fd.append('description', document.getElementById('e-description').value);
    fd.append('changelog', document.getElementById('e-changelog').value);
    const cover = document.getElementById('e-cover').files[0];
    if (cover) fd.append('cover', cover);
    Array.from(document.getElementById('e-shots').files).forEach((f) => fd.append('screenshots', f));
    const modfile = document.getElementById('e-modfile').files[0];
    if (modfile) fd.append('modfile', modfile);

    try {
      await Forge.api(`/mods/${mod.id}`, { method: 'PUT', body: fd });
      Forge.toast('Изменения сохранены', 'success');
    } catch (err) { Forge.toast(err.message, 'error'); }
  });

  document.getElementById('delete-btn').addEventListener('click', async () => {
    if (!confirm('Удалить мод безвозвратно? Это действие нельзя отменить.')) return;
    try {
      await Forge.api(`/mods/${mod.id}?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
      Forge.toast('Мод удалён', 'success');
      setTimeout(() => { location.href = '/'; }, 1000);
    } catch (err) { Forge.toast(err.message, 'error'); }
  });

  if (idFromUrl && document.getElementById('gate-token').value) {
    openEditor(idFromUrl, document.getElementById('gate-token').value);
  }
})();
