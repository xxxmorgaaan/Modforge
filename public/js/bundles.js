(async function () {
  function cardHtml(b) {
    const bg = b.cover_path ? `style="background-image:url('${b.cover_path}')"` : '';
    return `
      <a class="mod-card" href="/bundle.html?id=${b.id}">
        <div class="cover" ${bg}>
          <span class="game-badge">${Forge.escapeHtml(b.game_name)}</span>
          ${b.featured ? '<span class="featured-badge">Витрина</span>' : ''}
        </div>
        <div class="body">
          <h3>${Forge.escapeHtml(b.title)}</h3>
          <div class="meta"><span>${Forge.escapeHtml(b.author_name)}</span><span>${b.mod_count} мод.</span></div>
          <p class="desc">${Forge.escapeHtml((b.description || '').slice(0, 140))}</p>
          <div class="stats-row">
            <span>⬇ ${b.downloads}</span>
            <span>♥ ${b.likes}</span>
            <span>${Forge.timeAgo(b.created_at)}</span>
          </div>
        </div>
      </a>
    `;
  }

  async function loadGames() {
    const games = await Forge.api('/games');
    const sel = document.getElementById('filter-game');
    games.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g.slug;
      opt.textContent = g.name;
      sel.appendChild(opt);
    });
  }

  async function loadBundles() {
    const game = document.getElementById('filter-game').value;
    const search = document.getElementById('filter-search').value.trim();
    const sort = document.getElementById('filter-sort').value;
    const params = new URLSearchParams();
    if (game) params.set('game', game);
    if (search) params.set('search', search);
    if (sort) params.set('sort', sort);
    const grid = document.getElementById('bundle-grid');
    try {
      const bundles = await Forge.api(`/bundles?${params.toString()}`);
      grid.innerHTML = bundles.length
        ? bundles.map(cardHtml).join('')
        : `<div class="empty-state" style="grid-column:1/-1"><h3>Сборок пока нет</h3><p>Попробуйте изменить фильтры или <a href="/bundle-upload.html" style="color:var(--teal)">соберите первую сборку</a>.</p></div>`;
    } catch (e) { Forge.toast(e.message, 'error'); }
  }

  let t;
  document.getElementById('filter-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(loadBundles, 300); });
  document.getElementById('filter-game').addEventListener('change', loadBundles);
  document.getElementById('filter-sort').addEventListener('change', loadBundles);

  await loadGames();
  await loadBundles();
})();
