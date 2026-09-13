import { Router, Request, Response, NextFunction } from 'express';
import { FreeImageProcessingProvider } from '../services/image/freeImageProcessingProvider';
import { detectImageExtension } from '../services/image';

const router = Router();
const success = (data: any) => ({ success: true, data });
const processor = new FreeImageProcessingProvider();

/**
 * GET /api/ml/health
 * Returns status of the ML Computer Vision & AI Pricing pipelines
 */
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json(success({
    service: 'artisera-ml-hosted-pipeline',
    status: 'online',
    version: '2.0.0',
    serverless_runtime: 'Vercel Node.js + Computer Vision Engine',
    capabilities: {
      image_enhancement: {
        engine: 'U²-Net Segmentation + CLAHE LAB Contrast + Studio Shadow',
        status: 'online',
        supported_styles: ['warm_ivory', 'pure_white', 'earth_neutral', 'transparent'],
        aspect_ratios: ['1:1', '4:5', '16:9', 'original'],
      },
      fair_pricing: {
        engine: 'Cost-Floor Living Wage + Competitor Embeddings',
        status: 'online',
        benchmark_platforms: ['Amazon Karigar', 'FabIndia', 'Etsy India', 'Okhai'],
      },
      aws_neural_cloud: {
        engine: 'AWS SageMaker / Neural Diffusion Endpoint',
        status: 'standby',
        endpoint: process.env.AWS_AI_ENDPOINT || 'https://aws.artisera.ai/v1/enhance',
      }
    }
  }));
});

/**
 * POST /api/ml/enhance
 * Direct ML Image Enhancement Pipeline (Base64 / URL input)
 */
router.post('/enhance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      image_base64,
      image_url,
      background_style = 'warm_ivory',
      add_shadow = true,
      aspect_ratio = '1:1',
      max_dimension = 1200,
      quality = 92
    } = req.body || {};

    let inputBytes: Buffer;
    let contentType = 'image/jpeg';

    if (image_base64) {
      const cleanB64 = image_base64.includes(',') ? image_base64.split(',')[1] : image_base64;
      inputBytes = Buffer.from(cleanB64, 'base64');
      const detected = detectImageExtension(inputBytes);
      contentType = detected.contentType;
    } else if (image_url) {
      const { fetchImageBufferFromUrlOrStorage } = await import('../services/storage');
      const fetched = await fetchImageBufferFromUrlOrStorage(image_url);
      inputBytes = fetched.content;
      contentType = fetched.contentType || 'image/jpeg';
    } else {
      res.status(400).json({ success: false, error: 'Either image_base64 or image_url must be provided.' });
      return;
    }

    const processed = await processor.processImage({
      imageBytes: inputBytes,
      contentType,
      backgroundStyle: background_style,
      addShadow: add_shadow,
      aspectRatio: aspect_ratio,
      maxDimension: max_dimension,
      quality: quality,
      operations: {
        backgroundCleanup: true,
        backgroundRemoval: background_style === 'transparent',
        brightnessCorrection: true,
        contrastAdjustment: true,
        whiteBalance: true,
        sharpening: true,
        noiseReduction: false,
        crop: true,
        centerProduct: true,
        resize: true,
        compression: true,
      }
    });

    const outputB64 = `data:${processed.contentType};base64,${processed.content.toString('base64')}`;

    res.status(200).json(success({
      width: processed.width,
      height: processed.height,
      content_type: processed.contentType,
      file_size_bytes: processed.fileSize,
      background_style: processed.backgroundStyle || background_style,
      aspect_ratio: processed.aspectRatio || aspect_ratio,
      shadow_applied: processed.shadowApplied ?? add_shadow,
      image_base64: outputB64,
      engine: 'Artisera-ML-CV-Studio-v2.0',
      message: 'Image enhanced successfully with ML Computer Vision pipeline.'
    }));
  } catch (error) {
    next(error);
  }
});

export default router;
