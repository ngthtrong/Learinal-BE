const http = require('http');
const app = require('./app');
const { env, mongo } = require('./config');

const PORT = env.port || 3000;
const server = http.createServer(app);

async function start() {
  try {
    await mongo.connectMongo(env.mongoUri, env.mongoDbName);
    // eslint-disable-next-line no-console
    console.log(`Connected to MongoDB: ${env.mongoDbName}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Learinal API listening on port ${PORT}`);
  });
}

start();

function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    // Close DB/queue connections here when added
    await mongo.disconnectMongo().catch(() => {});
    process.exit(0);
  });
  // Force close after 10s
  setTimeout(() => process.exit(1), 10_000).unref();
}

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));
