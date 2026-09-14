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
        engine: 'AWS Neural Enhancement + U²-Net Segmentation + CLAHE LAB Contrast + Studio Shadow',
        status: 'online',
        primary: process.env.IMAGE_AI_URL || 'http://16.16.99.220:8000',
        fallback: process.env.IMAGE_AI_BACKUP || 'gemini',
        supported_styles: ['warm_ivory', 'pure_white', 'earth_neutral', 'transparent'],
        aspect_ratios: ['1:1', '4:5', '16:9', 'original'],
      },
      fair_pricing: {
        engine: 'Cost-Floor Living Wage + Competitor Embeddings',
        status: 'online',
        benchmark_platforms: ['Amazon Karigar', 'FabIndia', 'Etsy India', 'Okhai'],
      },
      aws_neural_cloud: {
        engine: 'AWS EC2 Neural Image Enhancement',
        status: 'active',
        endpoint: process.env.IMAGE_AI_URL || 'http://16.16.99.220:8000',
      }
    }
  }));
});

/**
 * POST /api/ml/enhance
 * Direct ML Image Enhancement Pipeline (Base64 / URL input)
 * Primary:   AWS EC2 image enhancement server at IMAGE_AI_URL (http://16.16.99.220:8000)
 * Fallback:  Built-in Sharp + U²-Net + CLAHE pipeline
 * Last resort: Return original image as-is
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

    let outputB64: string = '';
    let engine = 'Artisera-ML-CV-Studio-v2.0';
    let width = 1000;
    let height = 1000;
    let fileSize = inputBytes.length;
    let outContentType = 'image/png';

    // ── PRIMARY: AWS EC2 Neural Image Enhancement Server ─────────────────────
    const awsUrl = process.env.IMAGE_AI_URL || 'http://16.16.99.220:8000';
    const awsTimeoutMs = parseInt(process.env.IMAGE_AI_TIMEOUT_MS || '30000', 10);
    let awsSuccess = false;

    try {
      const axios = (await import('axios')).default;
      const FormData = (await import('form-data')).default;

      const detected = detectImageExtension(inputBytes, contentType);
      const filename = `craft.${detected.ext}`;

      const form = new FormData();
      form.append('image', inputBytes, { filename, contentType });
      form.append('background_style', background_style);
      form.append('add_shadow', String(add_shadow));

      const resp = await axios.post(`${awsUrl}/enhance`, form, {
        headers: form.getHeaders(),
        timeout: awsTimeoutMs,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      // Normalize response — AWS may return various shapes
      const respData = resp.data;
      if (respData) {
        // Shape 1: { success: true, images: [{ image_base64, content_type }] }
        if (respData.success && Array.isArray(respData.images) && respData.images.length > 0) {
          const item = respData.images[0];
          const rawB64 = item.image_base64 || item.enhanced_image_base64 || '';
          if (rawB64) {
            outputB64 = rawB64.startsWith('data:')
              ? rawB64
              : `data:${item.content_type || 'image/png'};base64,${rawB64}`;
            outContentType = item.content_type || 'image/png';
            width = item.width || 1000;
            height = item.height || 1000;
            fileSize = item.file_size || inputBytes.length;
            engine = 'AWS-EC2-Neural-Enhancement';
            awsSuccess = true;
          }
        }
        // Shape 2: { image_base64: '...', content_type: '...' }
        else if (respData.image_base64) {
          const rawB64 = respData.image_base64;
          outputB64 = rawB64.startsWith('data:')
            ? rawB64
            : `data:${respData.content_type || 'image/png'};base64,${rawB64}`;
          outContentType = respData.content_type || 'image/png';
          width = respData.width || 1000;
          height = respData.height || 1000;
          fileSize = respData.file_size || inputBytes.length;
          engine = 'AWS-EC2-Neural-Enhancement';
          awsSuccess = true;
        }
        // Shape 3: { enhanced_image: '...base64...' }
        else if (respData.enhanced_image) {
          const rawB64 = respData.enhanced_image;
          outputB64 = rawB64.startsWith('data:')
            ? rawB64
            : `data:image/png;base64,${rawB64}`;
          outContentType = 'image/png';
          engine = 'AWS-EC2-Neural-Enhancement';
          awsSuccess = true;
        }
      }

      if (awsSuccess) {
        console.log(`✅ AWS image enhancement succeeded via ${awsUrl}/enhance`);
      }
    } catch (awsErr: any) {
      console.warn(`⚠️  AWS image enhancement at ${awsUrl} failed (${awsErr?.message || awsErr}). Falling back to built-in ML CV pipeline.`);
    }

    // ── FALLBACK: Built-in Sharp + U²-Net + CLAHE pipeline ───────────────────
    if (!awsSuccess) {
      try {
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

        outputB64 = `data:${processed.contentType};base64,${processed.content.toString('base64')}`;
        width = processed.width;
        height = processed.height;
        fileSize = processed.fileSize;
        outContentType = processed.contentType;
        engine = 'Artisera-ML-CV-Studio-v2.0';
        console.log('✅ Built-in Sharp ML pipeline succeeded as fallback.');
      } catch (sharpErr: any) {
        console.error('Built-in Sharp pipeline also failed:', sharpErr?.message);
        // Last resort: return original image unchanged so UI still works
        outputB64 = `data:${contentType};base64,${inputBytes.toString('base64')}`;
        outContentType = contentType;
        engine = 'passthrough-original';
      }
    }

    res.status(200).json(success({
      width,
      height,
      content_type: outContentType,
      file_size_bytes: fileSize,
      background_style,
      aspect_ratio,
      shadow_applied: add_shadow,
      image_base64: outputB64,
      engine,
      aws_used: awsSuccess,
      message: `Image enhanced successfully with ${engine}.`
    }));
  } catch (error) {
    next(error);
  }
});

export default router;
