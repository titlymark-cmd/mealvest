import React from "react";
import { COLORS } from "../styles/theme";
import { useGoogleAuth } from "../services/googleAuth";
import { Spinner } from "./Spinner";

interface Props {
  onIdToken: (idToken: string) => void;
  loading: boolean;
}

/**
 * Isolated into its own component so useGoogleAuth — which no-ops
 * when REACT_APP_GOOGLE_WEB_CLIENT_ID isn't set — only ever runs
 * when this component is actually mounted. Callers gate mounting on
 * isGoogleAuthConfigured() from services/googleAuth, matching the
 * original app's behavior exactly.
 *
 * Renders Google's own real button (via useGoogleAuth's buttonRef) —
 * see that hook's comment for why a custom-skinned button faking a
 * click on a hidden real one doesn't reliably work. `loading` (while
 * the ID token is being exchanged with our backend) overlays a
 * spinner on top of Google's button rather than replacing it, since
 * unmounting Google's button mid-flow would lose its click state.
 */
export function GoogleSignInButton({ onIdToken, loading }: Props) {
  const { ready, buttonRef } = useGoogleAuth(onIdToken);

  return (
    <div style={styles.wrap}>
      {!ready && <div style={styles.placeholder} />}
      <div ref={buttonRef} style={{ display: "flex", justifyContent: "center", visibility: ready ? "visible" : "hidden" }} />
      {loading && (
        <div style={styles.loadingOverlay}>
          <Spinner color={COLORS.primary} />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: "relative", width: "100%", minHeight: 44, display: "flex", justifyContent: "center" },
  placeholder: { position: "absolute", inset: 0, borderRadius: 999, backgroundColor: "rgba(252,244,234,0.06)" },
  loadingOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 999,
  },
};
