const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');
const { uploadGameCover, DIRS } = require('../utils/upload');

const router = express.Router();

function slugify(str) {
  const translit = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const transliterated = str.toLowerCase().split('').map((ch) => translit[ch] ?? ch).join('');
  return transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `game-${Date.now()}`;
}

router.get('/', (req, res) => {
  const games = db.prepare(`
    SELECT g.*, COUNT(m.id) AS mod_count
    FROM games g
    LEFT JOIN mods m ON m.game_id = g.id AND m.hidden = 0
    GROUP BY g.id
    ORDER BY g.name COLLATE NOCASE ASC
  `).all();
  res.json(games);
});

router.get('/:slug', (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE slug = ?').get(req.params.slug);
  if (!game) return res.status(404).json({ error: 'Игра не найдена' });
  res.json(game);
});

router.post('/', requireOwner, (req, res) => {
  uploadGameCover(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Укажите название игры' });
    let slug = slugify(name);
    const exists = db.prepare('SELECT id FROM games WHERE slug = ?').get(slug);
    if (exists) slug = `${slug}-${Date.now().toString(36)}`;
    const coverPath = req.file ? `/uploads/games/${req.file.filename}` : null;
    const info = db.prepare('INSERT INTO games (slug, name, description, cover_path) VALUES (?, ?, ?, ?)')
      .run(slug, name.trim(), (description || '').trim(), coverPath);
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(game);
  });
});

router.put('/:id', requireOwner, (req, res) => {
  uploadGameCover(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Игра не найдена' });
    const { name, description } = req.body;
    let coverPath = game.cover_path;
    if (req.file) {
      if (game.cover_path) {
        const oldPath = path.join(DIRS.games, path.basename(game.cover_path));
        fs.unlink(oldPath, () => {});
      }
      coverPath = `/uploads/games/${req.file.filename}`;
    }
    db.prepare('UPDATE games SET name = ?, description = ?, cover_path = ? WHERE id = ?')
      .run(name?.trim() || game.name, description ?? game.description, coverPath, req.params.id);
    res.json(db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id));
  });
});

router.delete('/:id', requireOwner, (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Игра не найдена' });
  const modCount = db.prepare('SELECT COUNT(*) AS c FROM mods WHERE game_id = ?').get(req.params.id).c;
  if (modCount > 0 && req.query.force !== 'true') {
    return res.status(409).json({ error: `У этой игры ${modCount} мод(ов). Повторите с force=true, чтобы удалить игру вместе со всеми модами.`, modCount });
  }
  db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
