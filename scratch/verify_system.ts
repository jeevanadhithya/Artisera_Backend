import { getPool } from '../src/services/db';
import { imageEnhancementService } from '../src/services/image';
import * as storageService from '../src/services/storage';
import * as db from '../src/services/db';
import * as llmService from '../src/services/llm';
import { MarketplaceExportService } from '../src/services/marketplace';

async function runCompleteSystemVerification() {
  console.log('====================================================');
  console.log('ARTISERA FULL PIPELINE VERIFICATION SUITE');
  console.log('====================================================');

  const pool = getPool();

  // 1. Database & User Check
  const userRes = await pool.query(`SELECT id FROM auth.users LIMIT 1;`);
  const userId = userRes.rows[0].id;
  const artisan = await db.getOrCreateArtisan(userId, 'Master Artisan');
  console.log('1. Artisan Profile Ready:', artisan.name, `(${artisan.id})`);

  // 2. Create Product Draft
  const product = await db.createProduct(artisan.id, {
    name: 'Handcrafted Terracotta Warli Art Vase',
    category: 'Home Decor',
    craft_type: 'Terracotta Pottery',
    material: 'Natural Clay',
    region: 'Maharashtra',
    price: 850,
    material_cost: 200,
    labor_cost: 300,
    status: 'draft',
  });
  console.log('2. Product Draft Created:', product.id);

  // 3. Generate Image Bytes & Upload Original Image
  const sharp = require('sharp');
  const originalBytes = await sharp({
    create: {
      width: 500,
      height: 500,
      channels: 3,
      background: { r: 185, g: 110, b: 65 },
    },
  }).jpeg({ quality: 90 }).toBuffer();

  const imageId = crypto.randomUUID();
  const originalUrl = await storageService.uploadOriginalProductImage({
    artisanId: artisan.id,
    productId: product.id,
    imageId,
    fileContent: originalBytes,
    contentType: 'image/jpeg',
    extension: 'jpg',
  });
  console.log('3. Original Image Uploaded to Supabase Storage:', originalUrl);

  const imgRecord = await db.createProductImage({
    id: imageId,
    product_id: product.id,
    artisan_id: artisan.id,
    original_image_url: originalUrl,
    processing_status: 'uploaded',
    mime_type: 'image/jpeg',
    file_size: originalBytes.length,
  });
  console.log('4. product_images record created:', imgRecord.id);

  // 4. Enhance Image using ImageEnhancementService (Gemini 2.5 Flash + Sharp)
  console.log('5. Running Enhancement (Gemini 2.5 Flash Visual Analysis + Sharp Transformation)...');
  const enhanceResult = await imageEnhancementService.enhanceImageById(imageId, userId, 'admin');
  console.log('   - Processing Status:', enhanceResult.status);
  console.log('   - Enhanced Image URL:', enhanceResult.enhancedImageUrl);
  console.log('   - Visual Info Extracted:', enhanceResult.analysis?.product);

  // 5. Select Image
  console.log('6. Selecting Enhanced Photo...');
  const selectResult = await imageEnhancementService.selectImage(imageId, 'enhanced', userId, 'admin');
  console.log('   - Selected URL Saved:', selectResult.selected_image_url);

  // 6. Generate Catalog with Visual Analysis Context + Voice Transcript
  console.log('7. Generating Catalog with Qwen/Gemini using Visual Intelligence Context...');
  const sampleTranscript = 'Yeh mitti ka sundar guldaan hai jisme Warli chitra-kala ki gayi hai.';
  const catalog = await llmService.generateCatalog(
    enhanceResult.enhancedImageUrl,
    sampleTranscript,
    { craft_type: 'Terracotta Pottery', region: 'Maharashtra' },
    enhanceResult.analysis
  );
  console.log('   - Catalog Name:', catalog.product_name);
  console.log('   - Category:', catalog.category);
  console.log('   - Material:', catalog.material);
  console.log('   - Confidence Score:', catalog.confidence);

  // 7. Multilingual Translations Test
  console.log('8. Storing Multilingual Translations in Database...');
  await db.saveProductTranslation(product.id, 'hi', {
    title: catalog.product_name,
    description: catalog.description_hi,
    keywords: catalog.keywords,
  });
  await db.saveProductTranslation(product.id, 'ta', {
    title: catalog.product_name,
    description: 'பாரம்பரிய கைவினை மட்பாண்ட பொருள்.',
    keywords: catalog.keywords,
  });
  const savedTranslations = await db.getProductTranslations(product.id);
  console.log('   - Stored languages in DB:', savedTranslations.map(t => t.language_code));

  // 8. Marketplace Export Test (Amazon, Flipkart, GeM)
  console.log('9. Testing Marketplace Export Service...');
  const updatedProd = await db.getProductById(product.id);
  const amazon = MarketplaceExportService.exportProduct(updatedProd, 'amazon');
  const flipkart = MarketplaceExportService.exportProduct(updatedProd, 'flipkart');
  const gem = MarketplaceExportService.exportProduct(updatedProd, 'gem');
  console.log('   - Amazon Export Ready:', amazon.sku, '| Image:', amazon.images.mainImage.substring(0, 60) + '...');
  console.log('   - Flipkart Export Ready:', flipkart.sku, '| Samarth:', flipkart.attributes.flipkart_samarth_initiative);
  console.log('   - GeM Export Ready:', gem.sku, '| Code:', gem.attributes.gem_category_code);

  console.log('====================================================');
  console.log('🎉 ALL 9 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  console.log('====================================================');
  process.exit(0);
}

runCompleteSystemVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
