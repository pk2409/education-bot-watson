export class LLMGenerator {
  constructor(watsonxService) {
    this.watsonxService = watsonxService;
    this.promptTemplate = this.getPromptTemplate();
  }

  getPromptTemplate() {
    return `You are EduBot AI, a helpful educational assistant. Use the provided context to answer the student's question accurately and educationally.

Context from documents:
{context}

Student question: {question}

Instructions:
- Provide clear, educational responses using the context above
- If the context doesn't contain relevant information, say so and provide general educational guidance
- Use markdown formatting for better readability
- Keep responses concise but informative
- Encourage further learning and questions

Answer:`;
  }

  // Format context from retrieved documents
  formatContext(documents) {
    if (!documents || documents.length === 0) {
      return "No specific documents found for this query.";
    }
    
    return documents.map((doc, index) => {
      const title = doc.metadata?.title || 'Unknown Document';
      const subject = doc.metadata?.subject || 'General';
      
      return `Document ${index + 1} (${subject} - ${title}):
${doc.content}`;
    }).join('\n\n---\n\n');
  }

  // Generate response using the LLM
  async generate(context, question) {
    try {
      const formattedContext = this.formatContext(context);
      const prompt = this.promptTemplate
        .replace('{context}', formattedContext)
        .replace('{question}', question);
      
      console.log('Generating response with context from', context.length, 'documents');
      
      // Use the existing Watsonx service
      const response = await this.watsonxService.sendMessage(prompt);
      
      return response;
    } catch (error) {
      console.error('Error generating LLM response:', error);
      
      // Provide educational fallback
      return `I'm having trouble accessing the AI service right now. Here's some general guidance for your question about "${question}":

**Study Tips:**
- Break down complex topics into smaller, manageable parts
- Use multiple sources to understand different perspectives
- Practice applying concepts through examples and exercises
- Don't hesitate to ask follow-up questions

**Next Steps:**
- Review your course materials for related information
- Try rephrasing your question in different ways
- Ask your teacher or classmates for additional insights

Please try asking your question again in a moment!`;
    }
  }

  // Update prompt template
  updatePromptTemplate(template) {
    this.promptTemplate = template;
  }
}