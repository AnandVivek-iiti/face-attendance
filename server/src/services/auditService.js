const AuditLog = require('../models/AuditLog');

const userEntry = (user, entry) => ({ actorType: 'user', actorId: user._id, ...entry });

const record = (entry) => AuditLog.create(entry);

const recordMany = (entries) => (entries.length ? AuditLog.insertMany(entries) : Promise.resolve([]));

module.exports = { record, recordMany, userEntry };
