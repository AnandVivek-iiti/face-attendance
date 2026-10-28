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

// Secrets that have been published in docs/examples.
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
// In dev, always allow the local Vite origins so a mis-set CLIENT_URL cannot break local sign-in.
if (!isProduction) {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
    if (!clientOrigins.includes(origin)) clientOrigins.push(origin);
  }
}

const ratio = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be a number between 0 and 1`);
  return value;
};

const port = positiveInt('PORT', 5000);
const smtpPort = positiveInt('SMTP_PORT', 587);

// Public origin of THIS server, used to build professor sign-in links.
const serverUrl = (process.env.SERVER_URL || `http://localhost:${port}`).replace(/\/+$/, '');

module.exports = Object.freeze({
  nodeEnv,
  isProduction,
  port,
  serverUrl,
  mongodbUri: required('MONGODB_URI'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  mlServiceUrl: required('ML_SERVICE_URL').replace(/\/+$/, ''),
  // Optional: only needed when the ML service has API_KEY set.
  mlApiKey: process.env.ML_API_KEY || '',
  mlTimeoutMs: positiveInt('ML_TIMEOUT_MS', 60000),
  // Any face matched to an enrolled student with similarity >= this is marked Present automatically (no review step).
  presentSimilarityThreshold: ratio('PRESENT_SIMILARITY_THRESHOLD', 0.3),
  // Second pass for faces the ML service left unmatched: pair them with still-absent students at or above this similarity.
  rescueSimilarityThreshold: ratio('RESCUE_SIMILARITY_THRESHOLD', 0.2),
  // Total tries for a transient ML failure (unreachable host / 5xx), including the first.
  mlRetryAttempts: positiveInt('ML_RETRY_ATTEMPTS', 3),
  // Base backoff between retries in ms (linear: delay, 2*delay, ...).
  mlRetryDelayMs: nonNegativeInt('ML_RETRY_DELAY_MS', 1000),
  clientOrigins,
  uploadMaxSize: positiveInt('UPLOAD_MAX_SIZE', 10 * 1024 * 1024),
  // Number of reverse proxies in front of the app (0 = none).
  trustProxy: nonNegativeInt('TRUST_PROXY', 0),
  // Password "first login creates the account" lets anyone register an address they do not own.
  allowSelfRegistration: booleanFlag('ALLOW_SELF_REGISTRATION', !isProduction),
  // Audit trail is off unless explicitly enabled.
  auditLogEnabled: booleanFlag('AUDIT_LOG_ENABLED', false),
  // Optional: only set when "Sign in with Google" should be offered.
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  // Relative by default: passport resolves it against the incoming request host, so the same value works in dev (:5000) and behind a proxy.
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
  // Optional SMTP for professor sign-in links.
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort,
  smtpSecure: booleanFlag('SMTP_SECURE', smtpPort === 465),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  mailFrom: process.env.MAIL_FROM || '',
  // Optional HTTP mail providers for hosts where outbound SMTP is blocked (e.g. Render).
  emailProvider: (process.env.EMAIL_PROVIDER || '').toLowerCase(),
  resendApiKey: process.env.RESEND_API_KEY || '',
  sendgridApiKey: process.env.SENDGRID_API_KEY || '',
  brevoApiKey: process.env.BREVO_API_KEY || '',
  // How long a professor invite / sign-in link stays valid.
  emailLinkTtlMinutes: positiveInt('EMAIL_LINK_TTL_MINUTES', 30),
  storageRoot: path.join(projectRoot, 'storage')
});
