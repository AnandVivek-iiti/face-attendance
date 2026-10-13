const path = require('path');
const dotenv = require('dotenv');

const serverRoot = path.resolve(__dirname, '../..');
const projectRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: [path.join(serverRoot, '.env'), path.join(projectRoot, '.env')] });

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};

const positiveInt = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
};

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32 || jwtSecret.startsWith('replace-with')) {
  throw new Error('JWT_SECRET must be a random string of at least 32 characters');
}

module.exports = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: positiveInt('PORT', 5000),
  mongodbUri: required('MONGODB_URI'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  mlServiceUrl: required('ML_SERVICE_URL').replace(/\/+$/, ''),
  // Optional: only needed when the ML service has API_KEY set. Empty means no header.
  mlApiKey: process.env.ML_API_KEY || '',
  mlTimeoutMs: positiveInt('ML_TIMEOUT_MS', 60000),
  clientOrigins: required('CLIENT_URL')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  uploadMaxSize: positiveInt('UPLOAD_MAX_SIZE', 10 * 1024 * 1024),
  storageRoot: path.join(projectRoot, 'storage')
});
