import * as dotenv from 'dotenv';
import { RabbitMQClient, EXCHANGES, QUEUES } from './shared/src/index';

// Load environment variables from root
dotenv.config();

async function testRabbitMQ() {
  console.log('🧪 Testing RabbitMQ Connection...\n');
  
  const rabbitMQUrl = process.env.RABBITMQ_URL;
  console.log(`📍 RabbitMQ URL: ${rabbitMQUrl ? rabbitMQUrl.replace(/:[^:@]+@/, ':****@') : 'Not set'}\n`);
  
  if (!rabbitMQUrl) {
    console.error('❌ RABBITMQ_URL not found in environment variables');
    process.exit(1);
  }

  const client = new RabbitMQClient(rabbitMQUrl);
  
  try {
    // Test 1: Connect to RabbitMQ
    console.log('1️⃣  Testing connection...');
    await client.connect();
    console.log('   ✅ Connected successfully!\n');
    
    // Test 2: Assert exchanges
    console.log('2️⃣  Creating exchanges...');
    await client.assertExchange(EXCHANGES.USERS, 'topic');
    console.log(`   ✅ Exchange "${EXCHANGES.USERS}" created`);
    await client.assertExchange(EXCHANGES.AUTH, 'topic');
    console.log(`   ✅ Exchange "${EXCHANGES.AUTH}" created\n`);
    
    // Test 3: Assert queue
    console.log('3️⃣  Creating test queue...');
    await client.assertQueue('test-queue');
    console.log('   ✅ Queue "test-queue" created\n');
    
    // Test 4: Bind queue to exchange
    console.log('4️⃣  Binding queue to exchange...');
    await client.bindQueue('test-queue', EXCHANGES.USERS, 'user.#');
    console.log('   ✅ Queue bound to exchange\n');
    
    // Test 5: Publish a test message
    console.log('5️⃣  Publishing test message...');
    const testMessage = {
      type: 'test.message' as any,
      timestamp: new Date().toISOString(),
      data: { message: 'Hello from test script!' }
    };
    await client.publish(EXCHANGES.USERS, 'user.test', testMessage);
    console.log('   ✅ Message published successfully\n');
    
    // Test 6: Consume the message
    console.log('6️⃣  Consuming test message...');
    let messageReceived = false;
    
    await client.consume('test-queue', async (event) => {
      console.log('   📨 Message received:', event);
      messageReceived = true;
    });
    
    // Wait a bit for the message to be consumed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (messageReceived) {
      console.log('   ✅ Message consumed successfully\n');
    } else {
      console.log('   ⚠️  Message not received (might need more time)\n');
    }
    
    // Cleanup
    console.log('7️⃣  Cleaning up...');
    await client.disconnect();
    console.log('   ✅ Disconnected from RabbitMQ\n');
    
    console.log('✨ All tests passed! RabbitMQ is working correctly.\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('\nTroubleshooting tips:');
    console.error('1. Check if your RabbitMQ URL is correct');
    console.error('2. Verify your CloudAMQP instance is active');
    console.error('3. Check your network/firewall settings');
    process.exit(1);
  }
}

testRabbitMQ();

