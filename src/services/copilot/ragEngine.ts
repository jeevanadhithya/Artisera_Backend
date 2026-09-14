import { KnowledgeDocument, VERIFIED_KNOWLEDGE_BASE } from './knowledgeBase';
import { getSupabase } from '../supabase';

export interface RAGCitation {
  id: string;
  title: string;
  category: string;
  platform?: string;
  sourceUrl: string;
  documentVersion: string;
  publicationDate: string;
  lastVerifiedDate: string;
  keyTakeaways: string[];
  relevanceScore: number;
}

export interface RAGRetrievalResult {
  documents: KnowledgeDocument[];
  citations: RAGCitation[];
  contextString: string;
  hasSufficientKnowledge: boolean;
  dominantPlatform?: string;
}

export class RAGEngine {
  /**
   * Retrieves relevant verified knowledge documents matching the query and platform filter.
   */
  public static async retrieve(
    query: string,
    platformFilter?: string,
    categoryFilter?: string,
    maxDocuments: number = 3
  ): Promise<RAGRetrievalResult> {
    const cleanQuery = query.toLowerCase().trim();
    const queryTokens = cleanQuery
      .replace(/[^\w\s]/gi, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    // 1. Fetch any extra documents from Supabase rag_documents table if available
    let allDocs: KnowledgeDocument[] = [...VERIFIED_KNOWLEDGE_BASE];
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.from('rag_documents').select('*').limit(20);
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (!allDocs.some((d) => d.id === row.id || d.title.toLowerCase() === row.title?.toLowerCase())) {
            allDocs.push({
              id: row.id,
              title: row.title || 'Official Artisan Document',
              category: (row.category as any) || 'platform_help',
              topic: row.category || 'Craft Knowledge',
              language: 'en',
              sourceUrl: row.metadata?.source_url || 'https://artisera.in/help',
              documentVersion: row.metadata?.version || '1.0',
              publicationDate: row.created_at ? row.created_at.substring(0, 10) : '2026-01-01',
              lastVerifiedDate: row.updated_at ? row.updated_at.substring(0, 10) : '2026-08-01',
              content: row.content || '',
              tags: Array.isArray(row.tags) ? row.tags : [],
              keyTakeaways: Array.isArray(row.metadata?.key_takeaways) ? row.metadata.key_takeaways : [],
              officialActionUrl: row.metadata?.official_action_url,
            });
          }
        }
      }
    } catch {
      // Fallback seamlessly to in-memory verified knowledge base
    }

    // 2. Score and rank documents
    const scoredDocs: { doc: KnowledgeDocument; score: number }[] = [];

    for (const doc of allDocs) {
      let score = 0;

      // Platform match weighting
      const docPlatform = doc.platform?.toLowerCase();
      if (platformFilter && docPlatform === platformFilter.toLowerCase()) {
        score += 25;
      }
      if (docPlatform && cleanQuery.includes(docPlatform)) {
        score += 20;
      }

      // Category match
      if (categoryFilter && doc.category.toLowerCase() === categoryFilter.toLowerCase()) {
        score += 15;
      }

      // Title match
      const docTitleLower = doc.title.toLowerCase();
      if (docTitleLower.includes(cleanQuery)) {
        score += 30;
      }

      // Token matching across title, content, tags, keyTakeaways
      const docContentLower = doc.content.toLowerCase();
      const docTagsLower = doc.tags.map((t) => t.toLowerCase()).join(' ');
      const docTakeawaysLower = doc.keyTakeaways.map((t) => t.toLowerCase()).join(' ');

      for (const token of queryTokens) {
        if (docTitleLower.includes(token)) score += 8;
        if (docTagsLower.includes(token)) score += 6;
        if (docTakeawaysLower.includes(token)) score += 4;
        if (docContentLower.includes(token)) score += 2;
      }

      // Marketplace special token mappings
      if (cleanQuery.includes('amazon') && doc.platform === 'amazon') score += 15;
      if (cleanQuery.includes('flipkart') && doc.platform === 'flipkart') score += 15;
      if (cleanQuery.includes('meesho') && doc.platform === 'meesho') score += 15;
      if (cleanQuery.includes('gem') && (doc.platform === 'gem' || doc.id.includes('gem'))) score += 15;
      if (cleanQuery.includes('ondc') && doc.platform === 'ondc') score += 15;
      if ((cleanQuery.includes('profit') || cleanQuery.includes('price') || cleanQuery.includes('wage')) && doc.category === 'pricing') score += 15;
      if ((cleanQuery.includes('photo') || cleanQuery.includes('camera') || cleanQuery.includes('picture')) && doc.category === 'photography') score += 15;
      if ((cleanQuery.includes('package') || cleanQuery.includes('box') || cleanQuery.includes('shipping') || cleanQuery.includes('fragile')) && doc.category === 'packaging') score += 15;
      if ((cleanQuery.includes('reel') || cleanQuery.includes('marketing') || cleanQuery.includes('social')) && doc.category === 'marketing') score += 15;

      if (score > 5) {
        scoredDocs.push({ doc, score });
      }
    }

    // Sort descending by relevance score
    scoredDocs.sort((a, b) => b.score - a.score);
    const topScored = scoredDocs.slice(0, maxDocuments);

    const hasSufficientKnowledge = topScored.length > 0 && topScored[0].score >= 8;
    const documents = topScored.map((s) => s.doc);

    // Build Citations
    const citations: RAGCitation[] = topScored.map((s) => ({
      id: s.doc.id,
      title: s.doc.title,
      category: s.doc.category,
      platform: s.doc.platform,
      sourceUrl: s.doc.sourceUrl,
      documentVersion: s.doc.documentVersion,
      publicationDate: s.doc.publicationDate,
      lastVerifiedDate: s.doc.lastVerifiedDate,
      keyTakeaways: s.doc.keyTakeaways,
      relevanceScore: Math.min(100, Math.round(s.score * 2.5)),
    }));

    // Build formatted Context String for LLM
    const contextLines: string[] = [];
    for (const item of topScored) {
      const d = item.doc;
      contextLines.push(`---
DOCUMENT: ${d.title} (Platform: ${d.platform || 'Artisera Standard'}, Version: ${d.documentVersion}, Verified: ${d.lastVerifiedDate})
SOURCE: ${d.sourceUrl}
CONTENT:
${d.content}
KEY TAKEAWAYS:
${d.keyTakeaways.map((k) => `• ${k}`).join('\n')}
---`);
    }

    const dominantPlatform = documents.find((d) => d.platform)?.platform;

    return {
      documents,
      citations,
      contextString: contextLines.join('\n\n'),
      hasSufficientKnowledge,
      dominantPlatform,
    };
  }
}
