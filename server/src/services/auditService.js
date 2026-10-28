const env = require('../config/env');

const userEntry = (user, entry) => ({ actorType: 'user', actorId: user._id, ...entry });

const isEnabled = () => env.auditLogEnabled;

const model = () => require('../models/AuditLog');

const record = async (entry) => (isEnabled() ? model().create(entry) : null);

const recordMany = async (entries) => (isEnabled() && entries.length ? model().insertMany(entries) : []);

module.exports = { record, recordMany, userEntry, isEnabled };
