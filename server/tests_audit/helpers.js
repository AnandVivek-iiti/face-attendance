// Run:  TARGET=/path/to/server NODE_PATH=/path/to/node_modules node --test tests_audit/*.test.js
const path = require('path');
const Module = require('module');
Object.assign(process.env, {
  JWT_SECRET: 'x'.repeat(40), CLIENT_URL: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://localhost/test', ML_SERVICE_URL: 'http://127.0.0.1:8000', NODE_ENV: 'test'
});
const TARGET = process.env.TARGET || path.resolve(__dirname, '..');
const src = (p) => path.join(TARGET, 'src', p);

// Replace modules that need a database with stubs (matched by file name suffix).
const stubs = {};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  for (const [suffix, stub] of Object.entries(stubs)) if (request.endsWith(suffix)) return stub;
  return originalLoad.apply(this, arguments);
};
const fresh = (p) => { delete require.cache[require.resolve(src(p))]; return require(src(p)); };
module.exports = { TARGET, src, stubs, fresh };
