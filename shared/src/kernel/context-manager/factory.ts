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
import { KernelErrors } from '../errors';

export class ContextManagerFactory {
  static create(
    type: ContextManagerType,
    config?: ContextManagerConfig
  ): IContextManager {
    switch (type) {
      case ContextManagerType.LOCAL:
        if (!config || !('basePath' in config)) {
          throw KernelErrors.missingConfig('ContextManagerFactory', 'basePath', { type: 'local-file' });
        }
        return new LocalFileContextManager(config as LocalFileConfig);

      case ContextManagerType.MONGO:
        if (!config || !('connectionString' in config)) {
          throw KernelErrors.missingConfig(
            'ContextManagerFactory',
            'connectionString and databaseName',
            undefined,
            { type: 'mongo' }
          );
        }
        return new MongoContextManager(config as MongoConfig);

      case ContextManagerType.PINECONE:
        if (!config || !('apiKey' in config)) {
          throw KernelErrors.missingConfig(
            'ContextManagerFactory',
            'apiKey and indexName',
            undefined,
            { type: 'pinecone' }
          );
        }
        return new PineconeContextManager(config as PineconeConfig);

      default:
        throw KernelErrors.invalidConfig(
          'ContextManagerFactory',
          'type',
          `Invalid context manager type: ${type}`
        );
    }
  }
}

