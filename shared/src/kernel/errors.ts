/**
 * Standardized error types for kernel components
 */

export enum KernelErrorCode {
  // Connection errors
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_CLOSED = 'CONNECTION_CLOSED',
  
  // Configuration errors
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_CONFIG = 'MISSING_CONFIG',
  
  // Operation errors
  OPERATION_FAILED = 'OPERATION_FAILED',
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',
  OPERATION_NOT_SUPPORTED = 'OPERATION_NOT_SUPPORTED',
  
  // Resource errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_UNAVAILABLE = 'RESOURCE_UNAVAILABLE',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  
  // State errors
  INVALID_STATE = 'INVALID_STATE',
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  
  // External service errors
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  EXTERNAL_SERVICE_UNAVAILABLE = 'EXTERNAL_SERVICE_UNAVAILABLE',
}

export interface KernelErrorDetails {
  code: KernelErrorCode;
  message: string;
  component?: string;
  operation?: string;
  originalError?: Error | unknown;
  metadata?: Record<string, any>;
}

/**
 * Base error class for all kernel errors
 */
export class KernelError extends Error {
  public readonly code: KernelErrorCode;
  public readonly component?: string;
  public readonly operation?: string;
  public readonly originalError?: Error | unknown;
  public readonly metadata?: Record<string, any>;

  constructor(details: KernelErrorDetails) {
    super(details.message);
    this.name = 'KernelError';
    this.code = details.code;
    this.component = details.component;
    this.operation = details.operation;
    this.originalError = details.originalError;
    this.metadata = details.metadata;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, KernelError);
    }

    // Include original error stack if available
    if (details.originalError instanceof Error && details.originalError.stack) {
      this.stack = `${this.stack}\nOriginal Error: ${details.originalError.stack}`;
    }
  }

  /**
   * Convert error to JSON for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      component: this.component,
      operation: this.operation,
      metadata: this.metadata,
      stack: this.stack,
      originalError: this.originalError instanceof Error
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : this.originalError,
    };
  }
}

/**
 * Helper functions to create common error types
 */
export const KernelErrors = {
  connectionFailed: (
    component: string,
    operation: string,
    originalError?: Error | unknown,
    metadata?: Record<string, any>
  ): KernelError => {
    return new KernelError({
      code: KernelErrorCode.CONNECTION_FAILED,
      message: `Failed to connect in ${component} during ${operation}`,
      component,
      operation,
      originalError,
      metadata,
    });
  },

  connectionTimeout: (
    component: string,
    operation: string,
    timeoutMs?: number,
    metadata?: Record<string, any>
  ): KernelError => {
    return new KernelError({
      code: KernelErrorCode.CONNECTION_TIMEOUT,
      message: `Connection timeout in ${component} during ${operation}${timeoutMs ? ` (${timeoutMs}ms)` : ''}`,
      component,
      operation,
      metadata: { ...metadata, timeoutMs },
    });
  },

  invalidConfig: (
    component: string,
    configKey: string,
    reason?: string,
    metadata?: Record<string, any>
  ): KernelError => {
    return new KernelError({
      code: KernelErrorCode.INVALID_CONFIG,
      message: `Invalid configuration for ${component}: ${configKey}${reason ? ` - ${reason}` : ''}`,
      component,
      metadata: { ...metadata, configKey, reason },
    });
  },

  missingConfig: (
    component: string,
    configKey: string,
    metadata?: Record<string, any>
  ): KernelError => {
    return new KernelError({
      code: KernelErrorCode.MISSING_CONFIG,
      message: `Missing required configuration for ${component}: ${configKey}`,
      component,
      metadata: { ...metadata, configKey },
    });
  },

  operationFailed: (
    component: string,
    operation: string,
    reason?: string,
    originalError?: Error | unknown,
    metadata?: Record<string, any>
  ): KernelError => {
    return new KernelError({
      code: KernelErrorCode.OPERATION_FAILED,
      message: `Operation failed in ${component}: ${operation}${reason ? ` - ${reason}` : ''}`,
      component,
      operation,
      originalError,
      metadata,
    });
  },

  operationTimeout: (
    component: string,
    operation: string,
    timeoutMs?: number,
    metadata?: Record<string, any>
  ): KernelError => {
    return new KernelError({
      code: KernelErrorCode.OPERATION_TIMEOUT,
      message: `Operation timeout in ${component}: ${operation}${timeoutMs ? ` (${timeoutMs}ms)` : ''}`,
      component,
      operation,
      metadata: { ...metadata, timeoutMs },
    });
  },

  resourceNotFound: (
    component: string,
    resourceType: string,
    resourceId: string,
    metadata?: Record<string, any>
  ): KernelError => {
    return new KernelError({
      code: KernelErrorCode.RESOURCE_NOT_FOUND,
      message: `${resourceType} not found in ${component}: ${resourceId}`,
      component,
      metadata: { ...metadata, resourceType, resourceId },
    });
  },

  invalidState: (
    component: string,
    currentState: string,
    expectedState?: string,
    metadata?: Record<string, any>
  ): KernelError => {
    return new KernelError({
      code: KernelErrorCode.INVALID_STATE,
      message: `Invalid state in ${component}: ${currentState}${expectedState ? ` (expected: ${expectedState})` : ''}`,
      component,
      metadata: { ...metadata, currentState, expectedState },
    });
  },

  notInitialized: (
    component: string,
    resource?: string,
    metadata?: Record<string, any>
  ): KernelError => {
    return new KernelError({
      code: KernelErrorCode.NOT_INITIALIZED,
      message: `${component}${resource ? ` (${resource})` : ''} is not initialized`,
      component,
      metadata: { ...metadata, resource },
    });
  },

  validationError: (
    component: string,
    field: string,
    reason: string,
    metadata?: Record<string, any>
  ): KernelError => {
    return new KernelError({
      code: KernelErrorCode.VALIDATION_ERROR,
      message: `Validation error in ${component}: ${field} - ${reason}`,
      component,
      metadata: { ...metadata, field, reason },
    });
  },

  externalServiceError: (
    component: string,
    service: string,
    operation: string,
    originalError?: Error | unknown,
    metadata?: Record<string, any>
  ): KernelError => {
    return new KernelError({
      code: KernelErrorCode.EXTERNAL_SERVICE_ERROR,
      message: `External service error in ${component}: ${service} - ${operation}`,
      component,
      operation,
      originalError,
      metadata: { ...metadata, service },
    });
  },
};

/**
 * Check if an error is a KernelError
 */
export function isKernelError(error: unknown): error is KernelError {
  return error instanceof KernelError;
}

/**
 * Extract error message from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof KernelError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Extract error code from any error type
 */
export function getErrorCode(error: unknown): KernelErrorCode | string | undefined {
  if (error instanceof KernelError) {
    return error.code;
  }
  if (error instanceof Error) {
    return error.name;
  }
  return undefined;
}

