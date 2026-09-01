import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth, requireArtisan, requireVerifiedProfile, getOptionalUser, AuthenticatedRequest } from '../middleware/auth';
import * as db from '../services/db';
import * as imageService from '../services/image';
import * as storageService from '../services/storage';
import * as speechService from '../services/speech';
import * as llmService from '../services/llm';
import * as pricingService from '../services/pricing';
import { BadRequestError, ForbiddenError, NotFoundError, OwnershipError } from '../types/errors';

import { getSupabase } from '../services/supabase';
import { config } from '../config';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const success = (data: any) => ({ success: true, data });

// Helper to verify product ownership
const verifyOwnership = async (productId: string, userId: string, userRole: string) => {
  const product = await db.getProductById(productId);
  if (userRole !== 'admin') {
    const artisan = await db.getArtisanByUserId(userId);
    if (!artisan || artisan.id !== product.artisan_id) {
      throw new OwnershipError('product');
    }
  }
  return product;
};

// ─── Create Product (POST /products) ──────────────────────────────────────────
router.post('/', requireAuth, requireArtisan, requireVerifiedProfile, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const nameHint = user.raw?.user_metadata?.name || user.email?.split('@')[0] || 'Artisan';
    const artisan = await db.getOrCreateArtisan(user.user_id, nameHint);
    const created = await db.createProduct(artisan.id, req.body);
    res.status(201).json(success(created));
  } catch (error) {
    next(error);
  }
});

// ─── List Products (GET /products) ────────────────────────────────────────────
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const offset = (page - 1) * limit;

    if (user.role === 'buyer') {
      throw new ForbiddenError('Buyers should use GET /api/market/products for browsing');
    }

    if (user.role === 'admin') {
      const { items, total } = await db.getAllProducts(limit, offset);
      return res.status(200).json(success({
        items,
        total,
        page,
        limit,
        has_more: (offset + limit) < total,
      }));
    } else {
      const artisan = await db.getArtisanByUserId(user.user_id);
      if (!artisan) {
        return res.status(200).json(success({
          items: [],
          total: 0,
          page,
          limit,
          has_more: false,
        }));
      }
      const { items, total } = await db.getProductsByArtisan(artisan.id, limit, offset);
      return res.status(200).json(success({
        items,
        total,
        page,
        limit,
        has_more: (offset + limit) < total,
      }));
    }
  } catch (error) {
    next(error);
  }
});

// ─── Get Product (GET /products/:id) ──────────────────────────────────────────
router.get('/:product_id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const product = await db.getProductById(req.params.product_id);

    if (user.role === 'buyer') {
      if (product.status !== 'published') {
        throw new NotFoundError('Product', req.params.product_id);
      }
    } else if (user.role === 'artisan') {
      const artisan = await db.getArtisanByUserId(user.user_id);
      if (!artisan || artisan.id !== product.artisan_id) {
        throw new ForbiddenError('You can only view your own products');
      }
    }

    res.status(200).json(success(product));
  } catch (error) {
    next(error);
  }
});

// ─── Update Product (PUT /products/:id) ───────────────────────────────────────
router.put('/:product_id', requireAuth, requireArtisan, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    await verifyOwnership(req.params.product_id, user.user_id, user.role);
    const updated = await db.updateProduct(req.params.product_id, req.body);
    res.status(200).json(success(updated));
  } catch (error) {
    next(error);
  }
});

// ─── Delete Product (DELETE /products/:id) ───────────────────────────────────
router.delete('/:product_id', requireAuth, requireArtisan, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    await verifyOwnership(req.params.product_id, user.user_id, user.role);
    await db.deleteProduct(req.params.product_id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ─── Publish Product (POST /products/:id/publish) ────────────────────────────
router.post('/:product_id/publish', requireAuth, requireArtisan, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const product = await verifyOwnership(req.params.product_id, user.user_id, user.role);

    if (product.status === 'published') {
      return res.status(200).json(success({ message: 'Product is already published', product }));
    }
    if (product.status === 'archived') {
      throw new BadRequestError('Cannot publish an archived product. Restore it first.', 'INVALID_STATUS_TRANSITION');
    }

    const updated = await db.updateProduct(req.params.product_id, { status: 'published' });
    res.status(200).json(success(updated));
  } catch (error) {
    next(error);
  }
});

