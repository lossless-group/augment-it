import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Get the current site URL
const siteUrl = window.location.origin;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: window.localStorage,
    storageKey: 'supabase.auth.token',
    debug: import.meta.env.DEV,
    // Set the site URL for redirects
    redirectTo: `${siteUrl}/reset-password`
  },
  realtime: {
    params: {
      eventsPerSecond: 2
    }
  }
});

// Add auth state change listener for debugging
supabase.auth.onAuthStateChange((event, session) => {
  console.debug('Auth state changed:', event, session?.user?.email);
});