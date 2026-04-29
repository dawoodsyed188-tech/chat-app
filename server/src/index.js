import 'dotenv/config';
import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import authRouter from './routes/auth.js';
import { connectDatabase, isDatabaseConnected } from './db.js';
import messagesRouter from './routes/messages.js';
import roomsRouter from './routes/rooms.js';
import { getRecentMessages, saveMessage } from './messageStore.js';
import { ensureDefaultRooms, getRooms, roomExists } from './roomStore.js';
import { authenticateRequest, verifyToken } from './auth.js';

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const USER_COLORS = [
  '#0f8f83',
  '#4667c7',
  '#c2417c',
  '#c47f1f',
  '#6d5bd0',
  '#23845f',
  '#b94735',
  '#2f7ab8'
];
const onlineUsers = new Map();
const userSockets = new Map();
const DEFAULT_ROOM = 'general';

function getRoomChannel(roomId) {
  return `room:${roomId}`;
}

function getDirectChannel(userId, recipientId) {
  return `direct:${[userId, recipientId].sort().join(':')}`;
}

function getAvailableColor(socketId) {
  const usedColors = new Set(
    [...onlineUsers.entries()]
      .filter(([id]) => id !== socketId)
      .map(([, user]) => user.color)
  );

  return USER_COLORS.find((color) => !usedColors.has(color)) || USER_COLORS[onlineUsers.size % USER_COLORS.length];
}

function getOnlineUsers() {
  const usersById = new Map();

  for (const user of onlineUsers.values()) {
    usersById.set(user.id, user);
  }

  return [...usersById.values()].sort((a, b) => a.username.localeCompare(b.username));
}

function broadcastUsers() {
  io.emit('users:update', getOnlineUsers());
}

function emitSystemEvent(type, username) {
  io.emit('presence:event', {
    id: crypto.randomUUID(),
    type,
    username,
    text: `${username} ${type === 'join' ? 'joined' : 'left'} the chat`,
    createdAt: new Date().toISOString()
  });
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST']
  }
});

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    database: isDatabaseConnected() ? 'connected' : 'memory'
  });
});

app.use('/api/auth', authRouter);
app.use('/api/messages', authenticateRequest, messagesRouter);
app.use('/api/rooms', authenticateRequest, roomsRouter);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    socket.user = await verifyToken(token);
    next();
  } catch (error) {
    next(new Error('Authentication required'));
  }
});

