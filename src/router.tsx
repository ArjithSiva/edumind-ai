import { Navigate } from "react-router-dom";
import { AuthedLayout, RedirectIfAuthed, RequireAuth } from "./components/guards";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Tutor from "./pages/Tutor";
import Quiz from "./pages/Quiz";
import Planner from "./pages/Planner";
import Progress from "./pages/Progress";
import Career from "./pages/Career";
import Assignments from "./pages/Assignments";
import Doubts from "./pages/Doubts";
import Settings from "./pages/Settings";

export const routers = [
  {
    path: "/login",
    name: "login",
    element: <RedirectIfAuthed><Login /></RedirectIfAuthed>,
  },
  {
    path: "/register",
    name: "register",
    element: <RedirectIfAuthed><Register /></RedirectIfAuthed>,
  },
  {
    path: "/onboarding",
    name: "onboarding",
    element: <RequireAuth><Onboarding /></RequireAuth>,
  },
  {
    path: "/",
    name: "dashboard",
    element: <AuthedLayout />,
    children: [
      { index: true, name: "dashboard", element: <Dashboard /> },
      { path: "tutor", name: "tutor", element: <Tutor /> },
      { path: "quiz", name: "quiz", element: <Quiz /> },
      { path: "planner", name: "planner", element: <Planner /> },
      { path: "progress", name: "progress", element: <Progress /> },
      { path: "career", name: "career", element: <Career /> },
      { path: "assignments", name: "assignments", element: <Assignments /> },
      { path: "doubts", name: "doubts", element: <Doubts /> },
      { path: "settings", name: "settings", element: <Settings /> },
    ],
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: <Navigate to="/" replace />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
