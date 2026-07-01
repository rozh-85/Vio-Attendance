import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { DataServiceProvider } from '@/services/data/context';
import { routePatterns } from '@/routes';
import { LecturerDashboard } from '@/pages/LecturerDashboard';
import { SessionView } from '@/pages/SessionView';
import { RegisterPage } from '@/pages/RegisterPage';
import { CheckInPage } from '@/pages/CheckInPage';
import { CheckOutPage } from '@/pages/CheckOutPage';
import { RecoverCodePage } from '@/pages/RecoverCodePage';

export default function App() {
  return (
    <DataServiceProvider>
      <BrowserRouter>
        <Routes>
          <Route path={routePatterns.dashboard} element={<LecturerDashboard />} />
          <Route path={routePatterns.session} element={<SessionView />} />
          <Route path={routePatterns.register} element={<RegisterPage />} />
          <Route path={routePatterns.recover} element={<RecoverCodePage />} />
          <Route path={routePatterns.checkIn} element={<CheckInPage />} />
          <Route path={routePatterns.checkOut} element={<CheckOutPage />} />
          <Route path="*" element={<LecturerDashboard />} />
        </Routes>
      </BrowserRouter>
    </DataServiceProvider>
  );
}
