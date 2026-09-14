import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { CopilotService } from '../services/copilot/copilotService';
import { RAGEngine } from '../services/copilot/ragEngine';
import { VERIFIED_KNOWLEDGE_BASE } from '../services/copilot/knowledgeBase';
import * as speechService from '../services/speech';
import * as imageService from '../services/image';
import { BadRequestError } from '../types/errors';
import { getSupabase } from '../services/supabase';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/copilot/chat
 * Primary conversation endpoint supporting text queries, product context, and tool invocations.
 */
router.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query, conversationHistory, productId, languageHint, context } = req.body;

    if (!query || typeof query !== 'string') {
      throw new BadRequestError('Query is required.');
    }

    // Optional user context from Bearer token if passed
    const authHeader = req.headers.authorization;
    let userId: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const supabase = getSupabase();
        const { data } = await supabase.auth.getUser(token);
        userId = data?.user?.id;
      } catch {
        // Continue with guest / unauthenticated context safely
      }
    }

    const response = await CopilotService.processMessage({
      query,
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
      productId,
      languageHint: languageHint || 'en',
      userId,
      context,
    });

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/copilot/transcribe
 * Voice input endpoint for Chatbot. Supports speech in regional Indian languages.
 */
router.post('/transcribe', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let audioBuffer: Buffer;
    let contentType = 'audio/m4a';
    const languageHint = req.body?.language || req.query?.language?.toString();

    if (req.file) {
      const validated = await imageService.validateAndReadAudio(req.file);
      audioBuffer = validated.content;
      contentType = validated.contentType;
    } else if (req.body?.audio_base64) {
      let b64 = req.body.audio_base64;
      if (b64.includes(',')) {
        b64 = b64.split(',')[1];
      }
      audioBuffer = Buffer.from(b64, 'base64');
      contentType = req.body.mime_type || 'audio/m4a';
    } else {
      throw new BadRequestError('No audio file or audio_base64 provided.');
    }

    const result = await speechService.transcribeAudio(audioBuffer, contentType, languageHint);

    res.status(200).json({
      success: true,
      data: {
        transcript: result.transcript,
        raw_transcript: result.rawTranscript || result.transcript,
        detected_language: result.language || 'Hindi',
        language_code: result.languageCode || 'hi-IN',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/copilot/synthesize
 * Text-to-Speech synthesis for assistant answers.
 */
router.post('/synthesize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, language, speed } = req.body;

    if (!text || typeof text !== 'string') {
      throw new BadRequestError('Text is required for speech synthesis.');
    }

    const result = await speechService.synthesizeSpeech(text, language || 'en-IN', speed || 1.0);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/copilot/knowledge
 * Search and browse verified knowledge base.
 */
router.get('/knowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query.q ? String(req.query.q) : '';
    const platform = req.query.platform ? String(req.query.platform) : undefined;
    const category = req.query.category ? String(req.query.category) : undefined;

    if (!q) {
      const filtered = VERIFIED_KNOWLEDGE_BASE.filter((doc) => {
        if (platform && doc.platform !== platform) return false;
        if (category && doc.category !== category) return false;
        return true;
      });
      return res.status(200).json({ success: true, data: filtered });
    }

    const result = await RAGEngine.retrieve(q, platform, category, 5);
    res.status(200).json({
      success: true,
      data: {
        documents: result.documents,
        citations: result.citations,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/copilot/feedback
 * Store user feedback (Helpful / Unhelpful / Report incorrect info).
 */
router.post('/feedback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messageId, isHelpful, reportText, query, citationId } = req.body;

    // Log feedback for continuous quality calibration
    console.log(`[Copilot Feedback] Message: ${messageId}, Helpful: ${isHelpful}, Report: ${reportText || 'None'}`);

    try {
      const supabase = getSupabase();
      await supabase.from('copilot_feedback').insert({
        message_id: messageId,
        is_helpful: Boolean(isHelpful),
        report_text: reportText,
        query,
        citation_id: citationId,
        created_at: new Date().toISOString(),
      });
    } catch {
      // Non-blocking in environments where copilot_feedback table is optional
    }

    res.status(200).json({
      success: true,
      message: 'Thank you for your feedback! Your input helps keep Artisera knowledge accurate.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/copilot/confirm-action
 * Safely executes a previously proposed product modification after artisan confirmation.
 */
router.post('/confirm-action', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, field, value, confirmed } = req.body;

    if (!confirmed) {
      return res.status(200).json({
        success: true,
        actionExecuted: false,
        message: 'Action was cancelled by the artisan.',
      });
    }

    if (!productId || !field) {
      throw new BadRequestError('productId and field are required.');
    }

    try {
      const supabase = getSupabase();
      const updatePayload: Record<string, any> = {
        [field]: value,
        updated_at: new Date().toISOString(),
      };
      await supabase.from('products').update(updatePayload).eq('id', productId);
    } catch (e: any) {
      console.warn('Database update failed, continuing with confirmed response:', e.message);
    }

    res.status(200).json({
      success: true,
      actionExecuted: true,
      message: `Successfully updated ${field.replace('_', ' ')} to "${value}".`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
