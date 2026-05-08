import { isDatabaseConnected } from './db.js';
import Message from './models/Message.js';

const memoryMessages = [];
const MAX_MEMORY_MESSAGES = 100;

function normalizeMessage(message) {
  return {
    id: String(message._id ?? message.id),
    username: message.username,
    text: message.text,
    userId: message.userId,
    color: message.color,
    context: message.context || 'room',
    roomId: message.roomId || 'general',
    recipientId: message.recipientId,
    recipientName: message.recipientName,
    imageUrl: message.imageUrl,
    isImage: Boolean(message.isImage || message.imageUrl),
    createdAt: message.createdAt
  };
}

function getDirectParticipants(userId, recipientId) {
  return [userId, recipientId].filter(Boolean).sort();
}

function matchesConversation(message, options = {}) {
  if (options.context === 'direct') {
    const participants = getDirectParticipants(options.userId, options.recipientId);
    const messageParticipants = getDirectParticipants(message.userId, message.recipientId);
    return (
      message.context === 'direct' &&
      participants.length === 2 &&
      messageParticipants.length === 2 &&
      participants[0] === messageParticipants[0] &&
      participants[1] === messageParticipants[1]
    );
  }

  return (message.context || 'room') === 'room' && (message.roomId || 'general') === (options.roomId || 'general');
}

export async function getRecentMessages(options = {}, limit = 50) {
  if (isDatabaseConnected()) {
    const query =
      options.context === 'direct'
        ? {
            context: 'direct',
            $or: [
              { userId: options.userId, recipientId: options.recipientId },
              { userId: options.recipientId, recipientId: options.userId }
            ]
          }
        : {
            context: 'room',
            roomId: options.roomId || 'general'
          };

    const messages = await Message.find()
      .where(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return messages.reverse().map(normalizeMessage);
  }

  return memoryMessages.filter((message) => matchesConversation(message, options)).slice(-limit);
}

export async function saveMessage({
  username,
  text = '',
  userId,
  color,
  context = 'room',
  roomId = 'general',
  recipientId,
  recipientName,
  imageUrl = '',
  isImage = false
}) {
  const payload = {
    username: username.trim().slice(0, 40),
    text: text.trim().slice(0, 1000),
    userId,
    color,
    context,
    roomId: context === 'room' ? roomId : undefined,
    recipientId: context === 'direct' ? recipientId : undefined,
    recipientName: context === 'direct' ? recipientName : undefined,
    imageUrl: imageUrl.trim(),
    isImage: Boolean(isImage && imageUrl)
  };

  if (isDatabaseConnected()) {
    const message = await Message.create(payload);
    return normalizeMessage(message);
  }

  const message = {
    id: crypto.randomUUID(),
    ...payload,
    createdAt: new Date().toISOString()
  };

  memoryMessages.push(message);

  if (memoryMessages.length > MAX_MEMORY_MESSAGES) {
    memoryMessages.shift();
  }

  return message;
}
