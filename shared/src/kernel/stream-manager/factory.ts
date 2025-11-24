import {
  StreamManagerType,
  IStreamManager,
  StreamManagerConfig,
  SSEStreamConfig,
  WebSocketStreamConfig,
} from './types';
import { SSEStreamManager } from './implementations/SSEStreamManager';
import { WebSocketStreamManager } from './implementations/WebSocketStreamManager';

export class StreamManagerFactory {
  static create(
    type: StreamManagerType,
    config?: StreamManagerConfig
  ): IStreamManager {
    switch (type) {
      case StreamManagerType.SSE:
        return new SSEStreamManager(config as SSEStreamConfig);

      case StreamManagerType.WEBSOCKET:
        return new WebSocketStreamManager(config as WebSocketStreamConfig);

      default:
        throw new Error(`Invalid stream manager type: ${type}`);
    }
  }
}

