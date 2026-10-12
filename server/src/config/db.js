const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);

const connect = () => mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });

const disconnect = () => mongoose.disconnect();

module.exports = { connect, disconnect };
