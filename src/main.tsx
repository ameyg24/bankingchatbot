import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { getEnv } from "./persist";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={getEnv("VITE_GOOGLE_CLIENT_ID") || ""}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>
);
