import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { SessionProvider, useSession } from './hooks/useSession.js';
import { BlotterPage } from './pages/BlotterPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { PlannedPage } from './pages/PlannedPage.js';
import { PortfolioPage } from './pages/PortfolioPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { TradePage } from './pages/TradePage.js';

const RequireSession = ({ children }: { children: ReactNode }) => {
  const { me, loading } = useSession();
  if (loading) return <p className="muted center">Loading…</p>;
  return me ? <>{children}</> : <Navigate to="/login" replace />;
};

export const App = () => (
  <SessionProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          element={
            <RequireSession>
              <Layout />
            </RequireSession>
          }
        >
          <Route path="/trade" element={<TradePage />} />
          <Route path="/orders" element={<BlotterPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/planned/:section" element={<PlannedPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/trade" replace />} />
      </Routes>
    </BrowserRouter>
  </SessionProvider>
);
