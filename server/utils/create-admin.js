// Использование: node server/utils/create-admin.js <username> <password>
// Создаёт нового админа или обновляет пароль существующего — полезно на VPS,
// если забыт пароль или нужен второй администратор.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

const [, , username, password] = process.argv;

if (!username || !password) {
  console.log('Использование: node server/utils/create-admin.js <username> <password>');
  process.exit(1);
}
if (password.length < 6) {
  console.log('Пароль должен быть не короче 6 символов');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
if (existing) {
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, existing.id);
  console.log(`Пароль администратора "${username}" обновлён.`);
} else {
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hash);
  console.log(`Администратор "${username}" создан.`);
}
