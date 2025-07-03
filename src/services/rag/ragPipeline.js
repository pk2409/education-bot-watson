import { DocumentProcessor } from './documentProcessor';
import { EmbeddingManager } from './embeddingManager';
import { VectorStore } from './vectorStore';
import { Reranker } from './reranker';
import { LLMGenerator } from './llmGenerator';

export class RAGPipeline {
  constructor(watsonxService, config = {}) {
    console.log('🔧 Initializing RAG Pipeline...');
    
    // Configuration with defaults
    this.config = {
      chunkSize: 500,
      chunkOverlap: 50,
      retrievalTopK: 10,
      rerankerTopN: 3,
      embeddingModel: 'simple',
      ...config
    };
    
    // Initialize components
    this.documentProcessor = new DocumentProcessor({
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap
    });
    
    this.embeddingManager = new EmbeddingManager({
      model: this.config.embeddingModel
    });
    
    this.vectorStore = new VectorStore(this.embeddingManager);
    
    this.reranker = new Reranker({
      topN: this.config.rerankerTopN
    });
    
    this.llmGenerator = new LLMGenerator(watsonxService);
    
    // State
    this.isInitialized = false;
    this.lastDocumentLoad = null;
    this.lastDocumentHash = null;
    
    console.log('✅ RAG Pipeline components initialized');
  }

  // Generate a simple hash of documents to detect changes
  generateDocumentHash(documents) {
    if (!documents || documents.length === 0) return 'empty';
    
    const docInfo = documents.map(doc => `${doc.id}-${doc.title}-${doc.subject}`).join('|');
    return btoa(docInfo).substring(0, 16); // Simple hash
  }

  // Initialize the pipeline with documents
  async initialize(documents = null) {
    try {
      console.log('🔄 Initializing RAG Pipeline with documents...');
      
      // Load documents if not provided
      if (!documents) {
        documents = await this.documentProcessor.loadDocuments();
      }
      
      // Generate hash to track document changes
      const currentHash = this.generateDocumentHash(documents);
      
      if (documents.length === 0) {
        console.warn('⚠️ No documents available for RAG pipeline');
        this.isInitialized = true;
        this.lastDocumentHash = currentHash;
        return;
      }
      
      // Check if we need to reprocess documents
      if (this.lastDocumentHash === currentHash && this.isInitialized) {
        console.log('📋 Documents unchanged, skipping reprocessing');
        return;
      }
      
      console.log(`📚 Processing ${documents.length} documents...`);
      
      // Process documents into chunks
      const processedDocs = await this.documentProcessor.processDocuments(documents);
      
      // Clear existing vector store and add new documents
      this.vectorStore.clear();
      this.vectorStore.addDocuments(processedDocs);
      
      this.isInitialized = true;
      this.lastDocumentLoad = new Date();
      this.lastDocumentHash = currentHash;
      
      console.log(`✅ RAG Pipeline initialized with ${documents.length} documents (${processedDocs.length} chunks)`);
    } catch (error) {
      console.error('❌ Error initializing RAG pipeline:', error);
      this.isInitialized = false;
    }
  }

  // Check if reinitialization is needed
  shouldReinitialize(documents = null) {
    if (!this.isInitialized) return true;
    
    // Check if documents have changed
    if (documents) {
      const currentHash = this.generateDocumentHash(documents);
      if (currentHash !== this.lastDocumentHash) {
        console.log('📝 Document changes detected, reinitialization needed');
        return true;
      }
    }
    
    // Reinitialize every 30 minutes to pick up new documents
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const needsRefresh = this.lastDocumentLoad && this.lastDocumentLoad < thirtyMinutesAgo;
    
    if (needsRefresh) {
      console.log('⏰ 30 minutes elapsed, reinitialization needed');
    }
    
    return needsRefresh;
  }

  // Main query method
  async query(question, documents = null) {
    try {
      console.log(`\n🔍 --- RAG Query ---`);
      console.log(`❓ Question: ${question}`);
      
      // Initialize or reinitialize if needed
      if (!this.isInitialized || this.shouldReinitialize(documents)) {
        await this.initialize(documents);
      }
      
      // If no documents available, use fallback
      if (this.vectorStore.getDocumentCount() === 0) {
        console.log('📭 No documents in vector store, using direct LLM response');
        const response = await this.llmGenerator.generate([], question);
        return {
          response,
          sourceDocuments: []
        };
      }
      
      // 1. Retrieve relevant documents
      console.log(`🔎 Searching vector store with ${this.vectorStore.getDocumentCount()} documents...`);
      const retrievedDocs = this.vectorStore.search(question, this.config.retrievalTopK);
      console.log(`📄 Retrieved ${retrievedDocs.length} documents`);
      
      if (retrievedDocs.length === 0) {
        console.log('🚫 No relevant documents found, using direct LLM response');
        const response = await this.llmGenerator.generate([], question);
        return {
          response,
          sourceDocuments: []
        };
      }
      
      // Log retrieved documents for debugging
      retrievedDocs.forEach((doc, index) => {
        console.log(`📋 Doc ${index + 1}: ${doc.metadata?.title} (similarity: ${doc.similarity?.toFixed(3)})`);
      });
      
      // 2. Rerank documents
      const rerankedDocs = this.reranker.rerank(question, retrievedDocs);
      console.log(`🎯 Reranked to ${rerankedDocs.length} documents`);
      
      // Log reranked documents
      rerankedDocs.forEach((doc, index) => {
        console.log(`🏆 Reranked ${index + 1}: ${doc.metadata?.title} (score: ${doc.rerankScore?.toFixed(3)})`);
      });
      
      // 3. Generate response
      console.log('🤖 Generating LLM response...');
      const response = await this.llmGenerator.generate(rerankedDocs, question);
      
      // 4. Return response with metadata
      const sourceDocuments = rerankedDocs.map(doc => ({
        id: doc.metadata?.documentId,
        title: doc.metadata?.title,
        subject: doc.metadata?.subject,
        similarity: doc.similarity,
        rerankScore: doc.rerankScore
      }));
      
      console.log(`✅ RAG query completed successfully`);
      console.log(`📖 Source documents: ${sourceDocuments.map(d => d.title).join(', ')}`);
      
      return {
        response,
        sourceDocuments
      };
      
    } catch (error) {
      console.error('❌ Error in RAG pipeline query:', error);
      
      // Fallback response
      return {
        response: `I encountered an error while processing your question. Here's some general guidance:

**For your question about "${question}":**
- Try breaking it down into smaller, specific parts
- Check your course materials for related topics
- Consider asking your teacher for clarification

**Study Tips:**
- Use multiple sources to understand concepts
- Practice with examples and exercises
- Don't hesitate to ask follow-up questions

Please try asking your question again!`,
        sourceDocuments: []
      };
    }
  }

  // Update configuration
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Update component configurations
    this.reranker.updateConfig({ topN: this.config.rerankerTopN });
    
    console.log('⚙️ RAG Pipeline configuration updated');
  }

  // Get pipeline status
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      documentCount: this.vectorStore.getDocumentCount(),
      lastDocumentLoad: this.lastDocumentLoad,
      lastDocumentHash: this.lastDocumentHash,
      config: this.config
    };
  }

  // Force reinitialization
  async reinitialize(documents = null) {
    console.log('🔄 Forcing RAG pipeline reinitialization...');
    this.isInitialized = false;
    this.lastDocumentHash = null;
    await this.initialize(documents);
  }
}