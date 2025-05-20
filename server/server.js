const WebSocket = require('ws');
const http = require('http');
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Planning Poker WebSocket Server is running');
});

const wss = new WebSocket.Server({ server });

const rooms = new Map();

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

wss.on('connection', (ws) => {
  const clientId = generateId();
  ws.on('message', (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      handleMessage(ws, clientId, parsedMessage);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    removeClientFromRooms(clientId);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    removeClientFromRooms(clientId);
  });

  ws.clientId = clientId;
});

function handleMessage(ws, clientId, message) {
  const { type, roomId, data, senderId, senderName, isHost } = message;

  if (!roomId && type !== 'ping') {
    console.warn('No room ID provided');
    return;
  }

  switch (type) {
    case 'join_room':
      joinRoom(ws, roomId, data, clientId, senderName, isHost);
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    default:
      broadcastToRoom(roomId, message, clientId);
      break;
  }
}

function joinRoom(ws, roomId, data, clientId, senderName, isHost) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }

  const room = rooms.get(roomId);

  room.set(clientId, {
    ws,
    displayName: data.displayName || senderName || clientId,
    isHost: data.isHost || isHost || false,
    joinedAt: Date.now()
  });


  broadcastToRoom(roomId, {
    type: 'user_joined',
    roomId,
    data: {
      clientId,
      displayName: data.displayName || senderName || clientId,
      isHost: data.isHost || isHost || false
    },
    senderId: 'server',
    timestamp: Date.now()
  }, clientId);

  const roomClients = [];
  room.forEach((client, id) => {
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

  if (data.needsFullState) {
    notifyHostForState(roomId, clientId);
  }
}

function broadcastToRoom(roomId, message, excludeClientId = null) {
  if (!rooms.has(roomId)) {
    return;
  }

  const room = rooms.get(roomId);

  room.forEach((client, id) => {
    if (id !== excludeClientId) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Error sending message to client ${id}:`, error);
        room.delete(id);
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

  room.forEach((client, id) => {
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
      console.error('Error notifying host for state:', error);
    }
  }
}

function removeClientFromRooms(clientId) {
  rooms.forEach((room, roomId) => {
    if (room.has(clientId)) {
      const client = room.get(clientId);
      const wasHost = client.isHost;

      room.delete(clientId);

      broadcastToRoom(roomId, {
        type: 'user_left',
        roomId,
        data: {
          clientId,
          wasHost
        },
        senderId: 'server',
        timestamp: Date.now()
      });


      if (room.size === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
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

  if (room.size === 0) {
    return;
  }

  const [firstClientId] = room.keys();
  const client = room.get(firstClientId);
  client.isHost = true;


  broadcastToRoom(roomId, {
    type: 'new_host',
    roomId,
    data: {
      clientId: firstClientId,
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

server.listen(port, () => {
  console.log(`WebSocket server is running on port ${port}`);
});
