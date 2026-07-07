/** Centralised route paths + builders so links never drift out of sync. */
export const paths = {
  dashboard: '/',
  login: '/login',
  session: (id: string) => `/session/${id}`,
  recover: '/recover',
  checkIn: (sessionId: string) => `/checkin/${sessionId}`,
  checkOut: (sessionId: string) => `/checkout/${sessionId}`,
} as const;

export const routePatterns = {
  dashboard: '/',
  login: '/login',
  session: '/session/:sessionId',
  recover: '/recover',
  checkIn: '/checkin/:sessionId',
  checkOut: '/checkout/:sessionId',
} as const;
