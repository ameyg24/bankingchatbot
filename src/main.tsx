import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { getEnv } from "./persist";

if (
  import.meta.env.DEV &&
  window.location.hostname === "127.0.0.1"
) {
  // Keep a single local origin
  const url = new URL(window.location.href);
  url.hostname = "localhost";
  window.location.replace(url.toString());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={getEnv("VITE_GOOGLE_CLIENT_ID") || ""}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>
);
