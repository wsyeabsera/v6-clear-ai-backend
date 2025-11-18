import * as dotenv from 'dotenv';
import { RabbitMQClient, EXCHANGES, QUEUES, ROUTING_KEYS } from './shared/src/index';

dotenv.config();

async function testEventConsumption() {
  console.log('🧪 Testing RabbitMQ Event Consumption...\n');
  
  const client = new RabbitMQClient();
  
  try {
    await client.connect();
    console.log('✅ Connected to RabbitMQ\n');
    
    // Create a test queue to listen for all user events
    const testQueue = 'test-event-listener';
    await client.assertQueue(testQueue);
    await client.bindQueue(testQueue, EXCHANGES.USERS, 'user.#');
    await client.bindQueue(testQueue, EXCHANGES.AUTH, 'auth.#');
    
    console.log('📡 Listening for events... (will listen for 10 seconds)\n');
    console.log('Try registering a user or creating/updating/deleting users in another terminal!\n');
    
    let eventCount = 0;
    
    await client.consume(testQueue, async (event) => {
      eventCount++;
      console.log(`\n📨 Event ${eventCount} received:`);
      console.log(`   Type: ${event.type}`);
      console.log(`   Timestamp: ${event.timestamp}`);
      console.log(`   Data:`, JSON.stringify(event.data, null, 2));
    });
    
    // Listen for 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log(`\n\n✅ Test complete! Received ${eventCount} event(s)\n`);
    
    await client.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testEventConsumption();

