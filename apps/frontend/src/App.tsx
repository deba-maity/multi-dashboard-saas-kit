import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { Shell } from "./components/layout/Shell";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";

import { dashboards } from "./lib/dashboards";
import { isDemo } from "./lib/demo";

function DashboardRoute() {
  const { dashboardId } = useParams();
  if (!dashboards.some(({ id }) => id === dashboardId)) return <Navigate to="/dashboards/analytics" replace />;
  return <DashboardPage key={dashboardId} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={isDemo ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={isDemo ? <Outlet /> : <ProtectedRoute />}>
        <Route element={<Shell />}>
          <Route path="/" element={<Navigate to="/dashboards/analytics" replace />} />
          <Route path="/dashboards/:dashboardId" element={<DashboardRoute />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
