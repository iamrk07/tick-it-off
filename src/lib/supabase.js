import { createClient } from '@supabase/supabase-js';

// Your Supabase project. Override with env vars when deploying elsewhere:
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// NOTE: the anon key is public by design (it's in every app using Supabase).
// Private data stays private because of Row Level Security rules in the DB.
// NEVER use the service_role key in this app.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://kjeifnglvjrzuyxuufpc.supabase.co';
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZWlmbmdsdmpyenV5eHV1ZnBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MDY1NDEsImV4cCI6MjEwNjE4MjU0MX0.2PYPs0QfVee0lFalzb_0VUueDpNzgagUsGoH9Icc5J0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
