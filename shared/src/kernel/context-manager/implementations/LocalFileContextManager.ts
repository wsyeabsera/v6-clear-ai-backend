import { promises as fs } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { IContextManager, Message, ConversationContext, LocalFileConfig } from '../types';

export class LocalFileContextManager implements IContextManager {
  private basePath: string;

  constructor(config: LocalFileConfig) {
    this.basePath = config.basePath;
    
    // Create directory if it doesn't exist
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  async getContext(sessionId: string): Promise<ConversationContext | null> {
    const filePath = this.getFilePath(sessionId);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const context: ConversationContext = JSON.parse(fileContent);
      return context;
    } catch (error) {
      throw new Error(`Failed to read context file for session ${sessionId}: ${error}`);
    }
  }

  async saveContext(sessionId: string, context: ConversationContext): Promise<void> {
    const filePath = this.getFilePath(sessionId);

    // Ensure directory exists
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }

    // Update metadata
    const contextWithMetadata: ConversationContext = {
      ...context,
      metadata: {
        ...context.metadata,
        updatedAt: new Date().toISOString(),
        ...(context.metadata?.createdAt ? {} : { createdAt: new Date().toISOString() }),
      },
    };

    try {
      await fs.writeFile(filePath, JSON.stringify(contextWithMetadata, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save context file for session ${sessionId}: ${error}`);
    }
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    const existingContext = await this.getContext(sessionId);

    let context: ConversationContext;
    if (existingContext) {
      context = {
        ...existingContext,
        messages: [...existingContext.messages, message],
      };
    } else {
      context = {
        sessionId,
        messages: [message],
        metadata: {
          createdAt: new Date().toISOString(),
        },
      };
    }

    await this.saveContext(sessionId, context);
  }

  private getFilePath(sessionId: string): string {
    // Sanitize sessionId to prevent directory traversal
    const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.basePath, `${sanitizedSessionId}.json`);
  }
}

