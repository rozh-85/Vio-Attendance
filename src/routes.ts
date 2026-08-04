/** Centralised route paths + builders so links never drift out of sync. */
export const paths = {
  dashboard: '/',
  // Admin sign-in lives at a non-obvious path so students never stumble onto
  // it. Everything else students might guess (/login, /register, unknown URLs)
  // falls through to the neutral NotFound page.
  admin: '/admin01',
  students: '/students',
  // Unlisted: the shared-phone report names suspected proxy check-ins, so it
  // is not in the sidebar and asks for the owner's password of its own.
  devices: '/rozhadmin',
  session: (id: string) => `/session/${id}`,
  recover: '/recover',
  checkIn: (sessionId: string) => `/checkin/${sessionId}`,
  checkOut: (sessionId: string) => `/checkout/${sessionId}`,
} as const;

export const routePatterns = {
  dashboard: '/',
  admin: '/admin01',
  students: '/students',
  devices: '/rozhadmin',
  session: '/session/:sessionId',
  recover: '/recover',
  checkIn: '/checkin/:sessionId',
  checkOut: '/checkout/:sessionId',
} as const;
