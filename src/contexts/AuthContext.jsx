import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;
    let initTimeout;

    const initializeAuth = async () => {
      try {
        console.log('Initializing auth...');
        
        // Check for mock user first (for testing)
        const mockUser = localStorage.getItem('mockUser');
        const mockProfile = localStorage.getItem('mockProfile');
        
        if (mockUser && mockProfile) {
          console.log('Using mock user data');
          if (mounted) {
            setUser(JSON.parse(mockUser));
            setProfile(JSON.parse(mockProfile));
            setLoading(false);
            setInitialized(true);
          }
          return;
        }

        // For testing purposes, if no mock data and no real auth, 
        // allow access with minimal profile
        if (mounted) {
          setUser(null);
          setProfile(null);
          setLoading(false);
          setInitialized(true);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        if (mounted) {
          setLoading(false);
          setInitialized(true);
          setUser(null);
          setProfile(null);
        }
      }
    };

    // Set a maximum initialization time
    const maxInitTime = setTimeout(() => {
      if (mounted && !initialized) {
        console.warn('Auth initialization taking too long, forcing completion');
        setLoading(false);
        setInitialized(true);
      }
    }, 3000); // Reduced timeout for testing

    initializeAuth();

    return () => {
      mounted = false;
      if (initTimeout) clearTimeout(initTimeout);
      if (maxInitTime) clearTimeout(maxInitTime);
    };
  }, [initialized]);

  const signOut = async () => {
    console.log('Signing out...');
    setLoading(true);
    
    try {
      // Clear mock data
      localStorage.removeItem('mockUser');
      localStorage.removeItem('mockProfile');
      
      setUser(null);
      setProfile(null);
      
      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      return { error };
    } finally {
      setLoading(false);
    }
  };

  const updateXP = async (points) => {
    if (!profile) return;

    try {
      const newXP = profile.xp_points + points;
      
      // Handle mock users
      if (localStorage.getItem('mockUser')) {
        const updatedProfile = { ...profile, xp_points: newXP };
        localStorage.setItem('mockProfile', JSON.stringify(updatedProfile));
        setProfile(updatedProfile);
        checkBadgeProgress(newXP);
        return;
      }
    } catch (error) {
      console.error('Error updating XP:', error);
    }
  };

  const checkBadgeProgress = async (xp) => {
    const newBadges = [];
    
    if (xp >= 100 && !profile.badges.includes('first-hundred')) {
      newBadges.push('first-hundred');
    }
    if (xp >= 500 && !profile.badges.includes('xp-master')) {
      newBadges.push('xp-master');
    }

    if (newBadges.length > 0) {
      const updatedBadges = [...profile.badges, ...newBadges];
      
      // Handle mock users
      if (localStorage.getItem('mockUser')) {
        const updatedProfile = { ...profile, badges: updatedBadges };
        localStorage.setItem('mockProfile', JSON.stringify(updatedProfile));
        setProfile(updatedProfile);
        return;
      }
    }
  };

  const value = {
    user,
    profile,
    loading,
    signOut,
    updateXP
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};