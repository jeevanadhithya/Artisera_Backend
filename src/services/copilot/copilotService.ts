import axios from 'axios';
import { config } from '../../config';
import { RAGEngine, RAGCitation } from './ragEngine';
import { IntentRouter, CopilotIntent } from './intentRouter';
import { CopilotToolRegistry, MarketplaceValidationResult, ProfitCalculationResult } from './tools';
import { ProductScoreResult } from '../../ai/intelligence/productScore';

export interface CopilotChatRequest {
  query: string;
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
  productId?: string;
  languageHint?: string;
  userId?: string;
  context?: {
    screen?: string;
    marketplace?: string;
    pricingData?: any;
  };
}

export interface CopilotChatResponse {
  message: string;
  intent: CopilotIntent;
  detectedLanguage: string;
  citations: RAGCitation[];
  hasProductContext: boolean;
  productCard?: {
    id: string;
    title: string;
    price: number;
    imageUrl?: string;
    status: string;
  };
  scoreCard?: ProductScoreResult;
  readinessCard?: MarketplaceValidationResult;
  profitCard?: ProfitCalculationResult;
  breakEvenCard?: any;
  lessonCard?: {
    topic: string;
    title: string;
    currentStep: number;
    totalSteps: number;
    stepHeading: string;
    stepDetails: string;
    actionLabel: string;
  };
  quickActions: {
    label: string;
    action: string;
    payload?: any;
  }[];
  confirmationRequired?: {
    actionId: string;
    confirmationMessage: string;
    field: string;
    proposedValue: any;
  };
}

// ─── Lesson Content Modules ──────────────────────────────────────────────────
const LESSON_MODULES: Record<string, { title: string; steps: { heading: string; details: string; action: string }[] }> = {
  photography: {
    title: 'How to Photograph Handmade Crafts Like a Pro',
    steps: [
      {
        heading: 'Step 1: Use Soft Morning Daylight',
        details: 'Place your craft within 3 feet of an open window between 8:00 AM and 10:00 AM. Soft daylight captures natural clay, wood, or silk colors without harsh shadows or fake yellow tint.',
        action: 'Next: Choose Background →',
      },
      {
        heading: 'Step 2: Use a Clean Matte Sheet',
        details: 'Lay an unprinted light cream, light grey, or off-white sheet underneath and behind your craft. Keep the background smooth and uncluttered so your craft stands out.',
        action: 'Next: Capture 4 Key Angles →',
      },
      {
        heading: 'Step 3: Capture Front, Angle & Texture',
        details: 'Take 4 photos: (1) Eye-level front, (2) 45-degree angle showing depth, (3) Top-down view, and (4) Close-up macro showing your handmade brush strokes or carving.',
        action: 'Open AI Studio Camera →',
      },
    ],
  },
  fair_pricing: {
    title: 'How to Price Your Craft for Sustainable Profit',
    steps: [
      {
        heading: 'Step 1: Calculate Your Floor Production Cost',
        details: 'Add up Raw Materials + (Hours of Labor × Fair Wage of ₹120–₹160/hr) + Safe Packaging + Transport to pickup center. Never sell below this floor price.',
        action: 'Next: Set Retail Markup →',
      },
      {
        heading: 'Step 2: Add 35% to 50% for Retail Customers',
        details: 'Multiply your floor cost by 1.35 to 1.50 for individual online buyers. This covers platform fees, minor returns, and guarantees you a 25%+ pure profit margin.',
        action: 'Next: Understand Wholesale Rates →',
      },
      {
        heading: 'Step 3: Price Wholesale Orders at 20% Margin',
        details: 'For bulk B2B orders of 25+ pieces, offer a 15% discount off retail while maintaining at least 20% margin above your floor cost.',
        action: 'Open Fair Pricing Calculator →',
      },
    ],
  },
  packaging: {
    title: 'How to Package Fragile Crafts for Zero Breakage',
    steps: [
      {
        heading: 'Step 1: Primary Surface Cushioning',
        details: 'Wrap each piece in 2 layers of 10mm bubble wrap or honeycomb Kraft paper. Tape all corners firmly so no clay or glass surface touches anything hard.',
        action: 'Next: Box Sizing & Void Fill →',
      },
      {
        heading: 'Step 2: The 2-Inch Void Fill Rule',
        details: 'Use a strong 5-ply corrugated cardboard box. Leave 2 inches (5 cm) of space on all sides of the craft filled with crumpled paper or air cushions. Do the shake test: zero movement allowed!',
        action: 'Next: Fragile Labelling →',
      },
      {
        heading: 'Step 3: Seal with H-Taping & Affix Fragile Stickers',
        details: 'Seal along all flaps with 2-inch tape in an "H" shape. Affix bold "FRAGILE - HANDLE WITH CARE" labels on the top and both sides.',
        action: 'Complete Lesson ✓',
      },
    ],
  },
};

