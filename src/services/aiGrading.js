// AI Grading Service for Subjective Tests
import { WatsonxService } from './watsonx';

export const AIGradingService = {
  // Grade handwritten answer using AI
  async gradeHandwrittenAnswer(imageBase64, question, expectedAnswer, maxScore, documentContext = '') {
    try {
      console.log('Starting AI grading for handwritten answer...');

      // Create a comprehensive prompt for AI grading
      const gradingPrompt = this.createGradingPrompt(question, expectedAnswer, maxScore, documentContext);

      // For now, we'll simulate OCR + grading since we can't actually process images
      // In production, you'd integrate with OCR services like Google Vision API or Azure Computer Vision
      const mockOCRText = this.simulateOCR(imageBase64);

      // Grade the extracted text
      const gradingResult = await this.gradeTextAnswer(mockOCRText, gradingPrompt);

      return {
        score: gradingResult.score,
        feedback: gradingResult.feedback,
        extractedText: mockOCRText,
        confidence: gradingResult.confidence
      };
    } catch (error) {
      console.error('Error in AI grading:', error);
      return {
        score: 0,
        feedback: 'Unable to grade this answer automatically. Please review manually.',
        extractedText: 'Error extracting text from image',
        confidence: 0
      };
    }
  },

  // Simulate OCR for demonstration (in production, use real OCR service)
  simulateOCR(imageBase64) {
    // This is a mock function - in production you'd use actual OCR
    const mockTexts = [
      "The photosynthesis process involves the conversion of light energy into chemical energy. Plants use chlorophyll to capture sunlight and convert carbon dioxide and water into glucose and oxygen.",
      "The French Revolution began in 1789 and was caused by economic crisis, social inequality, and political corruption. It led to the overthrow of the monarchy and establishment of a republic.",
      "To solve this equation, we first isolate the variable by adding 5 to both sides, then divide by 3 to get x = 7.",
      "Shakespeare's use of metaphor in this passage reveals the character's inner turmoil and foreshadows the tragic events to come.",
      "The algorithm works by comparing adjacent elements and swapping them if they are in the wrong order, repeating until the array is sorted."
    ];
    
    // Return a random mock text for demonstration
    return mockTexts[Math.floor(Math.random() * mockTexts.length)];
  },

  // Create grading prompt for AI
  createGradingPrompt(question, expectedAnswer, maxScore, documentContext) {
    return `You are an expert teacher grading a student's handwritten answer. Please evaluate the following:

QUESTION: ${question}

EXPECTED ANSWER/RUBRIC: ${expectedAnswer}

DOCUMENT CONTEXT: ${documentContext}

MAXIMUM SCORE: ${maxScore}

Please grade the student's answer based on:
1. Accuracy of content (40%)
2. Understanding of concepts (30%)
3. Clarity of explanation (20%)
4. Use of relevant examples (10%)

Provide your response in this exact JSON format:
{
  "score": [number between 0 and ${maxScore}],
  "feedback": "[detailed feedback explaining the score]",
  "confidence": [number between 0 and 1 indicating confidence in grading]
}`;
  },

  // Grade extracted text using AI
  async gradeTextAnswer(extractedText, gradingPrompt) {
    try {
      const fullPrompt = `${gradingPrompt}

STUDENT'S ANSWER: ${extractedText}

Grade this answer and respond with the JSON format specified above.`;

      const response = await WatsonxService.sendMessage(fullPrompt);
      
      // Try to extract JSON from response
      let gradingResult;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          gradingResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.warn('Could not parse AI grading response, using fallback');
        gradingResult = this.createFallbackGrading(extractedText, response);
      }

      // Validate and sanitize the result
      return {
        score: Math.max(0, Math.min(gradingResult.score || 0, 100)),
        feedback: gradingResult.feedback || 'AI grading completed. Please review manually.',
        confidence: Math.max(0, Math.min(gradingResult.confidence || 0.5, 1))
      };
    } catch (error) {
      console.error('Error grading text answer:', error);
      return this.createFallbackGrading(extractedText, 'Error occurred during grading');
    }
  },

  // Create fallback grading when AI fails
  createFallbackGrading(extractedText, aiResponse) {
    // Simple heuristic grading based on text length and keywords
    const wordCount = extractedText.split(' ').length;
    let score = 0;

    if (wordCount > 50) score += 30; // Good length
    else if (wordCount > 20) score += 20;
    else if (wordCount > 10) score += 10;

    // Check for educational keywords
    const educationalKeywords = [
      'because', 'therefore', 'however', 'example', 'explain', 'analyze',
      'compare', 'contrast', 'result', 'conclusion', 'evidence', 'theory'
    ];
    
    const foundKeywords = educationalKeywords.filter(keyword => 
      extractedText.toLowerCase().includes(keyword)
    ).length;
    
    score += foundKeywords * 5; // 5 points per educational keyword
    score = Math.min(score, 75); // Cap at 75 for fallback grading

    return {
      score: score,
      feedback: `Automatic grading based on text analysis. Word count: ${wordCount}. Found ${foundKeywords} educational indicators. Please review manually for accuracy. AI Response: ${aiResponse.substring(0, 200)}...`,
      confidence: 0.3 // Low confidence for fallback
    };
  },

  // Batch grade multiple submissions
  async batchGradeSubmissions(submissions, test, documentContext) {
    const results = [];
    
    for (const submission of submissions) {
      try {
        const gradingResults = [];
        
        for (let i = 0; i < submission.answers.length; i++) {
          const answer = submission.answers[i];
          const question = test.questions[i];
          
          if (answer.imageUrl) {
            const result = await this.gradeHandwrittenAnswer(
              answer.imageUrl,
              question.question,
              question.expectedAnswer,
              question.maxScore,
              documentContext
            );
            
            gradingResults.push({
              questionIndex: i,
              ...result
            });
          }
        }
        
        // Calculate total score
        const totalScore = gradingResults.reduce((sum, result) => sum + result.score, 0);
        const maxPossibleScore = test.questions.reduce((sum, q) => sum + q.maxScore, 0);
        const percentage = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;
        
        results.push({
          submissionId: submission.id,
          totalScore: percentage,
          gradingResults: gradingResults,
          overallFeedback: this.generateOverallFeedback(gradingResults, percentage)
        });
        
      } catch (error) {
        console.error(`Error grading submission ${submission.id}:`, error);
        results.push({
          submissionId: submission.id,
          totalScore: 0,
          gradingResults: [],
          overallFeedback: 'Error occurred during automatic grading. Please review manually.'
        });
      }
    }
    
    return results;
  },

  // Generate overall feedback for a submission
  generateOverallFeedback(gradingResults, percentage) {
    const avgConfidence = gradingResults.reduce((sum, r) => sum + r.confidence, 0) / gradingResults.length;
    
    let feedback = '';
    
    if (percentage >= 90) {
      feedback = '🌟 Excellent work! ';
    } else if (percentage >= 80) {
      feedback = '👍 Good job! ';
    } else if (percentage >= 70) {
      feedback = '📚 Satisfactory work. ';
    } else if (percentage >= 60) {
      feedback = '⚠️ Needs improvement. ';
    } else {
      feedback = '📖 Requires significant review. ';
    }
    
    if (avgConfidence < 0.6) {
      feedback += 'Note: AI grading confidence is low. Manual review recommended.';
    } else {
      feedback += 'AI grading confidence is good, but teacher review is still recommended.';
    }
    
    return feedback;
  }
};