const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'modforge.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  author_name TEXT DEFAULT 'Аноним',
  version TEXT DEFAULT '1.0',
  tags TEXT DEFAULT '[]',
  cover_path TEXT,
  screenshots TEXT DEFAULT '[]',
  file_path TEXT,
  file_name TEXT,
  file_size INTEGER DEFAULT 0,
  downloads INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  featured INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  token_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mod_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mod_id INTEGER NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  changelog TEXT DEFAULT '',
  file_path TEXT,
  file_name TEXT,
  file_size INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Сборки: набор из нескольких модов одной игры, объединённых в один пак
CREATE TABLE IF NOT EXISTS bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  author_name TEXT DEFAULT 'Аноним',
  tags TEXT DEFAULT '[]',
  cover_path TEXT,
  mod_ids TEXT NOT NULL DEFAULT '[]',
  downloads INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  featured INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  token_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mod_id INTEGER NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
  author_name TEXT DEFAULT 'Аноним',
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Жалобы теперь могут быть на мод или на сборку, и содержат переписку (report_messages)
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mod_id INTEGER REFERENCES mods(id) ON DELETE CASCADE,
  bundle_id INTEGER REFERENCES bundles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  resolved INTEGER DEFAULT 0,
  token_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS report_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  sender_name TEXT DEFAULT '',
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- role: 'owner' (главный админ — всё) или 'moderator' (только жалобы и удаление нарушающих модов/сборок)
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mods_game ON mods(game_id);
CREATE INDEX IF NOT EXISTS idx_bundles_game ON bundles(game_id);
CREATE INDEX IF NOT EXISTS idx_comments_mod ON comments(mod_id);
CREATE INDEX IF NOT EXISTS idx_reports_mod ON reports(mod_id);
CREATE INDEX IF NOT EXISTS idx_reports_bundle ON reports(bundle_id);
CREATE INDEX IF NOT EXISTS idx_report_messages_report ON report_messages(report_id);
`);

// Первичная инициализация главного админа (роль owner) из .env, если таблица admins пуста
function ensureDefaultAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  if (count === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'change-me-please';
    const hash = bcrypt.hashSync(password, 12);
    db.prepare('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'owner');
    console.log(`[modforge] Создан главный администратор "${username}" из .env — обязательно смените пароль в панели.`);
  }
}
ensureDefaultAdmin();

module.exports = db;
