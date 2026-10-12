const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { detectImageType } = require('../utils/fileSignature');
const { IMAGE_MIME_TYPES, LIMITS } = require('../config/constants');

const root = env.storageRoot;

const dirs = Object.freeze({
  attendanceImages: path.join(root, 'attendance-images'),
  registeredFaces: path.join(root, 'registered-faces'),
  temporary: path.join(root, 'temporary')
});

const ensureDirs = () => {
  Object.values(dirs).forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
};

const resolveRelative = (relativePath) => {
  const absolute = path.resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new AppError('Invalid storage path', 400, { code: 'INVALID_PATH' });
  }
  return absolute;
};

const removeAbsolute = async (absolutePath) => {
  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

const removeFiles = (absolutePaths) => Promise.all(absolutePaths.map(removeAbsolute));

const removeStored = (relativePath) => (relativePath ? removeAbsolute(resolveRelative(relativePath)) : Promise.resolve());

const readHead = async (filePath) => {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buffer, 0, 12, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const commitUploads = async (files, subdirectory, namePrefix = '') => {
  const targetDir = path.join(root, subdirectory);
  const detected = [];

  for (const file of files) {
    const mimeType = detectImageType(await readHead(file.path));
    if (!mimeType) {
      await removeFiles(files.map((item) => item.path));
      throw new AppError(
        `"${file.originalname}" is not a valid JPEG, PNG or WebP image`,
        400,
        { code: 'INVALID_FILE_TYPE' }
      );
    }
    detected.push(mimeType);
  }

  await fs.promises.mkdir(targetDir, { recursive: true });
  const stored = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const filename = `${namePrefix}${crypto.randomUUID()}${IMAGE_MIME_TYPES[detected[index]]}`;
      const destination = path.join(targetDir, filename);
      await fs.promises.rename(file.path, destination);
      stored.push({
        filename,
        absolutePath: destination,
        relativePath: path.posix.join(subdirectory.split(path.sep).join('/'), filename),
        originalName: file.originalname,
        mimeType: detected[index],
        size: file.size
      });
    }
  } catch (error) {
    await removeFiles([...stored.map((item) => item.absolutePath), ...files.map((item) => item.path)]);
    throw error;
  }
  return stored;
};

const readFile = async (relativePath) => {
  try {
    return await fs.promises.readFile(resolveRelative(relativePath));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AppError('Stored image file is missing', 409, { code: 'FILE_MISSING' });
    }
    throw error;
  }
};

const cleanTemporary = async () => {
  const entries = await fs.promises.readdir(dirs.temporary, { withFileTypes: true });
  const cutoff = Date.now() - LIMITS.TEMP_FILE_MAX_AGE_MS;
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name !== '.gitkeep')
      .map(async (entry) => {
        const filePath = path.join(dirs.temporary, entry.name);
        const stat = await fs.promises.stat(filePath);
        if (stat.mtimeMs < cutoff) await removeAbsolute(filePath);
      })
  );
};

module.exports = {
  dirs,
  ensureDirs,
  commitUploads,
  readFile,
  removeFiles,
  removeStored,
  cleanTemporary
};
