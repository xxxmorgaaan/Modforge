const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { generateToken, hashToken, canManageMod } = require('../middleware/auth');
const { uploadModAssets, uploadVersionAssets, DIRS } = require('../utils/upload');

const router = express.Router();

function parseJsonSafe(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function serializeMod(mod, { includeToken = false } = {}) {
  const out = {
    ...mod,
    tags: parseJsonSafe(mod.tags, []),
    screenshots: parseJsonSafe(mod.screenshots, []),
    hidden: !!mod.hidden,
    featured: !!mod.featured,
  };
  delete out.token_hash;
  return out;
}

function slugify(str) {
  const translit = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const transliterated = str.toLowerCase().split('').map((ch) => translit[ch] ?? ch).join('');
  return transliterated.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || `mod-${Date.now()}`;
}

function unlinkQuiet(relPath, kindDir) {
  if (!relPath) return;
  fs.unlink(path.join(kindDir, path.basename(relPath)), () => {});
}

// ---- Список / поиск модов ----
router.get('/', (req, res) => {
  const { game, search, tag, sort = 'newest', featured, includeHidden } = req.query;
  const clauses = [];
  const params = {};
  if (!includeHidden) clauses.push('m.hidden = 0');
  if (game) { clauses.push('g.slug = @game'); params.game = game; }
  if (search) { clauses.push('(m.title LIKE @search OR m.description LIKE @search OR m.author_name LIKE @search)'); params.search = `%${search}%`; }
  if (featured === 'true') clauses.push('m.featured = 1');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const orderMap = {
    newest: 'm.created_at DESC',
    updated: 'm.updated_at DESC',
    popular: 'm.downloads DESC',
    top_rated: 'm.likes DESC',
    az: 'm.title COLLATE NOCASE ASC',
  };
  const order = orderMap[sort] || orderMap.newest;

  let rows = db.prepare(`
    SELECT m.*, g.name AS game_name, g.slug AS game_slug
    FROM mods m JOIN games g ON g.id = m.game_id
    ${where}
    ORDER BY ${order}
  `).all(params);

  if (tag) {
    rows = rows.filter((r) => parseJsonSafe(r.tags, []).includes(tag));
  }

  res.json(rows.map((r) => serializeMod(r)));
});

router.get('/tags', (req, res) => {
  const rows = db.prepare('SELECT tags FROM mods WHERE hidden = 0').all();
  const counts = {};
  rows.forEach((r) => parseJsonSafe(r.tags, []).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
  const list = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
  res.json(list);
});

router.get('/:id', (req, res) => {
  const mod = db.prepare(`
    SELECT m.*, g.name AS game_name, g.slug AS game_slug
    FROM mods m JOIN games g ON g.id = m.game_id WHERE m.id = ?
  `).get(req.params.id);
  if (!mod) return res.status(404).json({ error: 'Мод не найден' });
  const versions = db.prepare('SELECT id, version, changelog, file_name, file_size, created_at FROM mod_versions WHERE mod_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ...serializeMod(mod), versions });
});

// ---- Создание мода (разработчик, без регистрации — выдаём токен управления) ----
router.post('/', (req, res) => {
  uploadModAssets(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const { game_id, title, description, author_name, version, tags } = req.body;
    if (!game_id || !title || !title.trim()) {
      return res.status(400).json({ error: 'Укажите игру и название мода' });
    }
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(game_id);
    if (!game) return res.status(400).json({ error: 'Выбранная игра не найдена' });
    if (!req.files || !req.files.modfile) {
      return res.status(400).json({ error: 'Прикрепите файл мода (архив)' });
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    let slug = slugify(title);
    const clash = db.prepare('SELECT id FROM mods WHERE game_id = ? AND slug = ?').get(game_id, slug);
    if (clash) slug = `${slug}-${Date.now().toString(36)}`;

    const coverPath = req.files.cover ? `/uploads/mods/covers/${req.files.cover[0].filename}` : null;
    const screenshotPaths = (req.files.screenshots || []).map((f) => `/uploads/mods/screenshots/${f.filename}`);
    const modFile = req.files.modfile[0];
    const filePath = `/uploads/mods/files/${modFile.filename}`;
    const tagList = parseJsonSafe(tags, null) || (tags ? String(tags).split(',').map((t) => t.trim()).filter(Boolean) : []);

    const info = db.prepare(`
      INSERT INTO mods (game_id, slug, title, description, author_name, version, tags, cover_path, screenshots, file_path, file_name, file_size, token_hash)
      VALUES (@game_id, @slug, @title, @description, @author_name, @version, @tags, @cover_path, @screenshots, @file_path, @file_name, @file_size, @token_hash)
    `).run({
      game_id, slug, title: title.trim(), description: description || '', author_name: author_name?.trim() || 'Аноним',
      version: version?.trim() || '1.0', tags: JSON.stringify(tagList), cover_path: coverPath,
      screenshots: JSON.stringify(screenshotPaths), file_path: filePath, file_name: modFile.originalname,
      file_size: modFile.size, token_hash: tokenHash,
    });

    db.prepare('INSERT INTO mod_versions (mod_id, version, changelog, file_path, file_name, file_size) VALUES (?, ?, ?, ?, ?, ?)')
      .run(info.lastInsertRowid, version?.trim() || '1.0', 'Первая публикация', filePath, modFile.originalname, modFile.size);

    const mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ mod: serializeMod(mod), token });
  });
});

// ---- Обновление мода (владелец по токену, либо админ) ----
router.put('/:id', (req, res) => {
  const mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(req.params.id);
  if (!mod) return res.status(404).json({ error: 'Мод не найден' });

  uploadModAssets(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!canManageMod(req, mod)) return res.status(403).json({ error: 'Неверный код управления модом' });

    const { title, description, author_name, tags, version, changelog } = req.body;
    let coverPath = mod.cover_path;
    if (req.files?.cover) {
      unlinkQuiet(mod.cover_path, DIRS.covers);
      coverPath = `/uploads/mods/covers/${req.files.cover[0].filename}`;
    }
    let screenshots = parseJsonSafe(mod.screenshots, []);
    if (req.files?.screenshots?.length) {
      screenshots = screenshots.concat(req.files.screenshots.map((f) => `/uploads/mods/screenshots/${f.filename}`));
    }
    const removeShots = parseJsonSafe(req.body.remove_screenshots, []);
    if (removeShots.length) {
      screenshots.filter((s) => removeShots.includes(s)).forEach((s) => unlinkQuiet(s, DIRS.screenshots));
      screenshots = screenshots.filter((s) => !removeShots.includes(s));
    }

    let filePath = mod.file_path;
    let fileName = mod.file_name;
    let fileSize = mod.file_size;
    const newVersion = version?.trim() && version.trim() !== mod.version;
    if (req.files?.modfile) {
      filePath = `/uploads/mods/files/${req.files.modfile[0].filename}`;
      fileName = req.files.modfile[0].originalname;
      fileSize = req.files.modfile[0].size;
      db.prepare('INSERT INTO mod_versions (mod_id, version, changelog, file_path, file_name, file_size) VALUES (?, ?, ?, ?, ?, ?)')
        .run(mod.id, version?.trim() || mod.version, changelog || 'Обновление файла', filePath, fileName, fileSize);
    } else if (newVersion) {
      db.prepare('INSERT INTO mod_versions (mod_id, version, changelog, file_path, file_name, file_size) VALUES (?, ?, ?, ?, ?, ?)')
        .run(mod.id, version.trim(), changelog || 'Обновление описания', filePath, fileName, fileSize);
    }

    const tagList = tags !== undefined ? (parseJsonSafe(tags, null) || String(tags).split(',').map((t) => t.trim()).filter(Boolean)) : parseJsonSafe(mod.tags, []);

    db.prepare(`
      UPDATE mods SET title=@title, description=@description, author_name=@author_name, version=@version,
        tags=@tags, cover_path=@cover_path, screenshots=@screenshots, file_path=@file_path, file_name=@file_name,
        file_size=@file_size, updated_at=datetime('now') WHERE id=@id
    `).run({
      id: mod.id, title: title?.trim() || mod.title, description: description ?? mod.description,
      author_name: author_name?.trim() || mod.author_name, version: version?.trim() || mod.version,
      tags: JSON.stringify(tagList), cover_path: coverPath, screenshots: JSON.stringify(screenshots),
      file_path: filePath, file_name: fileName, file_size: fileSize,
    });

    res.json(serializeMod(db.prepare('SELECT * FROM mods WHERE id = ?').get(mod.id)));
  });
});

