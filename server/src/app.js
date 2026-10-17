const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { initializeGooglePassport } = require('./middleware/googleAuth');

const TEMP_CLEAN_INTERVAL_MS = 30 * 60 * 1000;
const SHUTDOWN_TIMEOUT_MS = 10 * 1000;

const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  // Without this, every client behind a proxy shares one IP and the rate limits
  // below either block everyone or (if mis-set) nobody.
  if (env.trustProxy > 0) app.set('trust proxy', env.trustProxy);

  // Allow the dev client to render session photos served from this origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // The client sends cookies, so the browser needs credentials allowed here.
  app.use(cors({ origin: env.clientOrigins, credentials: true }));

  // Coarse safety net for every endpoint; /auth/login has its own stricter one.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 600,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: 'Too many requests, slow down', code: 'RATE_LIMITED' }
    })
  );

  // API responses carry personal data; never let a shared cache keep them.
  // (The file route sets its own private caching header afterwards.)
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // Passport is only used for the stateless Google OAuth handshake.
  app.use(passport.initialize());
  initializeGooglePassport();

  app.use('/api', routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

const app = createApp();

const start = async () => {
  const db = require('./config/db');
  const storageService = require('./services/storageService');

  storageService.ensureDirs();
  await storageService.cleanTemporary();
  await db.connect();

  // Uploads abandoned mid-request would otherwise sit in /temporary until the
  // next restart.
  const cleaner = setInterval(() => {
    storageService.cleanTemporary().catch((error) => console.error('Temp cleanup failed', error));
  }, TEMP_CLEAN_INTERVAL_MS);
  cleaner.unref();

  const server = app.listen(env.port, () => {
    console.log(`Server listening on port http://localhost:${env.port}`);
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    // Keep-alive connections can hold close() open forever; force the exit.
    const force = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
    force.unref();
    clearInterval(cleaner);
    server.close(async () => {
      try {
        await db.disconnect();
      } finally {
        process.exit(0);
      }
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

if (require.main === module) {
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection', reason);
  });
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { app, start };
