import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DataServiceProvider } from '@/services/data/context';
import { AuthProvider } from '@/services/auth/context';
import { RequireAuth } from '@/components/RequireAuth';
import { routePatterns } from '@/routes';
import { LecturerDashboard } from '@/pages/LecturerDashboard';
import { SessionView } from '@/pages/SessionView';
import { RegisterPage } from '@/pages/RegisterPage';
import { CheckInPage } from '@/pages/CheckInPage';
import { CheckOutPage } from '@/pages/CheckOutPage';
import { RecoverCodePage } from '@/pages/RecoverCodePage';
import { LoginPage } from '@/pages/LoginPage';

export default function App() {
  return (
    <DataServiceProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Lecturer-only — gated behind sign in. */}
            <Route
              path={routePatterns.dashboard}
              element={
                <RequireAuth>
                  <LecturerDashboard />
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

            {/* Public — student-facing + the lecturer login screen. */}
            <Route path={routePatterns.login} element={<LoginPage />} />
            <Route path={routePatterns.register} element={<RegisterPage />} />
            <Route path={routePatterns.recover} element={<RecoverCodePage />} />
            <Route path={routePatterns.checkIn} element={<CheckInPage />} />
            <Route path={routePatterns.checkOut} element={<CheckOutPage />} />

            {/* Unknown paths → dashboard, which itself redirects to login if needed. */}
            <Route
              path="*"
              element={<Navigate to={routePatterns.dashboard} replace />}
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </DataServiceProvider>
  );
}
