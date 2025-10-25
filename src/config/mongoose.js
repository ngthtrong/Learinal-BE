const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

async function connectMongoose(uri, dbName) {
  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 10,
  });
  // eslint-disable-next-line no-console
  console.log(`Mongoose connected to db=${dbName}`);
  return mongoose.connection;
}

async function disconnectMongoose() {
  await mongoose.disconnect();
  // eslint-disable-next-line no-console
  console.log('Mongoose disconnected');
}

module.exports = { connectMongoose, disconnectMongoose };
