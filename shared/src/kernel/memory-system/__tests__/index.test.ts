import { describe, it, expect } from 'vitest';

describe('Memory System Exports', () => {
  it('should export types', async () => {
    const types = await import('../types');
    // Interfaces are compile-time only, check for actual exported values
    expect(types).toHaveProperty('MemorySystemType');
    expect(types.MemorySystemType).toBeDefined();
    expect(types.MemorySystemType.LOCAL).toBe('local');
    expect(types.MemorySystemType.PINECONE).toBe('pinecone');
  });

  it('should export factory', async () => {
    const factory = await import('../factory');
    expect(factory).toHaveProperty('MemorySystemFactory');
    expect(factory.MemorySystemFactory).toBeDefined();
    expect(typeof factory.MemorySystemFactory.create).toBe('function');
  });

  it('should export implementations', async () => {
    const implementations = await import('../implementations/LocalMemorySystem');
    expect(implementations).toHaveProperty('LocalMemorySystem');
    expect(implementations.LocalMemorySystem).toBeDefined();

    const pineconeImpl = await import('../implementations/PineconeMemorySystem');
    expect(pineconeImpl).toHaveProperty('PineconeMemorySystem');
    expect(pineconeImpl.PineconeMemorySystem).toBeDefined();
  });

  it('should export from index', async () => {
    const index = await import('../index');
    // Check for actual runtime exports
    expect(index).toHaveProperty('MemorySystemFactory');
    expect(index).toHaveProperty('LocalMemorySystem');
    expect(index).toHaveProperty('PineconeMemorySystem');
    expect(index).toHaveProperty('MemorySystemType');
    expect(index.MemorySystemType).toBeDefined();
    expect(index.MemorySystemFactory).toBeDefined();
    expect(index.LocalMemorySystem).toBeDefined();
    expect(index.PineconeMemorySystem).toBeDefined();
  });
});

