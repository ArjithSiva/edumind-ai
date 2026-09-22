/**
 * Route guards for EduMind, ported from the original client/src/App.jsx.
 *
 * Kept out of router.tsx so that file stays a pure route table (which also
 * keeps react-refresh happy, since it exports non-component values).
 */
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "./Layout";

function Booting() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", gap: 14 }}>
      <span className="spinner" style={{ width: 26, height: 26, color: "var(--brand)" }} />
      <p className="muted" style={{ fontSize: 13 }}>Loading EduMind…</p>
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Booting />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Booting />;
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

/** The signed-in shell: sidebar + centred .view, with pages via Layout's Outlet. */
export function AuthedLayout() {
  return (
    <RequireAuth>
      <Layout />
    </RequireAuth>
  );
}
