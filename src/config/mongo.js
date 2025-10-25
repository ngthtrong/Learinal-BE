// Placeholder Mongo driver setup (official mongodb driver recommended)
// This file exposes connect/disconnect helpers and a getter for the DB reference.

let client = null;
let db = null;

async function connectMongo(uri, dbName) {
  // Lazy import to avoid hard dependency during scaffold
  // const { MongoClient } = require('mongodb');
  // client = new MongoClient(uri, { maxPoolSize: 10 });
  // await client.connect();
  // db = client.db(dbName);
  // return db;
  return null; // Will be implemented later
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
