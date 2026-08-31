import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { DataServiceProvider } from '@/services/data/context';
import { AuthProvider } from '@/services/auth/context';
import { RequireAuth } from '@/components/RequireAuth';
import { routePatterns } from '@/routes';
import { SupervisorDashboard } from '@/pages/SupervisorDashboard';
import { EmployeeReportPage } from '@/pages/EmployeeReportPage';
import { SharedDevicesPage } from '@/pages/SharedDevicesPage';
import { OwnerGate } from '@/components/OwnerGate';
import { SessionView } from '@/pages/SessionView';
import { CheckInPage } from '@/pages/CheckInPage';
import { CheckOutPage } from '@/pages/CheckOutPage';
import { RecoverCodePage } from '@/pages/RecoverCodePage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

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
            {/* Unlisted owner report: supervisor sign-in, then its own password. */}
            <Route
              path={routePatterns.devices}
              element={
                <RequireAuth>
                  <OwnerGate>
                    <SharedDevicesPage />
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

            {/* Everything else — /login, /register, and any unknown URL — shows
                the neutral employee page. It never reveals the admin login. */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </DataServiceProvider>
  );
}
