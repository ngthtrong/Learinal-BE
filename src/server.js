const http = require('http');
const app = require('./app');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Learinal API listening on port ${PORT}`);
});

function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    // Close DB/queue connections here when added
    process.exit(0);
  });
  // Force close after 10s
  setTimeout(() => process.exit(1), 10_000).unref();
}

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));