export class CopilotService {
  /**
   * Main Conversational Processing Pipeline
   */
  public static async processMessage(req: CopilotChatRequest): Promise<CopilotChatResponse> {
    const query = req.query.trim();

    // 1. Resolve Product Context if productId provided
    let currentProduct: any = null;
    if (req.productId) {
      currentProduct = await CopilotToolRegistry.getCurrentProduct(req.userId, req.productId);
    }

    const hasProductContext = Boolean(currentProduct);

    // 2. Intent Routing
    const classification = IntentRouter.classify(query, hasProductContext);

    // 3. RAG Knowledge Retrieval
    const ragResult = await RAGEngine.retrieve(
      query,
      classification.targetMarketplace || req.context?.marketplace,
      undefined,
      3
    );

    // 4. Execute Tools based on classification & product context
    let scoreCard: ProductScoreResult | undefined;
    let readinessCard: MarketplaceValidationResult | undefined;
    let profitCard: ProfitCalculationResult | undefined;
    let breakEvenCard: any | undefined;
    let lessonCard: any | undefined;
    const quickActions: { label: string; action: string; payload?: any }[] = [];

    if (currentProduct) {
      // If user asks about improving product or product score
      if (classification.intent === 'HYBRID' || classification.toolName === 'evaluateProductScore') {
        scoreCard = CopilotToolRegistry.evaluateProductScore(currentProduct);
        quickActions.push(
          { label: 'Improve Photo', action: 'open_ai_studio', payload: { productId: currentProduct.id } },
          { label: 'Check Pricing', action: 'open_pricing', payload: { productId: currentProduct.id } },
          { label: 'Check Amazon Readiness', action: 'check_marketplace', payload: { marketplace: 'amazon' } }
        );
      }

      // If user asks about marketplace readiness (e.g. Amazon, Flipkart, Meesho, GeM, ONDC)
      if (classification.targetMarketplace) {
        readinessCard = CopilotToolRegistry.validateMarketplaceProduct(currentProduct, classification.targetMarketplace);
        quickActions.push(
          { label: `Prepare ${readinessCard.displayName} Export`, action: 'generate_export', payload: { marketplace: classification.targetMarketplace } },
          { label: 'Open Official Seller Portal', action: 'open_url', payload: { url: readinessCard.officialPortalUrl } }
        );
      }
    }

    // Profit Tool Calculation
    if (classification.toolName === 'calculateProfit') {
      const price = classification.extractedPrice || currentProduct?.price || 650;
      profitCard = CopilotToolRegistry.calculateProfit(price, {
        rawMaterials: currentProduct?.cost_inputs?.raw_materials || 90,
        laborHours: currentProduct?.cost_inputs?.labor_hours || 3.5,
        hourlyWage: currentProduct?.cost_inputs?.hourly_wage || 130,
        packaging: currentProduct?.cost_inputs?.packaging || 40,
        transport: currentProduct?.cost_inputs?.transport || 30,
      });
      quickActions.push(
        { label: 'Calculate Another Price', action: 'prompt', payload: { text: 'How much profit will I make if I sell for ₹1100?' } },
        { label: 'Open Fair Pricing Tool', action: 'open_pricing' }
      );
    }

    // Break-even Tool Calculation
    if (classification.toolName === 'calculateBreakEven') {
      breakEvenCard = CopilotToolRegistry.calculateBreakEven(3500, currentProduct?.price || 650, 240);
      quickActions.push({ label: 'Calculate Profit Margin', action: 'prompt', payload: { text: 'How much profit will I make at ₹650?' } });
    }

    // Lesson Guide
    if (classification.intent === 'LESSON_GUIDE' && classification.lessonTopic) {
      const moduleKey = LESSON_MODULES[classification.lessonTopic] ? classification.lessonTopic : 'photography';
      const lesson = LESSON_MODULES[moduleKey];
      if (lesson) {
        lessonCard = {
          topic: moduleKey,
          title: lesson.title,
          currentStep: 1,
          totalSteps: lesson.steps.length,
          stepHeading: lesson.steps[0].heading,
          stepDetails: lesson.steps[0].details,
          actionLabel: lesson.steps[0].action,
        };
        quickActions.push(
          { label: 'Next Step →', action: 'next_lesson_step', payload: { topic: moduleKey, step: 2 } },
          { label: 'Ask a Question', action: 'prompt', payload: { text: `Can you explain ${lesson.steps[0].heading}?` } }
        );
      }
    }

    // General Fallback Quick Actions if none populated
    if (quickActions.length === 0) {
      if (currentProduct) {
        quickActions.push(
          { label: 'Check Amazon Compatibility', action: 'check_marketplace', payload: { marketplace: 'amazon' } },
          { label: 'Check Flipkart Compatibility', action: 'check_marketplace', payload: { marketplace: 'flipkart' } },
          { label: 'How to Improve This Craft', action: 'prompt', payload: { text: 'How can I improve this product?' } }
        );
      } else {
        quickActions.push(
          { label: 'How to Sell on Amazon', action: 'prompt', payload: { text: 'How do I register on Amazon Karigar?' } },
          { label: 'How to Sell on Meesho', action: 'prompt', payload: { text: 'How do I register on Meesho 0% commission?' } },
          { label: 'Calculate Fair Profit', action: 'prompt', payload: { text: 'How do I calculate fair selling price?' } }
        );
      }
    }

    // 5. Generate Mentor Response via Gemini / LLM
    const detectedLanguage = req.languageHint || 'en';
    const message = await this.generateLlmResponse(
      query,
      req.conversationHistory || [],
      ragResult.contextString,
      currentProduct,
      scoreCard,
      readinessCard,
      profitCard,
      lessonCard,
      detectedLanguage
    );

    return {
      message,
      intent: classification.intent,
      detectedLanguage,
      citations: ragResult.citations,
      hasProductContext,
      productCard: currentProduct
        ? {
            id: currentProduct.id,
            title: currentProduct.name || currentProduct.title,
            price: currentProduct.price,
            imageUrl: currentProduct.selected_image_url || currentProduct.primary_image_url || currentProduct.images?.[0],
            status: currentProduct.status || 'Draft',
          }
        : undefined,
      scoreCard,
      readinessCard,
      profitCard,
      breakEvenCard,
      lessonCard,
      quickActions: quickActions.slice(0, 4),
    };
  }

