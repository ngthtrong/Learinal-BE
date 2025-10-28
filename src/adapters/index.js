/**
 * Adapters barrel file
 * Exports all adapter instances for external services
 */

const llmClient = require('./llmClient');
const emailClient = require('./emailClient');
const storageClient = require('./storageClient');
const oauthClient = require('./oauthClient');
const eventBus = require('./eventBus');

module.exports = {
  llmClient,
  emailClient,
  storageClient,
  oauthClient,
  eventBus,
};
