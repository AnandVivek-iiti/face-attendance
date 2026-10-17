const path = require('path');
const dotenv = require('dotenv');

const serverRoot = path.resolve(__dirname, '../..');
const projectRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: [path.join(serverRoot, '.env'), path.join(projectRoot, '.env')] });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

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

const nonNegativeInt = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
};

const booleanFlag = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!['true', 'false'].includes(raw.toLowerCase())) throw new Error(`${name} must be "true" or "false"`);
  return raw.toLowerCase() === 'true';
};

// Secrets that have been published in docs/examples. A server running with one
// of these accepts forged tokens from anyone who has read the same page.
const KNOWN_PUBLIC_SECRETS = [
  // The sample HS256 token from jwt.io that used to sit in .env.example.
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.KMUFsIDTnFmyG3nMiGM6H9FNFUROf3wh7SmqJp-QV30'
];

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32 || jwtSecret.startsWith('replace-with') || jwtSecret.startsWith('eyJ')) {
  throw new Error('JWT_SECRET must be a random string of at least 32 characters (not a JWT or a placeholder)');
}
if (KNOWN_PUBLIC_SECRETS.includes(jwtSecret)) {
  throw new Error('JWT_SECRET is a publicly known example value; generate a new one');
}

const clientOrigins = required('CLIENT_URL')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
if (clientOrigins.length === 0 || clientOrigins.includes('*')) {
  throw new Error('CLIENT_URL must list explicit origins (a wildcard is not allowed with credentialed CORS)');
}

module.exports = Object.freeze({
  nodeEnv,
  isProduction,
  port: positiveInt('PORT', 5000),
  mongodbUri: required('MONGODB_URI'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  mlServiceUrl: required('ML_SERVICE_URL').replace(/\/+$/, ''),
  // Optional: only needed when the ML service has API_KEY set. Empty means no header.
  mlApiKey: process.env.ML_API_KEY || '',
  mlTimeoutMs: positiveInt('ML_TIMEOUT_MS', 60000),
  clientOrigins,
  uploadMaxSize: positiveInt('UPLOAD_MAX_SIZE', 10 * 1024 * 1024),
  // Number of reverse proxies in front of the app (0 = none). Required for
  // correct per-IP rate limiting behind nginx / a load balancer.
  trustProxy: nonNegativeInt('TRUST_PROXY', 0),
  // Password "first login creates the account" lets anyone register an address
  // they do not own. Off by default in production; Google sign-in still works.
  allowSelfRegistration: booleanFlag('ALLOW_SELF_REGISTRATION', !isProduction),
  // Optional: only set when "Sign in with Google" should be offered. The client
  // secret must never reach the browser, so these are server-side only.
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  // Relative by default: passport resolves it against the incoming request host,
  // so the same value works in dev (:5000) and behind a proxy.
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
  storageRoot: path.join(projectRoot, 'storage')
});
