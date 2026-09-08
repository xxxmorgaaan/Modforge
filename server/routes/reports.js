const express = require('express');
const db = require('../db');
const { generateToken, hashToken } = require('../middleware/auth');

const router = express.Router();

function canAccessReport(req, report) {
  if (req.session && req.session.isAdmin) return true;
  const provided = req.body.token || req.query.token;
  if (!provided) return false;
  return hashToken(provided) === report.token_hash;
}

// Создать жалобу на мод или сборку — сразу же превращается в переписку
router.post('/', (req, res) => {
  const { mod_id, bundle_id, reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'Опишите проблему' });
  if (!mod_id && !bundle_id) return res.status(400).json({ error: 'Не указан мод или сборка' });

  if (mod_id) {
    const mod = db.prepare('SELECT id FROM mods WHERE id = ?').get(mod_id);
    if (!mod) return res.status(404).json({ error: 'Мод не найден' });
  }
  if (bundle_id) {
    const bundle = db.prepare('SELECT id FROM bundles WHERE id = ?').get(bundle_id);
    if (!bundle) return res.status(404).json({ error: 'Сборка не найдена' });
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const info = db.prepare('INSERT INTO reports (mod_id, bundle_id, reason, token_hash) VALUES (?, ?, ?, ?)')
    .run(mod_id || null, bundle_id || null, reason.trim().slice(0, 1000), tokenHash);

  db.prepare('INSERT INTO report_messages (report_id, sender, sender_name, text) VALUES (?, ?, ?, ?)')
    .run(info.lastInsertRowid, 'user', 'Автор обращения', reason.trim().slice(0, 1000));

  res.status(201).json({ reportId: info.lastInsertRowid, token });
});

// Получить переписку по жалобе — либо по токену (заявитель), либо администратор
router.get('/:id', (req, res) => {
  const report = db.prepare(`
    SELECT r.*, m.title AS mod_title, b.title AS bundle_title
    FROM reports r
    LEFT JOIN mods m ON m.id = r.mod_id
    LEFT JOIN bundles b ON b.id = r.bundle_id
    WHERE r.id = ?
  `).get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Обращение не найдено' });
  if (!canAccessReport(req, report)) return res.status(403).json({ error: 'Нет доступа к этой переписке' });

  const messages = db.prepare('SELECT sender, sender_name, text, created_at FROM report_messages WHERE report_id = ? ORDER BY created_at ASC').all(report.id);
  res.json({
    id: report.id, reason: report.reason, resolved: !!report.resolved,
    mod_id: report.mod_id, bundle_id: report.bundle_id,
    subject_title: report.mod_title || report.bundle_title || 'Удалено',
    created_at: report.created_at, messages,
  });
});

// Добавить сообщение в переписку
router.post('/:id/messages', (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Обращение не найдено' });
  if (!canAccessReport(req, report)) return res.status(403).json({ error: 'Нет доступа к этой переписке' });
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Сообщение не может быть пустым' });

  const isAdmin = !!(req.session && req.session.isAdmin);
  const sender = isAdmin ? 'admin' : 'user';
  const senderName = isAdmin ? (req.session.adminUsername || 'Администрация') : 'Автор обращения';
  db.prepare('INSERT INTO report_messages (report_id, sender, sender_name, text) VALUES (?, ?, ?, ?)')
    .run(report.id, sender, senderName, text.trim().slice(0, 2000));

  // ответ администрации автоматически "поднимает" жалобу из решённых, если она вдруг была закрыта
  if (isAdmin === false && report.resolved) {
    db.prepare('UPDATE reports SET resolved = 0 WHERE id = ?').run(report.id);
  }

  res.status(201).json({ ok: true });
});

module.exports = router;
