import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { DatabaseService } from '../services/supabase';
import { AIGradingService } from '../services/aiGrading';
import { 
  FileText, 
  Plus, 
  Play, 
  Clock, 
  Upload,
  CheckCircle,
  XCircle,
  Star,
  Edit3,
  Trash2,
  AlertCircle,
  Users,
  BarChart3,
  Camera,
  Image as ImageIcon,
  Brain,
  Eye,
  MessageSquare
} from 'lucide-react';

const SubjectiveTests = () => {
  const { user, profile, updateXP } = useAuth();
  const [tests, setTests] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
  const [showGradingModal, setShowGradingModal] = useState(false);
  const [currentTest, setCurrentTest] = useState(null);
  const [currentSubmission, setCurrentSubmission] = useState(null);
  const [selectedSubmissions, setSelectedSubmissions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  const [createForm, setCreateForm] = useState({
    title: '',
    document_id: '',
    time_limit: 60,
    questions: [
      {
        question: '',
        expectedAnswer: '',
        maxScore: 10
      }
    ]
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([
        loadTests(),
        loadDocuments(),
        profile?.role === 'teacher' && loadSubmissions()
      ]);
      setLoading(false);
    };
    fetchData();
  }, [profile]);

  const loadTests = async () => {
    try {
      const { data } = profile?.role === 'teacher' 
        ? await DatabaseService.getSubjectiveTests(user?.id)
        : await DatabaseService.getSubjectiveTests();
      
      if (data) {
        setTests(data);
      }
    } catch (error) {
      console.error('Error loading subjective tests:', error);
    }
  };

  const loadDocuments = async () => {
    try {
      const { data } = await DatabaseService.getDocuments();
      if (data) {
        setDocuments(data);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  const loadSubmissions = async () => {
    try {
      const { data } = await DatabaseService.getSubjectiveSubmissions();
      if (data) {
        setSubmissions(data);
      }
    } catch (error) {
      console.error('Error loading submissions:', error);
    }
  };

  const handleCreateTest = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await DatabaseService.createSubjectiveTest({
        ...createForm,
        created_by: user.id,
        document_id: createForm.document_id || null,
        max_score: createForm.questions.reduce((sum, q) => sum + q.maxScore, 0)
      });

      if (!error) {
        setShowCreateModal(false);
        resetCreateForm();
        await loadTests();
      }
    } catch (error) {
      console.error('Create test error:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetCreateForm = () => {
    setCreateForm({
      title: '',
      document_id: '',
      time_limit: 60,
      questions: [{
        question: '',
        expectedAnswer: '',
        maxScore: 10
      }]
    });
  };

  const addQuestion = () => {
    setCreateForm({
      ...createForm,
      questions: [...createForm.questions, {
        question: '',
        expectedAnswer: '',
        maxScore: 10
      }]
    });
  };

  const updateQuestion = (index, field, value) => {
    const updatedQuestions = [...createForm.questions];
    updatedQuestions[index] = {
      ...updatedQuestions[index],
      [field]: value
    };
    setCreateForm({
      ...createForm,
      questions: updatedQuestions
    });
  };

  const removeQuestion = (index) => {
    if (createForm.questions.length > 1) {
      const updatedQuestions = createForm.questions.filter((_, i) => i !== index);
      setCreateForm({
        ...createForm,
        questions: updatedQuestions
      });
    }
  };

  const startTest = (test) => {
    setCurrentTest(test);
    setCurrentQuestionIndex(0);
    setAnswers(test.questions.map(() => ({ imageUrl: null, text: '' })));
    setTimeRemaining(test.time_limit * 60); // Convert to seconds
    setShowTestModal(true);

    // Start timer
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          submitTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleImageUpload = async (file, questionIndex) => {
    try {
      const { data } = await DatabaseService.uploadAnswerImage(file);
      if (data) {
        const updatedAnswers = [...answers];
        updatedAnswers[questionIndex] = {
          ...updatedAnswers[questionIndex],
          imageUrl: data.url
        };
        setAnswers(updatedAnswers);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
    }
  };

  const submitTest = async () => {
    try {
      setLoading(true);
      
      const submissionData = {
        test_id: currentTest.id,
        user_id: user.id,
        answers: answers,
        status: 'submitted'
      };

      const { data } = await DatabaseService.submitSubjectiveTest(submissionData);
      
      if (data) {
        // Start AI grading
        await gradeSubmission(data);
        
        // Award XP
        await updateXP(15);
        
        setShowTestModal(false);
        setCurrentTest(null);
        setTimeRemaining(null);
      }
    } catch (error) {
      console.error('Error submitting test:', error);
    } finally {
      setLoading(false);
    }
  };

  const gradeSubmission = async (submission) => {
    try {
      const document = documents.find(d => d.id === currentTest.document_id);
      const documentContext = document ? `Document: ${document.title} - ${document.subject}` : '';

      let totalScore = 0;
      let feedback = '';

      for (let i = 0; i < submission.answers.length; i++) {
        const answer = submission.answers[i];
        const question = currentTest.questions[i];

        if (answer.imageUrl) {
          const result = await AIGradingService.gradeHandwrittenAnswer(
            answer.imageUrl,
            question.question,
            question.expectedAnswer,
            question.maxScore,
            documentContext
          );

          totalScore += result.score;
          feedback += `Q${i + 1}: ${result.feedback}\n\n`;
        }
      }

      const maxPossibleScore = currentTest.questions.reduce((sum, q) => sum + q.maxScore, 0);
      const percentage = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;

      // Update submission with AI grading
      await DatabaseService.updateSubjectiveSubmission(submission.id, {
        ai_score: percentage,
        ai_feedback: feedback,
        status: 'ai_graded',
        ai_graded_at: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error grading submission:', error);
    }
  };

  const viewSubmissions = async (test) => {
    try {
      const { data } = await DatabaseService.getSubjectiveSubmissions(test.id);
      if (data) {
        setSelectedSubmissions(data);
        setCurrentTest(test);
        setShowSubmissionsModal(true);
      }
    } catch (error) {
      console.error('Error loading test submissions:', error);
    }
  };

  const reviewSubmission = (submission) => {
    setCurrentSubmission(submission);
    setShowGradingModal(true);
  };

  const updateTeacherGrade = async (submissionId, teacherScore, teacherFeedback) => {
    try {
      await DatabaseService.updateSubjectiveSubmission(submissionId, {
        teacher_score: teacherScore,
        teacher_feedback: teacherFeedback,
        status: 'teacher_reviewed',
        teacher_reviewed_at: new Date().toISOString()
      });

      // Refresh submissions
      await loadSubmissions();
      setShowGradingModal(false);
      setCurrentSubmission(null);
    } catch (error) {
      console.error('Error updating teacher grade:', error);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDeleteTest = async (testId) => {
    setLoading(true);
    try {
      const { error } = await DatabaseService.deleteSubjectiveTest(testId);
      if (!error) {
        await loadTests();
        setDeleteConfirm(null);
      }
    } catch (error) {
      console.error('Delete test error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-8 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Subjective Tests</h1>
            <p className="text-gray-600 mt-2">
              {profile?.role === 'teacher' 
                ? 'Create and manage subjective tests with AI-powered grading'
                : 'Take subjective tests and upload handwritten answers'
              }
            </p>
          </div>
          {profile?.role === 'teacher' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-lg hover:from-purple-600 hover:to-pink-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
            >
              <Plus size={20} />
              <span>Create Test</span>
            </button>
          )}
        </div>

        {/* Stats for Students */}
        {profile?.role === 'student' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Available Tests</p>
                  <p className="text-2xl font-bold text-gray-800">{tests.length}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <FileText className="text-purple-600" size={24} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Completed</p>
                  <p className="text-2xl font-bold text-gray-800">3</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="text-green-600" size={24} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Average Score</p>
                  <p className="text-2xl font-bold text-gray-800">85%</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Star className="text-yellow-600" size={24} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">XP Earned</p>
                  <p className="text-2xl font-bold text-gray-800">45</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Brain className="text-blue-600" size={24} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tests Grid */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100">
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {profile?.role === 'teacher' ? 'Your Tests' : 'Available Tests'} ({tests.length})
            </h2>
            
            {loading && tests.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="ml-3 text-gray-600">Loading tests...</span>
              </div>
            ) : tests.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tests.map((test) => (
                  <div key={test.id} className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 border border-purple-100 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                        <FileText className="text-white" size={24} />
                      </div>
                      <div className="text-right">
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
                          {test.questions?.length || 0} questions
                        </span>
                      </div>
                    </div>
                    
                    <h3 className="font-bold text-gray-800 mb-2 truncate">{test.title}</h3>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <Clock size={14} className="mr-2" />
                        <span>{test.time_limit} minutes</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Star size={14} className="mr-2" />
                        <span>Max Score: {test.max_score}</span>
                      </div>
                      {test.document && (
                        <div className="flex items-center text-sm text-gray-600">
                          <FileText size={14} className="mr-2" />
                          <span>{test.document.subject}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      {profile?.role === 'student' ? (
                        <button
                          onClick={() => startTest(test)}
                          className="flex items-center space-x-2 bg-gradient-to-r from-green-500 to-teal-500 text-white px-4 py-2 rounded-lg hover:from-green-600 hover:to-teal-600 transition-all duration-200"
                        >
                          <Play size={16} />
                          <span>Start Test</span>
                        </button>
                      ) : (
                        <div className="flex space-x-2">
                          <button 
                            onClick={() => viewSubmissions(test)}
                            className="flex items-center space-x-1 text-purple-600 hover:text-purple-800 text-sm font-medium bg-purple-50 hover:bg-purple-100 px-3 py-2 rounded-lg transition-colors"
                          >
                            <Users size={14} />
                            <span>Submissions</span>
                          </button>
                          <button 
                            onClick={() => setDeleteConfirm(test.id)}
                            className="flex items-center space-x-1 text-red-600 hover:text-red-800 text-sm font-medium bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="mx-auto text-gray-300 mb-4" size={64} />
                <h3 className="text-xl font-medium text-gray-600 mb-2">No tests available</h3>
                <p className="text-gray-500 mb-6">
                  {profile?.role === 'teacher' 
                    ? 'Create your first subjective test to get started'
                    : 'Check back later for new tests'
                  }
                </p>
                {profile?.role === 'teacher' && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
                  >
                    Create Test
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Create Test Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Create Subjective Test</h2>
              
              <form onSubmit={handleCreateTest} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Test Title
                  </label>
                  <input
                    type="text"
                    value={createForm.title}
                    onChange={(e) => setCreateForm({...createForm, title: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Enter test title"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Based on Document (Optional)
                    </label>
                    <select
                      value={createForm.document_id}
                      onChange={(e) => setCreateForm({...createForm, document_id: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="">Select a document</option>
                      {documents.map(doc => (
                        <option key={doc.id} value={doc.id}>{doc.title}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Time Limit (minutes)
                    </label>
                    <input
                      type="number"
                      value={createForm.time_limit}
                      onChange={(e) => setCreateForm({...createForm, time_limit: parseInt(e.target.value)})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      min="10"
                      max="180"
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-medium text-gray-700">
                      Questions
                    </label>
                    <button
                      type="button"
                      onClick={addQuestion}
                      className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                    >
                      + Add Question
                    </button>
                  </div>

                  <div className="space-y-6">
                    {createForm.questions.map((question, qIndex) => (
                      <div key={qIndex} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                          <label className="block text-sm font-medium text-gray-700">
                            Question {qIndex + 1}
                          </label>
                          {createForm.questions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeQuestion(qIndex)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        
                        <div className="space-y-4">
                          <textarea
                            value={question.question}
                            onChange={(e) => updateQuestion(qIndex, 'question', e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            placeholder="Enter question"
                            rows="3"
                            required
                          />

                          <textarea
                            value={question.expectedAnswer}
                            onChange={(e) => updateQuestion(qIndex, 'expectedAnswer', e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            placeholder="Enter expected answer/rubric for AI grading"
                            rows="3"
                            required
                          />

                          <div className="w-32">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Max Score
                            </label>
                            <input
                              type="number"
                              value={question.maxScore}
                              onChange={(e) => updateQuestion(qIndex, 'maxScore', parseInt(e.target.value))}
                              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                              min="1"
                              max="100"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex space-x-4 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      resetCreateForm();
                    }}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 px-4 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create Test'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Test Taking Modal */}
        {showTestModal && currentTest && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">{currentTest.title}</h2>
                <div className="flex items-center space-x-4">
                  <div className="text-sm text-gray-600">
                    Question {currentQuestionIndex + 1} of {currentTest.questions.length}
                  </div>
                  {timeRemaining !== null && (
                    <div className={`text-sm font-bold ${timeRemaining < 300 ? 'text-red-600' : 'text-gray-600'}`}>
                      <Clock size={16} className="inline mr-1" />
                      {formatTime(timeRemaining)}
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((currentQuestionIndex + 1) / currentTest.questions.length) * 100}%` }}
                  ></div>
                </div>
              </div>

              <div className="mb-8">
                <h3 className="text-xl font-medium text-gray-800 mb-6">
                  {currentTest.questions[currentQuestionIndex].question}
                </h3>

                <div className="space-y-4">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    {answers[currentQuestionIndex]?.imageUrl ? (
                      <div className="space-y-4">
                        <img 
                          src={answers[currentQuestionIndex].imageUrl} 
                          alt="Answer" 
                          className="max-w-full h-auto mx-auto rounded-lg shadow-md"
                        />
                        <button
                          onClick={() => {
                            const updatedAnswers = [...answers];
                            updatedAnswers[currentQuestionIndex] = { imageUrl: null, text: '' };
                            setAnswers(updatedAnswers);
                          }}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Remove Image
                        </button>
                      </div>
                    ) : (
                      <div>
                        <ImageIcon className="mx-auto text-gray-400 mb-4" size={48} />
                        <p className="text-gray-600 mb-4">Upload your handwritten answer</p>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              handleImageUpload(file, currentQuestionIndex);
                            }
                          }}
                          className="hidden"
                          id={`image-upload-${currentQuestionIndex}`}
                        />
                        <label
                          htmlFor={`image-upload-${currentQuestionIndex}`}
                          className="inline-flex items-center space-x-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 cursor-pointer transition-colors"
                        >
                          <Upload size={16} />
                          <span>Choose Image</span>
                        </label>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Additional Notes (Optional)
                    </label>
                    <textarea
                      value={answers[currentQuestionIndex]?.text || ''}
                      onChange={(e) => {
                        const updatedAnswers = [...answers];
                        updatedAnswers[currentQuestionIndex] = {
                          ...updatedAnswers[currentQuestionIndex],
                          text: e.target.value
                        };
                        setAnswers(updatedAnswers);
                      }}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Add any additional notes or explanations..."
                      rows="3"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                  disabled={currentQuestionIndex === 0}
                  className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Previous
                </button>
                
                {currentQuestionIndex === currentTest.questions.length - 1 ? (
                  <button
                    onClick={submitTest}
                    disabled={loading}
                    className="bg-gradient-to-r from-green-500 to-teal-500 text-white px-6 py-3 rounded-lg hover:from-green-600 hover:to-teal-600 transition-all duration-200 disabled:opacity-50"
                  >
                    {loading ? 'Submitting...' : 'Submit Test'}
                  </button>
                ) : (
                  <button
                    onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
                  >
                    Next Question
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Submissions Modal */}
        {showSubmissionsModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Test Submissions</h2>
                <button
                  onClick={() => setShowSubmissionsModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {selectedSubmissions.map((submission) => (
                  <div key={submission.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-gray-800">{submission.user?.name}</h3>
                        <p className="text-sm text-gray-600">
                          Submitted: {new Date(submission.submitted_at).toLocaleString()}
                        </p>
                        <div className="flex items-center space-x-4 mt-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            submission.status === 'teacher_reviewed' ? 'bg-green-100 text-green-800' :
                            submission.status === 'ai_graded' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {submission.status.replace('_', ' ').toUpperCase()}
                          </span>
                          {submission.ai_score !== null && (
                            <span className="text-sm text-gray-600">
                              AI Score: {Math.round(submission.ai_score)}%
                            </span>
                          )}
                          {submission.teacher_score !== null && (
                            <span className="text-sm font-medium text-green-600">
                              Final Score: {Math.round(submission.teacher_score)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => reviewSubmission(submission)}
                        className="flex items-center space-x-2 bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors"
                      >
                        <Eye size={16} />
                        <span>Review</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Grading Modal */}
        {showGradingModal && currentSubmission && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Review Submission</h2>
                <button
                  onClick={() => setShowGradingModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="font-medium text-blue-800 mb-2">Student: {currentSubmission.user?.name}</h3>
                  <p className="text-blue-700 text-sm">
                    AI Score: {Math.round(currentSubmission.ai_score)}% | 
                    Status: {currentSubmission.status.replace('_', ' ')}
                  </p>
                </div>

                {currentSubmission.answers.map((answer, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-800 mb-3">
                      Question {index + 1}: {currentTest?.questions[index]?.question}
                    </h4>
                    
                    {answer.imageUrl && (
                      <div className="mb-4">
                        <img 
                          src={answer.imageUrl} 
                          alt={`Answer ${index + 1}`} 
                          className="max-w-full h-auto rounded-lg shadow-md"
                        />
                      </div>
                    )}
                    
                    {answer.text && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-600 mb-1">Additional Notes:</p>
                        <p className="text-gray-800">{answer.text}</p>
                      </div>
                    )}
                  </div>
                ))}

                {currentSubmission.ai_feedback && (
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <h4 className="font-medium text-yellow-800 mb-2">AI Feedback</h4>
                    <p className="text-yellow-700 whitespace-pre-wrap">{currentSubmission.ai_feedback}</p>
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-4">Teacher Review</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Final Score (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={currentSubmission.teacher_score || currentSubmission.ai_score}
                        className="w-32 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        id="teacher-score"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Teacher Feedback
                      </label>
                      <textarea
                        defaultValue={currentSubmission.teacher_feedback || ''}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        rows="4"
                        placeholder="Provide feedback to the student..."
                        id="teacher-feedback"
                      />
                    </div>
                    
                    <button
                      onClick={() => {
                        const score = document.getElementById('teacher-score').value;
                        const feedback = document.getElementById('teacher-feedback').value;
                        updateTeacherGrade(currentSubmission.id, parseFloat(score), feedback);
                      }}
                      className="bg-gradient-to-r from-green-500 to-teal-500 text-white px-6 py-3 rounded-lg hover:from-green-600 hover:to-teal-600 transition-all duration-200"
                    >
                      Save Review
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full">
              <div className="text-center">
                <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
                <h2 className="text-xl font-bold text-gray-800 mb-2">Delete Test</h2>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to delete this test? This action cannot be undone and will remove all submissions.
                </p>
                <div className="flex space-x-4">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteTest(deleteConfirm)}
                    disabled={loading}
                    className="flex-1 bg-red-500 text-white py-3 px-4 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default SubjectiveTests;