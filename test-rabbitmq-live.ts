import * as dotenv from 'dotenv';
import { RabbitMQClient, EXCHANGES, ROUTING_KEYS, EventType } from './shared/src/index';

dotenv.config();

async function liveTest() {
  console.log('🧪 Live RabbitMQ Test - Publishing and Consuming Events\n');
  
  const publisher = new RabbitMQClient();
  const consumer = new RabbitMQClient();
  
  try {
    // Connect both clients
    await publisher.connect();
    await consumer.connect();
    console.log('✅ Connected publisher and consumer\n');
    
    // Setup exchanges and queue
    await publisher.assertExchange(EXCHANGES.USERS, 'topic');
    await publisher.assertExchange(EXCHANGES.AUTH, 'topic');
    
    const testQueue = 'live-test-queue';
    await consumer.assertQueue(testQueue);
    
    // Bind to all user and auth events  
    // user.* pattern matches: user.created, user.updated, user.deleted
    await consumer.bindQueue(testQueue, EXCHANGES.USERS, 'user.*');
    // user.* pattern also matches: user.registered, user.login from AUTH exchange
    await consumer.bindQueue(testQueue, EXCHANGES.AUTH, 'user.*');
    
    console.log('📡 Queue setup complete. Starting consumer...\n');
    
    let receivedEvents: any[] = [];
    
    // Start consuming
    await consumer.consume(testQueue, async (event) => {
      receivedEvents.push(event);
      console.log(`📨 Event ${receivedEvents.length} received:`);
      console.log(`   Type: ${event.type}`);
      console.log(`   Timestamp: ${event.timestamp}`);
      console.log(`   Data:`, JSON.stringify(event.data, null, 2));
      console.log('');
    });
    
    console.log('✅ Consumer is listening!\n');
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Publish test events
    console.log('📤 Publishing test events...\n');
    
    // Event 1: User Created
    await publisher.publish(EXCHANGES.USERS, ROUTING_KEYS.USER_CREATED, {
      type: EventType.USER_CREATED,
      timestamp: new Date().toISOString(),
      data: {
        id: 'test-user-1',
        name: 'Test User',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
      }
    });
    console.log('✅ Published USER_CREATED event');
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Event 2: User Registered
    await publisher.publish(EXCHANGES.AUTH, ROUTING_KEYS.USER_REGISTERED, {
      type: EventType.USER_REGISTERED,
      timestamp: new Date().toISOString(),
      data: {
        userId: 'test-user-2',
        email: 'register@example.com',
        name: 'Registered User',
      }
    });
    console.log('✅ Published USER_REGISTERED event');
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Event 3: User Login
    await publisher.publish(EXCHANGES.AUTH, ROUTING_KEYS.USER_LOGIN, {
      type: EventType.USER_LOGIN,
      timestamp: new Date().toISOString(),
      data: {
        userId: 'test-user-1',
        email: 'test@example.com',
      }
    });
    console.log('✅ Published USER_LOGIN event\n');
    
    // Wait for events to be consumed
    console.log('⏳ Waiting for events to be consumed...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Summary
    console.log('═══════════════════════════════════════════════════');
    console.log(`✨ Test Complete! Received ${receivedEvents.length} event(s)`);
    console.log('═══════════════════════════════════════════════════\n');
    
    if (receivedEvents.length === 3) {
      console.log('🎉 SUCCESS! All events were published and consumed correctly!');
      console.log('\nYour RabbitMQ integration is working perfectly!');
      console.log('Events published by your User Service will be:');
      console.log('  - Received by other services');
      console.log('  - Processed asynchronously');
      console.log('  - Available for event-driven workflows\n');
    } else {
      console.log(`⚠️  Expected 3 events but received ${receivedEvents.length}`);
    }
    
    // Cleanup
    await publisher.disconnect();
    await consumer.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

console.log('═══════════════════════════════════════════════════');
console.log('  RabbitMQ Live Event Publishing & Consumption Test');
console.log('═══════════════════════════════════════════════════\n');

liveTest();