router.delete('/:id', (req, res) => {
  const mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(req.params.id);
  if (!mod) return res.status(404).json({ error: 'Мод не найден' });
  if (!canManageMod(req, mod)) return res.status(403).json({ error: 'Неверный код управления модом' });

  unlinkQuiet(mod.cover_path, DIRS.covers);
  parseJsonSafe(mod.screenshots, []).forEach((s) => unlinkQuiet(s, DIRS.screenshots));
  const versions = db.prepare('SELECT file_path FROM mod_versions WHERE mod_id = ?').all(mod.id);
  versions.forEach((v) => unlinkQuiet(v.file_path, DIRS.files));

  db.prepare('DELETE FROM mods WHERE id = ?').run(mod.id);

  // убираем этот мод из всех сборок, где он упоминался, чтобы не оставалось «мёртвых» ссылок
  const bundles = db.prepare('SELECT id, mod_ids FROM bundles').all();
  bundles.forEach((b) => {
    const ids = parseJsonSafe(b.mod_ids, []);
    if (ids.includes(mod.id)) {
      const filtered = ids.filter((id) => id !== mod.id);
      db.prepare('UPDATE bundles SET mod_ids = ? WHERE id = ?').run(JSON.stringify(filtered), b.id);
    }
  });

  res.json({ ok: true });
});

