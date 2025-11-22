import {
  EventBusType,
  IEventBus,
  RabbitMQEventConfig,
} from './types';
import { RabbitMQEventBus } from './implementations/RabbitMQEventBus';

export class EventBusFactory {
  static create(
    type: EventBusType,
    config: RabbitMQEventConfig
  ): IEventBus {
    switch (type) {
      case EventBusType.RABBITMQ:
        if (!config.serviceName) {
          throw new Error('RabbitMQEventBus requires serviceName in config');
        }
        return new RabbitMQEventBus(config);

      default:
        throw new Error(`Invalid event bus type: ${type}`);
    }
  }
}

