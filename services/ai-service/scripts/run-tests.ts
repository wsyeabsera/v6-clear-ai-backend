#!/usr/bin/env node
/**
 * Comprehensive Test Runner for AI Service
 * 
 * Orchestrates all test types (unit, integration, by category) with detailed reporting,
 * automatic prerequisite checking, and comprehensive output formatting.
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs';
import {
  TestRunReport,
  TestResult,
  TestCategory,
  RunnerOptions,
  CoverageResult,
  CoverageMetric,
} from './test-utils/types';
import { checkPrerequisites, PrerequisitesResult } from './test-utils/prerequisites';
import {
  getTestCategories,
  getIntegrationCategories,
  getUnitCategories,
  getRunnableCategories,
  canRunCategory,
  TEST_CATEGORIES,
} from './test-utils/config';
import {
  printFullReport,
  printCategoryStart,
  printCategoryEnd,
  printHeader,
  printServiceStatus,
} from './test-utils/reporter';

const execAsync = promisify(exec);

/**
 * Default runner options
 */
const DEFAULT_OPTIONS: RunnerOptions = {
  skipPrerequisites: false,
  skipCoverage: false,
  generateJsonReport: true,
  jsonReportPath: join(process.cwd(), 'test-results.json'),
  verbose: false,
};

/**
 * Run vitest command and capture output
 */
async function runVitest(
  filter: string,
  coverage = false
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const args = ['vitest', '--run', '--reporter=verbose'];
    
    if (filter) {
      if (filter.startsWith('-t')) {
        // Test name filter
        const filterParts = filter.split(' ').filter(Boolean);
        args.push(...filterParts);
      } else if (filter.startsWith('--exclude')) {
        // Exclude pattern
        const filterParts = filter.split(' ').filter(Boolean);
        args.push(...filterParts);
      } else {
        // Assume it's a test name filter
        args.push('-t', filter);
      }
    }

    if (coverage) {
      args.push('--coverage');
    }

    const child = spawn('npx', args, {
      cwd: process.cwd(),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
      if (process.env.VERBOSE || DEFAULT_OPTIONS.verbose) {
        process.stdout.write(data);
      }
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      if (process.env.VERBOSE || DEFAULT_OPTIONS.verbose) {
        process.stderr.write(data);
      }
    });

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    child.on('error', (error) => {
      stderr += error.message;
      resolve({
        stdout,
        stderr,
        exitCode: 1,
      });
    });
  });
}

/**
 * Parse vitest verbose output to extract test results
 */
function parseVitestOutput(
  stdout: string,
  stderr: string
): {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  failures?: Array<{ name: string; error: string; file?: string; line?: number }>;
} {
  // Parse verbose output - vitest outputs summary like:
  // Test Files  1 passed (1)
  //      Tests  5 passed | 2 failed | 1 skipped (8)
  
  // Try to match test summary line
  const testSummaryMatch = stdout.match(/Tests\s+(\d+)\s+passed(?:\s+\|\s+(\d+)\s+failed)?(?:\s+\|\s+(\d+)\s+skipped)?\s+\((\d+)\)/i);
  
  if (testSummaryMatch) {
    const passed = parseInt(testSummaryMatch[1] || '0', 10);
    const failed = parseInt(testSummaryMatch[2] || '0', 10);
    const skipped = parseInt(testSummaryMatch[3] || '0', 10);
    const total = parseInt(testSummaryMatch[4] || '0', 10);

    // Try to extract failure details from output
    const failures: Array<{ name: string; error: string; file?: string; line?: number }> = [];
    
    if (failed > 0) {
      // Look for failure patterns in output
      const failureMatches = stdout.matchAll(/FAIL\s+(.+?)(?:\n|$)/gi);
      for (const match of failureMatches) {
        failures.push({
          name: match[1]?.trim() || 'Unknown test',
          error: 'See test output for details',
        });
      }
    }

    return {
      passed,
      failed,
      skipped,
      total,
      failures: failures.length > 0 ? failures : undefined,
    };
  }

  // Fallback: try simpler patterns
  const passedMatch = stdout.match(/(\d+)\s+passed/i);
  const failedMatch = stdout.match(/(\d+)\s+failed/i);
  const skippedMatch = stdout.match(/(\d+)\s+skipped/i);

  const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
  const skipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;

  return {
    passed,
    failed,
    skipped,
    total: passed + failed + skipped,
  };
}

