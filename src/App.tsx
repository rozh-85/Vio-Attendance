import { GashbenReportPage } from '@/pages/GashbenReportPage';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DataServiceProvider } from '@/services/data/context';
import { AuthProvider } from '@/services/auth/context';
import { RequireAuth } from '@/components/RequireAuth';
import { paths, routePatterns } from '@/routes';
import { SupervisorDashboard } from '@/pages/SupervisorDashboard';
import { EmployeeReportPage } from '@/pages/EmployeeReportPage';
import { SharedDevicesPage } from '@/pages/SharedDevicesPage';
import { CheckInLocationsPage } from '@/pages/CheckInLocationsPage';
import { SocialOrdersPage } from '@/pages/SocialOrdersPage';
import { OrderEditPage } from '@/pages/OrderEditPage';
import { ProfitPage } from '@/pages/ProfitPage';
import { ModelCostsPage } from '@/pages/ModelCostsPage';
import { SponsorPage } from '@/pages/SponsorPage';
import { SellerOrderPage } from '@/pages/SellerOrderPage';
import { OwnerGate } from '@/components/OwnerGate';
import { SessionView } from '@/pages/SessionView';
import { CheckInPage } from '@/pages/CheckInPage';
import { CheckOutPage } from '@/pages/CheckOutPage';
import { RecoverCodePage } from '@/pages/RecoverCodePage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LeaveManagementPage } from '@/pages/LeaveManagementPage';
import { CatalogManagementPage } from '@/pages/CatalogManagementPage';
import { HrManagementPage } from '@/pages/HrManagementPage';

export default function App() {
  return (
    <DataServiceProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Supervisor-only — gated behind sign in. */}
            <Route
              path={routePatterns.dashboard}
              element={
                <RequireAuth>
                  <SupervisorDashboard />
                </RequireAuth>
              }
            />
            <Route
              path={routePatterns.employees}
              element={
                <RequireAuth>
                  <EmployeeReportPage />
                </RequireAuth>
              }
            />
            <Route
              path={routePatterns.leave}
              element={
                <RequireAuth>
                  <LeaveManagementPage />
                </RequireAuth>
              }
            />
            <Route
              path={routePatterns.catalog}
              element={
                <RequireAuth>
                  <CatalogManagementPage />
                </RequireAuth>
              }
            />
            <Route
              path={routePatterns.hr}
              element={
                <RequireAuth>
                  <HrManagementPage />
                </RequireAuth>
              }
            />
            {/* Unlisted owner report: supervisor sign-in, then its own password.
                The owner signs in here, so that lands on the dashboard. */}
            <Route
              path={routePatterns.devices}
              element={
                <RequireAuth>
                  <OwnerGate landOn={paths.dashboard}>
                    <SharedDevicesPage />
                  </OwnerGate>
                </RequireAuth>
              }
            />
            {/* Who checked in away from the work site: any supervisor. */}
            <Route
              path={routePatterns.checkInLocations}
              element={
                <RequireAuth>
                  <CheckInLocationsPage />
                </RequireAuth>
              }
            />
            <Route
              path={routePatterns.oldCheckInLocations}
              element={<Navigate to={paths.checkInLocations} replace />}
            />
            {/* Same owner password: the social media sellers' orders. */}
            <Route
              path={routePatterns.socialOrders}
              element={
                <RequireAuth>
                  <OwnerGate title="Social media orders">
                    <SocialOrdersPage />
                  </OwnerGate>
                </RequireAuth>
              }
            />
            <Route path={routePatterns.gashbenReport} element={<RequireAuth><OwnerGate title="Gashben places report"><GashbenReportPage /></OwnerGate></RequireAuth>} />
            <Route path={routePatterns.gashbenPlaceReport} element={<RequireAuth><OwnerGate title="Gashben places report"><GashbenReportPage /></OwnerGate></RequireAuth>} />
            {/* One order on its own page, opened from the orders report. */}
            <Route
              path={routePatterns.socialOrder}
              element={
                <RequireAuth>
                  <OwnerGate title="Social media orders">
                    <OrderEditPage />
                  </OwnerGate>
                </RequireAuth>
              }
            />
            {/* Profit on the social media orders: its own pages, same owner password. */}
            <Route
              path={routePatterns.profit}
              element={
                <RequireAuth>
                  <OwnerGate title="Profit">
                    <ProfitPage />
                  </OwnerGate>
                </RequireAuth>
              }
            />
            <Route
              path={routePatterns.profitCosts}
              element={
                <RequireAuth>
                  <OwnerGate title="Profit">
                    <ModelCostsPage />
                  </OwnerGate>
                </RequireAuth>
              }
            />
            <Route
              path={routePatterns.profitSponsor}
              element={
                <RequireAuth>
                  <OwnerGate title="Profit">
                    <SponsorPage />
                  </OwnerGate>
                </RequireAuth>
              }
            />
            <Route
              path={routePatterns.session}
              element={
                <RequireAuth>
                  <SessionView />
                </RequireAuth>
              }
            />

            {/* Admin sign-in lives at the non-obvious /admin path. */}
            <Route path={routePatterns.admin} element={<LoginPage />} />

            {/* Public — employee-facing only. */}
            <Route path={routePatterns.recover} element={<RecoverCodePage />} />
            <Route path={routePatterns.checkIn} element={<CheckInPage />} />
            <Route path={routePatterns.checkOut} element={<CheckOutPage />} />
            {/* Social media sellers: their own sign-in, add-only. */}
            <Route path={routePatterns.sellerOrders} element={<SellerOrderPage />} />
            <Route path={routePatterns.sellerPlaces} element={<SellerOrderPage />} />
            <Route path={routePatterns.sellerPlace} element={<SellerOrderPage />} />

            {/* Everything else — /login, /register, and any unknown URL — shows
                the neutral employee page. It never reveals the admin login. */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </DataServiceProvider>
  );
}
