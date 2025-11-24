/**
 * Test reporter module for generating detailed test reports
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  TestRunReport,
  TestResult,
  PrerequisitesResult,
  ServiceCheck,
  CoverageResult,
} from './types';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function colorize(text: string, color: string): string {
  return `${color}${text}${COLORS.reset}`;
}

function success(text: string): string {
  return colorize(text, COLORS.green);
}

function error(text: string): string {
  return colorize(text, COLORS.red);
}

function warning(text: string): string {
  return colorize(text, COLORS.yellow);
}

function info(text: string): string {
  return colorize(text, COLORS.cyan);
}

function bold(text: string): string {
  return colorize(text, COLORS.bright);
}

function dim(text: string): string {
  return colorize(text, COLORS.dim);
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Print service availability status
 */
export function printServiceStatus(prerequisites: PrerequisitesResult): void {
  console.log(bold('\n📊 Service Status\n'));
  console.log('─'.repeat(70));

  const requiredServices = prerequisites.services.filter((s) => s.required);
  const optionalServices = prerequisites.services.filter((s) => !s.required);

  if (requiredServices.length > 0) {
    console.log(bold('\nRequired Services:'));
    for (const service of requiredServices) {
      const icon =
        service.status === 'available'
          ? success('✅')
          : error('❌');
      const statusText =
        service.status === 'available'
          ? success(service.status)
          : error(service.status);
      const message = service.message || '';
      const version = service.version ? dim(` (${service.version})`) : '';
      console.log(`  ${icon} ${service.name}: ${statusText} - ${message}${version}`);
    }
  }

  if (optionalServices.length > 0) {
    console.log(bold('\nOptional Services:'));
    for (const service of optionalServices) {
      const icon =
        service.status === 'available'
          ? success('✅')
          : service.status === 'optional'
          ? warning('⚠️ ')
          : dim('○');
      const statusText =
        service.status === 'available'
          ? success(service.status)
          : service.status === 'optional'
          ? warning('not configured')
          : dim(service.status);
      const message = service.message || '';
      console.log(`  ${icon} ${service.name}: ${statusText} - ${message}`);
    }
  }

  console.log('─'.repeat(70));
  console.log('');
}

/**
 * Print test results summary table
 */
export function printTestResults(results: TestResult[]): void {
  console.log(bold('\n📈 Test Results by Category\n'));
  console.log('─'.repeat(100));
  console.log(
    `${'Category'.padEnd(35)} ${'Passed'.padStart(8)} ${'Failed'.padStart(8)} ${'Skipped'.padStart(8)} ${'Total'.padStart(8)} ${'Duration'.padStart(12)}`
  );
  console.log('─'.repeat(100));

  for (const result of results) {
    const categoryName = result.category.padEnd(35);
    const passed = success(result.passed.toString().padStart(8));
    const failed =
      result.failed > 0
        ? error(result.failed.toString().padStart(8))
        : dim(result.failed.toString().padStart(8));
    const skipped =
      result.skipped > 0
        ? warning(result.skipped.toString().padStart(8))
        : dim(result.skipped.toString().padStart(8));
    const total = result.total.toString().padStart(8);
    const duration = formatDuration(result.duration).padStart(12);

    const statusIcon =
      result.failed > 0
        ? error('❌')
        : result.total > 0
        ? success('✅')
        : warning('⚠️ ');

    console.log(
      `${statusIcon} ${categoryName} ${passed} ${failed} ${skipped} ${total} ${duration}`
    );
  }

  console.log('─'.repeat(100));
  console.log('');
}

/**
 * Print coverage summary
 */
export function printCoverage(coverage: CoverageResult): void {
  console.log(bold('\n📊 Coverage Summary\n'));
  console.log('─'.repeat(70));

  const metrics = [
    { name: 'Statements', metric: coverage.statements },
    { name: 'Branches', metric: coverage.branches },
    { name: 'Functions', metric: coverage.functions },
    { name: 'Lines', metric: coverage.lines },
  ];

  for (const { name, metric } of metrics) {
    const percentage = metric.percentage.toFixed(2);
    const covered = metric.covered.toString();
    const total = metric.total.toString();
    const color = metric.percentage >= 80 ? success : metric.percentage >= 60 ? warning : error;
    console.log(
      `  ${name.padEnd(12)} ${color(`${percentage}%`.padStart(8))} (${covered}/${total})`
    );
  }

  const totalPercentage = coverage.total.percentage.toFixed(2);
  const totalColor = coverage.total.percentage >= 80 ? success : coverage.total.percentage >= 60 ? warning : error;
  console.log('─'.repeat(70));
  console.log(
    `  ${bold('Total').padEnd(12)} ${totalColor(`${totalPercentage}%`.padStart(8))} (${coverage.total.covered}/${coverage.total.total})`
  );
  console.log('');
}