// ---- Скачивание ----
router.get('/:id/download', (req, res) => {
  const mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(req.params.id);
  if (!mod || !mod.file_path) return res.status(404).json({ error: 'Файл не найден' });
  db.prepare('UPDATE mods SET downloads = downloads + 1 WHERE id = ?').run(mod.id);
  const filePath = path.join(DIRS.files, path.basename(mod.file_path));
  res.download(filePath, mod.file_name || 'mod.zip');
});

// ---- Лайки ----
router.post('/:id/like', (req, res) => {
  const mod = db.prepare('SELECT id, likes FROM mods WHERE id = ?').get(req.params.id);
  if (!mod) return res.status(404).json({ error: 'Мод не найден' });
  db.prepare('UPDATE mods SET likes = likes + 1 WHERE id = ?').run(mod.id);
  res.json({ likes: mod.likes + 1 });
});

// ---- Комментарии ----
router.get('/:id/comments', (req, res) => {
  const comments = db.prepare('SELECT * FROM comments WHERE mod_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(comments);
});

router.post('/:id/comments', (req, res) => {
  const mod = db.prepare('SELECT id FROM mods WHERE id = ?').get(req.params.id);
  if (!mod) return res.status(404).json({ error: 'Мод не найден' });
  const { author_name, text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Комментарий не может быть пустым' });
  if (text.length > 2000) return res.status(400).json({ error: 'Слишком длинный комментарий' });
  const info = db.prepare('INSERT INTO comments (mod_id, author_name, text) VALUES (?, ?, ?)')
    .run(mod.id, (author_name || 'Аноним').trim().slice(0, 60), text.trim());
  res.status(201).json(db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid));
});

module.exports = router;
