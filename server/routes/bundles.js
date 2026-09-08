const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { generateToken, hashToken, canManageResource } = require('../middleware/auth');
const { uploadBundleAssets, DIRS } = require('../utils/upload');

const router = express.Router();

function parseJsonSafe(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function slugify(str) {
  const translit = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const transliterated = str.toLowerCase().split('').map((ch) => translit[ch] ?? ch).join('');
  return transliterated.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || `bundle-${Date.now()}`;
}

function serializeBundle(b) {
  const out = { ...b, tags: parseJsonSafe(b.tags, []), mod_ids: parseJsonSafe(b.mod_ids, []), hidden: !!b.hidden, featured: !!b.featured };
  delete out.token_hash;
  return out;
}

function unlinkQuiet(relPath, kindDir) {
  if (!relPath) return;
  fs.unlink(path.join(kindDir, path.basename(relPath)), () => {});
}

router.get('/', (req, res) => {
  const { game, search, tag, sort = 'newest', featured, includeHidden } = req.query;
  const clauses = [];
  const params = {};
  if (!includeHidden) clauses.push('b.hidden = 0');
  if (game) { clauses.push('g.slug = @game'); params.game = game; }
  if (search) { clauses.push('(b.title LIKE @search OR b.description LIKE @search OR b.author_name LIKE @search)'); params.search = `%${search}%`; }
  if (featured === 'true') clauses.push('b.featured = 1');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const orderMap = { newest: 'b.created_at DESC', updated: 'b.updated_at DESC', popular: 'b.downloads DESC', top_rated: 'b.likes DESC', az: 'b.title COLLATE NOCASE ASC' };
  const order = orderMap[sort] || orderMap.newest;

  let rows = db.prepare(`
    SELECT b.*, g.name AS game_name, g.slug AS game_slug
    FROM bundles b JOIN games g ON g.id = b.game_id
    ${where}
    ORDER BY ${order}
  `).all(params);

  if (tag) rows = rows.filter((r) => parseJsonSafe(r.tags, []).includes(tag));

  const withCounts = rows.map((r) => ({ ...serializeBundle(r), mod_count: parseJsonSafe(r.mod_ids, []).length }));
  res.json(withCounts);
});

router.get('/:id', (req, res) => {
  const bundle = db.prepare(`
    SELECT b.*, g.name AS game_name, g.slug AS game_slug
    FROM bundles b JOIN games g ON g.id = b.game_id WHERE b.id = ?
  `).get(req.params.id);
  if (!bundle) return res.status(404).json({ error: 'Сборка не найдена' });
  const modIds = parseJsonSafe(bundle.mod_ids, []);
  const mods = modIds.length
    ? db.prepare(`SELECT id, title, slug, cover_path, downloads, likes, file_size, hidden FROM mods WHERE id IN (${modIds.map(() => '?').join(',')})`).all(...modIds)
    : [];
  // сохраняем порядок, в котором моды были добавлены в сборку
  const orderedMods = modIds.map((id) => mods.find((m) => m.id === id)).filter(Boolean);
  res.json({ ...serializeBundle(bundle), mods: orderedMods });
});

router.post('/', (req, res) => {
  uploadBundleAssets(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const { game_id, title, description, author_name, tags, mod_ids } = req.body;
    if (!game_id || !title || !title.trim()) return res.status(400).json({ error: 'Укажите игру и название сборки' });
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(game_id);
    if (!game) return res.status(400).json({ error: 'Выбранная игра не найдена' });

    const modIdList = (parseJsonSafe(mod_ids, null) || []).map(Number).filter(Boolean);
    if (modIdList.length < 2) return res.status(400).json({ error: 'Сборка должна включать минимум 2 мода' });
    const placeholders = modIdList.map(() => '?').join(',');
    const foundMods = db.prepare(`SELECT id, game_id FROM mods WHERE id IN (${placeholders})`).all(...modIdList);
    if (foundMods.length !== modIdList.length) return res.status(400).json({ error: 'Один или несколько модов не найдены' });
    if (foundMods.some((m) => String(m.game_id) !== String(game_id))) {
      return res.status(400).json({ error: 'Все моды в сборке должны быть для одной и той же игры' });
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    let slug = slugify(title);
    const clash = db.prepare('SELECT id FROM bundles WHERE game_id = ? AND slug = ?').get(game_id, slug);
    if (clash) slug = `${slug}-${Date.now().toString(36)}`;
    const coverPath = req.files?.cover ? `/uploads/bundles/covers/${req.files.cover[0].filename}` : null;
    const tagList = parseJsonSafe(tags, null) || (tags ? String(tags).split(',').map((t) => t.trim()).filter(Boolean) : []);

    const info = db.prepare(`
      INSERT INTO bundles (game_id, slug, title, description, author_name, tags, cover_path, mod_ids, token_hash)
      VALUES (@game_id, @slug, @title, @description, @author_name, @tags, @cover_path, @mod_ids, @token_hash)
    `).run({
      game_id, slug, title: title.trim(), description: description || '', author_name: author_name?.trim() || 'Аноним',
      tags: JSON.stringify(tagList), cover_path: coverPath, mod_ids: JSON.stringify(modIdList), token_hash: tokenHash,
    });

    const bundle = db.prepare('SELECT * FROM bundles WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ bundle: serializeBundle(bundle), token });
  });
});

router.put('/:id', (req, res) => {
  const bundle = db.prepare('SELECT * FROM bundles WHERE id = ?').get(req.params.id);
  if (!bundle) return res.status(404).json({ error: 'Сборка не найдена' });
  uploadBundleAssets(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!canManageResource(req, bundle)) return res.status(403).json({ error: 'Неверный код управления сборкой' });

    const { title, description, author_name, tags, mod_ids } = req.body;
    let coverPath = bundle.cover_path;
    if (req.files?.cover) {
      unlinkQuiet(bundle.cover_path, DIRS.bundleCovers);
      coverPath = `/uploads/bundles/covers/${req.files.cover[0].filename}`;
    }
    let modIdList = parseJsonSafe(bundle.mod_ids, []);
    if (mod_ids !== undefined) {
      const requested = (parseJsonSafe(mod_ids, null) || []).map(Number).filter(Boolean);
      if (requested.length < 2) return res.status(400).json({ error: 'Сборка должна включать минимум 2 мода' });
      const placeholders = requested.map(() => '?').join(',');
      const foundMods = db.prepare(`SELECT id, game_id FROM mods WHERE id IN (${placeholders})`).all(...requested);
      if (foundMods.length !== requested.length || foundMods.some((m) => String(m.game_id) !== String(bundle.game_id))) {
        return res.status(400).json({ error: 'Все моды в сборке должны существовать и относиться к той же игре' });
      }
      modIdList = requested;
    }
    const tagList = tags !== undefined ? (parseJsonSafe(tags, null) || String(tags).split(',').map((t) => t.trim()).filter(Boolean)) : parseJsonSafe(bundle.tags, []);

    db.prepare(`
      UPDATE bundles SET title=@title, description=@description, author_name=@author_name, tags=@tags,
        cover_path=@cover_path, mod_ids=@mod_ids, updated_at=datetime('now') WHERE id=@id
    `).run({
      id: bundle.id, title: title?.trim() || bundle.title, description: description ?? bundle.description,
      author_name: author_name?.trim() || bundle.author_name, tags: JSON.stringify(tagList),
      cover_path: coverPath, mod_ids: JSON.stringify(modIdList),
    });
    res.json(serializeBundle(db.prepare('SELECT * FROM bundles WHERE id = ?').get(bundle.id)));
  });
});

