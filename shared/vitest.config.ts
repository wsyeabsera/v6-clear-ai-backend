import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.test for integration tests
try {
  dotenv.config({ path: resolve(process.cwd(), '.env.test') });
} catch (error) {
  // .env.test may not exist, that's okay
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30 second default timeout for integration tests
    hookTimeout: 30000,
    teardownTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.integration.test.ts',
      ],
    },
    // Include all test files
    include: ['**/*.test.ts', '**/*.spec.ts', '**/*.integration.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});

