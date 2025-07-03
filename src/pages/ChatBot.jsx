import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { WatsonxService } from '../services/watsonx';
import { DatabaseService } from '../services/supabase';
import { Send, Bot, User, BookOpen, Sparkles, MessageCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react';

const ChatBot = () => {
  const { user, profile, updateXP } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    
    const initializeChat = async () => {
      if (!mounted) return;
      
      try {
        // Load documents first
        await loadDocuments();
        
        if (!mounted) return;
        
        // Load chat history
        await loadChatHistory();
        
        if (!mounted) return;
        
        // Add welcome message if no chat history and no existing messages
        if (messages.length === 0) {
          setMessages([{
            id: 1,
            type: 'bot',
            content: `Hi ${profile?.name}! 👋 I'm **EduBot AI**, your personal learning assistant powered by IBM Watsonx. 

I can help you with:
- 📚 Questions about your course materials
- 🧠 Explanations of complex topics  
- 💡 Study tips and learning strategies
- 🔍 Finding information in uploaded documents

**Note:** I need an internet connection to provide AI-powered responses. If you're offline, I'll still try to help with basic guidance!

What would you like to learn about today?`,
            timestamp: new Date()
          }]);
        }
      } catch (error) {
        console.error('Error initializing chat:', error);
      }
    };

    if (profile) {
      initializeChat();
    }

    // Check network status
    checkNetworkStatus();
    const networkInterval = setInterval(checkNetworkStatus, 30000);

    return () => {
      mounted = false;
      clearInterval(networkInterval);
      // Cancel any ongoing requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [profile]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const checkNetworkStatus = () => {
    if (navigator.onLine) {
      setConnectionStatus('connected');
    } else {
      setConnectionStatus('offline');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChatHistory = async () => {
    if (!user) return;
    
    try {
      const { data } = await DatabaseService.getChatHistory(user.id);
      if (data && data.length > 0) {
        const formattedMessages = data.map(chat => [
          {
            id: `${chat.id}-q`,
            type: 'user',
            content: chat.question,
            timestamp: new Date(chat.timestamp)
          },
          {
            id: `${chat.id}-a`,
            type: 'bot',
            content: chat.answer,
            timestamp: new Date(chat.timestamp),
            sourceDocument: chat.document_id ? documents.find(doc => doc.id === chat.document_id) : null
          }
        ]).flat();
        
        setMessages(prev => [...prev, ...formattedMessages]);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const loadDocuments = async () => {
    try {
      setDocumentsLoaded(false);
      console.log('🔄 Loading documents for chat...');
      
      // Add timeout to document loading
      const documentPromise = DatabaseService.getDocuments();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Document loading timeout')), 10000);
      });

      const { data } = await Promise.race([documentPromise, timeoutPromise]);
      
      if (data) {
        setDocuments(data);
        console.log('✅ Loaded documents for RAG:', data.length);
        
        // Log document details for debugging
        data.forEach(doc => {
          console.log(`📄 Document: ${doc.title} (${doc.subject}) - ID: ${doc.id}`);
        });
      } else {
        setDocuments([]);
        console.log('ℹ️ No documents found');
      }
    } catch (error) {
      console.error('❌ Error loading documents:', error);
      setDocuments([]); // Set empty array on error
    } finally {
      setDocumentsLoaded(true);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    const loadingMessage = {
      id: Date.now() + 1,
      type: 'bot',
      content: 'EduBot is thinking...',
      timestamp: new Date(),
      isLoading: true
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    const currentInput = inputMessage;
    setInputMessage('');
    setIsLoading(true);
    setError('');

    try {
      console.log('🚀 Sending message to Watsonx:', currentInput);
      setConnectionStatus('connecting');
      
      // Set a timeout for the entire chat request
      const chatTimeout = setTimeout(() => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      }, 60000); // 60 second timeout

      // Perform RAG search and get AI response
      const { response, sourceDocument } = await WatsonxService.performRAG(currentInput, documents);

      clearTimeout(chatTimeout);

      console.log('✅ Received response:', response);
      console.log('📖 Source document:', sourceDocument ? {
        id: sourceDocument.id,
        title: sourceDocument.title,
        subject: sourceDocument.subject
      } : 'None');
      
      setConnectionStatus('connected');

      // Save to database if user is authenticated and not using mock data
      if (user && !localStorage.getItem('mockUser')) {
        try {
          await DatabaseService.saveChatMessage({
            user_id: user.id,
            question: currentInput,
            answer: response,
            document_id: sourceDocument?.id || null,
            timestamp: new Date().toISOString()
          });
          console.log('💾 Chat message saved to database');
        } catch (dbError) {
          console.error('❌ Error saving chat to database:', dbError);
          // Continue anyway - don't block the chat experience
        }
      }

      // Update XP
      await updateXP(2);

      // Update messages with source document
      setMessages(prev => prev.map(msg => 
        msg.isLoading ? {
          ...msg,
          content: response,
          sourceDocument: sourceDocument,
          isLoading: false
        } : msg
      ));

    } catch (error) {
      console.error('❌ Chat error:', error);
      
      // Don't show error if request was aborted (user navigated away)
      if (error.name === 'AbortError') {
        console.log('ℹ️ Chat request was aborted');
        return;
      }
      
      setConnectionStatus('error');
      
      let errorMessage = 'I encountered an error processing your request. ';
      
      if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage = 'I\'m having trouble connecting to the AI service. Please check your internet connection and try again. ';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'The request took too long. Please try again with a shorter question. ';
      }
      
      errorMessage += 'In the meantime, try consulting your study materials or asking your teacher for help with this topic.';
      
      setError(errorMessage);
      
      setMessages(prev => prev.map(msg => 
        msg.isLoading ? {
          ...msg,
          content: errorMessage,
          isLoading: false,
          hasError: true
        } : msg
      ));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatBotMessage = (content) => {
    // Enhanced markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded">$1</code>')
      .replace(/\n/g, '<br>');
  };

  const retryMessage = () => {
    if (inputMessage.trim()) {
      handleSendMessage();
    }
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi className="text-green-500" size={16} />;
      case 'connecting':
        return <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>;
      case 'offline':
        return <WifiOff className="text-red-500" size={16} />;
      case 'error':
        return <AlertCircle className="text-red-500" size={16} />;
      default:
        return <Wifi className="text-gray-500" size={16} />;
    }
  };

  const getConnectionText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'AI Connected';
      case 'connecting':
        return 'Connecting...';
      case 'offline':
        return 'Offline';
      case 'error':
        return 'Connection Error';
      default:
        return 'Unknown';
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto h-[calc(100vh-12rem)] flex flex-col">
        {/* Header */}
        <div className="bg-white rounded-t-2xl p-6 border-b border-gray-100 shadow-sm">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
              <Bot className="text-white" size={24} />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-800">EduBot AI Chat</h1>
              <p className="text-gray-600">Powered by IBM Watsonx • Ask me anything about your studies! 🤖✨</p>
            </div>
            <div className="text-right text-sm">
              <div className="flex items-center space-x-2 mb-1">
                {getConnectionIcon()}
                <span className={`font-medium ${
                  connectionStatus === 'connected' ? 'text-green-600' :
                  connectionStatus === 'connecting' ? 'text-blue-600' :
                  connectionStatus === 'offline' ? 'text-red-600' :
                  'text-red-600'
                }`}>
                  {getConnectionText()}
                </span>
              </div>
              <div className="text-gray-500">
                <div>
                  {documentsLoaded ? (
                    `${documents.length} documents available`
                  ) : (
                    'Loading documents...'
                  )}
                </div>
                <div>+2 XP per question</div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mx-6 mt-4 rounded">
            <div className="flex items-center">
              <AlertCircle className="text-red-400 mr-2" size={20} />
              <p className="text-red-700 flex-1">{error}</p>
              <button 
                onClick={retryMessage}
                className="ml-4 text-red-600 hover:text-red-800 text-sm font-medium bg-red-100 hover:bg-red-200 px-3 py-1 rounded transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Network Status Warning */}
        {connectionStatus === 'offline' && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mx-6 mt-4 rounded">
            <div className="flex items-center">
              <WifiOff className="text-yellow-400 mr-2" size={20} />
              <p className="text-yellow-700">
                You're currently offline. I can still provide basic study guidance, but AI-powered responses require an internet connection.
              </p>
            </div>
          </div>
        )}

        {/* RAG Status Indicator */}
        {documentsLoaded && documents.length > 0 && (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mx-6 mt-2 rounded">
            <div className="flex items-center text-sm">
              <BookOpen className="text-blue-500 mr-2" size={16} />
              <span className="text-blue-700">
                🔍 RAG Pipeline Active: I can search through {documents.length} uploaded documents to provide contextual answers
              </span>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 bg-white overflow-y-auto p-6 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start space-x-3 ${
                message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                message.type === 'user' 
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500' 
                  : 'bg-gradient-to-r from-purple-500 to-pink-500'
              }`}>
                {message.type === 'user' ? (
                  <User className="text-white" size={20} />
                ) : (
                  <Bot className="text-white" size={20} />
                )}
              </div>
              
              <div className={`max-w-3xl ${
                message.type === 'user' ? 'text-right' : 'text-left'
              }`}>
                <div className={`inline-block p-4 rounded-2xl shadow-sm ${
                  message.type === 'user'
                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                    : message.hasError
                    ? 'bg-red-50 text-red-800 border border-red-200'
                    : 'bg-gray-50 text-gray-800 border border-gray-100'
                }`}>
                  {message.isLoading ? (
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                      <span className="text-purple-600">EduBot is thinking...</span>
                    </div>
                  ) : (
                    <div 
                      dangerouslySetInnerHTML={{ 
                        __html: message.type === 'bot' ? formatBotMessage(message.content) : message.content 
                      }} 
                    />
                  )}
                </div>
                
                {/* Enhanced Source Document Display */}
                {message.sourceDocument && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center space-x-2 text-sm">
                      <BookOpen size={16} className="text-blue-600" />
                      <span className="font-medium text-blue-800">Source Document:</span>
                    </div>
                    <div className="mt-1 text-sm text-blue-700">
                      <div className="font-medium">{message.sourceDocument.title}</div>
                      <div className="text-blue-600">Subject: {message.sourceDocument.subject}</div>
                      <div className="text-xs text-blue-500 mt-1">
                        ✅ Answer based on uploaded course material
                      </div>
                    </div>
                  </div>
                )}
                
                {/* No Source Indicator for Bot Messages */}
                {message.type === 'bot' && !message.sourceDocument && !message.isLoading && !message.hasError && (
                  <div className="mt-2 text-xs text-gray-500 flex items-center space-x-1">
                    <AlertCircle size={12} />
                    <span>General knowledge response (no specific document referenced)</span>
                  </div>
                )}
                
                <div className="text-xs text-gray-400 mt-1">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-white rounded-b-2xl p-4 border-t border-gray-100 shadow-sm">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  connectionStatus === 'offline' 
                    ? "You're offline - basic guidance available..."
                    : "Ask me about your studies... (Press Enter to send)"
                }
                className="w-full p-4 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows="1"
                style={{ minHeight: '3rem', maxHeight: '8rem' }}
                disabled={isLoading}
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                <Sparkles className="text-purple-400" size={16} />
              </div>
            </div>
            
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl flex items-center justify-center hover:from-purple-600 hover:to-pink-600 transform hover:scale-105 transition-all duration-200 shadow-lg disabled:opacity-50 disabled:transform-none"
            >
              <Send size={20} />
            </button>
          </div>
          
          <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
            <div className="flex items-center space-x-4">
              <span className="flex items-center space-x-1">
                <MessageCircle size={14} />
                <span>{messages.filter(m => m.type === 'user').length} questions asked</span>
              </span>
              <span className="flex items-center space-x-1">
                <BookOpen size={14} />
                <span>
                  {documentsLoaded ? (
                    `${documents.length} documents available`
                  ) : (
                    'Loading documents...'
                  )}
                </span>
              </span>
              <span>+2 XP per question</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                {getConnectionIcon()}
                <span className="text-xs">{getConnectionText()}</span>
              </div>
              <div className="text-purple-600 font-medium">
                Current XP: {profile?.xp_points || 0}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ChatBot;