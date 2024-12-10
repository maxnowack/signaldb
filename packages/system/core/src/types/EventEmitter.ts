import { EventEmitter as BaseEventEmitter } from 'events'

export default class EventEmitter<
  Events extends Record<string | symbol, any>,
> extends BaseEventEmitter {
  on<K extends keyof Events>(event: K, listener: Events[K]) {
    super.on(event as string, listener as (...args: any[]) => void)
    return this
  }

  emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>) {
    return super.emit(event as string, ...args)
  }
}
