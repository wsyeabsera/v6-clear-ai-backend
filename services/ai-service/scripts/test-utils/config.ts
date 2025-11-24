/**
 * Test configuration module defining test categories and their requirements
 */

import { TestCategory, TestCategoryConfig } from './types';

/**
 * Test category configurations
 * Each category defines:
 * - Filter pattern for vitest
 * - Required services
 * - Optional services
 */
export const TEST_CATEGORIES: Record<TestCategory, TestCategoryConfig> = {
  unit: {
    name: 'Unit Tests',
    category: 'unit',
    filter: '--exclude **/*.integration.test.ts',
    requiredServices: [],
    optionalServices: [],
    description: 'Unit tests with mocked dependencies (expected: 85 tests)',
  },
  'ask-mode': {
    name: 'Ask Mode Integration Tests',
    category: 'ask-mode',
    filter: '-t "AI Service Integration Tests - Ask Mode"',
    requiredServices: ['MongoDB', 'Ollama'],
    optionalServices: [],
    description: 'Ask mode functionality with Ollama and conversation context',
  },
  'llm-providers': {
    name: 'LLM Providers Integration Tests',
    category: 'llm-providers',
    filter: '-t "LLM Providers Integration Tests"',
    requiredServices: ['MongoDB', 'Ollama'],
    optionalServices: ['Claude API', 'OpenAI API'],
    description: 'LLM provider tests (Ollama required, Claude/OpenAI optional)',
  },
  'graphql-api': {
    name: 'GraphQL API Integration Tests',
    category: 'graphql-api',
    filter: '-t "AI Service GraphQL API Integration Tests"',
    requiredServices: ['MongoDB', 'Ollama'],
    optionalServices: [],
    description: 'GraphQL API endpoints (ask mutation, conversation query)',
  },
  configuration: {
    name: 'Configuration Integration Tests',
    category: 'configuration',
    filter: '-t "Configuration Integration Tests"',
    requiredServices: ['MongoDB'],
    optionalServices: ['Pinecone'],
    description: 'Configuration parsing and kernel adapter initialization',
  },
  'error-handling': {
    name: 'Error Handling Integration Tests',
    category: 'error-handling',
    filter: '-t "Error Handling Integration Tests"',
    requiredServices: ['MongoDB'],
    optionalServices: [],
    description: 'Error handling scenarios and graceful failures',
  },
  'conversation-persistence': {
    name: 'Conversation Persistence Integration Tests',
    category: 'conversation-persistence',
    filter: '-t "Conversation Persistence Integration Tests"',
    requiredServices: ['MongoDB', 'Ollama'],
    optionalServices: [],
    description: 'Conversation persistence across restarts and large histories',
  },
  pinecone: {
    name: 'Pinecone Integration Tests',
    category: 'pinecone',
    filter: '-t "Pinecone Context Integration Tests"',
    requiredServices: ['MongoDB', 'Ollama', 'Pinecone'],
    optionalServices: [],
    description: 'Pinecone context manager and memory system integration',
  },
  events: {
    name: 'Event Emission Integration Tests',
    category: 'events',
    filter: '-t "Event Emission Integration Tests"',
    requiredServices: ['MongoDB', 'Ollama'],
    optionalServices: ['RabbitMQ'],
    description: 'Event emission and RabbitMQ integration (graceful degradation)',
  },
  federation: {
    name: 'Federation Integration Tests',
    category: 'federation',
    filter: '-t "GraphQL Federation Integration Tests"',
    requiredServices: ['MongoDB', 'Ollama'],
    optionalServices: [],
    description: 'Apollo Federation and cross-service integration',
  },
};

/**
 * Get test categories in execution order
 */
export function getTestCategories(): TestCategoryConfig[] {
  return [
    TEST_CATEGORIES.unit,
    TEST_CATEGORIES['ask-mode'],
    TEST_CATEGORIES['llm-providers'],
    TEST_CATEGORIES['graphql-api'],
    TEST_CATEGORIES.configuration,
    TEST_CATEGORIES['error-handling'],
    TEST_CATEGORIES['conversation-persistence'],
    TEST_CATEGORIES.pinecone,
    TEST_CATEGORIES.events,
    TEST_CATEGORIES.federation,
  ];
}

/**
 * Get integration test categories only
 */
export function getIntegrationCategories(): TestCategoryConfig[] {
  return getTestCategories().filter((cat) => cat.category !== 'unit');
}

/**
 * Get unit test categories only
 */
export function getUnitCategories(): TestCategoryConfig[] {
  return getTestCategories().filter((cat) => cat.category === 'unit');
}

/**
 * Check if a category's required services are available
 */
export function canRunCategory(
  category: TestCategoryConfig,
  availableServices: string[]
): boolean {
  return category.requiredServices.every((service) =>
    availableServices.includes(service)
  );
}

/**
 * Get categories that can be run with available services
 */
export function getRunnableCategories(
  availableServices: string[]
): TestCategoryConfig[] {
  return getTestCategories().filter((cat) => canRunCategory(cat, availableServices));
}

