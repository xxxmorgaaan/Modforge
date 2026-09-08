const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAdmin, requireOwner } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Слишком много попыток входа. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username || '');
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  req.session.isAdmin = true;
  req.session.adminUsername = admin.username;
  req.session.adminRole = admin.role;
  res.json({ ok: true, username: admin.username, role: admin.role });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.json({ isAdmin: true, username: req.session.adminUsername, role: req.session.adminRole });
  }
  res.json({ isAdmin: false });
});

router.post('/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(req.session.adminUsername);
  if (!admin || !bcrypt.compareSync(currentPassword || '', admin.password_hash)) {
    return res.status(401).json({ error: 'Текущий пароль неверен' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Новый пароль должен быть не короче 6 символов' });
  }
  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, admin.id);
  res.json({ ok: true });
});

router.get('/stats', requireAdmin, (req, res) => {
  const games = db.prepare('SELECT COUNT(*) AS c FROM games').get().c;
  const mods = db.prepare('SELECT COUNT(*) AS c FROM mods').get().c;
  const bundles = db.prepare('SELECT COUNT(*) AS c FROM bundles').get().c;
  const downloads = db.prepare('SELECT COALESCE(SUM(downloads),0) AS c FROM mods').get().c;
  const comments = db.prepare('SELECT COUNT(*) AS c FROM comments').get().c;
  const pendingReports = db.prepare('SELECT COUNT(*) AS c FROM reports WHERE resolved = 0').get().c;
  res.json({ games, mods, bundles, downloads, comments, pendingReports });
});

// ---- Жалобы: список для панели (сводка + последнее сообщение) ----
router.get('/reports', requireAdmin, (req, res) => {
  const { includeResolved } = req.query;
  const rows = db.prepare(`
    SELECT r.*, m.title AS mod_title, m.id AS mod_ref, b.title AS bundle_title, b.id AS bundle_ref
    FROM reports r
    LEFT JOIN mods m ON m.id = r.mod_id
    LEFT JOIN bundles b ON b.id = r.bundle_id
    ${includeResolved === 'true' ? '' : 'WHERE r.resolved = 0'}
    ORDER BY r.created_at DESC
  `).all();
  const withLast = rows.map((r) => {
    const last = db.prepare('SELECT sender, text, created_at FROM report_messages WHERE report_id = ? ORDER BY created_at DESC LIMIT 1').get(r.id);
    return {
      id: r.id,
      resolved: !!r.resolved,
      subject_title: r.mod_title || r.bundle_title || 'Удалено',
      subject_type: r.mod_id ? 'mod' : 'bundle',
      subject_id: r.mod_ref || r.bundle_ref,
      created_at: r.created_at,
      last_message: last ? last.text : r.reason,
      last_sender: last ? last.sender : 'user',
      last_at: last ? last.created_at : r.created_at,
    };
  });
  res.json(withLast);
});

router.post('/reports/:id/resolve', requireAdmin, (req, res) => {
  db.prepare('UPDATE reports SET resolved = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Кураторские действия (витрина/видимость) — только владелец ----
router.post('/mods/:id/feature', requireOwner, (req, res) => {
  const mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(req.params.id);
  if (!mod) return res.status(404).json({ error: 'Мод не найден' });
  db.prepare('UPDATE mods SET featured = ? WHERE id = ?').run(mod.featured ? 0 : 1, mod.id);
  res.json({ featured: !mod.featured });
});

router.post('/mods/:id/hide', requireOwner, (req, res) => {
  const mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(req.params.id);
  if (!mod) return res.status(404).json({ error: 'Мод не найден' });
  db.prepare('UPDATE mods SET hidden = ? WHERE id = ?').run(mod.hidden ? 0 : 1, mod.id);
  res.json({ hidden: !mod.hidden });
});

router.post('/bundles/:id/feature', requireOwner, (req, res) => {
  const bundle = db.prepare('SELECT * FROM bundles WHERE id = ?').get(req.params.id);
  if (!bundle) return res.status(404).json({ error: 'Сборка не найдена' });
  db.prepare('UPDATE bundles SET featured = ? WHERE id = ?').run(bundle.featured ? 0 : 1, bundle.id);
  res.json({ featured: !bundle.featured });
});

router.post('/bundles/:id/hide', requireOwner, (req, res) => {
  const bundle = db.prepare('SELECT * FROM bundles WHERE id = ?').get(req.params.id);
  if (!bundle) return res.status(404).json({ error: 'Сборка не найдена' });
  db.prepare('UPDATE bundles SET hidden = ? WHERE id = ?').run(bundle.hidden ? 0 : 1, bundle.id);
  res.json({ hidden: !bundle.hidden });
});

// ---- Управление администраторами — только владелец ----
router.get('/admins', requireOwner, (req, res) => {
  const rows = db.prepare('SELECT id, username, role, created_at FROM admins ORDER BY created_at ASC').all();
  res.json(rows);
});

router.post('/admins', requireOwner, (req, res) => {
  const { username, password } = req.body;
  if (!username || !username.trim() || !password || password.length < 6) {
    return res.status(400).json({ error: 'Укажите логин и пароль (не короче 6 символов)' });
  }
  const exists = db.prepare('SELECT id FROM admins WHERE username = ?').get(username.trim());
  if (exists) return res.status(409).json({ error: 'Такой логин уже занят' });
  const hash = bcrypt.hashSync(password, 12);
  // новые администраторы, добавленные через панель, всегда модераторы —
  // они не могут управлять играми или другими админами
  const info = db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)').run(username.trim(), hash, 'moderator');
  res.status(201).json(db.prepare('SELECT id, username, role, created_at FROM admins WHERE id = ?').get(info.lastInsertRowid));
});

router.post('/admins/:id/reset-password', requireOwner, (req, res) => {
  const target = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Администратор не найден' });
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, target.id);
  res.json({ ok: true });
});

router.delete('/admins/:id', requireOwner, (req, res) => {
  const target = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Администратор не найден' });
  if (target.username === req.session.adminUsername) return res.status(400).json({ error: 'Нельзя удалить самого себя' });
  if (target.role === 'owner') return res.status(400).json({ error: 'Нельзя удалить главного администратора через эту панель' });
  db.prepare('DELETE FROM admins WHERE id = ?').run(target.id);
  res.json({ ok: true });
});

module.exports = router;
