const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const DIRS = {
  games: path.join(UPLOAD_ROOT, 'games'),
  covers: path.join(UPLOAD_ROOT, 'mods', 'covers'),
  screenshots: path.join(UPLOAD_ROOT, 'mods', 'screenshots'),
  files: path.join(UPLOAD_ROOT, 'mods', 'files'),
  bundleCovers: path.join(UPLOAD_ROOT, 'bundles', 'covers'),
};
Object.values(DIRS).forEach((d) => fs.mkdirSync(d, { recursive: true }));

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ARCHIVE_EXT = new Set(['.zip', '.rar', '.7z', '.pak', '.jar', '.tar', '.gz']);

function randomName(ext) {
  return crypto.randomBytes(16).toString('hex') + ext;
}

function makeStorage(kind) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, DIRS[kind]),
    filename: (req, file, cb) => cb(null, randomName(path.extname(file.originalname).toLowerCase())),
  });
}

const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_MB || 15) * 1024 * 1024;
const MAX_MOD_BYTES = Number(process.env.MAX_MOD_FILE_MB || 1024) * 1024 * 1024;

function imageFileFilter(req, file, cb) {
  if (!IMAGE_TYPES.has(file.mimetype)) {
    return cb(new Error('Разрешены только изображения JPG, PNG, WEBP или GIF'));
  }
  cb(null, true);
}

function modFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ARCHIVE_EXT.has(ext)) {
    return cb(new Error('Файл мода должен быть архивом: .zip, .rar, .7z, .pak, .jar, .tar или .gz'));
  }
  cb(null, true);
}

const uploadModAssets = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (file.fieldname === 'cover') return cb(null, DIRS.covers);
      if (file.fieldname === 'screenshots') return cb(null, DIRS.screenshots);
      if (file.fieldname === 'modfile') return cb(null, DIRS.files);
      cb(new Error('Неизвестное поле файла'));
    },
    filename: (req, file, cb) => cb(null, randomName(path.extname(file.originalname).toLowerCase())),
  }),
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'modfile') return modFileFilter(req, file, cb);
    return imageFileFilter(req, file, cb);
  },
  limits: { fileSize: MAX_MOD_BYTES },
}).fields([
  { name: 'cover', maxCount: 1 },
  { name: 'screenshots', maxCount: 8 },
  { name: 'modfile', maxCount: 1 },
]);

const uploadVersionAssets = multer({
  storage: makeStorage('files'),
  fileFilter: modFileFilter,
  limits: { fileSize: MAX_MOD_BYTES },
}).single('modfile');

const uploadGameCover = multer({
  storage: makeStorage('games'),
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_BYTES },
}).single('cover');

const uploadBundleAssets = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, DIRS.bundleCovers),
    filename: (req, file, cb) => cb(null, randomName(path.extname(file.originalname).toLowerCase())),
  }),
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_BYTES },
}).fields([{ name: 'cover', maxCount: 1 }]);

module.exports = { DIRS, UPLOAD_ROOT, uploadModAssets, uploadVersionAssets, uploadGameCover, uploadBundleAssets };