/**
 * Run tests for a specific category
 */
async function runCategory(
  category: typeof TEST_CATEGORIES[TestCategory],
  availableServices: string[]
): Promise<TestResult> {
  const startTime = Date.now();

  // Check if category can run
  if (!canRunCategory(category, availableServices)) {
    const missingServices = category.requiredServices.filter(
      (s) => !availableServices.includes(s)
    );
    return {
      category: category.category,
      passed: 0,
      failed: 0,
      skipped: 1,
      total: 1,
      duration: Date.now() - startTime,
      failures: [
        {
          name: category.name,
          error: `Required services not available: ${missingServices.join(', ')}`,
        },
      ],
    };
  }

  printCategoryStart(category.name);

  // Run vitest with filter
  const { stdout, stderr, exitCode } = await runVitest(category.filter);
  const duration = Date.now() - startTime;

  // Parse results
  const parsed = parseVitestOutput(stdout, stderr);

  const result: TestResult = {
    category: category.category,
    passed: parsed.passed,
    failed: parsed.failed,
    skipped: parsed.skipped,
    total: parsed.total,
    duration,
    failures: parsed.failures,
    stdout: stdout.substring(0, 10000), // Limit output size
    stderr: stderr.substring(0, 10000),
  };

  printCategoryEnd(category.name, result, duration);

  return result;
}

/**
 * Get coverage results from vitest coverage output
 */
async function getCoverage(): Promise<CoverageResult | undefined> {
  try {
    const coveragePath = join(process.cwd(), 'coverage', 'coverage-final.json');
    
    if (!fs.existsSync(coveragePath)) {
      return undefined;
    }

    const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
    
    // Aggregate coverage data
    let statements = { covered: 0, total: 0 };
    let branches = { covered: 0, total: 0 };
    let functions = { covered: 0, total: 0 };
    let lines = { covered: 0, total: 0 };

    for (const filePath in coverageData) {
      const fileCoverage = coverageData[filePath];
      
      if (fileCoverage.s) statements.total += Object.keys(fileCoverage.s).length;
      if (fileCoverage.s) statements.covered += Object.values(fileCoverage.s).filter((v: any) => v > 0).length;
      
      if (fileCoverage.b) branches.total += Object.keys(fileCoverage.b).length;
      if (fileCoverage.b) branches.covered += Object.values(fileCoverage.b).flat().filter((v: any) => v > 0).length;
      
      if (fileCoverage.f) functions.total += Object.keys(fileCoverage.f).length;
      if (fileCoverage.f) functions.covered += Object.values(fileCoverage.f).filter((v: any) => v > 0).length;
      
      if (fileCoverage.statementMap && fileCoverage.s) {
        lines.total += Object.keys(fileCoverage.statementMap).length;
        lines.covered += Object.values(fileCoverage.s).filter((v: any) => v > 0).length;
      }
    }

    const calcPercentage = (covered: number, total: number): number => {
      return total > 0 ? (covered / total) * 100 : 0;
    };

    const statementsMetric: CoverageMetric = {
      covered: statements.covered,
      total: statements.total,
      percentage: calcPercentage(statements.covered, statements.total),
    };

    const branchesMetric: CoverageMetric = {
      covered: branches.covered,
      total: branches.total,
      percentage: calcPercentage(branches.covered, branches.total),
    };

    const functionsMetric: CoverageMetric = {
      covered: functions.covered,
      total: functions.total,
      percentage: calcPercentage(functions.covered, functions.total),
    };

    const linesMetric: CoverageMetric = {
      covered: lines.covered,
      total: lines.total,
      percentage: calcPercentage(lines.covered, lines.total),
    };

    const totalCovered = statements.covered + branches.covered + functions.covered + lines.covered;
    const totalTotal = statements.total + branches.total + functions.total + lines.total;

    return {
      statements: statementsMetric,
      branches: branchesMetric,
      functions: functionsMetric,
      lines: linesMetric,
      total: {
        covered: totalCovered,
        total: totalTotal,
        percentage: calcPercentage(totalCovered, totalTotal),
      },
    };
  } catch (error) {
    return undefined;
  }
}

