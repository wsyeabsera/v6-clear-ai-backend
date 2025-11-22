import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmbeddingService } from '../utils/embeddingService';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as any;

describe('EmbeddingService', () => {
  let embeddingService: EmbeddingService;
  const mockApiUrl = 'http://localhost:11434';
  const mockModel = 'nomic-text';

  beforeEach(() => {
    vi.clearAllMocks();
    embeddingService = new EmbeddingService({
      apiUrl: mockApiUrl,
      model: mockModel,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const service = new EmbeddingService({
        apiUrl: 'http://custom:11434',
        model: 'custom-model',
      });
      expect(service).toBeInstanceOf(EmbeddingService);
    });

    it('should use environment variables if config not provided', () => {
      const originalEnv = process.env.OLLAMA_API_URL;
      const originalModel = process.env.OLLAMA_MODEL;

      process.env.OLLAMA_API_URL = 'http://env:11434';
      process.env.OLLAMA_MODEL = 'env-model';

      const service = new EmbeddingService();
      expect(service).toBeInstanceOf(EmbeddingService);

      // Restore
      if (originalEnv) process.env.OLLAMA_API_URL = originalEnv;
      if (originalModel) process.env.OLLAMA_MODEL = originalModel;
    });

    it('should use defaults if neither config nor env vars provided', () => {
      const originalEnv = process.env.OLLAMA_API_URL;
      const originalModel = process.env.OLLAMA_MODEL;

      delete process.env.OLLAMA_API_URL;
      delete process.env.OLLAMA_MODEL;

      const service = new EmbeddingService();
      expect(service).toBeInstanceOf(EmbeddingService);

      // Restore
      if (originalEnv) process.env.OLLAMA_API_URL = originalEnv;
      if (originalModel) process.env.OLLAMA_MODEL = originalModel;
    });
  });

  describe('generateEmbedding', () => {
    it('should generate embedding successfully', async () => {
      const mockEmbedding = new Array(768).fill(0).map((_, i) => i * 0.001);
      const mockResponse = {
        data: {
          embedding: mockEmbedding,
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await embeddingService.generateEmbedding('test text');

      expect(result).toEqual(mockEmbedding);
      expect(result).toHaveLength(768);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${mockApiUrl}/api/embeddings`,
        {
          model: mockModel,
          prompt: 'test text',
        },
        {
          timeout: 30000,
        }
      );
    });

    it('should warn if embedding dimension is not 768', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockEmbedding = new Array(512).fill(0); // Wrong dimension
      const mockResponse = {
        data: {
          embedding: mockEmbedding,
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await embeddingService.generateEmbedding('test text');

      expect(result).toEqual(mockEmbedding);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Expected 768-dim embedding but got 512 dimensions')
      );

      consoleSpy.mockRestore();
    });

    it('should throw error if response has no embedding', async () => {
      const mockResponse = {
        data: {},
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      await expect(
        embeddingService.generateEmbedding('test text')
      ).rejects.toThrow('Invalid embedding response from Ollama');
    });

    it('should handle connection refused error', async () => {
      const error = {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
        isAxiosError: true,
      };
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockRejectedValueOnce(error);

      await expect(
        embeddingService.generateEmbedding('test text')
      ).rejects.toThrow('Failed to connect to Ollama');
    });

    it('should handle timeout error', async () => {
      const error = {
        code: 'ETIMEDOUT',
        message: 'Timeout',
        isAxiosError: true,
      };
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockRejectedValueOnce(error);

      await expect(
        embeddingService.generateEmbedding('test text')
      ).rejects.toThrow('Failed to connect to Ollama');
    });

    it('should handle other axios errors', async () => {
      const error = {
        message: 'Network error',
        isAxiosError: true,
      };
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockRejectedValueOnce(error);

      await expect(
        embeddingService.generateEmbedding('test text')
      ).rejects.toThrow('Ollama API error: Network error');
    });

    it('should handle non-axios errors', async () => {
      const error = new Error('Generic error');
      mockedAxios.post.mockRejectedValueOnce(error);

      await expect(
        embeddingService.generateEmbedding('test text')
      ).rejects.toThrow('Generic error');
    });

    it('should handle empty text', async () => {
      const mockEmbedding = new Array(768).fill(0);
      const mockResponse = {
        data: {
          embedding: mockEmbedding,
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await embeddingService.generateEmbedding('');

      expect(result).toEqual(mockEmbedding);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${mockApiUrl}/api/embeddings`,
        {
          model: mockModel,
          prompt: '',
        },
        {
          timeout: 30000,
        }
      );
    });

    it('should handle long text', async () => {
      const longText = 'a'.repeat(10000);
      const mockEmbedding = new Array(768).fill(0);
      const mockResponse = {
        data: {
          embedding: mockEmbedding,
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await embeddingService.generateEmbedding(longText);

      expect(result).toEqual(mockEmbedding);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        {
          model: mockModel,
          prompt: longText,
        },
        expect.any(Object)
      );
    });
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings for multiple texts', async () => {
      const mockEmbedding1 = new Array(768).fill(0.1);
      const mockEmbedding2 = new Array(768).fill(0.2);
      const mockEmbedding3 = new Array(768).fill(0.3);

      mockedAxios.post
        .mockResolvedValueOnce({ data: { embedding: mockEmbedding1 } })
        .mockResolvedValueOnce({ data: { embedding: mockEmbedding2 } })
        .mockResolvedValueOnce({ data: { embedding: mockEmbedding3 } });

      const texts = ['text1', 'text2', 'text3'];
      const results = await embeddingService.generateEmbeddings(texts);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual(mockEmbedding1);
      expect(results[1]).toEqual(mockEmbedding2);
      expect(results[2]).toEqual(mockEmbedding3);
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should handle empty array', async () => {
      const results = await embeddingService.generateEmbeddings([]);

      expect(results).toHaveLength(0);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle single text array', async () => {
      const mockEmbedding = new Array(768).fill(0.5);
      mockedAxios.post.mockResolvedValueOnce({
        data: { embedding: mockEmbedding },
      });

      const results = await embeddingService.generateEmbeddings(['single']);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(mockEmbedding);
    });

    it('should propagate errors from individual embedding generation', async () => {
      const error = new Error('API error');
      mockedAxios.post
        .mockResolvedValueOnce({ data: { embedding: new Array(768).fill(0) } })
        .mockRejectedValueOnce(error);

      await expect(
        embeddingService.generateEmbeddings(['text1', 'text2'])
      ).rejects.toThrow('API error');
    });
  });

  describe('getEmptyEmbedding', () => {
    it('should return array of 768 zeros', () => {
      const result = embeddingService.getEmptyEmbedding();

      expect(result).toHaveLength(768);
      expect(result.every((val) => val === 0)).toBe(true);
    });

    it('should return new array each time', () => {
      const result1 = embeddingService.getEmptyEmbedding();
      const result2 = embeddingService.getEmptyEmbedding();

      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2); // Different array instances
    });

    it('should be mutable without affecting other calls', () => {
      const result1 = embeddingService.getEmptyEmbedding();
      const result2 = embeddingService.getEmptyEmbedding();

      result1[0] = 1;

      expect(result1[0]).toBe(1);
      expect(result2[0]).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in text', async () => {
      const specialText = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const mockEmbedding = new Array(768).fill(0);
      mockedAxios.post.mockResolvedValueOnce({
        data: { embedding: mockEmbedding },
      });

      const result = await embeddingService.generateEmbedding(specialText);

      expect(result).toEqual(mockEmbedding);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        {
          model: mockModel,
          prompt: specialText,
        },
        expect.any(Object)
      );
    });

    it('should handle unicode characters', async () => {
      const unicodeText = 'Hello 世界 🌍';
      const mockEmbedding = new Array(768).fill(0);
      mockedAxios.post.mockResolvedValueOnce({
        data: { embedding: mockEmbedding },
      });

      const result = await embeddingService.generateEmbedding(unicodeText);

      expect(result).toEqual(mockEmbedding);
    });

    it('should handle multiline text', async () => {
      const multilineText = 'Line 1\nLine 2\nLine 3';
      const mockEmbedding = new Array(768).fill(0);
      mockedAxios.post.mockResolvedValueOnce({
        data: { embedding: mockEmbedding },
      });

      const result = await embeddingService.generateEmbedding(multilineText);

      expect(result).toEqual(mockEmbedding);
    });
  });

  describe('configuration', () => {
    it('should use custom timeout if provided', async () => {
      const service = new EmbeddingService({
        apiUrl: mockApiUrl,
        model: mockModel,
      });

      const mockEmbedding = new Array(768).fill(0);
      mockedAxios.post.mockResolvedValueOnce({
        data: { embedding: mockEmbedding },
      });

      await service.generateEmbedding('test');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it('should handle custom API URL', async () => {
      const customUrl = 'http://custom-ollama:11434';
      const service = new EmbeddingService({
        apiUrl: customUrl,
        model: mockModel,
      });

      const mockEmbedding = new Array(768).fill(0);
      mockedAxios.post.mockResolvedValueOnce({
        data: { embedding: mockEmbedding },
      });

      await service.generateEmbedding('test');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${customUrl}/api/embeddings`,
        expect.any(Object),
        expect.any(Object)
      );
    });
  });
});

