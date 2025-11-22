// Event Bus Types

// Event handler function type
export type EventHandler = (event: EventMessage) => Promise<void> | void;

// Event message interface
export interface EventMessage {
  type: string;
  timestamp: string;
  data: any;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

// Event publishing options
export interface EventOptions {
  scope?: 'internal' | 'external'; // default: 'internal'
  exchange?: string; // for external, auto-derived if not provided
  routingKey?: string; // auto-derived from event name if not provided
  sessionId?: string; // auto-added to event metadata
  userId?: string; // auto-added to event metadata
  metadata?: Record<string, any>; // additional metadata
}

// Event subscription options
export interface SubscribeOptions {
  scope?: 'internal' | 'external'; // default: 'internal'
  queue?: string; // for internal, auto-generated if not provided
  exchange?: string; // for external
  routingKey?: string; // pattern matching, e.g., 'ai-service.ask.*'
}

// Event Bus interface
export interface IEventBus {
  emit(event: string, data: any, options?: EventOptions): Promise<void>;
  on(event: string, handler: EventHandler, options?: SubscribeOptions): Promise<void>;
  off(event: string, handler: EventHandler): Promise<void>;
}

// Event Bus type enum
export enum EventBusType {
  RABBITMQ = 'rabbitmq',
}

// RabbitMQ Event Bus configuration
export interface RabbitMQEventConfig {
  url?: string; // default: process.env.RABBITMQ_URL
  serviceName: string; // e.g., 'ai-service' - used for internal queue naming
  defaultExchange?: string; // default: serviceName
  internalQueuePrefix?: string; // default: `${serviceName}.internal`
}

