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
  // Who checked in away from the work site; in every supervisor's sidebar.
  checkInLocations: '/locations',
  // Behind the same owner password: the social media sellers' orders.
  socialOrders: '/rozhadmin/orders',
  socialOrder: (id: string) => `/rozhadmin/orders/${id}`,
  // Same owner password: profit on those orders, with its own pages for
  // the products and their costs, and for adding or changing a sponsor.
  profit: '/rozhadmin/profit',
  profitModels: '/rozhadmin/profit/models',
  profitAddProducts: '/rozhadmin/profit/models/add',
  profitNewSponsor: '/rozhadmin/profit/sponsors/new',
  profitSponsor: (id: string) => `/rozhadmin/profit/sponsors/${id}`,
  // Public, unlisted: where social media sellers sign in and add orders.
  sellerOrders: '/orders',
  sellerPlaces: '/orders/places',
  sellerPlace: (id: string) => `/orders/places/${id}`,
  gashbenReport: '/rozhadmin/gashben',
  gashbenPlaceReport: (id: string) => `/rozhadmin/gashben/${id}`,
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
  checkInLocations: '/locations',
  // Its old owner-only address, sent on to the new one.
  oldCheckInLocations: '/rozhadmin/locations',
  socialOrders: '/rozhadmin/orders',
  socialOrder: '/rozhadmin/orders/:orderId',
  profit: '/rozhadmin/profit',
  profitModels: '/rozhadmin/profit/models',
  profitAddProducts: '/rozhadmin/profit/models/add',
  // The page's first address, before prices joined the costs.
  oldProfitCosts: '/rozhadmin/profit/costs',
  // `new` for a new sponsor, else its id.
  profitSponsor: '/rozhadmin/profit/sponsors/:sponsorId',
  sellerOrders: '/orders',
  sellerPlaces: '/orders/places',
  sellerPlace: '/orders/places/:placeId',
  gashbenReport: '/rozhadmin/gashben',
  gashbenPlaceReport: '/rozhadmin/gashben/:placeId',
  session: '/session/:sessionId',
  recover: '/recover',
  checkIn: '/checkin/:sessionId',
  checkOut: '/checkout/:sessionId',
} as const;
