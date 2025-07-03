export class EmbeddingManager {
  constructor(config = {}) {
    this.model = config.model || 'simple';
    this.cache = new Map();
  }

  // Simple embedding using TF-IDF-like approach
  generateSimpleEmbedding(text) {
    // Convert text to lowercase and split into words
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
    
    // Create a simple word frequency vector
    const wordFreq = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });
    
    // Convert to normalized vector (simplified)
    const totalWords = words.length;
    const embedding = [];
    
    // Use a fixed vocabulary of common educational terms
    const vocabulary = [
      'learn', 'study', 'education', 'knowledge', 'understand', 'concept',
      'theory', 'practice', 'example', 'problem', 'solution', 'method',
      'analysis', 'research', 'data', 'information', 'science', 'math',
      'history', 'english', 'computer', 'technology', 'skill', 'development'
    ];
    
    vocabulary.forEach(term => {
      const freq = wordFreq[term] || 0;
      embedding.push(freq / totalWords);
    });
    
    // Add some basic text statistics
    embedding.push(words.length / 100); // Normalized word count
    embedding.push(text.length / 1000); // Normalized character count
    
    return embedding;
  }

  // Calculate cosine similarity between two embeddings
  calculateSimilarity(embedding1, embedding2) {
    if (embedding1.length !== embedding2.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }
    
    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  // Get embedding for text (with caching)
  getEmbedding(text) {
    const cacheKey = text.substring(0, 100); // Use first 100 chars as cache key
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    const embedding = this.generateSimpleEmbedding(text);
    this.cache.set(cacheKey, embedding);
    
    return embedding;
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }
}