io.on("connection", (socket) => {
  const authenticatedUser = socket.user;
  console.log(`Client connected: ${socket.id} (${authenticatedUser.email})`);

  if (!userSockets.has(authenticatedUser.id)) {
    userSockets.set(authenticatedUser.id, new Set());
  }
  userSockets.get(authenticatedUser.id).add(socket.id);
  socket.join(`user:${authenticatedUser.id}`);

  socket.on('user:join', () => {
    const existingUser = onlineUsers.get(socket.id);

    if (existingUser) {
      broadcastUsers();
      return;
    }

    onlineUsers.set(socket.id, {
      id: authenticatedUser.id,
      socketId: socket.id,
      username: authenticatedUser.name,
      email: authenticatedUser.email,
      color: getAvailableColor(socket.id),
      roomId: DEFAULT_ROOM
    });

    socket.join(getRoomChannel(DEFAULT_ROOM));
    emitSystemEvent('join', authenticatedUser.name);
    broadcastUsers();
  });

  socket.on('chat:joinRoom', async (payload, callback) => {
    try {
      const roomId = String(payload?.roomId || DEFAULT_ROOM).trim();
      const user = onlineUsers.get(socket.id);

      if (!(await roomExists(roomId))) {
        callback?.({ ok: false, error: 'Room does not exist.' });
        return;
      }

      if (user?.roomId) {
        socket.leave(getRoomChannel(user.roomId));
      }

      socket.join(getRoomChannel(roomId));

      if (user) {
        onlineUsers.set(socket.id, { ...user, roomId });
        broadcastUsers();
      }

      socket.emit('chat:history', await getRecentMessages({ context: 'room', roomId }));
      callback?.({ ok: true });
    } catch (error) {
      console.error(error);
      callback?.({ ok: false, error: 'Could not join room.' });
    }
  });

  socket.on('chat:openDirect', async (payload, callback) => {
    try {
      const recipientId = String(payload?.recipientId || '').trim();
      const recipient = getOnlineUsers().find((user) => user.id === recipientId);

      if (!recipient || recipientId === authenticatedUser.id) {
        callback?.({ ok: false, error: 'User is not available.' });
        return;
      }

      socket.join(getDirectChannel(authenticatedUser.id, recipientId));
      socket.emit(
        'chat:history',
        await getRecentMessages({
          context: 'direct',
          userId: authenticatedUser.id,
          recipientId
        })
      );
      callback?.({ ok: true });
    } catch (error) {
      console.error(error);
      callback?.({ ok: false, error: 'Could not open direct chat.' });
    }
  });

  socket.on('chat:message', async (payload, callback) => {
    try {
      const text = String(payload?.text || '').trim();
      const context = payload?.context === 'direct' ? 'direct' : 'room';

      if (!text) {
        callback?.({ ok: false, error: 'Message is required.' });
        return;
      }

      const user = onlineUsers.get(socket.id);
      const roomId = String(payload?.roomId || user?.roomId || DEFAULT_ROOM).trim();
      const recipientId = String(payload?.recipientId || '').trim();
      const recipient = getOnlineUsers().find((onlineUser) => onlineUser.id === recipientId);

      if (context === 'room' && !(await roomExists(roomId))) {
        callback?.({ ok: false, error: 'Room does not exist.' });
        return;
      }

      if (context === 'direct' && (!recipient || recipientId === authenticatedUser.id)) {
        callback?.({ ok: false, error: 'User is not available.' });
        return;
      }

      const message = await saveMessage({
        username: authenticatedUser.name,
        text,
        userId: authenticatedUser.id,
        color: user?.color,
        context,
        roomId,
        recipientId,
        recipientName: recipient?.username
      });

      if (context === 'direct') {
        const channel = getDirectChannel(authenticatedUser.id, recipientId);
        socket.join(channel);
        io.in(`user:${recipientId}`).socketsJoin(channel);
        io.in(`user:${authenticatedUser.id}`).socketsJoin(channel);
        io.to(channel).emit('chat:message', message);
      } else {
        io.to(getRoomChannel(roomId)).emit('chat:message', message);
      }

      callback?.({ ok: true });
    } catch (error) {
      console.error(error);
      callback?.({ ok: false, error: 'Message could not be sent.' });
    }
  });

  socket.on('chat:typing', (payload) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    const context = payload?.context === 'direct' ? 'direct' : 'room';
    const roomId = String(payload?.roomId || user.roomId || DEFAULT_ROOM).trim();
    const recipientId = String(payload?.recipientId || '').trim();

    const typingData = {
      userId: authenticatedUser.id,
      username: authenticatedUser.name,
      context,
      roomId,
      recipientId
    };

    if (context === 'direct') {
      const channel = getDirectChannel(authenticatedUser.id, recipientId);
      socket.to(channel).emit('chat:typing', typingData);
    } else {
      socket.to(getRoomChannel(roomId)).emit('chat:typing', typingData);
    }
  });

  socket.on('chat:stopTyping', (payload) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    const context = payload?.context === 'direct' ? 'direct' : 'room';
    const roomId = String(payload?.roomId || user.roomId || DEFAULT_ROOM).trim();
    const recipientId = String(payload?.recipientId || '').trim();

    const stopTypingData = {
      userId: authenticatedUser.id,
      username: authenticatedUser.name,
      context,
      roomId,
      recipientId
    };

    if (context === 'direct') {
      const channel = getDirectChannel(authenticatedUser.id, recipientId);
      socket.to(channel).emit('chat:stopTyping', stopTypingData);
    } else {
      socket.to(getRoomChannel(roomId)).emit('chat:stopTyping', stopTypingData);
    }
  });

  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      onlineUsers.delete(socket.id);
      const sockets = userSockets.get(authenticatedUser.id);
      sockets?.delete(socket.id);

      if (!sockets || sockets.size === 0) {
        userSockets.delete(authenticatedUser.id);
        emitSystemEvent('leave', user.username);
      }

      broadcastUsers();
    }

    console.log(`Client disconnected: ${socket.id}`);
  });

  try {
    socket.emit('rooms:update', await getRooms());
    socket.emit('chat:history', await getRecentMessages({ context: 'room', roomId: DEFAULT_ROOM }));
    socket.emit('users:update', getOnlineUsers());
  } catch (error) {
    console.error('Failed to send message history:', error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Something went wrong.' });
});

await connectDatabase(process.env.MONGO_URI);
await ensureDefaultRooms();

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
