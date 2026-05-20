// Single shared Supabase client.
//
// URL + anon key come from Vite env vars (must be prefixed VITE_ to reach the
// browser bundle). The anon key is designed to be public; security comes from
// (a) Netlify password protection in front of the site, and (b) RLS policies
// in supabase/schema.sql.

import { createClient } from "@supabase/supabase-js";

const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Loud failure beats silent breakage — every storage call would error
  // with a confusing message otherwise.
  // eslint-disable-next-line no-console
  console.error(
    "[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
    "Set them in .env.local for dev, and in Netlify env vars for production."
  );
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false }, // we don't use Supabase Auth in this app
});

export default supabase;
