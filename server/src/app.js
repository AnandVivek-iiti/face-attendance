const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { initializeGooglePassport } = require('./middleware/googleAuth');

const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  // Allow the dev client to render session photos served from this origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // The client sends cookies, so the browser needs credentials allowed here.
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  // Initialize Google OAuth passport strategy
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

  const server = app.listen(env.port, () => {
    console.log(`Server listening on port http://localhost:${env.port}`);
  });

  const shutdown = () => {
    server.close(async () => {
      await db.disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { app, start };