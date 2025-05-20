export const environment = {
  production: false,
  baseUrl: window.location.origin,
  websocketUrl: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//` +
    `${window.location.hostname}:3000`
};
