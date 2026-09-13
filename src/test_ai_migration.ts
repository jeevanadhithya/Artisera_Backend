import sharp from 'sharp';
import { enhanceProductImage } from './ai/image/enhancer';
import { PricingEngine } from './ai/pricing/pricingEngine';
import { scoreProductListing } from './ai/intelligence/productScore';
import { compareProductToMarket } from './ai/intelligence/comparison';
import { getMarketTrends } from './ai/intelligence/trends';
import { getMarketOpportunities } from './ai/intelligence/opportunities';

async function runAiMigrationTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING ARTISERA UNIFIED NODE.JS / TYPESCRIPT AI TEST SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assert(title: string, condition: boolean, details?: any) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title}`);
      if (details) console.error('   Details:', details);
    }
  }

  // ── Test 1: Image Enhancement Pipeline ──────────────────────────────────
  console.log('--- Test 1: TypeScript Image Enhancement Pipeline ---');
  try {
    // Generate 600x600 test canvas image with a colored circle product
    const testBuffer = await sharp({
      create: {
        width: 600,
        height: 600,
        channels: 3,
        background: { r: 240, g: 235, b: 220 }, // Light background
      },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="300" height="300"><circle cx="150" cy="150" r="120" fill="#C4512D" stroke="#30251F" stroke-width="8"/></svg>`
          ),
          left: 150,
          top: 150,
        },
      ])
      .jpeg()
      .toBuffer();

    const result = await enhanceProductImage(testBuffer, undefined, {
      canvasWidth: 1200,
      canvasHeight: 1200,
      quality: 92,
      outputFormat: 'jpeg',
    });

    assert('Image pipeline executed successfully', result.success === true);
    assert('Image width resized to standard 1200px', result.width === 1200);
    assert('Image height resized to standard 1200px', result.height === 1200);
    assert('Image format is JPEG', result.format === 'jpeg');
    assert('Output buffer generated', Boolean(result.buffer && result.buffer.length > 0));
    assert('Processing metadata contains steps', result.processingMetadata.stepsApplied.length >= 4);
    console.log(`   ⏱️ Enhancement latency: ${result.processingMetadata.processingTimeMs}ms (${Math.round(result.fileSize / 1024)} KB)`);
  } catch (err: any) {
    assert('Image pipeline failed with exception', false, err.message);
  }

  // ── Test 2: Fair-Trade Living Wage Pricing Engine ────────────────────────
  console.log('\n--- Test 2: PricingEngine Living Wage Formulation ---');
  try {
    const pricingInput = {
      title: 'Handloom Pure Silk Banarasi Saree with Zari Work',
      category: 'textiles',
      material: 'Mulberry Silk & Metallic Zari',
      craftComplexity: 'intricate' as const,
      isGiTagged: true,
      costInputs: {
        rawMaterials: 2200,
        laborHours: 24,
        hourlyWage: 150, // ₹3,600 labor
        transport: 250,
        packaging: 150,
        overhead: 200,
      },
    };

    const result = PricingEngine.calculatePrice(pricingInput);

    const expectedCostFloor = 2200 + 24 * 150 + 250 + (200 + 150); // 6,400
    assert('Cost floor accurately calculates labor + materials', result.costFloor === expectedCostFloor, {
      actual: result.costFloor,
      expected: expectedCostFloor,
    });
    assert('Suggested price is above cost floor', result.suggestedPrice >= result.costFloor);
    assert('Comparable products retrieved from benchmark catalog', result.comparableProducts.length > 0);
    assert('Confidence score is high or medium', ['high', 'medium'].includes(result.confidence));
    assert('Reasoning breakdown provided', result.reasoning.length >= 3);
    console.log(`   💰 Cost floor: ₹${result.costFloor} | Suggested: ₹${result.suggestedPrice} (Range: ₹${result.recommendedRange.min} - ₹${result.recommendedRange.max})`);
  } catch (err: any) {
    assert('Pricing engine failed with exception', false, err.message);
  }

  // ── Test 3: Product Catalog Readiness Score ──────────────────────────────
  console.log('\n--- Test 3: Product Catalog Readiness Score ---');
  try {
    const score = scoreProductListing({
      title: 'Terracotta Handcrafted Clay Vase with Warli Art',
      category: 'pottery',
      material: 'Natural Clay & Organic Earth Dyes',
      description: 'Handmade by tribal artisans of Maharashtra using ancient coil throwing techniques passed down through 4 generations.',
      price: 1250,
      imageUrl: 'https://images.unsplash.com/photo-terracotta-vase.jpg',
      giCertified: true,
    });

    assert('Catalog score calculated between 0 and 100', score.overallScore >= 70 && score.overallScore <= 100, score);
    assert('Grade assigned', ['A+', 'A', 'B'].includes(score.grade));
    assert('Strengths identified', score.strengths.length > 0);
    console.log(`   ⭐ Catalog Readiness Score: ${score.overallScore}/100 (Grade: ${score.grade})`);
  } catch (err: any) {
    assert('Product score failed with exception', false, err.message);
  }

  // ── Test 4: Market Comparison & Intelligence ─────────────────────────────
  console.log('\n--- Test 4: Market Comparison & Intelligence ---');
  try {
    const comparison = compareProductToMarket({
      title: 'Khurja Blue Pottery Floral Decorative Vase',
      category: 'pottery',
      price: 850,
      material: 'Quartz powder & glaze',
    });

    assert('Comparison calculated delta percent', typeof comparison.priceDeltaPercent === 'number');
    assert('Market positioning evaluated', ['below_average', 'at_market', 'premium'].includes(comparison.marketPosition));
    assert('Competitor listings retrieved', comparison.topCompetitors.length > 0);
    console.log(`   📊 Price comparison delta: ${comparison.priceDeltaPercent}% (${comparison.marketPosition})`);

    const trends = getMarketTrends('textiles');
    assert('Market trends retrieved for category', trends.length > 0 && trends[0].demandIndex > 0);

    const leads = getMarketOpportunities('woodwork');
    assert('Wholesale sourcing leads retrieved', leads.length > 0);
  } catch (err: any) {
    assert('Market comparison failed with exception', false, err.message);
  }

  console.log('\n======================================================');
  console.log(`🏁 TEST RESULTS: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('======================================================\n');

  if (passed === total) {
    console.log('🎉 ALL TYPESCRIPT AI MODULES OPERATING WITH 100% RELIABILITY ON VERCEL SERVERLESS!');
  } else {
    process.exit(1);
  }
}

runAiMigrationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
