(async function () {
  if (Forge.getRole() === 'developer') document.getElementById('dev-notice').style.display = '';

  try {
    const games = await Forge.api('/games');
    const sel = document.getElementById('f-game');
    if (!games.length) {
      sel.innerHTML = '<option value="">Пока нет ни одной игры</option>';
      Forge.toast('Администратор ещё не добавил ни одной игры', 'error');
    } else {
      sel.innerHTML = games.map((g) => `<option value="${g.id}">${Forge.escapeHtml(g.name)}</option>`).join('');
    }
  } catch (e) { Forge.toast(e.message, 'error'); }

  function wireFileDrop(dropId, inputId, listId, multiple) {
    const drop = document.getElementById(dropId);
    const input = document.getElementById(inputId);
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const names = Array.from(input.files).map((f) => f.name);
      document.getElementById(listId).textContent = names.join(', ');
    });
  }
  wireFileDrop('cover-drop', 'f-cover', 'cover-list');
  wireFileDrop('shots-drop', 'f-shots', 'shots-list', true);
  wireFileDrop('file-drop', 'f-modfile', 'file-list');

  document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const modFile = document.getElementById('f-modfile').files[0];
    if (!modFile) { Forge.toast('Прикрепите файл мода', 'error'); return; }

    const fd = new FormData();
    fd.append('game_id', document.getElementById('f-game').value);
    fd.append('title', document.getElementById('f-title').value);
    fd.append('description', document.getElementById('f-description').value);
    fd.append('author_name', document.getElementById('f-author').value);
    fd.append('version', document.getElementById('f-version').value);
    fd.append('tags', document.getElementById('f-tags').value);
    const cover = document.getElementById('f-cover').files[0];
    if (cover) fd.append('cover', cover);
    Array.from(document.getElementById('f-shots').files).forEach((f) => fd.append('screenshots', f));
    fd.append('modfile', modFile);

    const btn = document.getElementById('submit-btn');
    btn.disabled = true; btn.textContent = 'Публикуем…';
    try {
      const result = await Forge.api('/mods', { method: 'POST', body: fd });
      Forge.saveModToken(result.mod.id, result.token);
      document.getElementById('token-value').textContent = result.token;
      document.getElementById('goto-mod').href = `/mod.html?id=${result.mod.id}`;
      document.getElementById('token-modal').classList.add('open');
      document.getElementById('copy-token').addEventListener('click', () => {
        navigator.clipboard.writeText(result.token);
        Forge.toast('Код скопирован', 'success');
      });
      e.target.reset();
      ['cover-list', 'shots-list', 'file-list'].forEach((id) => { document.getElementById(id).textContent = ''; });
    } catch (err) {
      Forge.toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Опубликовать мод';
    }
  });
})();
