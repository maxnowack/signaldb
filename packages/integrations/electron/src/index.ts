export { setupSignalDBMain } from './main'
export { setupSignalDBPreload } from './preload'
export { createElectronAdapter } from './renderer'
export type {
  SignalDBBridge,
  ChangePayload,
  LoadPayload,
  SavePayload,
  RegisterPayload,
  UnregisterPayload,
  IpcMainLike,
  IpcRendererLike,
  ContextBridgeLike,
  WebContentsLike,
  IpcMainInvokeEventLike,
  CollectionLike,
  CursorLike,
} from './types'
export {
  SIGNALDB_LOAD,
  SIGNALDB_SAVE,
  SIGNALDB_REGISTER,
  SIGNALDB_UNREGISTER,
  SIGNALDB_CHANGE,
} from './types'
