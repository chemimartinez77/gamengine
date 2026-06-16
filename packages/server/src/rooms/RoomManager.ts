import { randomBytes } from 'node:crypto';
import { Room } from './Room.js';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ID_LENGTH = 6;

export class RoomManager {
  private static instance: RoomManager;
  private rooms: Map<string, Room> = new Map();

  private constructor() {}

  static getInstance(): RoomManager {
    if (!RoomManager.instance) {
      RoomManager.instance = new RoomManager();
    }
    return RoomManager.instance;
  }

  createRoom(): Room {
    const roomId = this.generateId();
    const room = new Room(roomId);
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  deleteRoom(roomId: string): void {
    this.rooms.delete(roomId);
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  private generateId(): string {
    let id: string;
    do {
      const bytes = randomBytes(ID_LENGTH);
      id = Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('');
    } while (this.rooms.has(id));
    return id;
  }
}
