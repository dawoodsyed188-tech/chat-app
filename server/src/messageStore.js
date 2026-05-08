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
    profileImageUrl: message.profileImageUrl || '',
    context: message.context || 'room',
    roomId: message.roomId || 'general',
    recipientId: message.recipientId,
    recipientName: message.recipientName,
    imageUrl: message.imageUrl,
    isImage: Boolean(message.isImage || message.imageUrl),
    status: message.status || 'sent',
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
  isImage = false,
  profileImageUrl = ''
}) {
  const payload = {
    username: username.trim().slice(0, 40),
    text: text.trim().slice(0, 1000),
    userId,
    color,
    profileImageUrl: profileImageUrl.trim(),
    context,
    roomId: context === 'room' ? roomId : undefined,
    recipientId: context === 'direct' ? recipientId : undefined,
    recipientName: context === 'direct' ? recipientName : undefined,
    imageUrl: imageUrl.trim(),
    isImage: Boolean(isImage && imageUrl),
    status: 'sent'
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

const STATUS_ORDER = {
  sent: 0,
  delivered: 1,
  seen: 2
};

export async function updateMessageStatus(messageId, status) {
  if (!STATUS_ORDER.hasOwnProperty(status)) {
    return null;
  }

  if (isDatabaseConnected()) {
    const currentMessage = await Message.findById(messageId).lean();
    if (!currentMessage) {
      return null;
    }

    if (STATUS_ORDER[currentMessage.status] >= STATUS_ORDER[status]) {
      return normalizeMessage(currentMessage);
    }

    const message = await Message.findByIdAndUpdate(messageId, { status }, { new: true }).lean();
    return message ? normalizeMessage(message) : null;
  }

  const message = memoryMessages.find((item) => item.id === messageId);
  if (!message) {
    return null;
  }

  if (STATUS_ORDER[message.status] >= STATUS_ORDER[status]) {
    return message;
  }

  message.status = status;
  return message;
}

export async function updateConversationStatus({ context, roomId, userId, recipientId }, status) {
  if (isDatabaseConnected()) {
    const filter = context === 'direct'
      ? {
          context: 'direct',
          userId: recipientId,
          recipientId: userId,
          status: { $ne: status }
        }
      : {
          context: 'room',
          roomId,
          userId: { $ne: userId },
          status: { $ne: status }
        };

    const result = await Message.updateMany(filter, { status });
    if (result.modifiedCount === 0) {
      return [];
    }

    const updatedMessages = await Message.find(filter).lean();
    return updatedMessages.map(normalizeMessage);
  }

  const updated = [];
  for (const message of memoryMessages) {
    if (message.status === status) {
      continue;
    }

    if (context === 'direct') {
      const isConversation =
        message.context === 'direct' &&
        message.userId === recipientId &&
        message.recipientId === userId;
      if (isConversation) {
        message.status = status;
        updated.push(message);
      }
    } else if (message.context === 'room' && message.roomId === roomId && message.userId !== userId) {
      message.status = status;
      updated.push(message);
    }
  }

  return updated;
}
