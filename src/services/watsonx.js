// IBM Watsonx API integration with enhanced error handling and modular RAG pipeline
import { RAGPipeline } from './rag/ragPipeline';

const WATSONX_URL = '/api/watsonx';
const IAM_URL = '/api/iam';

export const WatsonxService = {
  // Cache for access token to avoid repeated IAM calls
  accessTokenCache: {
    token: null,
    expiry: null
  },

  // RAG Pipeline instance
  ragPipeline: null,

  // Enhanced fallback responses for when API is unavailable
  fallbackResponses: [
    "I'm having trouble connecting to the AI service right now. Here's what I can tell you: This appears to be a great question! While I work on reconnecting, try rephrasing your question or check back in a moment.",
    "The AI service is temporarily unavailable, but I'd love to help! Your question seems important - could you try asking it in a different way? I'll do my best to assist you.",
    "I'm experiencing some connectivity issues with the main AI service. In the meantime, I recommend checking your course materials or asking your teacher for immediate help with this topic.",
    "Network connectivity is currently limited. While I work on reconnecting, consider breaking down your question into smaller parts or consulting your textbooks for this subject.",
    "The AI service is temporarily offline. This looks like an interesting learning question! Try exploring related topics in your study materials while I reconnect."
  ],

  getRandomFallback() {
    return this.fallbackResponses[Math.floor(Math.random() * this.fallbackResponses.length)];
  },

  // Initialize RAG Pipeline
  initializeRAG() {
    if (!this.ragPipeline) {
      console.log('Initializing RAG Pipeline...');
      this.ragPipeline = new RAGPipeline(this, {
        chunkSize: 500,
        chunkOverlap: 50,
        retrievalTopK: 8,
        rerankerTopN: 3,
        embeddingModel: 'simple'
      });
    }
    return this.ragPipeline;
  },

  // Retry function with exponential backoff
  async retryWithBackoff(fn, maxRetries = 1, baseDelay = 2000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Don't retry on certain error types
        if (error.name === 'AbortError' || 
            error.message.includes('401') || 
            error.message.includes('403')) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  },

  async getIAMToken(apiKey) {
    try {
      // Check if we have a valid cached token
      if (this.accessTokenCache.token && this.accessTokenCache.expiry > Date.now()) {
        console.log('Using cached IAM token');
        return this.accessTokenCache.token;
      }

      console.log('Getting new IAM token...');

      const tokenRequest = async () => {
        // Create request with reasonable timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        try {
          const response = await fetch(IAM_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json'
            },
            body: new URLSearchParams({
              'grant_type': 'urn:ibm:params:oauth:grant-type:apikey',
              'apikey': apiKey
            }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            console.error('IAM token request failed:', response.status, errorText);
            throw new Error(`IAM authentication failed (${response.status}): ${errorText}`);
          }

          const data = await response.json();
          
          if (!data.access_token) {
            throw new Error('No access token received from IAM service');
          }

          return data;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      };

      // Retry the token request with backoff
      const data = await this.retryWithBackoff(tokenRequest, 1, 2000);

      // Cache the token with expiry (subtract 5 minutes for safety)
      this.accessTokenCache.token = data.access_token;
      this.accessTokenCache.expiry = Date.now() + ((data.expires_in - 300) * 1000);

      console.log('IAM token obtained successfully');
      return data.access_token;
    } catch (error) {
      console.error('Error getting IAM token:', error);
      
      // Clear cache on error
      this.accessTokenCache.token = null;
      this.accessTokenCache.expiry = null;
      
      if (error.name === 'AbortError') {
        throw new Error('Authentication timeout - please check your internet connection');
      }
      
      throw error;
    }
  },

  async sendMessage(userMessage, documentContext = '') {
    try {
      const apiKey = import.meta.env.VITE_WATSONX_API_KEY || 'TbF09oVdL4GOZQCHVTYE0HBUeicfRRXpOiBuPi_8c4eY';
      const projectId = import.meta.env.VITE_WATSONX_PROJECT_ID || '08581777-de5d-43ea-a8c6-867e4f6bb677';

      if (!apiKey || !projectId) {
        console.warn('Watsonx credentials not configured, using fallback');
        return this.getRandomFallback();
      }

      console.log('Sending message to Watsonx...');

      // Get IAM access token with retry logic
      let accessToken;
      try {
        accessToken = await this.getIAMToken(apiKey);
      } catch (tokenError) {
        console.error('Failed to get IAM token:', tokenError);
        return `I'm having trouble authenticating with the AI service. ${this.getRandomFallback()}`;
      }

      // Enhanced system prompt for educational context
      const systemPrompt = `You are EduBot AI, a helpful educational assistant. Always provide clear, educational responses using markdown formatting. Focus on helping students learn with explanations, examples, and encouraging content. Keep responses concise but informative. If you cannot answer based on available information, suggest alternative learning approaches.`;

      // Prepare the user prompt with context if available
      const userPrompt = documentContext 
        ? `Context from document: ${documentContext}\n\nStudent question: ${userMessage}`
        : userMessage;

      const requestBody = {
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        project_id: projectId,
        model_id: 'meta-llama/llama-3-2-11b-vision-instruct',
        frequency_penalty: 0,
        max_tokens: 800,
        presence_penalty: 0,
        temperature: 0.7,
        top_p: 1
      };

      console.log('Sending request to Watsonx API...');

      const watsonxRequest = async () => {
        // Use reasonable timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        try {
          const response = await fetch(WATSONX_URL, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Watsonx API error:', response.status, errorText);
            
            // Clear cached token if we get auth errors
            if (response.status === 401 || response.status === 403) {
              this.accessTokenCache.token = null;
              this.accessTokenCache.expiry = null;
            }
            
            throw new Error(`Watsonx API error (${response.status}): ${errorText}`);
          }

          return await response.json();
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      };

      // Retry the Watsonx request with minimal retry
      const data = await this.retryWithBackoff(watsonxRequest, 0, 3000); // No retries for chat

      console.log('Watsonx response received successfully');

      // Extract the response content - handle different response formats
      let content = '';
      
      if (data.choices && data.choices.length > 0) {
        content = data.choices[0].message?.content || data.choices[0].text || '';
      } else if (data.results && data.results.length > 0) {
        content = data.results[0].generated_text || '';
      } else if (data.generated_text) {
        content = data.generated_text;
      }

      if (!content) {
        console.warn('No content found in response:', data);
        return 'I received your question but couldn\'t generate a proper response. Could you please rephrase your question or try asking about a specific topic?';
      }

      // Clean up the response
      content = content.trim();
      
      // Add educational encouragement if response is short
      if (content.length < 50) {
        content += "\n\nFeel free to ask follow-up questions or request more details about this topic!";
      }

      return content;
    } catch (error) {
      console.error('Watsonx API error:', error);
      
      // Provide helpful error messages based on error type
      if (error.name === 'AbortError') {
        return 'The request took too long to complete. Please try again with a shorter question or check your internet connection.';
      } else if (error.message.includes('Failed to fetch') || error.message.includes('network')) {
        return 'I\'m having trouble connecting to the AI service. Please check your internet connection and try again. If the problem persists, the service might be temporarily unavailable.';
      } else if (error.message.includes('401') || error.message.includes('403')) {
        return 'There\'s an authentication issue with the AI service. Please try again in a moment.';
      } else if (error.message.includes('429')) {
        return 'The AI service is currently busy. Please wait a moment and try again.';
      }
      
      return this.getRandomFallback();
    }
  },

  // Enhanced RAG implementation with modular pipeline
  async performRAG(userMessage, documents) {
    try {
      console.log('🔍 Performing RAG search for:', userMessage);
      console.log('📚 Available documents:', documents.length);

      // Initialize RAG pipeline if not already done
      const ragPipeline = this.initializeRAG();

      // Use the modular RAG pipeline with fresh documents
      const result = await ragPipeline.query(userMessage, documents);
      
      console.log('✅ RAG pipeline result:', {
        hasResponse: !!result.response,
        sourceDocuments: result.sourceDocuments?.length || 0
      });

      // Find the actual source document from the original documents array
      let sourceDocument = null;
      if (result.sourceDocuments && result.sourceDocuments.length > 0) {
        const sourceDocId = result.sourceDocuments[0].id;
        sourceDocument = documents.find(doc => doc.id === sourceDocId);
        
        if (sourceDocument) {
          console.log('📖 Source document found:', {
            id: sourceDocument.id,
            title: sourceDocument.title,
            subject: sourceDocument.subject
          });
        } else {
          console.warn('⚠️ Source document ID not found in original documents:', sourceDocId);
        }
      } else {
        console.log('ℹ️ No source documents returned from RAG pipeline');
      }

      return {
        response: result.response || result, // Handle both old and new formats
        sourceDocument: sourceDocument
      };
    } catch (error) {
      console.error('❌ RAG error:', error);
      
      // Provide educational fallback response
      const fallbackResponse = `I'm having trouble accessing the AI service right now, but I can see you're asking about: "${userMessage}"\n\n` +
        `Here are some general study tips while I reconnect:\n` +
        `• Break down complex topics into smaller parts\n` +
        `• Review your course materials for related information\n` +
        `• Try rephrasing your question in different ways\n` +
        `• Ask your teacher or classmates for additional perspectives\n\n` +
        `Please try asking your question again in a moment!`;
      
      return {
        response: fallbackResponse,
        sourceDocument: null
      };
    }
  },

  async generateQuizFromDocument(document) {
    try {
      console.log('Generating quiz for document:', document.title);

      // Check if AI service is available by testing with a simple request first
      const testPrompt = "Test connection";
      try {
        await this.sendMessage(testPrompt);
        console.log('AI service connection test successful');
      } catch (testError) {
        console.warn('AI service connection test failed, using fallback quiz');
        return this.generateFallbackQuiz(document);
      }

      // Extract document content for better context
      const documentContent = this.extractDocumentContent(document);
      
      const prompt = `Based on the following document information, create 5 multiple choice questions:

${documentContent}

Create educational questions that test understanding of ${document.subject} concepts. 

IMPORTANT: Respond with ONLY a valid JSON array in this exact format:
[
  {
    "question": "What is the main concept discussed in this ${document.subject} material?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": 0
  }
]

Requirements:
- Each question should test understanding of ${document.subject}
- All 4 options must be plausible but only one correct
- correct_answer is the index (0-3) of the correct option
- Questions should be appropriate for the subject: ${document.subject}
- Return ONLY the JSON array, no other text`;

      const response = await this.sendMessage(prompt);
      
      console.log('Quiz generation response received:', response);

      // Try to extract JSON from the response
      let quizData = [];
      try {
        // Clean the response - remove any markdown formatting
        let cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // Look for JSON array in the response
        const jsonMatch = cleanResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          quizData = JSON.parse(jsonMatch[0]);
        } else {
          // Try parsing the entire cleaned response
          quizData = JSON.parse(cleanResponse);
        }

        // Validate the structure
        if (Array.isArray(quizData) && quizData.length > 0) {
          // Ensure each question has the required fields
          const validQuestions = quizData.filter(q => 
            q.question && 
            Array.isArray(q.options) && 
            q.options.length === 4 &&
            typeof q.correct_answer === 'number' &&
            q.correct_answer >= 0 && 
            q.correct_answer < 4
          );

          console.log('Generated valid questions:', validQuestions.length);
          if (validQuestions.length > 0) {
            return validQuestions.slice(0, 5); // Ensure max 5 questions
          }
        }
      } catch (parseError) {
        console.error('Error parsing quiz JSON:', parseError);
        console.log('Raw response:', response);
        
        // If response contains fallback text, use fallback quiz
        if (response.includes("I'm having") || response.includes("trouble") || response.includes("unavailable")) {
          console.log('AI service returned fallback response, using fallback quiz');
          return this.generateFallbackQuiz(document);
        }
      }

      // Fallback: create sample questions based on document info if AI generation fails
      console.log('Using fallback quiz questions for:', document.title);
      return this.generateFallbackQuiz(document);
    } catch (error) {
      console.error('Error generating quiz:', error);
      
      // Return basic fallback questions
      return this.generateFallbackQuiz(document);
    }
  },

  // Extract text content from document for better context
  extractDocumentContent(document) {
    try {
      // If document has base64 content, try to extract text
      if (document.file_url && document.file_url.startsWith('data:')) {
        // For now, we'll use the document metadata as context
        // In production, you'd want to extract actual text from PDFs/docs
        return `Document Title: ${document.title}\nSubject: ${document.subject}\nThis document contains educational content about ${document.subject}.`;
      }
      
      // Fallback to basic document info
      return `Document: "${document.title}" - Subject: ${document.subject}`;
    } catch (error) {
      console.error('Error extracting document content:', error);
      return `Document: "${document.title}" - Subject: ${document.subject}`;
    }
  },

  // Generate fallback quiz questions when AI fails
  generateFallbackQuiz(document) {
    const subjectQuestions = {
      'Mathematics': [
        {
          question: `What type of mathematical concepts might be covered in "${document.title}"?`,
          options: ["Basic arithmetic", "Advanced calculus", "Geometry", "All of the above"],
          correct_answer: 3
        },
        {
          question: `In mathematics, what is typically the first step in problem solving?`,
          options: ["Calculate immediately", "Understand the problem", "Guess the answer", "Use a calculator"],
          correct_answer: 1
        },
        {
          question: `Which mathematical principle is fundamental to most calculations?`,
          options: ["Order of operations", "Random guessing", "Using only addition", "Avoiding fractions"],
          correct_answer: 0
        }
      ],
      'Science': [
        {
          question: `What scientific method step comes after forming a hypothesis?`,
          options: ["Conclusion", "Experimentation", "Observation", "Theory"],
          correct_answer: 1
        },
        {
          question: `Which of these is a fundamental concept in science?`,
          options: ["Observation", "Hypothesis", "Experimentation", "All of the above"],
          correct_answer: 3
        },
        {
          question: `In scientific research, what makes a good hypothesis?`,
          options: ["It's always correct", "It can be tested", "It's very complex", "It's based on opinion"],
          correct_answer: 1
        }
      ],
      'History': [
        {
          question: `What is the primary purpose of studying historical documents?`,
          options: ["Entertainment", "Understanding the past", "Memorizing dates", "Learning languages"],
          correct_answer: 1
        },
        {
          question: `Why is it important to consider multiple sources when studying history?`,
          options: ["To get different perspectives", "To fill time", "To confuse students", "To make it harder"],
          correct_answer: 0
        },
        {
          question: `What helps historians determine the reliability of a source?`,
          options: ["Its age", "Who wrote it and when", "Its length", "Its language"],
          correct_answer: 1
        }
      ],
      'English': [
        {
          question: `What is the main purpose of analyzing literature?`,
          options: ["To memorize plots", "To understand themes and meanings", "To count words", "To practice reading"],
          correct_answer: 1
        },
        {
          question: `Which element is crucial in effective writing?`,
          options: ["Length", "Clarity", "Complexity", "Speed"],
          correct_answer: 1
        },
        {
          question: `What makes a strong thesis statement?`,
          options: ["It's very long", "It states a clear argument", "It asks questions", "It's at the end"],
          correct_answer: 1
        }
      ],
      'Computer Science': [
        {
          question: `What is the first step in solving a programming problem?`,
          options: ["Write code immediately", "Understand the requirements", "Choose a language", "Test the solution"],
          correct_answer: 1
        },
        {
          question: `Which concept is fundamental to computer science?`,
          options: ["Algorithms", "Data structures", "Problem solving", "All of the above"],
          correct_answer: 3
        },
        {
          question: `What is the purpose of debugging in programming?`,
          options: ["To make code longer", "To find and fix errors", "To add features", "To change languages"],
          correct_answer: 1
        }
      ]
    };

    // Get subject-specific questions or use general ones
    const questions = subjectQuestions[document.subject] || [
      {
        question: `What is the main focus of the document "${document.title}"?`,
        options: ["Basic concepts", "Advanced theory", "Practical applications", "All of the above"],
        correct_answer: 3
      },
      {
        question: `This document belongs to which subject area?`,
        options: [document.subject, "General studies", "Mixed topics", "Unknown"],
        correct_answer: 0
      },
      {
        question: `When studying this material, what approach is most effective?`,
        options: ["Memorization only", "Understanding concepts", "Skipping difficult parts", "Reading once"],
        correct_answer: 1
      }
    ];

    // Add a document-specific question
    questions.unshift({
      question: `Based on the title "${document.title}", what would you expect to learn?`,
      options: [
        `${document.subject} fundamentals`,
        "Unrelated topics",
        "Historical facts only",
        "Mathematical formulas only"
      ],
      correct_answer: 0
    });

    console.log(`Generated ${questions.length} fallback questions for ${document.subject}`);
    return questions.slice(0, 5);
  }
};