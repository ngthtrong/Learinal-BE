// Mongo driver setup using official mongodb driver
// Exposes connect/disconnect helpers and a getter for the DB reference.

let client = null;
let db = null;

async function connectMongo(uri, dbName) {
  if (db) return db;
  const { MongoClient, ServerApiVersion } = require('mongodb');
  client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  await client.connect();
  db = client.db(dbName);
  // quick ping
  await db.command({ ping: 1 });
  return db;
}

function getDb() {
  return db;
}

async function disconnectMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

module.exports = { connectMongo, disconnectMongo, getDb };
