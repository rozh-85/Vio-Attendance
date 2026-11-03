import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * What Supabase answers when a sign-in token is a moment "too new" for it:
 * after the app has been in the background the token is refreshed, and the
 * clock of the server that checks it can sit a second or two behind the one
 * that issued it — "JWT issued at future". Waiting a moment fixes it, which is
 * why "Try again" always worked.
 */
const TOKEN_TOO_NEW = /issued at future|"iat" claim|iat.*in the past|jwt not active|token used before issued/i;

/** Wait and send again: 0.6s, 1.2s, 1.8s, 2.4s — about six seconds in all. */
const RETRY_DELAYS = [600, 1200, 1800, 2400];

/**
 * A fetch that sends a request again, after a short wait, when the only thing
 * wrong was that the sign-in token was a moment too new. Anything else comes
 * back untouched on the first try.
 */
export function retryWhenTokenTooNew(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      // A Request object can only be sent once; send a copy each time.
      const response = await base(input instanceof Request ? input.clone() : input, init);
      if (attempt >= RETRY_DELAYS.length || ![400, 401, 403].includes(response.status)) return response;
      const body = await response
        .clone()
        .text()
        .catch(() => '');
      if (!TOKEN_TOO_NEW.test(body)) return response;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
      if (init?.signal?.aborted) return response;
    }
  };
}

/**
 * Lazily-created Supabase client. Returns null when credentials are absent, so
 * the app can fall back to the local backend without crashing.
 */
let cached: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  cached = url && key ? createClient(url, key, { global: { fetch: retryWhenTokenTooNew((...args) => fetch(...args)) } }) : null;
  return cached;
}
