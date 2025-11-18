// Common types shared across all microservices

export interface ApiResponse<T = any> {
  message: string;
  data: T;
  tools?: string[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AuthUser extends User {
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

// RabbitMQ Event Types
export enum EventType {
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  USER_REGISTERED = 'user.registered',
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
}

export interface BaseEvent {
  type: EventType;
  timestamp: string;
  data: any;
}

export interface UserCreatedEvent extends BaseEvent {
  type: EventType.USER_CREATED;
  data: User;
}

export interface UserUpdatedEvent extends BaseEvent {
  type: EventType.USER_UPDATED;
  data: User;
}

export interface UserDeletedEvent extends BaseEvent {
  type: EventType.USER_DELETED;
  data: { id: string };
}

export interface UserRegisteredEvent extends BaseEvent {
  type: EventType.USER_REGISTERED;
  data: User;
}

export interface UserLoginEvent extends BaseEvent {
  type: EventType.USER_LOGIN;
  data: { userId: string; email: string };
}

export type MessageEvent =
  | UserCreatedEvent
  | UserUpdatedEvent
  | UserDeletedEvent
  | UserRegisteredEvent
  | UserLoginEvent;