  /**
   * LLM Mentor Persona Prompting
   */
  private static async generateLlmResponse(
    query: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    verifiedContext: string,
    product: any | null,
    scoreCard?: ProductScoreResult,
    readinessCard?: MarketplaceValidationResult,
    profitCard?: ProfitCalculationResult,
    lessonCard?: any,
    languageHint: string = 'en'
  ): Promise<string> {
    const systemPrompt = `You are "Chatbot", the friendly, patient, and knowledgeable AI assistant and marketplace mentor built specifically for Indian traditional artisans on the Artisera platform.

YOUR MISSION:
- Empower rural and generational craftspersons with clear, encouraging, practical, and trustworthy answers.
- STRICT BREVITY & CLEAN FORMATTING RULES:
  1. DO NOT WRITE LONG ESSAYS OR WALLS OF TEXT. Keep your entire answer short, crisp, and under 120 words.
  2. NEVER use markdown asterisks (**) around words or headings. Write clean, natural text with simple numbers (1, 2, 3) or bullet points.
  3. Never use generic intro fluff like "might seem like a lot of steps" or "here is a general idea". Jump directly to the practical advice.
  4. For marketplace listing (Amazon Karigar, Flipkart, Meesho), give 3 short, concrete steps: (1) Account setup & GTIN exemption, (2) Photos & craft description, (3) Price with fair profit.
  5. For government schemes (PM Vishwakarma, Mudra), state the exact benefit (e.g. ₹15,000 toolkit voucher, 5% low interest loan up to ₹3 lakh) in 2-3 short bullet points.
  6. Rely strictly on the verified knowledge provided below.
  7. Answer in the same language as the artisan's question (e.g. Hindi, Tamil, English).

VERIFIED KNOWLEDGE BASE CONTEXT:
${verifiedContext || 'No verified documents found for this specific query.'}

CURRENT ARTISAN PRODUCT CONTEXT:
${
  product
    ? `Product Name: ${product.name || product.title}
Craft Type: ${product.craft_type || 'Traditional Handicraft'}
Material: ${product.material || 'Natural Clay/Wood/Fabric'}
Price: ₹${product.price}
Description: ${product.description_en || 'Artisan handcrafted craft'}
Region: ${product.region || 'India'}`
    : 'No specific product selected.'
}

${
  scoreCard
    ? `PRODUCT SCORE DATA: Overall Score ${scoreCard.overallScore}/100. Strengths: ${scoreCard.strengths.join(', ')}. Improvements Needed: ${scoreCard.improvements.join(', ')}.`
    : ''
}

${
  readinessCard
    ? `MARKETPLACE READINESS FOR ${readinessCard.displayName}: Status is ${readinessCard.status} (${readinessCard.readinessPercentage}% ready). Passed: ${readinessCard.passedChecks.join(', ')}. Missing: ${readinessCard.missingFields.map((f) => f.label).join(', ')}.`
    : ''
}

${
  profitCard
    ? `PROFIT CALCULATION: Selling Price ₹${profitCard.sellingPrice}, Floor Cost ₹${profitCard.floorCost}, Net Profit ₹${profitCard.netProfit} (${profitCard.profitMarginPct}% margin). Recommendation: ${profitCard.recommendation}.`
    : ''
}

${
  lessonCard
    ? `LESSON STEP: ${lessonCard.title} - ${lessonCard.stepHeading}: ${lessonCard.stepDetails}`
    : ''
}

Remember: Speak with warm respect. Maximum 3 short points. No markdown asterisks.`;

    // Try Gemini if API key available
    if (config.GEMINI_API_KEY) {
      try {
        const contents: any[] = [];
        contents.push({
          role: 'user',
          parts: [{ text: systemPrompt }],
        });
        contents.push({
          role: 'model',
          parts: [{ text: 'Namaste! I am your AI Chatbot assistant. I am here to help you craft, price, package, and sell your handmade work with pride.' }],
        });

        // Add history
        for (const msg of history.slice(-3)) {
          contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
          });
        }

        // Add user query
        contents.push({
          role: 'user',
          parts: [{ text: query }],
        });

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent?key=${config.GEMINI_API_KEY}`;
        const response = await axios.post(
          url,
          {
            contents,
            generationConfig: {
              temperature: 0.25,
              maxOutputTokens: 300,
            },
          },
          { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
        );

        let reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply && reply.trim()) {
          // Sanitize any remaining double asterisks and clean up
          reply = reply.replace(/\*\*/g, '').trim();
          return reply;
        }
      } catch (err: any) {
        console.warn('Gemini chat call failed, falling back to rule-based response:', err.message);
      }
    }

    // Deterministic High-Quality Fallback based on Intent & Query
    return this.generateDeterministicFallback(query, product, scoreCard, readinessCard, profitCard);
  }

  private static generateDeterministicFallback(
    query: string,
    product: any | null,
    scoreCard?: ProductScoreResult,
    readinessCard?: MarketplaceValidationResult,
    profitCard?: ProfitCalculationResult
  ): string {
    const q = query.toLowerCase();

    if (profitCard) {
      return `Namaste! Based on your craft production costs, selling at ₹${profitCard.sellingPrice} gives you a net profit of ₹${profitCard.netProfit} (${profitCard.profitMarginPct}% margin).\n\nYour Production Floor Cost is ₹${profitCard.floorCost}, which includes ₹${profitCard.breakdown.materialCost} for raw materials and ₹${profitCard.breakdown.laborCompensation} for ${profitCard.breakdown.hoursWorked} hours of skilled labor at ₹${profitCard.breakdown.hourlyWageEarned}/hr.\n\n${profitCard.recommendation}`;
    }

    if (readinessCard) {
      if (readinessCard.status === 'ready') {
        return `Great news! Your product "${product?.name || 'Craft'}" is 100% ready for ${readinessCard.displayName}. All mandatory details including high-resolution photo, artisan story, and pricing have been verified.\n\nYou can now generate your marketplace export below or open the official seller portal to submit your listing.`;
      } else {
        const missingList = readinessCard.missingFields.map((f) => `• ${f.label}: ${f.description}`).join('\n');
        return `We evaluated your product for ${readinessCard.displayName} (Readiness: ${readinessCard.readinessPercentage}%).\n\nTo make this listing marketplace-ready, please complete:\n${missingList}\n\nTap the "Fix It" button below to update these fields directly!`;
      }
    }

    if (scoreCard && product) {
      return `Your listing score for "${product.name || 'Craft'}" is ${scoreCard.overallScore}/100 (Grade: ${scoreCard.grade}).\n\nStrengths:\n${scoreCard.strengths.map((s) => `✓ ${s}`).join('\n')}\n\nPractical next steps to improve:\n${scoreCard.improvements.map((i) => `→ ${i}`).join('\n')}`;
    }

    if (q.includes('amazon')) {
      return `To sell on Amazon Karigar as an authentic artisan:\n1. Eligibility: You need an official Pehchan Artisan ID Card (Ministry of Textiles) or Tribal/State Handicrafts certificate.\n2. GTIN Exemption: Handmade crafts do not need commercial barcodes. Apply for barcode exemption in Seller Central under your craft brand.\n3. Photos: Provide at least one photo on a pure white background (1000×1000 pixels).\n\nArtisera can generate an Amazon-ready CSV export of your product with one tap!`;
    }

    if (q.includes('meesho')) {
      return `Selling on Meesho offers a key advantage: 0% Commission on product sales.\n1. Registration: Visit supplier.meesho.com with your GSTIN (or Enrolment ID where applicable), PAN, and bank account.\n2. Bundling Tip: Meesho buyers appreciate great value. Bundling sets of 2 or 4 items helps absorb packaging and courier expenses.\n3. Orders: Meesho has no penalty for order cancellations if raw material shortages occur.`;
    }

    if (q.includes('ondc')) {
      return `ONDC (Open Network for Digital Commerce) is an open network connecting sellers directly with buyers across India:\n1. It is not a single website: You register through an authorized Seller App (such as Mystore or SellerApp).\n2. Once listed, your craft appears across Paytm, Pincode, and other buyer apps.\n3. Network commission is only 3% to 8%, significantly lower than private e-commerce portals.`;
    }

    if (q.includes('gem')) {
      return `GeM (Government e-Marketplace) is India's official public procurement portal:\n1. Artisans registered with DC-Handicrafts (Pehchan card) are exempt from Earnest Money Deposit (EMD) and prior turnover rules.\n2. You must declare 100% Make in India local content.\n3. Artisera provides the compliant GeM technical specification package for manual upload on gem.gov.in.`;
    }

    if (q.includes('vishwakarma') || q.includes('scheme') || q.includes('mudra') || q.includes('government') || q.includes('govt') || q.includes('loan')) {
      return `Top Government Schemes for Artisans:\n1. PM Vishwakarma Scheme: ₹15,000 tool kit voucher + collateral-free loans up to ₹3 Lakh at just 5% interest + ₹500/day training stipend.\n2. Mudra Yojana: Shishu loans up to ₹50,000 for immediate raw materials and tools.\n3. Pehchan Card: Ministry of Textiles artisan card granting free stalls at craft exhibitions & insurance.\n\nYou can enroll at any local Common Service Center (CSC) or pmvishwakarma.gov.in!`;
    }

    return `Namaste! I am your Artisera Chatbot assistant.\n\nI can help you with:\n1. Registering & selling on Amazon Karigar, Meesho, Flipkart, and ONDC.\n2. Government schemes like PM Vishwakarma (₹15,000 tool kit & 5% loans).\n3. Fair living wage pricing & calculating healthy profit margins.\n4. Improving product photography and listing quality.\n\nWhat would you like to explore today?`;
  }
}