router.delete('/:id', (req, res) => {
  const bundle = db.prepare('SELECT * FROM bundles WHERE id = ?').get(req.params.id);
  if (!bundle) return res.status(404).json({ error: 'Сборка не найдена' });
  if (!canManageResource(req, bundle)) return res.status(403).json({ error: 'Неверный код управления сборкой' });
  unlinkQuiet(bundle.cover_path, DIRS.bundleCovers);
  db.prepare('DELETE FROM bundles WHERE id = ?').run(bundle.id);
  res.json({ ok: true });
});

router.post('/:id/like', (req, res) => {
  const bundle = db.prepare('SELECT id, likes FROM bundles WHERE id = ?').get(req.params.id);
  if (!bundle) return res.status(404).json({ error: 'Сборка не найдена' });
  db.prepare('UPDATE bundles SET likes = likes + 1 WHERE id = ?').run(bundle.id);
  res.json({ likes: bundle.likes + 1 });
});

// Засчитывается при нажатии «Скачать всё» на клиенте — увеличивает счётчик сборки
router.post('/:id/download', (req, res) => {
  const bundle = db.prepare('SELECT id FROM bundles WHERE id = ?').get(req.params.id);
  if (!bundle) return res.status(404).json({ error: 'Сборка не найдена' });
  db.prepare('UPDATE bundles SET downloads = downloads + 1 WHERE id = ?').run(bundle.id);
  res.json({ ok: true });
});

router.get('/meta/tags', (req, res) => {
  const rows = db.prepare('SELECT tags FROM bundles WHERE hidden = 0').all();
  const counts = {};
  rows.forEach((r) => parseJsonSafe(r.tags, []).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
  res.json(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })));
});

module.exports = router;
