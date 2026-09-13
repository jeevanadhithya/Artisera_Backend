import { Router, Request, Response } from 'express';
import multer from 'multer';
import { enhanceProductImage } from '../ai/image/enhancer';
import { PricingEngine } from '../ai/pricing/pricingEngine';
import { scoreProductListing } from '../ai/intelligence/productScore';
import { compareProductToMarket } from '../ai/intelligence/comparison';
import { getMarketTrends } from '../ai/intelligence/trends';
import { getMarketOpportunities } from '../ai/intelligence/opportunities';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
});

export const aiRouter = Router();

/**
 * GET /api/ai/health
 */
aiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Artisera Unified AI Engine',
    runtime: 'Node.js / TypeScript Serverless',
    capabilities: [
      'image_enhancement_clahe_canvas',
      'fair_trade_living_wage_pricing',
      'market_benchmarks_embeddings',
      'product_readiness_scoring',
      'market_comparison',
      'trend_forecasting',
      'wholesale_opportunity_match',
    ],
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/ai/image/enhance
 * Accepts multipart/form-data with 'image' file or JSON with base64/URL.
 */
aiRouter.post('/image/enhance', upload.single('image'), async (req: Request, res: Response) => {
  try {
    let inputBuffer: Buffer | null = null;

    if (req.file) {
      inputBuffer = req.file.buffer;
    } else if (req.body.image_base64) {
      const cleanBase64 = req.body.image_base64.replace(/^data:image\/\w+;base64,/, '');
      inputBuffer = Buffer.from(cleanBase64, 'base64');
    }

    if (!inputBuffer) {
      return res.status(400).json({
        success: false,
        error: 'No image provided. Upload a file field named "image" or provide "image_base64".',
      });
    }

    const options = {
      lightingEnabled: req.body.lighting_enabled !== 'false' && req.body.lighting_enabled !== false,
      sharpenEnabled: req.body.sharpen !== 'false' && req.body.sharpen !== false,
      outputFormat: (req.body.format || 'jpeg') as 'jpeg' | 'png' | 'webp',
      quality: req.body.quality ? parseInt(req.body.quality, 10) : 92,
      cropPadding: req.body.crop_padding ? parseFloat(req.body.crop_padding) : 0.08,
    };

    const result = await enhanceProductImage(inputBuffer, undefined, options);

    if (!result.success || !result.buffer) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Enhancement failed',
      });
    }

    const base64Data = result.buffer.toString('base64');
    const mimeType = result.format === 'png' ? 'image/png' : result.format === 'webp' ? 'image/webp' : 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    res.json({
      success: true,
      data_url: dataUrl,
      width: result.width,
      height: result.height,
      format: result.format,
      file_size_kb: Math.round(result.fileSize / 1024),
      processing_status: result.processingStatus,
      processing_metadata: result.processingMetadata,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Internal AI image enhancement error',
    });
  }
});

/**
 * POST /api/ai/pricing
 * Calculate fair living wage price suggestion & market comparables.
 */
aiRouter.post('/pricing', (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      category,
      material,
      region,
      craftComplexity,
      isGiTagged,
      costInputs,
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Field "title" is required for pricing evaluation',
      });
    }

    const recommendation = PricingEngine.calculatePrice({
      title,
      description,
      category,
      material,
      region,
      craftComplexity,
      isGiTagged: Boolean(isGiTagged),
      costInputs,
    });

    res.json({
      success: true,
      data: recommendation,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Pricing evaluation failed',
    });
  }
});

/**
 * POST /api/ai/product-score
 * Evaluates listing completeness, storytelling, and market readiness.
 */
aiRouter.post('/product-score', (req: Request, res: Response) => {
  try {
    const score = scoreProductListing(req.body);
    res.json({
      success: true,
      data: score,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai/comparison
 * Compare product pricing against live benchmark competitor listings.
 */
aiRouter.post('/comparison', (req: Request, res: Response) => {
  try {
    const { title, category, price, description, material } = req.body;
    if (!title || price === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Fields "title" and "price" are required for comparison',
      });
    }

    const comparison = compareProductToMarket({
      title,
      category,
      price: Number(price),
      description,
      material,
    });

    res.json({
      success: true,
      data: comparison,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai/trends (or GET)
 */
aiRouter.all('/trends', (req: Request, res: Response) => {
  const category = req.query.category || req.body?.category;
  const trends = getMarketTrends(typeof category === 'string' ? category : undefined);
  res.json({
    success: true,
    data: trends,
  });
});

/**
 * POST /api/ai/opportunities (or GET)
 */
aiRouter.all('/opportunities', (req: Request, res: Response) => {
  const category = req.query.category || req.body?.category;
  const leads = getMarketOpportunities(typeof category === 'string' ? category : undefined);
  res.json({
    success: true,
    data: leads,
  });
});
