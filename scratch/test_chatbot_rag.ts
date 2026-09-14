import { RAGEngine } from '../src/services/copilot/ragEngine';
import { IntentRouter } from '../src/services/copilot/intentRouter';
import { CopilotToolRegistry } from '../src/services/copilot/tools';
import { CopilotService } from '../src/services/copilot/copilotService';

async function testChatbotRAG() {
  console.log('====================================================');
  console.log('TESTING ARTISERA CHATBOT RAG & CONTROLLED TOOLS');
  console.log('====================================================');

  // 1. Test RAG Retrieval for Amazon Karigar
  console.log('\n--- 1. Testing RAG Retrieval: "How do I register on Amazon Karigar?" ---');
  const ragAmazon = await RAGEngine.retrieve('How do I register on Amazon Karigar?');
  console.log(`Retrieved ${ragAmazon.documents.length} documents.`);
  for (const doc of ragAmazon.documents) {
    console.log(`✓ Document: "${doc.title}" (Version: ${doc.documentVersion}, Verified: ${doc.lastVerifiedDate})`);
    console.log(`  Source: ${doc.sourceUrl}`);
  }

  // 2. Test RAG Retrieval for ONDC
  console.log('\n--- 2. Testing RAG Retrieval: "How does ONDC work for sellers?" ---');
  const ragOndc = await RAGEngine.retrieve('How does ONDC work for sellers?');
  console.log(`Retrieved ${ragOndc.documents.length} documents.`);
  for (const doc of ragOndc.documents) {
    console.log(`✓ Document: "${doc.title}"`);
    console.log(`  Source: ${doc.sourceUrl}`);
  }

  // 3. Test Intent Router
  console.log('\n--- 3. Testing Intent Routing ---');
  const query1 = 'How much profit will I make if I sell this for ₹900?';
  const intent1 = IntentRouter.classify(query1, true);
  console.log(`Query: "${query1}" -> Intent: ${intent1.intent}, Tool: ${intent1.toolName}, Extracted Price: ${intent1.extractedPrice}`);

  const query2 = 'Can this product be listed on Amazon?';
  const intent2 = IntentRouter.classify(query2, true);
  console.log(`Query: "${query2}" -> Intent: ${intent2.intent}, Marketplace: ${intent2.targetMarketplace}`);

  const query3 = 'Teach me how to photograph products step by step';
  const intent3 = IntentRouter.classify(query3, false);
  console.log(`Query: "${query3}" -> Intent: ${intent3.intent}, Lesson Topic: ${intent3.lessonTopic}`);

  // 4. Test Profit Calculation Tool
  console.log('\n--- 4. Testing Profit Calculation Tool for ₹900 ---');
  const profit = CopilotToolRegistry.calculateProfit(900, {
    rawMaterials: 90,
    laborHours: 3.5,
    hourlyWage: 130,
    packaging: 40,
    transport: 30,
  });
  console.log(`Floor Cost: ₹${profit.floorCost}, Selling Price: ₹${profit.sellingPrice}, Net Profit: ₹${profit.netProfit} (${profit.profitMarginPct}%)`);
  console.log(`Recommendation: ${profit.recommendation}`);

  // 5. Test Marketplace Compatibility Checker
  console.log('\n--- 5. Testing Marketplace Compatibility Checker (Amazon) ---');
  const dummyProduct = {
    id: 'prod_test_01',
    name: 'Gorakhpur Traditional Terracotta Pitcher',
    price: 650,
    description_en: 'Authentic hand-thrown water pot crafted by Gorakhpur master clay artisans.',
    region: 'Gorakhpur, Uttar Pradesh',
    material: 'Natural Red Clay',
    dimensions: { height_cm: 28, weight_grams: 1400 },
    images: ['https://images.unsplash.com/photo-1615486511484-92e172cc4fe0'],
  };
  const validation = CopilotToolRegistry.validateMarketplaceProduct(dummyProduct, 'amazon');
  console.log(`Marketplace: ${validation.displayName}`);
  console.log(`Status: ${validation.status} (${validation.readinessPercentage}% ready)`);
  console.log(`Passed Checks: ${validation.passedChecks.join('; ')}`);
  if (validation.missingFields.length > 0) {
    console.log(`Missing Fields: ${validation.missingFields.map(f => f.label).join(', ')}`);
  }

  // 6. Test End-to-End Chatbot Service (with Gemini API Key)
  console.log('\n--- 6. Testing End-to-End Chatbot Service Pipeline ---');
  const chatResponse = await CopilotService.processMessage({
    query: 'How much profit will I make if I sell this for ₹900?',
    productId: 'prod_test_01',
    languageHint: 'en',
  });
  
  console.log(`Detected Intent: ${chatResponse.intent}`);
  console.log(`Assistant Message Preview:\n${chatResponse.message.substring(0, 200)}...`);
  if (chatResponse.profitCard) {
    console.log(`✓ Profit Card attached: Net Profit ₹${chatResponse.profitCard.netProfit}`);
  }
  if (chatResponse.quickActions.length > 0) {
    console.log(`✓ Quick Actions generated: ${chatResponse.quickActions.map(a => a.label).join(', ')}`);
  }

  console.log('\n====================================================');
  console.log('ALL CHATBOT BACKEND TESTS COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
}

testChatbotRAG().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
