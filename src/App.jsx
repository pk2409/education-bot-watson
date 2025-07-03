import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import DocumentHub from './pages/DocumentHub';
import QuizCenter from './pages/QuizCenter';
import ChatBot from './pages/ChatBot';
import Profile from './pages/Profile';
import TestScreen from './pages/TestScreen';

function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/test" element={<TestScreen />} />
          
          <Route path="/student" element={
            <ProtectedRoute requiredRole="student">
              <StudentDashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/teacher" element={
            <ProtectedRoute requiredRole="teacher">
              <TeacherDashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/documents" element={
            <ProtectedRoute requiredRole="teacher">
              <DocumentHub />
            </ProtectedRoute>
          } />
          
          <Route path="/quizzes" element={
            <ProtectedRoute>
              <QuizCenter />
            </ProtectedRoute>
          } />
          
          <Route path="/chat" element={
            <ProtectedRoute requiredRole="student">
              <ChatBot />
            </ProtectedRoute>
          } />
          
          <Route path="/profile" element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } />
          
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}

export default App;