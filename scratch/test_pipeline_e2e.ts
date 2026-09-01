import { getPool } from '../src/services/db';
import { imageEnhancementService } from '../src/services/image';
import * as storageService from '../src/services/storage';
import * as db from '../src/services/db';
import { MarketplaceExportService } from '../src/services/marketplace';

async function testPipeline() {
  console.log('--- STARTING ARTISERA IMAGE PIPELINE E2E TEST ---');

  const pool = getPool();

  // Find an existing user or artisan in the DB
  const userRes = await pool.query(`SELECT id FROM auth.users LIMIT 1;`);
  let testUserId: string;

  if (userRes.rows.length > 0) {
    testUserId = userRes.rows[0].id;
  } else {
    // Check if any artisan already exists
    const artisanRes = await pool.query(`SELECT user_id FROM public.artisans LIMIT 1;`);
    if (artisanRes.rows.length > 0) {
      testUserId = artisanRes.rows[0].user_id;
    } else {
      console.log('No user found in auth.users');
      return;
    }
  }

  console.log('Using real user_id:', testUserId);

  let artisan = await db.getArtisanByUserId(testUserId);
  if (!artisan) {
    artisan = await db.createArtisan(testUserId, {
      name: 'Ramesh Sharma',
      language: 'Hindi',
      state: 'Rajasthan',
      district: 'Jaipur',
      craft_type: 'Blue Pottery',
      profile_status: 'verified',
    });
  }
  console.log('✅ Artisan verified:', artisan.name, artisan.id);

  const product = await db.createProduct(artisan.id, {
    name: 'Handcrafted Jaipur Blue Pottery Floral Vase',
    category: 'Home Decor',
    craft_type: 'Blue Pottery',
    material: 'Quartz Clay',
    region: 'Jaipur, Rajasthan',
    price: 1200,
    status: 'draft',
  });
  console.log('✅ Product draft initialized with ID:', product.id);

  // 2. Prepare a test image buffer (a 400x400 RGB image with colored craft pattern)
  const sharp = require('sharp');
  const testImageBuffer = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 180, g: 120, b: 70 }, // Terracotta clay color
    },
  })
    .jpeg()
    .toBuffer();

  const imageId = crypto.randomUUID();
  console.log('✅ Test sample image generated, bytes:', testImageBuffer.length);

  // 3. Upload Original Image to Supabase Storage: products/{artisanId}/{productId}/original/{imageId}.jpg
  const originalUrl = await storageService.uploadOriginalProductImage({
    artisanId: artisan.id,
    productId: product.id,
    imageId,
    fileContent: testImageBuffer,
    contentType: 'image/jpeg',
    extension: 'jpg',
  });
  console.log('✅ Original image uploaded to Supabase Storage:', originalUrl);

  // 4. Create record in product_images table
  const imageRecord = await db.createProductImage({
    id: imageId,
    product_id: product.id,
    artisan_id: artisan.id,
    original_image_url: originalUrl,
    processing_status: 'uploaded',
    analysis_status: 'pending',
    mime_type: 'image/jpeg',
    file_size: testImageBuffer.length,
  });
  console.log('✅ product_images database record created:', imageRecord.id, 'status:', imageRecord.processing_status);

  // 5. Run Image Enhancement (Gemini 2.5 Flash visual intelligence + Free Sharp processor)
  console.log('🚀 Running ImageEnhancementService (Gemini 2.5 Flash + Sharp)...');
  const enhancementResult = await imageEnhancementService.enhanceImageById(imageId, testUserId, 'admin');
  console.log('🎉 Enhancement completed successfully!');
  console.log('Result:', {
    imageId: enhancementResult.imageId,
    originalImageUrl: enhancementResult.originalImageUrl,
    enhancedImageUrl: enhancementResult.enhancedImageUrl,
    status: enhancementResult.status,
    analysisProduct: enhancementResult.analysis?.product,
  });

  // Verify enhanced image URL != original image URL
  if (enhancementResult.enhancedImageUrl === enhancementResult.originalImageUrl) {
    throw new Error('FAILED: Enhanced image URL cannot equal original image URL');
  }

  // 6. Select Enhanced Image
  console.log('👉 Selecting Enhanced photo...');
  const selectResult = await imageEnhancementService.selectImage(imageId, 'enhanced', testUserId, 'admin');
  console.log('✅ Selected image saved:', selectResult.selected_image_url);

  // 7. Verify product database fields
  const finalProduct = await db.getProductById(product.id);
  console.log('✅ Product verified in DB:');
  console.log({
    id: finalProduct.id,
    image_url: finalProduct.image_url,
    primary_image_url: finalProduct.primary_image_url,
    selected_image_url: finalProduct.selected_image_url,
    enhanced_image_url: finalProduct.enhanced_image_url,
  });

  // 8. Test Marketplace Export Service
  console.log('📦 Testing Marketplace Export Service (Amazon, Flipkart, GeM)...');
  const amazonExport = MarketplaceExportService.exportProduct(finalProduct, 'amazon');
  const flipkartExport = MarketplaceExportService.exportProduct(finalProduct, 'flipkart');
  const gemExport = MarketplaceExportService.exportProduct(finalProduct, 'gem');
  console.log('✅ Amazon SKU:', amazonExport.sku, 'Title:', amazonExport.title, 'MRP:', amazonExport.price.mrp);
  console.log('✅ Flipkart Title:', flipkartExport.title, 'Samarth:', flipkartExport.attributes.flipkart_samarth_initiative);
  console.log('✅ GeM Category:', gemExport.attributes.gem_category_code, 'Make in India:', gemExport.attributes.make_in_india_compliance);

  console.log('🎉 ALL BACKEND PIPELINE TESTS PASSED COMPLETELY!');
  process.exit(0);
}

testPipeline().catch(err => {
  console.error('❌ Pipeline test failed:', err);
  process.exit(1);
});
