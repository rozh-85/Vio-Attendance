/** Centralised route paths + builders so links never drift out of sync. */
export const paths = {
  dashboard: '/',
  // Admin sign-in lives at a non-obvious path so employees never stumble onto
  // it. Everything else employees might guess (/login, /register, unknown URLs)
  // falls through to the neutral NotFound page.
  admin: '/VioAdmin',
  employees: '/employees',
  leave: '/leave',
  catalog: '/catalog',
  hr: '/hr',
  hrTab: (tab: string) => `/hr?tab=${encodeURIComponent(tab)}`,
  // Unlisted: the shared-phone report names suspected proxy check-ins, so it
  // is not in the sidebar and asks for the owner's password of its own.
  devices: '/rozhadmin',
  // Behind the same owner password: who checked in away from the work site.
  checkInLocations: '/rozhadmin/locations',
  // Behind the same owner password: the social media sellers' orders.
  socialOrders: '/rozhadmin/orders',
  socialOrder: (id: string) => `/rozhadmin/orders/${id}`,
  // Public, unlisted: where social media sellers sign in and add orders.
  sellerOrders: '/orders',
  session: (id: string) => `/session/${id}`,
  recover: '/recover',
  checkIn: (sessionId: string) => `/checkin/${sessionId}`,
  checkOut: (sessionId: string) => `/checkout/${sessionId}`,
} as const;

export const routePatterns = {
  dashboard: '/',
  admin: '/VioAdmin',
  employees: '/employees',
  leave: '/leave',
  catalog: '/catalog',
  hr: '/hr',
  devices: '/rozhadmin',
  checkInLocations: '/rozhadmin/locations',
  socialOrders: '/rozhadmin/orders',
  socialOrder: '/rozhadmin/orders/:orderId',
  sellerOrders: '/orders',
  session: '/session/:sessionId',
  recover: '/recover',
  checkIn: '/checkin/:sessionId',
  checkOut: '/checkout/:sessionId',
} as const;
