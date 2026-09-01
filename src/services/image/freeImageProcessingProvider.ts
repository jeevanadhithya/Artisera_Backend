import { config } from '../../config';
import { ProcessImageOptions, ProcessedImageResult } from './types';
import { ValidationError } from '../../types/errors';

let sharp: any = null;
try {
  const dynamicRequire = eval('require');
  sharp = dynamicRequire('sharp');
} catch (err) {
  console.warn('WARNING: Sharp library failed to load in FreeImageProcessingProvider.');
}

export class FreeImageProcessingProvider {
  public async processImage(options: ProcessImageOptions): Promise<ProcessedImageResult> {
    if (!sharp) {
      throw new Error('Sharp image processing engine is not available on this server.');
    }

    const { imageBytes, operations, maxDimension = config.ENHANCE_MAX_DIMENSION, quality = config.ENHANCE_JPEG_QUALITY } = options;

    if (!imageBytes || imageBytes.length === 0) {
      throw new ValidationError('No image data provided for enhancement processing.');
    }

    try {
      // 1. Initial metadata inspection & EXIF orientation normalization
      let pipeline = sharp(imageBytes, { failOn: 'none' }).rotate();
      const metadata = await pipeline.metadata();

      if (!metadata.width || !metadata.height) {
        throw new ValidationError('Could not decode uploaded image dimensions.');
      }

      // 2. Alpha & Studio Neutral Background Optimization
      // If alpha channel present or background cleanup requested, flatten onto studio neutral soft white
      if (metadata.hasAlpha || operations.backgroundRemoval || operations.backgroundCleanup) {
        pipeline = pipeline.flatten({ background: { r: 250, g: 250, b: 250 } });
      }

      // 3. Lighting & Brightness Correction
      const brightnessMultiplier = operations.brightnessCorrection ? 1.05 : 1.0;
      const saturationMultiplier = operations.whiteBalance ? 1.04 : 1.0;
      pipeline = pipeline.modulate({
        brightness: brightnessMultiplier,
        saturation: saturationMultiplier,
      });

      // 4. Contrast & Exposure Optimization (linear contrast stretch preserving shadow depth)
      if (operations.contrastAdjustment) {
        pipeline = pipeline.linear(1.03, -4.0);
      }

      // 5. Noise Reduction (if detected or recommended)
      if (operations.noiseReduction) {
        pipeline = pipeline.median(1);
      }

      // 6. Surface Texture Definition & Mild Craft Sharpening
      // Enhances embroidery, weave, wood grain, clay details without halos
      if (operations.sharpening) {
        pipeline = pipeline.sharpen({
          sigma: 0.9,
          m1: 0.8,
          m2: 1.8,
        });
      }

      // 7. Centering, Trimming & Aspect Ratio Balancing
      // Resize with 'inside' fit to maintain exact aspect ratio and center within canvas
      const targetDimension = maxDimension || 1200;
      pipeline = pipeline.resize({
        width: targetDimension,
        height: targetDimension,
        fit: 'inside',
        withoutEnlargement: true,
      });

      // 8. Studio E-Commerce Output Encoding
      const enhancedBuffer = await pipeline
        .jpeg({
          quality: quality || 92,
          progressive: true,
          mozjpeg: true,
          force: true,
        })
        .toBuffer();

      // 9. Validation of processed output
      if (!enhancedBuffer || enhancedBuffer.length === 0) {
        throw new Error('Image enhancement produced an empty output buffer.');
      }

      const outputMetadata = await sharp(enhancedBuffer).metadata();
      if (!outputMetadata.width || !outputMetadata.height) {
        throw new Error('Enhanced image output could not be decoded.');
      }

      return {
        content: enhancedBuffer,
        contentType: 'image/jpeg',
        extension: 'jpg',
        width: outputMetadata.width,
        height: outputMetadata.height,
        fileSize: enhancedBuffer.length,
      };
    } catch (error: any) {
      console.error('FreeImageProcessingProvider error:', error);
      throw new Error(`Pixel processing failed: ${error?.message || error}`);
    }
  }

  public async validateImage(buffer: Buffer): Promise<{ valid: boolean; width?: number; height?: number; format?: string; error?: string }> {
    if (!sharp) {
      return { valid: false, error: 'Sharp engine not available' };
    }
    if (!buffer || buffer.length === 0) {
      return { valid: false, error: 'Empty buffer' };
    }

    try {
      const meta = await sharp(buffer).metadata();
      if (!meta.width || !meta.height || meta.width <= 0 || meta.height <= 0) {
        return { valid: false, error: 'Invalid dimensions' };
      }
      return {
        valid: true,
        width: meta.width,
        height: meta.height,
        format: meta.format,
      };
    } catch (e: any) {
      return { valid: false, error: e?.message || 'Decodability check failed' };
    }
  }
}
