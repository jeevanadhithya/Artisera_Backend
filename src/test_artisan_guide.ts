import { CopilotService } from './services/copilot/copilotService';
import { IntentRouter } from './services/copilot/intentRouter';
import { RAGEngine } from './services/copilot/ragEngine';
import { CopilotToolRegistry } from './services/copilot/tools';

async function runArtisanGuideTests() {
  console.log('=== STARTING ARTISAN GUIDE VERIFICATION SUITE ===\n');
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName}`, detail || '');
    }
  }

  // TEST 1: Intent Routing & Multilingual Detection across 7 Languages
  console.log('\n--- 1. Testing Multilingual Detection (7 Languages) ---');
  const langTests = [
    { query: 'How do I register for PM Vishwakarma scheme?', expectedLang: 'en', flow: 'pm_vishwakarma' },
    { query: 'मुझे पीएम विश्वकर्मा योजना में पंजीकरण कैसे करना है?', expectedLang: 'hi', flow: 'pm_vishwakarma' },
    { query: 'பிஎம் விஸ்வகர்மா திட்டத்தில் எப்படி பதிவு செய்வது?', expectedLang: 'ta', flow: 'pm_vishwakarma' },
    { query: 'పీఎం విశ్వకర్మ పథకంలో ఎలా నమోదు చేసుకోవాలి?', expectedLang: 'te', flow: 'pm_vishwakarma' },
    { query: 'পিএম বিশ্বকর্মা যোজনায় কীভাবে নিবন্ধন করব?', expectedLang: 'bn', flow: 'pm_vishwakarma' },
    { query: 'पीएम विश्वकर्मा योजनेत नोंदणी कशी करावी?', expectedLang: 'mr', flow: 'pm_vishwakarma' },
    { query: 'ಪಿಎಂ ವಿಶ್ವಕರ್ಮ ಯೋಜನೆಯಲ್ಲಿ ನೋಂದಾಯಿಸುವುದು ಹೇಗೆ?', expectedLang: 'kn', flow: 'pm_vishwakarma' },
  ];

  for (const t of langTests) {
    const classification = IntentRouter.classify(t.query);
    assert(
      classification.detectedLanguage === t.expectedLang,
      `Language detection for ${t.expectedLang} (${t.query.substring(0, 25)}...)`
    );
    assert(
      classification.flowType === t.flow,
      `Flow classification for ${t.flow} in ${t.expectedLang}`
    );
  }

  // TEST 2: Step-by-Step Task Guidance for PM Vishwakarma
  console.log('\n--- 2. Testing PM Vishwakarma 4-Step Guided Flow ---');
  const vishwaRes = await CopilotService.processMessage({
    query: 'How do I apply for PM Vishwakarma?',
    languageHint: 'en',
  });

  assert(Boolean(vishwaRes.task_guide), 'PM Vishwakarma task guide returned');
  assert(vishwaRes.task_guide?.current_step === 1, 'Initial step is Step 1');
  assert(vishwaRes.task_guide?.total_steps === 4, 'Total steps is 4');
  assert(
    vishwaRes.task_guide?.step_title.includes('Check Traditional Trade Eligibility') === true,
    'Step 1 title is accurate'
  );
  assert(
    Boolean(vishwaRes.task_guide?.action_button?.route_or_url),
    'Action button has official URL/route'
  );
  assert(
    vishwaRes.task_guide?.verified_requirements?.length! > 0,
    'Verified requirements are distinguished'
  );
  assert(
    vishwaRes.task_guide?.needs_confirmation?.length! > 0,
    'Needs confirmation items are distinguished'
  );

  // Next step query
  const nextStepRes = await CopilotService.processMessage({
    query: 'What should I do next?',
    activeFlow: 'pm_vishwakarma',
    languageHint: 'en',
  });
  assert(nextStepRes.task_guide?.current_step === 2, 'Next step query advances to Step 2');

  // TEST 3: Product Creation 6-Step Guided Flow with 1 In-App Action Button per Step
  console.log('\n--- 3. Testing Product Creation 6-Step Flow ---');
  const prodFlowRes = await CopilotService.processMessage({
    query: 'I want to create a new product on Artisera',
    languageHint: 'en',
  });
  assert(prodFlowRes.task_guide?.flow_type === 'product_creation', 'Flow is product_creation');
  assert(prodFlowRes.task_guide?.total_steps === 6, 'Total steps is 6');
  assert(prodFlowRes.task_guide?.current_step === 1, 'Starts at Step 1 (Photo)');
  assert(
    prodFlowRes.task_guide?.action_button?.action_type === 'navigate',
    'Action button is in-app navigation'
  );
  assert(
    prodFlowRes.task_guide?.action_button?.route_or_url === '/add-craft',
    'Action button routes to /add-craft'
  );

  // TEST 4: Non-fictional Product Retrieval & Strict Ownership Error
  console.log('\n--- 4. Testing Product Ownership & No Fictional Fallback ---');
  const nonExistentProduct = await CopilotToolRegistry.getCurrentProduct(
    '00000000-0000-0000-0000-000000000000',
    '99999999-9999-9999-9999-999999999999'
  );
  assert(nonExistentProduct === null, 'Non-existent product returns null (never demo terracotta pot)');

  const missingProdChat = await CopilotService.processMessage({
    query: 'How ready is this product for Amazon?',
    productId: '99999999-9999-9999-9999-999999999999',
    languageHint: 'en',
  });
  assert(
    missingProdChat.hasProductContext === false,
    'Chat indicates no product context for missing product'
  );
  assert(
    missingProdChat.warnings?.[0]?.includes('could not find this product') === true,
    'Clear warning given that product was not found'
  );

  // TEST 5: Genuine Marketplace Readiness Evaluation
  console.log('\n--- 5. Testing Marketplace Readiness Tool ---');
  const sampleArtisan = {
    id: 'art_test_1',
    business_name: 'Jaipur Blue Pottery Collective',
    city: 'Jaipur',
    state: 'Rajasthan',
  };
  const sampleProduct = {
    id: 'prod_test_1',
    artisan_id: 'art_test_1',
    title: 'Handmade Glazed Ceramic Floral Vase',
    description: 'Traditional Jaipur blue pottery vase handcrafted with quartz powder and natural glazes.',
    price: 850,
    images: ['https://images.unsplash.com/photo-1578749556568-bc2c40e68b61'],
    category: 'Home Decor',
  };

  const amazonEval = CopilotToolRegistry.evaluateMarketplaceReadiness(sampleProduct, sampleArtisan, 'amazon');
  assert(amazonEval.marketplace === 'amazon', 'Evaluated for Amazon');
  assert(amazonEval.readinessPercentage > 0, 'Readiness percentage calculated');
  assert(amazonEval.missingFields.length > 0, 'Identified missing fields (e.g. dimensions, weight, SKU)');
  assert(
    amazonEval.missingFields.some(f => f.field === 'sku'),
    'Missing field includes SKU'
  );
  assert(
    amazonEval.warnings.some(w => w.toLowerCase().includes('dimensions')),
    'Warnings include package dimensions confirmation'
  );
  assert(
    amazonEval.officialPortalUrl.includes('amazon'),
    'Includes official Amazon portal URL'
  );

  // TEST 6: Fair Living Wage Pricing Tool
  console.log('\n--- 6. Testing Fair Living Wage Pricing Tool ---');
  const pricingResult = CopilotToolRegistry.calculateProfit(850, {
    raw_materials: 120,
    labor_hours: 4.0,
    hourly_wage: 130,
    packaging: 45,
    transport: 35,
  });
  // Floor cost: 120 + (4*130=520) + 45 + 35 = 720
  assert(pricingResult.floorCost === 720, `Living wage floor is ₹720 (Calculated: ₹${pricingResult.floorCost})`);
  assert(pricingResult.netProfit === 130, `Net profit is ₹130 (Calculated: ₹${pricingResult.netProfit})`);
  assert(pricingResult.profitMarginPct === 15, `Margin is 15% (Calculated: ${pricingResult.profitMarginPct}%)`);
  assert(pricingResult.fairWageSatisfied === true, 'Fair wage standard satisfied');

  // TEST 7: Vector Semantic RAG Retrieval
  console.log('\n--- 7. Testing Semantic Vector RAG Retrieval ---');
  const ragRetrieval = await RAGEngine.retrieve('PM Vishwakarma tool kit voucher 15000', 'en');
  assert(ragRetrieval.citations.length > 0, 'Retrieved RAG citations');
  assert(
    ragRetrieval.citations[0].title.toLowerCase().includes('vishwakarma'),
    `Top citation is PM Vishwakarma (Found: ${ragRetrieval.citations[0].title})`
  );
  assert(
    ragRetrieval.citations[0].official_source_url === 'https://pmvishwakarma.gov.in',
    'Official government citation URL verified'
  );

  console.log(`\n==============================================`);
  console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`==============================================\n`);

  if (passedTests === totalTests) {
    console.log('ALL ARTISAN GUIDE BACKEND TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('SOME TESTS FAILED!');
    process.exit(1);
  }
}

runArtisanGuideTests().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
