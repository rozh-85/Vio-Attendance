/** Centralised route paths + builders so links never drift out of sync. */
export const paths = {
  dashboard: '/',
  // Admin sign-in lives at a non-obvious path so students never stumble onto
  // it. Everything else students might guess (/login, /register, unknown URLs)
  // falls through to the neutral NotFound page.
  admin: '/admin',
  session: (id: string) => `/session/${id}`,
  recover: '/recover',
  checkIn: (sessionId: string) => `/checkin/${sessionId}`,
  checkOut: (sessionId: string) => `/checkout/${sessionId}`,
} as const;

export const routePatterns = {
  dashboard: '/',
  admin: '/admin',
  session: '/session/:sessionId',
  recover: '/recover',
  checkIn: '/checkin/:sessionId',
  checkOut: '/checkout/:sessionId',
} as const;
