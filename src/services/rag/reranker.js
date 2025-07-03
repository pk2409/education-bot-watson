export class Reranker {
  constructor(config = {}) {
    this.topN = config.topN || 3;
  }

  // Simple reranking based on keyword matching and document metadata
  rerank(query, documents) {
    if (!documents || documents.length === 0) {
      return [];
    }
    
    const queryWords = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
    
    // Score documents based on multiple factors
    const scoredDocs = documents.map(doc => {
      let score = doc.similarity || 0; // Base similarity score
      
      const content = doc.content.toLowerCase();
      const title = doc.metadata?.title?.toLowerCase() || '';
      const subject = doc.metadata?.subject?.toLowerCase() || '';
      
      // Boost score for exact keyword matches
      queryWords.forEach(word => {
        // Title matches are most important
        if (title.includes(word)) {
          score += 0.3;
        }
        // Subject matches are also important
        if (subject.includes(word)) {
          score += 0.2;
        }
        // Content matches
        const contentMatches = (content.match(new RegExp(word, 'g')) || []).length;
        score += contentMatches * 0.1;
      });
      
      // Boost score for documents with relevant subjects
      const educationalSubjects = ['mathematics', 'science', 'history', 'english', 'computer science'];
      if (educationalSubjects.some(subj => subject.includes(subj))) {
        score += 0.1;
      }
      
      // Penalize very short content
      if (doc.content.length < 50) {
        score *= 0.8;
      }
      
      return {
        ...doc,
        rerankScore: score
      };
    });
    
    // Sort by rerank score and return top N
    const reranked = scoredDocs
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, this.topN);
    
    console.log(`Reranked ${documents.length} documents, returning top ${reranked.length}`);
    
    return reranked;
  }

  // Update configuration
  updateConfig(config) {
    this.topN = config.topN || this.topN;
  }
}