// ─── Upload Image (POST /products/:id/images and /products/:id/image) ───────
const handleImageUpload = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const product = await verifyOwnership(req.params.product_id, user.user_id, user.role);

    if (!req.file) {
      throw new BadRequestError('No image file uploaded', 'MISSING_FILE');
    }

    // Validate image format, size, and magic bytes
    const { content, contentType, extension } = await imageService.validateAndReadImage(req.file);
    const imageId = crypto.randomUUID();

    // Upload original image to Supabase Storage: products/{artisanId}/{productId}/original/{imageId}.{ext}
    const originalUrl = await storageService.uploadOriginalProductImage({
      artisanId: product.artisan_id,
      productId: req.params.product_id,
      imageId,
      fileContent: content,
      contentType,
      extension,
    });

    // Create record in product_images table
    const imageRecord = await db.createProductImage({
      id: imageId,
      product_id: req.params.product_id,
      artisan_id: product.artisan_id,
      original_image_url: originalUrl,
      processing_status: 'uploaded',
      analysis_status: 'pending',
      mime_type: contentType,
      file_size: content.length,
    });

    // Update product reference
    await db.updateProduct(req.params.product_id, {
      original_image_url: originalUrl,
      image_url: product.image_url || originalUrl,
      selected_image_url: product.selected_image_url || originalUrl,
    });

    res.status(201).json(success({
      imageId: imageRecord.id,
      originalImageUrl: originalUrl,
      status: 'uploaded',
      product_id: req.params.product_id,
      message: 'Original image uploaded successfully'
    }));
  } catch (error) {
    next(error);
  }
};

router.post('/:product_id/images', requireAuth, requireArtisan, upload.single('file'), handleImageUpload);
router.post('/:product_id/image', requireAuth, requireArtisan, upload.single('file'), handleImageUpload);

// ─── List Product Images (GET /products/:id/images) ──────────────────────────
router.get('/:product_id/images', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const product = await db.getProductById(req.params.product_id);

    if (user.role === 'artisan') {
      const artisan = await db.getArtisanByUserId(user.user_id);
      if (!artisan || artisan.id !== product.artisan_id) {
        throw new ForbiddenError('You can only view images of your own products');
      }
    }

    const images = await db.getProductImagesByProductId(req.params.product_id);
    res.status(200).json(success(images));
  } catch (error) {
    next(error);
  }
});

// ─── Enhance Image by ImageId (POST /products/:id/images/:imageId/enhance) ───
router.post('/:product_id/images/:image_id/enhance', requireAuth, requireArtisan, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    await verifyOwnership(req.params.product_id, user.user_id, user.role);

    const result = await imageService.imageEnhancementService.enhanceImageById(
      req.params.image_id,
      user.user_id,
      user.role
    );

    res.status(200).json(success({
      imageId: result.imageId,
      originalImageUrl: result.originalImageUrl,
      enhancedImageUrl: result.enhancedImageUrl,
      status: result.status,
      analysis: result.analysis,
      message: 'Image enhanced successfully.'
    }));
  } catch (error) {
    next(error);
  }
});

