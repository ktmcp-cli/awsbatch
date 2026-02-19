import Conf from 'conf';

const config = new Conf({ projectName: '@ktmcp-cli/awsbatch' });

export function getConfig(key) {
  return config.get(key);
}

export function setConfig(key, value) {
  config.set(key, value);
}

export function isConfigured() {
  return !!(config.get('accessKeyId') && config.get('secretAccessKey'));
}

export function getAllConfig() {
  return config.store;
}

export default config;
