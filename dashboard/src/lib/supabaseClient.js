import { createClient } from '@supabase/supabase-js';

const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const envSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let runtimeConfig = {
  supabaseUrl: envSupabaseUrl,
  supabaseAnonKey: envSupabaseAnonKey,
};

let supabaseClient = null;

export const hasSupabaseConfig = () =>
  Boolean(runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey);

export const configureSupabase = ({ supabaseUrl, supabaseAnonKey }) => {
  runtimeConfig = {
    supabaseUrl: supabaseUrl || '',
    supabaseAnonKey: supabaseAnonKey || '',
  };
  if (hasSupabaseConfig()) {
    supabaseClient = createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  } else {
    supabaseClient = null;
  }
  return supabaseClient;
};

export const getSupabase = () => {
  if (supabaseClient) return supabaseClient;
  if (hasSupabaseConfig()) {
    supabaseClient = createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return supabaseClient;
};
