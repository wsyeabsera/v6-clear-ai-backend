import axios from 'axios';

export interface EmbeddingConfig {
  apiUrl?: string;
  model?: string;
}

export interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * Service for generating embeddings using Ollama
 * Supports 768-dim embeddings via nomic-text model
 */
export class EmbeddingService {
  private apiUrl: string;
  private model: string;

  constructor(config?: EmbeddingConfig) {
    this.apiUrl = config?.apiUrl || process.env.OLLAMA_API_URL || 'http://localhost:11434';
    this.model = config?.model || process.env.OLLAMA_MODEL || 'nomic-text';
  }

  /**
   * Generate embedding for a given text
   * @param text - Text to generate embedding for
   * @returns Promise<number[]> - 768-dim embedding vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post<OllamaEmbeddingResponse>(
        `${this.apiUrl}/api/embeddings`,
        {
          model: this.model,
          prompt: text,
        },
        {
          timeout: 30000, // 30 second timeout
        }
      );

      if (!response.data?.embedding) {
        throw new Error('Invalid embedding response from Ollama');
      }

      const embedding = response.data.embedding;

      // Verify embedding dimension (should be 768 for nomic-text)
      if (embedding.length !== 768) {
        console.warn(
          `Expected 768-dim embedding but got ${embedding.length} dimensions. This may cause issues with Pinecone.`
        );
      }

      return embedding;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          throw new Error(
            `Failed to connect to Ollama at ${this.apiUrl}. Make sure Ollama is running and the model "${this.model}" is loaded.`
          );
        }
        throw new Error(`Ollama API error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   * @param texts - Array of texts to generate embeddings for
   * @returns Promise<number[][]> - Array of 768-dim embedding vectors
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.generateEmbedding(text)));
  }

  /**
   * Get default empty embedding (768 dimensions of zeros)
   * Useful as fallback when embedding generation fails
   * @returns number[] - 768-dim zero vector
   */
  getEmptyEmbedding(): number[] {
    return new Array(768).fill(0);
  }
}