/**
 * Print failure details
 */
export function printFailures(results: TestResult[]): void {
  const failedCategories = results.filter((r) => r.failed > 0 && r.failures);

  if (failedCategories.length === 0) {
    return;
  }

  console.log(bold('\n❌ Failure Details\n'));

  for (const result of failedCategories) {
    console.log(error(`\n${result.category.toUpperCase()} (${result.failed} failures):`));
    console.log('─'.repeat(70));

    if (result.failures) {
      for (const failure of result.failures) {
        console.log(error(`  ✗ ${failure.name}`));
        if (failure.file) {
          console.log(dim(`    File: ${failure.file}${failure.line ? `:${failure.line}` : ''}`));
        }
        console.log(dim(`    ${failure.error.split('\n').join('\n    ')}`));
        console.log('');
      }
    }
  }

  console.log('');
}

/**
 * Print final summary
 */
export function printSummary(report: TestRunReport): void {
  console.log(bold('\n📋 Test Run Summary\n'));
  console.log('─'.repeat(70));

  const { summary } = report;

  console.log(`  Total Tests:    ${summary.totalTests.toString().padStart(6)}`);
  console.log(`  ${success('Passed:')}          ${success(summary.totalPassed.toString().padStart(6))}`);
  console.log(`  ${error('Failed:')}          ${summary.totalFailed > 0 ? error(summary.totalFailed.toString().padStart(6)) : dim(summary.totalFailed.toString().padStart(6))}`);
  console.log(`  ${warning('Skipped:')}         ${summary.totalSkipped > 0 ? warning(summary.totalSkipped.toString().padStart(6)) : dim(summary.totalSkipped.toString().padStart(6))}`);
  console.log(`  Duration:       ${formatDuration(report.duration).padStart(6)}`);

  const successRate = summary.totalTests > 0
    ? ((summary.totalPassed / summary.totalTests) * 100).toFixed(2)
    : '0.00';

  console.log(`  Success Rate:   ${summary.success ? success(`${successRate}%`) : error(`${successRate}%`)}`);

  console.log('─'.repeat(70));

  if (summary.success) {
    console.log(bold(success('\n✅ All tests passed!\n')));
  } else {
    console.log(bold(error('\n❌ Some tests failed. See details above.\n')));
  }
}

/**
 * Generate JSON report file
 */
export function generateJsonReport(report: TestRunReport, outputPath: string): void {
  try {
    // Ensure directory exists
    const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
    if (dir) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(info(`\n📄 JSON report saved to: ${outputPath}\n`));
  } catch (error: any) {
    console.error(error(`Failed to write JSON report: ${error.message}`));
  }
}

/**
 * Print header
 */
export function printHeader(): void {
  console.log('');
  console.log(bold('🧪 AI Service Comprehensive Test Runner'));
  console.log(dim('─'.repeat(70)));
  console.log('');
}

/**
 * Print category start
 */
export function printCategoryStart(categoryName: string): void {
  console.log(bold(`\n▶ Running: ${categoryName}\n`));
}

/**
 * Print category end
 */
export function printCategoryEnd(
  categoryName: string,
  result: TestResult,
  duration: number
): void {
  const icon = result.failed > 0 ? error('❌') : result.total > 0 ? success('✅') : warning('⚠️ ');
  const status = result.failed > 0
    ? error('FAILED')
    : result.total > 0
    ? success('PASSED')
    : warning('SKIPPED');

  console.log(
    `${icon} ${categoryName}: ${status} - ${result.total} tests, ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped (${formatDuration(duration)})`
  );
}

/**
 * Print all report sections
 */
export function printFullReport(report: TestRunReport, jsonPath?: string): void {
  printHeader();
  printServiceStatus(report.prerequisites);
  printTestResults(report.results);
  
  if (report.coverage) {
    printCoverage(report.coverage);
  }

  if (report.results.some((r) => r.failed > 0)) {
    printFailures(report.results);
  }

  printSummary(report);

  if (jsonPath) {
    generateJsonReport(report, jsonPath);
  }
}