// ─── Legacy Enhance Route (POST /products/:id/enhance-image) ────────────────
router.post('/:product_id/enhance-image', requireAuth, requireArtisan, upload.single('file'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const product = await verifyOwnership(req.params.product_id, user.user_id, user.role);

    let targetImageId: string | null = null;

    if (req.file) {
      const { content, contentType, extension } = await imageService.validateAndReadImage(req.file);
      const imageId = crypto.randomUUID();
      const originalUrl = await storageService.uploadOriginalProductImage({
        artisanId: product.artisan_id,
        productId: req.params.product_id,
        imageId,
        fileContent: content,
        contentType,
        extension,
      });

      const imgRec = await db.createProductImage({
        id: imageId,
        product_id: req.params.product_id,
        artisan_id: product.artisan_id,
        original_image_url: originalUrl,
        mime_type: contentType,
        file_size: content.length,
      });
      targetImageId = imgRec.id;
    } else {
      const existingImages = await db.getProductImagesByProductId(req.params.product_id);
      if (existingImages.length > 0) {
        targetImageId = existingImages[0].id;
      } else if (product.original_image_url || product.image_url) {
        const url = product.original_image_url || product.image_url;
        const imgRec = await db.createProductImage({
          product_id: req.params.product_id,
          artisan_id: product.artisan_id,
          original_image_url: url,
          mime_type: 'image/jpeg',
        });
        targetImageId = imgRec.id;
      }
    }

    if (!targetImageId) {
      throw new BadRequestError('No image available to enhance. Upload an image first.', 'NO_IMAGE_TO_ENHANCE');
    }

    const result = await imageService.imageEnhancementService.enhanceImageById(
      targetImageId,
      user.user_id,
      user.role
    );

    const updatedProduct = await db.getProductById(req.params.product_id);

    res.status(200).json(success({
      product_id: req.params.product_id,
      imageId: result.imageId,
      original_image_url: result.originalImageUrl,
      enhanced_image_url: result.enhancedImageUrl,
      status: result.status,
      analysis: result.analysis,
      product: updatedProduct,
      message: 'Image enhanced successfully'
    }));
  } catch (error) {
    next(error);
  }
});

// ─── Select Image (POST /products/:id/images/:imageId/select) ────────────────
router.post('/:product_id/images/:image_id/select', requireAuth, requireArtisan, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    await verifyOwnership(req.params.product_id, user.user_id, user.role);

    const selection = req.body.selection === 'original' ? 'original' : 'enhanced';
    const updatedImage = await imageService.imageEnhancementService.selectImage(
      req.params.image_id,
      selection,
      user.user_id,
      user.role
    );

    const product = await db.getProductById(req.params.product_id);

    res.status(200).json(success({
      imageId: updatedImage.id,
      selectedImageUrl: updatedImage.selected_image_url,
      selection,
      product,
      message: `Selected ${selection} photo for product listing.`
    }));
  } catch (error) {
    next(error);
  }
});

// ─── Upload Voice (POST /products/:id/voice) ──────────────────────────────────
router.post('/:product_id/voice', requireAuth, requireArtisan, upload.single('file'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    await verifyOwnership(req.params.product_id, user.user_id, user.role);

    if (!req.file) {
      throw new BadRequestError('No file uploaded', 'MISSING_FILE');
    }

    const language = req.body.language;

    // Validate and read audio file
    const { content, contentType, extension } = await imageService.validateAndReadAudio(req.file);

    // Save raw audio to private storage
    const storagePath = await storageService.uploadVoiceRecording(
      req.params.product_id,
      content,
      req.file.originalname || `voice.${extension}`,
      contentType
    );

    // Transcribe audio and auto-translate any regional language speech to fluent English text
    const { transcript, rawTranscript, language: detectedLanguage } = await speechService.transcribeAudio(
      content,
      contentType,
      language
    );

    const updateData: Record<string, any> = { voice_transcript: transcript };
    if (detectedLanguage) {
      updateData.voice_language = detectedLanguage;
    }

    const updated = await db.updateProduct(req.params.product_id, updateData);

    res.status(200).json(success({
      product_id: req.params.product_id,
      transcript,
      raw_transcript: rawTranscript || transcript,
      voice_language: detectedLanguage,
      product: updated,
      message: 'Voice transcribed and converted to English successfully'
    }));
  } catch (error) {
    next(error);
  }
});


