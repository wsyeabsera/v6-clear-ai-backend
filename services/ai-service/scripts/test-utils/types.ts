/**
 * Type definitions for the comprehensive test runner
 */

export type ServiceStatus = 'available' | 'unavailable' | 'optional';

export interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  required: boolean;
  message?: string;
  version?: string;
  details?: Record<string, unknown>;
}

export interface PrerequisitesResult {
  services: ServiceCheck[];
  allRequiredAvailable: boolean;
  timestamp: string;
}

export type TestCategory =
  | 'unit'
  | 'ask-mode'
  | 'llm-providers'
  | 'graphql-api'
  | 'configuration'
  | 'error-handling'
  | 'conversation-persistence'
  | 'pinecone'
  | 'events'
  | 'federation';

export interface TestResult {
  category: TestCategory;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number; // milliseconds
  failures?: TestFailure[];
  stdout?: string;
  stderr?: string;
}

export interface TestFailure {
  name: string;
  error: string;
  file?: string;
  line?: number;
}

export interface CoverageResult {
  statements: CoverageMetric;
  branches: CoverageMetric;
  functions: CoverageMetric;
  lines: CoverageMetric;
  total: CoverageMetric;
}

export interface CoverageMetric {
  covered: number;
  total: number;
  percentage: number;
}

export interface TestRunReport {
  timestamp: string;
  duration: number; // milliseconds
  prerequisites: PrerequisitesResult;
  results: TestResult[];
  coverage?: CoverageResult;
  summary: {
    totalTests: number;
    totalPassed: number;
    totalFailed: number;
    totalSkipped: number;
    success: boolean;
  };
}

export interface TestCategoryConfig {
  name: string;
  category: TestCategory;
  filter: string; // Vitest filter pattern
  requiredServices: string[];
  optionalServices: string[];
  description: string;
}

export interface RunnerOptions {
  categories?: TestCategory[];
  skipPrerequisites?: boolean;
  skipCoverage?: boolean;
  generateJsonReport?: boolean;
  jsonReportPath?: string;
  verbose?: boolean;
}

