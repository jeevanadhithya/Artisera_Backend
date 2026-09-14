export type CopilotIntent =
  | 'KNOWLEDGE_RAG'
  | 'TOOL_EXECUTION'
  | 'HYBRID'
  | 'LESSON_GUIDE'
  | 'BUSINESS_ADVISOR';

export interface IntentClassification {
  intent: CopilotIntent;
  targetMarketplace?: 'amazon' | 'flipkart' | 'meesho' | 'gem' | 'ondc';
  toolName?:
    | 'calculateProfit'
    | 'evaluateProductScore'
    | 'validateMarketplaceProduct'
    | 'analyzePrice'
    | 'calculateBreakEven'
    | 'generateExport'
    | 'getProductRecommendations';
  lessonTopic?: string;
  extractedPrice?: number;
  confidence: number;
}

export class IntentRouter {
  public static classify(query: string, hasProductContext: boolean = false): IntentClassification {
    const q = query.toLowerCase().trim();

    // 1. Detect Marketplace Reference
    let targetMarketplace: 'amazon' | 'flipkart' | 'meesho' | 'gem' | 'ondc' | undefined;
    if (q.includes('amazon')) targetMarketplace = 'amazon';
    else if (q.includes('flipkart')) targetMarketplace = 'flipkart';
    else if (q.includes('meesho')) targetMarketplace = 'meesho';
    else if (q.includes('gem') || q.includes('government e-marketplace')) targetMarketplace = 'gem';
    else if (q.includes('ondc')) targetMarketplace = 'ondc';

    // 2. Detect Price extraction (e.g. "sell this for ₹900" or "for 900")
    let extractedPrice: number | undefined;
    const priceMatch = q.match(/(?:₹|rs\.?|inr|\bfor\b)\s*(\d{2,6})/i) || q.match(/(\d{3,6})\s*(?:₹|rupees)/i);
    if (priceMatch && priceMatch[1]) {
      extractedPrice = parseInt(priceMatch[1], 10);
    }

    // 3. Detect "Learn with Artisera" Lesson Request
    const isLessonRequest =
      q.includes('teach me') ||
      q.includes('step by step') ||
      q.includes('how to photograph') ||
      q.includes('how to price') ||
      q.includes('how to package') ||
      q.includes('learn how') ||
      q.includes('how to sell online') ||
      q.includes('learn e-commerce') ||
      q.includes('guide me through');

    if (isLessonRequest) {
      let lessonTopic = 'general_ecommerce';
      if (q.includes('photo') || q.includes('camera') || q.includes('lighting')) lessonTopic = 'photography';
      else if (q.includes('price') || q.includes('cost') || q.includes('wage')) lessonTopic = 'fair_pricing';
      else if (q.includes('package') || q.includes('box') || q.includes('ship')) lessonTopic = 'packaging';
      else if (q.includes('catalog') || q.includes('story')) lessonTopic = 'catalog_storytelling';
      else if (q.includes('amazon') || q.includes('flipkart') || q.includes('meesho') || q.includes('sell online')) lessonTopic = 'marketplace_onboarding';

      return {
        intent: 'LESSON_GUIDE',
        targetMarketplace,
        lessonTopic,
        confidence: 0.95,
      };
    }

    // 4. Detect Business Advisor
    const isBusinessAdvisor =
      q.includes('what should i focus on') ||
      q.includes('analyze my catalog') ||
      q.includes('business advisor') ||
      q.includes('which products need improvement') ||
      q.includes('how are my sales') ||
      q.includes('improve my business');

    if (isBusinessAdvisor) {
      return {
        intent: 'BUSINESS_ADVISOR',
        confidence: 0.92,
      };
    }

    // 5. Detect Hybrid (Product Context + Marketplace or Improvement)
    if (hasProductContext) {
      if (targetMarketplace && (q.includes('can this') || q.includes('prepare') || q.includes('ready') || q.includes('list this') || q.includes('check'))) {
        return {
          intent: 'HYBRID',
          targetMarketplace,
          toolName: 'validateMarketplaceProduct',
          confidence: 0.96,
        };
      }
      if (q.includes('improve') || q.includes('score') || q.includes('make this better') || q.includes('professional')) {
        return {
          intent: 'HYBRID',
          toolName: 'evaluateProductScore',
          confidence: 0.94,
        };
      }
    }

    // 6. Detect Specific Tool Calls
    if (extractedPrice !== undefined || (q.includes('profit') && (q.includes('how much') || q.includes('calculate') || q.includes('make')))) {
      return {
        intent: 'TOOL_EXECUTION',
        toolName: 'calculateProfit',
        extractedPrice: extractedPrice || 650,
        confidence: 0.95,
      };
    }

    if (q.includes('break-even') || q.includes('break even')) {
      return {
        intent: 'TOOL_EXECUTION',
        toolName: 'calculateBreakEven',
        confidence: 0.95,
      };
    }

    if (q.includes('product score') || q.includes('my score') || q.includes('grade my product')) {
      return {
        intent: 'TOOL_EXECUTION',
        toolName: 'evaluateProductScore',
        confidence: 0.93,
      };
    }

    if (q.includes('export') || q.includes('generate listing package') || q.includes('download listing')) {
      return {
        intent: 'TOOL_EXECUTION',
        toolName: 'generateExport',
        targetMarketplace: targetMarketplace || 'amazon',
        confidence: 0.94,
      };
    }

    if (q.includes('fair price') || q.includes('calculate my selling price') || q.includes('living wage price')) {
      return {
        intent: 'TOOL_EXECUTION',
        toolName: 'analyzePrice',
        confidence: 0.92,
      };
    }

    // 7. Default to Knowledge RAG (Marketplace questions, registration, photography, packaging, etc.)
    return {
      intent: 'KNOWLEDGE_RAG',
      targetMarketplace,
      confidence: 0.88,
    };
  }
}
