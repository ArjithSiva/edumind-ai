import axios from "axios";
import { SUPABASE_URL } from "./integrations/supabase/client";

/**
 * The API now runs as a single backend function that reproduces the old
 * Express router at the same /api/... paths, so every call site below is
 * unchanged. baseURL stops at /functions/v1 so the existing "/api/..." paths
 * in the pages resolve to <functions>/v1/api/... exactly as before.
 */
const baseURL = `${SUPABASE_URL}/functions/v1`;

export const api = axios.create({ baseURL, timeout: 45000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("edumind-token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const model = localStorage.getItem("edumind-ai-model");
  if (model) config.headers["X-AI-Model"] = model;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // A 401 anywhere means the token is dead — clear it and bounce to login.
    if (err.response?.status === 401 && !err.config.url.includes("/auth/login")) {
      localStorage.removeItem("edumind-token");
      if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

/** Pull a readable message out of any axios failure. */
export function errMsg(err, fallback = "Something went wrong. Try again.") {
  if (err?.code === "ECONNABORTED") return "The server took too long to answer. Try once more.";
  if (err?.message === "Network Error") return "Can't reach the server. Check your connection and try again.";
  return err?.response?.data?.message || fallback;
}
