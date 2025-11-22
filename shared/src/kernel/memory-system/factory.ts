import {
  MemorySystemType,
  IMemorySystem,
  MemorySystemConfig,
  LocalMemoryConfig,
  PineconeMemoryConfig,
} from './types';
import { LocalMemorySystem } from './implementations/LocalMemorySystem';
import { PineconeMemorySystem } from './implementations/PineconeMemorySystem';

export class MemorySystemFactory {
  static create(
    type: MemorySystemType,
    config?: MemorySystemConfig
  ): IMemorySystem {
    switch (type) {
      case MemorySystemType.LOCAL:
        return new LocalMemorySystem(config as LocalMemoryConfig);

      case MemorySystemType.PINECONE:
        if (!config || !('apiKey' in config)) {
          throw new Error(
            'PineconeMemorySystem requires apiKey and indexName in config'
          );
        }
        return new PineconeMemorySystem(config as PineconeMemoryConfig);

      default:
        throw new Error(`Invalid memory system type: ${type}`);
    }
  }
}

