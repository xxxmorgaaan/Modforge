(async function () {
  const state = { games: [], mods: [], activeTag: null };

  function modCardHtml(m) {
    const cover = m.cover_path || '';
    const bg = cover ? `style="background-image:url('${cover}')"` : '';
    return `
      <a class="mod-card" href="/mod.html?id=${m.id}">
        <div class="cover" ${bg}>
          <span class="game-badge">${Forge.escapeHtml(m.game_name)}</span>
          ${m.featured ? '<span class="featured-badge">Витрина</span>' : ''}
        </div>
        <div class="body">
          <h3>${Forge.escapeHtml(m.title)}</h3>
          <div class="meta"><span>${Forge.escapeHtml(m.author_name)}</span><span>v${Forge.escapeHtml(m.version)}</span></div>
          <p class="desc">${Forge.escapeHtml((m.description || '').slice(0, 140))}</p>
          <div class="stats-row">
            <span>⬇ ${m.downloads}</span>
            <span>♥ ${m.likes}</span>
            <span>${Forge.timeAgo(m.created_at)}</span>
          </div>
        </div>
      </a>
    `;
  }

  function renderMods() {
    const grid = document.getElementById('mod-grid');
    const countEl = document.getElementById('result-count');
    if (!state.mods.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <h3>Модов пока нет</h3>
        <p>Попробуйте изменить фильтры или <a href="/upload.html" style="color:var(--teal)">загрузите первый мод</a>.</p>
      </div>`;
      countEl.textContent = '';
      return;
    }
    grid.innerHTML = state.mods.map(modCardHtml).join('');
    countEl.textContent = `найдено: ${state.mods.length}`;
  }

  async function loadStats() {
    try {
      const games = await Forge.api('/games');
      const totalDownloads = 0; // считается ниже из модов
      document.getElementById('stat-games').textContent = games.length;
    } catch (e) { /* тихо */ }
  }

  async function loadGames() {
    const games = await Forge.api('/games');
    state.games = games;
    const sel = document.getElementById('filter-game');
    games.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g.slug;
      opt.textContent = `${g.name} (${g.mod_count})`;
      sel.appendChild(opt);
    });
    document.getElementById('stat-games').textContent = games.length;
  }

  async function loadTags() {
    const tags = await Forge.api('/mods/tags');
    const wrap = document.getElementById('tag-chips');
    wrap.innerHTML = tags.slice(0, 14).map((t) => `<span class="chip" data-tag="${Forge.escapeHtml(t.tag)}">${Forge.escapeHtml(t.tag)} · ${t.count}</span>`).join('');
    wrap.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag;
        state.activeTag = state.activeTag === tag ? null : tag;
        wrap.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.tag === state.activeTag));
        loadMods();
      });
    });
  }

  async function loadFeatured() {
    const mods = await Forge.api('/mods?featured=true');
    if (!mods.length) return;
    document.getElementById('featured-section').style.display = '';
    document.getElementById('featured-grid').innerHTML = mods.map(modCardHtml).join('');
  }

  async function loadMods() {
    const game = document.getElementById('filter-game').value;
    const search = document.getElementById('filter-search').value.trim();
    const sort = document.getElementById('filter-sort').value;
    const params = new URLSearchParams();
    if (game) params.set('game', game);
    if (search) params.set('search', search);
    if (sort) params.set('sort', sort);
    if (state.activeTag) params.set('tag', state.activeTag);
    const mods = await Forge.api(`/mods?${params.toString()}`);
    state.mods = mods;
    renderMods();

    const totalDownloads = mods.reduce((s, m) => s + m.downloads, 0);
    document.getElementById('stat-mods').textContent = mods.length;
    document.getElementById('stat-downloads').textContent = totalDownloads;
  }

  let searchTimer;
  document.getElementById('filter-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadMods, 300);
  });
  document.getElementById('filter-game').addEventListener('change', loadMods);
  document.getElementById('filter-sort').addEventListener('change', loadMods);

  try {
    await loadGames();
    await loadTags();
    await loadFeatured();
    await loadMods();
  } catch (e) {
    Forge.toast(e.message, 'error');
  }
})();
