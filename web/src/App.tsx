import React from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { RootGate } from "./routes/RootGate";

/**
 * Web port of the original App.tsx: AuthProvider + a router, wrapping
 * RootGate (the web port of RootNavigator). The original also gated
 * rendering on Poppins fonts loading (useFonts from
 * @expo-google-fonts/poppins, required on native or the app would
 * render with no font at all); on web the fonts are loaded via a CSS
 * @font-face import (styles/fonts.css) which the browser handles
 * progressively, so that gate isn't needed here.
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RootGate />
      </BrowserRouter>
    </AuthProvider>
  );
}
