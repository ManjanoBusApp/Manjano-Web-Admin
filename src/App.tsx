import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/auth/Login";
import Dashboard from "./pages/dashboard/Dashboard";
import Schools from "./pages/schools/Schools";
import Students from "./pages/students/Students";
import Parents from "./pages/parents/Parents";
import RoutesPage from "./modules/routes/pages/RoutesPage";
import "react-phone-number-input/style.css";
import DashboardLayout from "./components/layout/DashboardLayout";
import DriverDashboard from "./pages/drivers/DriverDashboard";


export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>

        {/* LOGIN */}
        <Route
          path="/"
          element={!user ? <Login /> : <Navigate to="/dashboard" />}
        />

        {/* DASHBOARD */}
        <Route
          path="/dashboard"
          element={
            user ? (
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            ) : (
              <Navigate to="/" />
            )
          }
        />

        {/* SCHOOLS */}
        <Route
          path="/schools"
          element={
            user ? (
              <DashboardLayout>
                <Schools />
              </DashboardLayout>
            ) : (
              <Navigate to="/" />
            )
          }
        />

        {/* STUDENTS */}
        <Route
          path="/students"
          element={
            user ? (
              <DashboardLayout>
                <Students />
              </DashboardLayout>
            ) : (
              <Navigate to="/" />
            )
          }
        />

        {/* ROUTES */}
        <Route
          path="/routes"
          element={
            user ? (
              <DashboardLayout>
                <RoutesPage />
              </DashboardLayout>
            ) : (
              <Navigate to="/" />
            )
          }
        />

        {/* PARENTS */}
        <Route
          path="/parents"
          element={
            user ? (
              <DashboardLayout>
                <Parents />
              </DashboardLayout>
            ) : (
              <Navigate to="/" />
            )
          }
        />

           
        {/* DRIVER DASHBOARD */}
        <Route
          path="/driver-dashboard"
          element={
            user ? (
              <DashboardLayout>
                <DriverDashboard />
              </DashboardLayout>
            ) : (
              <Navigate to="/" />
            )
          }
        />

      </Routes>
    </BrowserRouter>
  );
}