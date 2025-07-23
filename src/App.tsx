import React, { useEffect, useState } from 'react';
import { MainLayout } from './components/MainLayout';
import { DataModelModal } from './components/DataModelModal';
import { useStore } from './store';
import { supabase } from './lib/supabase';
import { PasswordReset } from './components/PasswordReset';
import { UpdatePassword } from './components/UpdatePassword';

function App() {
  const { loadInitialData, user, signIn, signUp } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [isDataModelOpen, setIsDataModelOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [isPasswordUpdate, setIsPasswordUpdate] = useState(false);

  useEffect(() => {
    // Check if we're on the password reset route
    const isResetPasswordRoute = window.location.pathname === '/reset-password';
    setIsPasswordUpdate(isResetPasswordRoute);

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await loadInitialData();
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await loadInitialData();
      }
    });

    initializeAuth();

    return () => {
      subscription.unsubscribe();
    };
  }, [loadInitialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (isPasswordUpdate) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Update Your Password
          </h2>
          <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <UpdatePassword />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          {showPasswordReset ? (
            <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
              <PasswordReset onBack={() => setShowPasswordReset(false)} />
            </div>
          ) : (
            <>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                {isSignUp ? 'Create your account' : 'Sign in to your account'}
              </h2>

              <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                <form className="space-y-6" onSubmit={handleSubmit}>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                      Email address
                    </label>
                    <div className="mt-1">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Password
                    </label>
                    <div className="mt-1">
                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="text-red-600 text-sm">{error}</div>
                  )}

                  <div>
                    <button
                      type="submit"
                      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      {isSignUp ? 'Sign up' : 'Sign in'}
                    </button>
                  </div>

                  <div className="flex flex-col space-y-2 text-center text-sm">
                    <button
                      type="button"
                      onClick={() => setIsSignUp(!isSignUp)}
                      className="text-blue-600 hover:text-blue-500"
                    >
                      {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                    </button>

                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={() => setShowPasswordReset(true)}
                        className="text-blue-600 hover:text-blue-500"
                      >
                        Forgot your password?
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <MainLayout onOpenDataModel={() => setIsDataModelOpen(true)} />
      <DataModelModal
        isOpen={isDataModelOpen}
        onClose={() => setIsDataModelOpen(false)}
      />
    </>
  );
}

export default App;