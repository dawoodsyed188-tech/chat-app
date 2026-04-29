import { isDatabaseConnected } from './db.js';
import Room from './models/Room.js';

const defaultRooms = [
  { roomId: 'general', name: 'General', description: 'Everyday chat' },
  { roomId: 'gaming', name: 'Gaming', description: 'Squads, streams, and wins' },
  { roomId: 'study', name: 'Study', description: 'Focus room and questions' }
];

let memoryRooms = [...defaultRooms];

function normalizeRoom(room) {
  return {
    id: room.roomId,
    name: room.name,
    description: room.description
  };
}

export async function ensureDefaultRooms() {
  if (!isDatabaseConnected()) {
    return memoryRooms;
  }

  await Promise.all(
    defaultRooms.map((room) =>
      Room.updateOne(
        { roomId: room.roomId },
        { $setOnInsert: room },
        { upsert: true }
      )
    )
  );

  return getRooms();
}

export async function getRooms() {
  if (isDatabaseConnected()) {
    const rooms = await Room.find().sort({ createdAt: 1 }).lean();
    return rooms.map(normalizeRoom);
  }

  return memoryRooms.map(normalizeRoom);
}

export async function roomExists(roomId) {
  const rooms = await getRooms();
  return rooms.some((room) => room.id === roomId);
}
