import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

export function emit(name, payload) {
  bus.emit('domain', { name, ...payload, at: new Date() });
}