// ─── Generate Catalog (POST /products/:id/generate-catalog) ─────────────────
router.post('/:product_id/generate-catalog', requireAuth, requireArtisan, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const product = await db.getProductById(req.params.product_id);
    const nameHint = user.raw?.user_metadata?.name || user.email?.split('@')[0] || 'Artisan';
    const artisan = await db.getOrCreateArtisan(user.user_id, nameHint);

    if (user.role !== 'admin' && artisan.id !== product.artisan_id) {
      throw new OwnershipError('product');
    }

    const imageUrl = product.selected_image_url || product.primary_image_url || product.enhanced_image_url || product.image_url || product.original_image_url;
    const transcript = product.voice_transcript;

    if (!imageUrl && !transcript) {
      throw new BadRequestError(
        'Cannot generate catalog: product has no image and no voice transcript. Upload at least one before generating.',
        'INSUFFICIENT_PRODUCT_DATA'
      );
    }

    const artisanContext = {
      craft_type: artisan.craft_type,
      region: artisan.state,
      district: artisan.district,
    };

    // Check if we have visual analysis stored in product_images
    let visualAnalysis: any = null;
    const images = await db.getProductImagesByProductId(req.params.product_id);
    if (images.length > 0 && images[0].analysis_result) {
      visualAnalysis = images[0].analysis_result;
    }

    // Run catalog generation with Qwen / Gemini 2.5 Flash
    const catalog = await llmService.generateCatalog(imageUrl, transcript, artisanContext, visualAnalysis);

    // Save results to product
    const updatePayload = {
      name: catalog.product_name,
      category: catalog.category,
      material: catalog.material,
      craft_type: catalog.craft_type,
      region: catalog.region,
      description_en: catalog.description_en,
      description_hi: catalog.description_hi,
      keywords: catalog.keywords,
      ai_generated: true,
      ai_confidence: catalog.confidence,
      status: 'review',
    };

    const updatedProduct = await db.updateProduct(req.params.product_id, updatePayload);

    // Save English and Hindi default translations
    await db.saveProductTranslation(req.params.product_id, 'en', {
      title: catalog.product_name,
      short_description: catalog.description_en.substring(0, 150),
      description: catalog.description_en,
      keywords: catalog.keywords,
    });

    if (catalog.description_hi) {
      await db.saveProductTranslation(req.params.product_id, 'hi', {
        title: catalog.product_name,
        short_description: catalog.description_hi.substring(0, 150),
        description: catalog.description_hi,
        keywords: catalog.keywords,
      });
    }

    res.status(200).json(success({
      product_id: req.params.product_id,
      catalog,
      status: 'review',
      product: updatedProduct,
      message: 'Catalog generated successfully. Please review the details and publish.'
    }));
  } catch (error) {
    next(error);
  }
});

// ─── Multilingual Translation (POST /products/:id/translate) ────────────────
router.post('/:product_id/translate', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const product = await db.getProductById(req.params.product_id);
    const { translateText } = await import('../services/translation');
    const targetLanguages: { code: string; name: string }[] = [
      { code: 'hi', name: 'Hindi' },
      { code: 'ta', name: 'Tamil' },
      { code: 'te', name: 'Telugu' },
      { code: 'bn', name: 'Bengali' },
      { code: 'mr', name: 'Marathi' },
    ];

    const sourceText = product.description_en || product.name || '';
    const translatedResults: Record<string, any> = {};

    for (const lang of targetLanguages) {
      try {
        const translatedDesc = await translateText(sourceText, 'en-IN', `${lang.code}-IN`);
        const translatedTitle = await translateText(product.name, 'en-IN', `${lang.code}-IN`);
        
        await db.saveProductTranslation(req.params.product_id, lang.code, {
          title: translatedTitle,
          description: translatedDesc,
          short_description: translatedDesc.substring(0, 150),
          keywords: product.keywords,
        });

        translatedResults[lang.code] = {
          title: translatedTitle,
          description: translatedDesc,
        };
      } catch (tErr) {
        console.warn(`Translation to ${lang.code} failed:`, tErr);
      }
    }

    res.status(200).json(success({
      product_id: req.params.product_id,
      translations: translatedResults,
      message: 'Multilingual catalog translations generated and saved successfully.'
    }));
  } catch (error) {
    next(error);
  }
});

// ─── Get Stored Translations (GET /products/:id/translations) ───────────────
router.get('/:product_id/translations', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const translations = await db.getProductTranslations(req.params.product_id);
    res.status(200).json(success(translations));
  } catch (error) {
    next(error);
  }
});

