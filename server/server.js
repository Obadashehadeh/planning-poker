const WebSocket = require('ws');
const http = require('http');
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Planning Poker WebSocket Server is running');
});

const wss = new WebSocket.Server({ server });

const rooms = new Map();
let connectionCount = 0;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

wss.on('connection', (ws) => {
  connectionCount++;

  const clientId = generateId();
  ws.clientId = clientId;

  ws.send(JSON.stringify({
    type: 'welcome',
    data: {
      clientId,
      timestamp: Date.now()
    },
    senderId: 'server'
  }));

  ws.on('message', (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      handleMessage(ws, clientId, parsedMessage);
    } catch (error) {
      // Silent error handling
    }
  });

  ws.on('close', () => {
    connectionCount--;
    removeClientFromRooms(clientId);
  });

  ws.on('error', (error) => {
    removeClientFromRooms(clientId);
  });

  ws.clientId = clientId;
});

function handleMessage(ws, clientId, message) {
  const { type, roomId, data, senderId, senderName, isHost } = message;

  if (!roomId && type !== 'ping') {
    return;
  }

  switch (type) {
    case 'join_room':
      joinRoom(ws, roomId, data, clientId, senderName, isHost);
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    case 'update_issues':
      const issuesCount = data && data.issues ? data.issues.length : 0;
      broadcastToRoom(roomId, message, clientId);
      storeRoomState(roomId, 'issues', data.issues);
      break;

    case 'select_ticket':
      broadcastToRoom(roomId, message, clientId);
      storeRoomState(roomId, 'selectedTicket', data.ticket);
      break;

    case 'vote':
      broadcastToRoom(roomId, message, clientId);
      break;

    case 'reveal':
      broadcastToRoom(roomId, message, clientId);
      break;

    case 'reset_voting':
      broadcastToRoom(roomId, message, clientId);
      break;

    case 'request_state':
      sendRoomStateToClient(roomId, ws);
      notifyHostForState(roomId, clientId);
      break;

    case 'full_state':
      broadcastToRoom(roomId, message, clientId);
      if (data) {
        if (data.issues) storeRoomState(roomId, 'issues', data.issues);
        if (data.selectedTicket) storeRoomState(roomId, 'selectedTicket', data.selectedTicket);
        if (data.gameName) storeRoomState(roomId, 'gameName', data.gameName);
        if (data.gameType) storeRoomState(roomId, 'gameType', data.gameType);
      }
      break;

    default:
      broadcastToRoom(roomId, message, clientId);
      break;
  }
}

function joinRoom(ws, roomId, data, clientId, senderName, isHost) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      clients: new Map(),
      state: {
        issues: [],
        selectedTicket: null,
        gameName: '',
        gameType: ''
      }
    });
  }

  const room = rooms.get(roomId);

  const clientInfo = {
    ws,
    displayName: data.displayName || senderName || clientId,
    isHost: data.isHost || isHost || (room.clients.size === 0),
    joinedAt: Date.now()
  };

  room.clients.set(clientId, clientInfo);

  broadcastToRoom(roomId, {
    type: 'user_joined',
    roomId,
    data: {
      clientId,
      displayName: clientInfo.displayName,
      isHost: clientInfo.isHost
    },
    senderId: 'server',
    timestamp: Date.now()
  }, clientId);

  const roomClients = [];
  room.clients.forEach((client, id) => {
    if (id !== clientId) {
      roomClients.push({
        clientId: id,
        displayName: client.displayName,
        isHost: client.isHost
      });
    }
  });

  ws.send(JSON.stringify({
    type: 'room_joined',
    roomId,
    data: {
      roomId,
      clients: roomClients
    },
    senderId: 'server',
    timestamp: Date.now()
  }));

  if (data.needsFullState || !clientInfo.isHost) {
    sendRoomStateToClient(roomId, ws);
    notifyHostForState(roomId, clientId);
  }
}

function storeRoomState(roomId, key, value) {
  if (!rooms.has(roomId)) return;

  const room = rooms.get(roomId);
  if (!room.state) {
    room.state = {};
  }

  room.state[key] = value;
}

function sendRoomStateToClient(roomId, ws) {
  if (!rooms.has(roomId)) return;

  const room = rooms.get(roomId);
  if (!room.state) return;

  try {
    ws.send(JSON.stringify({
      type: 'full_state',
      roomId,
      data: room.state,
      senderId: 'server',
      timestamp: Date.now()
    }));
  } catch (error) {
    // Silent error handling
  }
}

function broadcastToRoom(roomId, message, excludeClientId = null) {
  if (!rooms.has(roomId)) {
    return;
  }

  const room = rooms.get(roomId);
  let messageCount = 0;

  room.clients.forEach((client, id) => {
    if (id !== excludeClientId) {
      try {
        client.ws.send(JSON.stringify(message));
        messageCount++;
      } catch (error) {
        room.clients.delete(id);
      }
    }
  });
}

function notifyHostForState(roomId, clientId) {
  if (!rooms.has(roomId)) {
    return;
  }

  const room = rooms.get(roomId);
  let hostClient = null;

  room.clients.forEach((client, id) => {
    if (client.isHost) {
      hostClient = client;
      return;
    }
  });

  if (hostClient) {
    try {
      hostClient.ws.send(JSON.stringify({
        type: 'request_state',
        roomId,
        data: {
          requestingClientId: clientId,
          needsFullState: true
        },
        senderId: 'server',
        timestamp: Date.now()
      }));
    } catch (error) {
      // Silent error handling
    }
  }
}

function removeClientFromRooms(clientId) {
  rooms.forEach((room, roomId) => {
    if (room.clients.has(clientId)) {
      const client = room.clients.get(clientId);
      const wasHost = client.isHost;

      room.clients.delete(clientId);

      broadcastToRoom(roomId, {
        type: 'user_left',
        roomId,
        data: {
          clientId,
          wasHost,
          displayName: client.displayName
        },
        senderId: 'server',
        timestamp: Date.now()
      });

      if (room.clients.size === 0) {
        rooms.delete(roomId);
      }
      else if (wasHost) {
        assignNewHost(roomId);
      }
    }
  });
}

function assignNewHost(roomId) {
  if (!rooms.has(roomId)) {
    return;
  }

  const room = rooms.get(roomId);

  if (room.clients.size === 0) {
    return;
  }

  let oldestClient = null;
  let oldestTimestamp = Infinity;

  room.clients.forEach((client, id) => {
    if (client.joinedAt < oldestTimestamp) {
      oldestTimestamp = client.joinedAt;
      oldestClient = { id, client };
    }
  });

  if (oldestClient) {
    const { id: newHostId, client } = oldestClient;
    client.isHost = true;

    broadcastToRoom(roomId, {
      type: 'new_host',
      roomId,
      data: {
        clientId: newHostId,
        displayName: client.displayName
      },
      senderId: 'server',
      timestamp: Date.now()
    });

    client.ws.send(JSON.stringify({
      type: 'promoted_to_host',
      roomId,
      data: {
        isHost: true
      },
      senderId: 'server',
      timestamp: Date.now()
    }));
  }
}

const HEARTBEAT_INTERVAL = 30000;

function heartbeat() {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }

    ws.isAlive = false;
    try {
      ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
    } catch (e) {
      ws.terminate();
    }
  });
}

wss.on('listening', () => {
  setInterval(heartbeat, HEARTBEAT_INTERVAL);
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'pong') {
        ws.isAlive = true;
      }
    } catch (e) {
      // Ignore parsing errors for pong messages
    }
  });
});

server.listen(port, () => {
  // Server started
});
