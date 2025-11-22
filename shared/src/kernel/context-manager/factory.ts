import {
  ContextManagerType,
  IContextManager,
  ContextManagerConfig,
  LocalFileConfig,
  MongoConfig,
  PineconeConfig,
} from './types';
import { LocalFileContextManager } from './implementations/LocalFileContextManager';
import { MongoContextManager } from './implementations/MongoContextManager';
import { PineconeContextManager } from './implementations/PineconeContextManager';

export class ContextManagerFactory {
  static create(
    type: ContextManagerType,
    config?: ContextManagerConfig
  ): IContextManager {
    switch (type) {
      case ContextManagerType.LOCAL:
        if (!config || !('basePath' in config)) {
          throw new Error('LocalFileContextManager requires basePath in config');
        }
        return new LocalFileContextManager(config as LocalFileConfig);

      case ContextManagerType.MONGO:
        if (!config || !('connectionString' in config)) {
          throw new Error(
            'MongoContextManager requires connectionString and databaseName in config'
          );
        }
        return new MongoContextManager(config as MongoConfig);

      case ContextManagerType.PINECONE:
        if (!config || !('apiKey' in config)) {
          throw new Error(
            'PineconeContextManager requires apiKey and indexName in config'
          );
        }
        return new PineconeContextManager(config as PineconeConfig);

      default:
        throw new Error(`Invalid context manager type: ${type}`);
    }
  }
}

