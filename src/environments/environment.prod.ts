export const environment = {
  production: true,
  baseUrl: window.location.origin,
  websocketUrl: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//` +
    `${window.location.hostname}:3000`,
  appName: 'Planning Poker Online',
  version: '1.0.0'
};
