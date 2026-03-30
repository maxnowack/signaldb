import type { LoadResponse, Changeset } from '@signaldb/core'

export const SIGNALDB_LOAD = 'signaldb:load'
export const SIGNALDB_SAVE = 'signaldb:save'
export const SIGNALDB_REGISTER = 'signaldb:register'
export const SIGNALDB_UNREGISTER = 'signaldb:unregister'
export const SIGNALDB_CHANGE = 'signaldb:change'

export interface LoadPayload {
  collectionName: string,
}

export interface SavePayload<T> {
  collectionName: string,
  items: T[],
  changes: Changeset<T>,
}

export interface RegisterPayload {
  collectionName: string,
}

export interface UnregisterPayload {
  collectionName: string,
}

export interface ChangePayload<T> {
  collectionName: string,
  data?: LoadResponse<T>,
}

export interface SignalDBBridge {
  load(collectionName: string): Promise<LoadResponse<any>>,
  save(collectionName: string, items: any[], changes: Changeset<any>): Promise<void>,
  register(collectionName: string): Promise<void>,
  unregister(collectionName: string): Promise<void>,
  onChange(callback: (payload: ChangePayload<any>) => void): () => void,
}

export interface IpcMainLike {
  handle(channel: string, listener: (event: any, ...args: any[]) => any): void,
  removeHandler(channel: string): void,
}

export interface WebContentsLike {
  send(channel: string, ...args: any[]): void,
  isDestroyed(): boolean,
  once(event: 'destroyed', listener: () => void): void,
}

export interface IpcMainInvokeEventLike {
  sender: WebContentsLike,
}

export interface IpcRendererLike {
  invoke(channel: string, ...args: any[]): Promise<any>,
  on(channel: string, listener: (event: any, ...args: any[]) => void): void,
  removeListener(channel: string, listener: (...args: any[]) => void): void,
}

export interface ContextBridgeLike {
  exposeInMainWorld(apiKey: string, api: Record<string, any>): void,
}

export interface CursorLike<T = any> {
  fetch(): T[],
}

export interface CollectionLike<T extends { id: any } & Record<string, any> = any> {
  find(selector?: any, options?: any): CursorLike<T>,
  insert(item: any): any,
  updateOne(selector: any, modifier: any): any,
  removeOne(selector: any): any,
  batch(callback: () => void): void,
  on(event: string, listener: (...args: any[]) => void): any,
  off(event: string, listener: (...args: any[]) => void): any,
}