// ─── Marketplace Export (GET /products/:id/export/:marketplace) ─────────────
router.get('/:product_id/export/:marketplace', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const product = await db.getProductById(req.params.product_id);

    if (user.role === 'artisan') {
      const artisan = await db.getArtisanByUserId(user.user_id);
      if (!artisan || artisan.id !== product.artisan_id) {
        throw new ForbiddenError('You can only export your own products');
      }
    }

    const marketplace = req.params.marketplace.toLowerCase() as 'amazon' | 'flipkart' | 'gem';
    const { MarketplaceExportService } = await import('../services/marketplace');
    const exportPayload = MarketplaceExportService.exportProduct(product, marketplace);

    res.status(200).json(success(exportPayload));
  } catch (error) {
    next(error);
  }
});

// ─── Update Catalog (PUT /products/:id/catalog) ──────────────────────────────
router.put('/:product_id/catalog', requireAuth, requireArtisan, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    await verifyOwnership(req.params.product_id, user.user_id, user.role);

    const updateData = req.body;
    if (!updateData || Object.keys(updateData).length === 0) {
      const product = await db.getProductById(req.params.product_id);
      return res.status(200).json(success(product));
    }

    const fieldMapping: Record<string, string> = {
      product_name: 'name',
      description_en: 'description_en',
      description_hi: 'description_hi',
      category: 'category',
      material: 'material',
      craft_type: 'craft_type',
      region: 'region',
      keywords: 'keywords',
      image_url: 'image_url',
      primary_image_url: 'primary_image_url',
      selected_image_url: 'selected_image_url',
    };

    const dbUpdate: Record<string, any> = {};
    for (const [k, v] of Object.entries(updateData)) {
      const dbKey = fieldMapping[k] || k;
      dbUpdate[dbKey] = v;
    }

    const updated = await db.updateProduct(req.params.product_id, dbUpdate);
    res.status(200).json(success(updated));
  } catch (error) {
    next(error);
  }
});

// ─── Get Product Price Recommendation (GET /products/:id/price) ──────────────
router.get('/:product_id/price', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const product = await db.getProductById(req.params.product_id);

    if (user.role === 'artisan') {
      const artisan = await db.getArtisanByUserId(user.user_id);
      if (!artisan || artisan.id !== product.artisan_id) {
        throw new ForbiddenError('You can only price your own products');
      }
    }

    const material_cost = parseFloat(req.query.material_cost as string || '0');
    const labor_cost = parseFloat(req.query.labor_cost as string || '0');
    const production_cost = parseFloat(req.query.production_cost as string || '0');
    const market_price_low = req.query.market_price_low ? parseFloat(req.query.market_price_low as string) : product.minimum_price;
    const market_price_high = req.query.market_price_high ? parseFloat(req.query.market_price_high as string) : product.maximum_price;
    const demand_score = req.query.demand_score ? parseFloat(req.query.demand_score as string) : null;

    const result = pricingService.calculatePrice({
      material_cost,
      labor_cost,
      production_cost,
      market_price_low,
      market_price_high,
      demand_score,
      region: product.region,
      category: product.category,
    });

    res.status(200).json(success({
      product_id: req.params.product_id,
      product_name: product.name,
      pricing: result,
    }));
  } catch (error) {
    next(error);
  }
});

// ─── Publish Product (POST /products/:id/publish) ─────────────────────────────
router.post('/:product_id/publish', requireAuth, requireArtisan, requireVerifiedProfile, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    await verifyOwnership(req.params.product_id, user.user_id, user.role);

    const product = await db.getProductById(req.params.product_id);

    // Validate required fields
    if (!product.image_url && !product.original_image_url && !product.enhanced_image_url && !product.primary_image_url) {
      throw new BadRequestError('Cannot publish product: photo is missing.', 'MISSING_PHOTO');
    }
    if (!product.name || product.name === 'Untitled Craft Draft') {
      throw new BadRequestError('Cannot publish product: catalog name is missing or incomplete.', 'MISSING_CATALOG_NAME');
    }
    if (!product.price || parseFloat(product.price.toString()) <= 0) {
      throw new BadRequestError('Cannot publish product: price is missing or invalid.', 'MISSING_PRICE');
    }

    const updated = await db.updateProduct(req.params.product_id, {
      status: 'published'
    });

    res.status(200).json(success({
      product_id: req.params.product_id,
      status: 'published',
      product: updated,
      message: 'Your product is now live on Artisera.'
    }));
  } catch (error) {
    next(error);
  }
});

export default router;

