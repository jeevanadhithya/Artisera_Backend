import { GeminiAnalysisProvider } from './geminiAnalysisProvider';
import { FreeImageProcessingProvider } from './freeImageProcessingProvider';
import { GeminiImageAnalysis, EnhancementResult } from './types';
import * as storageService from '../storage';
import * as db from '../db';
import { BadRequestError, NotFoundError, StorageError, ValidationError } from '../../types/errors';

export class ImageEnhancementService {
  private analysisProvider: GeminiAnalysisProvider;
  private processingProvider: FreeImageProcessingProvider;

  constructor(
    analysisProvider = new GeminiAnalysisProvider(),
    processingProvider = new FreeImageProcessingProvider()
  ) {
    this.analysisProvider = analysisProvider;
    this.processingProvider = processingProvider;
  }

  /**
   * Enhances an existing product image record by ID
   */
  public async enhanceImageById(imageId: string, userId: string, userRole: string): Promise<EnhancementResult> {
    const imageRecord = await db.getProductImageById(imageId);
    if (!imageRecord) {
      throw new NotFoundError('Product image record', imageId);
    }

    // Verify ownership
    if (userRole !== 'admin') {
      const artisan = await db.getArtisanByUserId(userId);
      if (!artisan || artisan.id !== imageRecord.artisan_id) {
        throw new BadRequestError('You do not have permission to enhance this image.', 'FORBIDDEN_OWNERSHIP');
      }
    }

    // Update status to analyzing
    await db.updateProductImage(imageId, {
      processing_status: 'analyzing',
      analysis_status: 'analyzing',
    });

    let originalBytes: Buffer;
    let originalContentType: string;

    try {
      const fetched = await storageService.fetchImageBufferFromUrlOrStorage(imageRecord.original_image_url);
      originalBytes = fetched.content;
      originalContentType = fetched.contentType || imageRecord.mime_type || 'image/jpeg';
    } catch (downloadErr: any) {
      await db.updateProductImage(imageId, {
        processing_status: 'failed',
        analysis_status: 'failed',
      });
      throw new StorageError(`Failed to retrieve original image: ${downloadErr?.message || downloadErr}`);
    }

    // 1. Run Gemini 2.5 Flash Visual Intelligence Analysis
    let analysis: GeminiImageAnalysis;
    try {
      analysis = await this.analysisProvider.analyzeImage(originalBytes, originalContentType);
      await db.updateProductImage(imageId, {
        analysis_result: analysis,
        analysis_status: 'completed',
        processing_status: 'enhancing',
      });
    } catch (analysisErr) {
      console.warn('Gemini 2.5 Flash analysis error, continuing with fallback settings:', analysisErr);
      analysis = {
        product: { type: 'Artisan Product', category: 'Handicraft', craftType: 'Craft', material: 'Natural', colors: [] },
        imageQuality: { background: 'Neutral', lighting: 'Even', exposure: 'Normal', sharpness: 'Standard', composition: 'Centered' },
        enhancement: {
          backgroundCleanup: true,
          backgroundRemoval: false,
          brightnessCorrection: true,
          contrastAdjustment: true,
          whiteBalance: true,
          sharpening: true,
          noiseReduction: false,
          crop: true,
          centerProduct: true,
          resize: true,
        },
      };
    }

    // 2. Perform Pixel Processing with Free Provider (Sharp)
    let processedResult;
    try {
      processedResult = await this.processingProvider.processImage({
        imageBytes: originalBytes,
        contentType: originalContentType,
        operations: analysis.enhancement,
      });
    } catch (procErr: any) {
      console.error(`Enhancement pixel transformation failed for image ${imageId}:`, procErr);
      await db.updateProductImage(imageId, {
        processing_status: 'failed',
      });
      throw new Error(`Image enhancement failed: ${procErr?.message || procErr}`);
    }

    // 3. Strict Validation of Enhanced Output
    const validation = await this.processingProvider.validateImage(processedResult.content);
    if (!validation.valid || processedResult.content.length === 0) {
      await db.updateProductImage(imageId, {
        processing_status: 'failed',
      });
      throw new ValidationError(`Enhanced image failed quality validation: ${validation.error}`);
    }

    // 4. Upload Enhanced Image to Supabase Storage: products/{artisanId}/{productId}/enhanced/{imageId}.jpg
    let enhancedUrl: string;
    try {
      enhancedUrl = await storageService.uploadEnhancedProductImage({
        artisanId: imageRecord.artisan_id,
        productId: imageRecord.product_id,
        imageId: imageRecord.id,
        fileContent: processedResult.content,
        contentType: processedResult.contentType,
        extension: processedResult.extension,
      });
    } catch (uploadErr: any) {
      await db.updateProductImage(imageId, {
        processing_status: 'failed',
      });
      throw new StorageError(`Failed to save enhanced image to storage: ${uploadErr?.message || uploadErr}`);
    }

    // Safeguard: Never allow enhanced_image_url to equal original_image_url
    if (enhancedUrl === imageRecord.original_image_url) {
      await db.updateProductImage(imageId, {
        processing_status: 'failed',
      });
      throw new Error('Enhanced image storage resulted in collision with original image URL.');
    }

    // 5. Update Database Record
    const updatedRecord = await db.updateProductImage(imageId, {
      enhanced_image_url: enhancedUrl,
      processing_status: 'completed',
      analysis_status: 'completed',
      file_size: processedResult.fileSize,
      mime_type: processedResult.contentType,
    });

    // Also update product's enhanced_image_url
    await db.updateProduct(imageRecord.product_id, {
      enhanced_image_url: enhancedUrl,
    });

    return {
      imageId: imageRecord.id,
      originalImageUrl: imageRecord.original_image_url,
      enhancedImageUrl: enhancedUrl,
      selectedImageUrl: updatedRecord.selected_image_url,
      status: 'completed',
      analysis,
      mimeType: processedResult.contentType,
      fileSize: processedResult.fileSize,
    };
  }

  /**
   * Sets the user's selected image choice ('enhanced' | 'original')
   */
  public async selectImage(imageId: string, selection: 'enhanced' | 'original', userId: string, userRole: string): Promise<any> {
    const imageRecord = await db.getProductImageById(imageId);
    if (!imageRecord) {
      throw new NotFoundError('Product image record', imageId);
    }

    if (userRole !== 'admin') {
      const artisan = await db.getArtisanByUserId(userId);
      if (!artisan || artisan.id !== imageRecord.artisan_id) {
        throw new BadRequestError('You do not have permission to update this image.', 'FORBIDDEN_OWNERSHIP');
      }
    }

    const selectedUrl = selection === 'enhanced' && imageRecord.enhanced_image_url
      ? imageRecord.enhanced_image_url
      : imageRecord.original_image_url;

    // Update product_images table
    const updatedImage = await db.updateProductImage(imageId, {
      selected_image_url: selectedUrl,
    });

    // Update products table: primary_image_url, selected_image_url, and image_url
    await db.updateProduct(imageRecord.product_id, {
      primary_image_url: selectedUrl,
      selected_image_url: selectedUrl,
      image_url: selectedUrl,
    });

    return updatedImage;
  }
}

export const imageEnhancementService = new ImageEnhancementService();
