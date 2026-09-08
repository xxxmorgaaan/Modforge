require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

require('./db'); // инициализирует базу и главного админа при первом запуске

const gamesRouter = require('./routes/games');
const modsRouter = require('./routes/mods');
const bundlesRouter = require('./routes/bundles');
const reportsRouter = require('./routes/reports');
const adminRouter = require('./routes/admin');
const { UPLOAD_ROOT } = require('./utils/upload');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false, // упрощаем для статичных страниц со шрифтами с CDN
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'insecure-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 1000 * 60 * 60 * 12, // 12 часов
    sameSite: 'lax',
  },
}));

// Общий лимит запросов на запись — защита от спама/флуда.
// Лайки и скачивания не считаем "спамом" в этом смысле и не режем их — иначе
// во время активного использования сайта лайк может тихо перестать срабатывать.
const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  message: { error: 'Слишком много запросов. Подождите немного.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET' || /\/(like|download)$/.test(req.path),
});
app.use('/api', writeLimiter);

app.use('/uploads', express.static(UPLOAD_ROOT, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/games', gamesRouter);
app.use('/api/mods', modsRouter);
app.use('/api/bundles', bundlesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/admin', adminRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

// SPA-подобный фоллбэк для чистых путей вроде /mod/12 не нужен — используем query-параметры,
// но на всякий случай отдаём index.html для неизвестных не-API GET запросов
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', '404.html'), (err) => {
    if (err) next();
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.message && err.message.includes('File too large')) {
    return res.status(413).json({ error: 'Файл слишком большой' });
  }
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`[modforge] Сервер запущен на порту ${PORT}`);
});