/**
 * Run coverage report
 */
async function runCoverage(): Promise<CoverageResult | undefined> {
  console.log('\n📊 Generating coverage report...\n');
  await runVitest('', true);
  return getCoverage();
}

/**
 * Main test runner function
 */
async function runTests(options: RunnerOptions = {}): Promise<number> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  printHeader();

  // Step 1: Check prerequisites
  let prerequisites: PrerequisitesResult;
  
  if (!opts.skipPrerequisites) {
    prerequisites = await checkPrerequisites();

    if (!prerequisites.allRequiredAvailable) {
      const missingServices = prerequisites.services
        .filter((s) => s.required && s.status !== 'available')
        .map((s) => s.name);
      
      console.error(
        `\n❌ Required services not available: ${missingServices.join(', ')}\n`
      );
      console.error('Please start required services before running tests.\n');
      return 1;
    }

    printServiceStatus(prerequisites);
  } else {
    // Create a default prerequisites result
    prerequisites = {
      services: [],
      allRequiredAvailable: true,
      timestamp: new Date().toISOString(),
    };
  }

  // Step 2: Determine available services
  const availableServices = prerequisites.services
    .filter((s) => s.status === 'available')
    .map((s) => s.name);

  // Step 3: Determine categories to run
  let categoriesToRun;
  
  if (opts.categories && opts.categories.length > 0) {
    categoriesToRun = opts.categories.map((cat) => TEST_CATEGORIES[cat]);
  } else {
    categoriesToRun = getTestCategories();
  }

  // Filter to runnable categories
  const runnableCategories = categoriesToRun.filter((cat) =>
    canRunCategory(cat, availableServices)
  );

  // Step 4: Run tests by category
  const results: TestResult[] = [];
  
  console.log(`\n🚀 Running ${runnableCategories.length} test categories...\n`);

  for (const category of runnableCategories) {
    const result = await runCategory(category, availableServices);
    results.push(result);
  }

  // Step 5: Generate coverage report (if requested)
  let coverage: CoverageResult | undefined;
  
  if (!opts.skipCoverage) {
    coverage = await runCoverage();
  }

  // Step 6: Generate report
  const duration = Date.now() - startTime;
  
  const totalTests = results.reduce((sum, r) => sum + r.total, 0);
  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

  const report: TestRunReport = {
    timestamp: new Date().toISOString(),
    duration,
    prerequisites,
    results,
    coverage,
    summary: {
      totalTests,
      totalPassed,
      totalFailed,
      totalSkipped,
      success: totalFailed === 0,
    },
  };

  // Step 7: Print full report
  printFullReport(report, opts.generateJsonReport ? opts.jsonReportPath : undefined);

  // Step 8: Return exit code
  return totalFailed > 0 ? 1 : 0;
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const options: RunnerOptions = {};

  // Parse command line arguments
  if (args.includes('--unit-only')) {
    options.categories = ['unit'];
  } else if (args.includes('--integration-only')) {
    options.categories = getIntegrationCategories().map((c) => c.category);
  } else if (args.includes('--skip-prerequisites')) {
    options.skipPrerequisites = true;
  } else if (args.includes('--skip-coverage')) {
    options.skipCoverage = true;
  } else if (args.includes('--no-json-report')) {
    options.generateJsonReport = false;
  } else if (args.includes('--verbose') || args.includes('-v')) {
    options.verbose = true;
  }

  const exitCode = await runTests(options);
  process.exit(exitCode);
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runTests, runCategory, getCoverage };

