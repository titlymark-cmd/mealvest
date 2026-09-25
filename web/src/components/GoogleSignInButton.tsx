import React from "react";
import { COLORS, FONTS, RADIUS } from "../styles/theme";
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
 */
export function GoogleSignInButton({ onIdToken, loading }: Props) {
  const { ready, promptAsync, hiddenButtonRef } = useGoogleAuth(onIdToken);

  return (
    <>
      {/* Google's own rendered button, kept off-screen — see
          services/googleAuth.ts for why this exists instead of
          calling accounts.id.prompt() directly. */}
      <div ref={hiddenButtonRef} style={{ position: "absolute", top: -9999, left: -9999, opacity: 0 }} />
      <button style={styles.googleButton} disabled={!ready || loading} onClick={() => promptAsync()}>
        {loading ? <Spinner color={COLORS.primary} /> : <span style={styles.googleButtonText}>Continue with Google</span>}
      </button>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  googleButton: {
    backgroundColor: "#fff",
    borderRadius: RADIUS.md,
    border: `1px solid ${COLORS.border}`,
    paddingTop: 14,
    paddingBottom: 14,
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  googleButtonText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 15, color: COLORS.text },
};
