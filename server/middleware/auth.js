const crypto = require('crypto');

// Любой вошедший администратор (и владелец, и модератор)
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Требуется вход администратора' });
}

// Только главный администратор (владелец) — игры, управление другими админами,
// витрина/скрытие контента. Модераторам сюда нельзя.
function requireOwner(req, res, next) {
  if (req.session && req.session.isAdmin && req.session.adminRole === 'owner') return next();
  if (req.session && req.session.isAdmin) {
    return res.status(403).json({ error: 'Это действие доступно только главному администратору' });
  }
  return res.status(401).json({ error: 'Требуется вход администратора' });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(20).toString('hex');
}

// Разрешает действие, если запрос пришёл от админа (любой роли) ИЛИ содержит верный токен —
// используется и для модов, и для сборок, и для доступа к переписке по жалобе (везде поле token_hash)
function canManageResource(req, resource) {
  if (req.session && req.session.isAdmin) return true;
  const provided = req.body.token || req.query.token || req.headers['x-mod-token'];
  if (!provided) return false;
  return hashToken(provided) === resource.token_hash;
}

module.exports = {
  requireAdmin,
  requireOwner,
  hashToken,
  generateToken,
  canManageResource,
  canManageMod: canManageResource, // старое имя — для обратной совместимости
};
