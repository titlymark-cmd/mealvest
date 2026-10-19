import React, { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { COLORS, FONTS, RADIUS } from "../styles/theme";
import { uploadHotelImage } from "../services/hotelStaffApi";
import { compressImage } from "../utils/imageCompression";

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

export function ImageUploadField({
  authFetch,
  value,
  onChange,
  itemId,
  label = "Upload a photo",
  hidePreview = false,
  compact = false,
  tone = "cream",
}: {
  authFetch: AuthFetch;
  value: string;
  onChange: (url: string) => void;
  itemId?: string;
  label?: string;
  /** Skip rendering the built-in preview — for callers (like a menu item card) that already show the image elsewhere. */
  hidePreview?: boolean;
  /** Smaller trigger button, for use inside a tight card layout. */
  compact?: boolean;
  /** "dark" restyles the trigger as a raised espresso control for use on dark panels. Behaviour is identical. */
  tone?: "cream" | "dark";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dark = tone === "dark";

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPEG, PNG, or WebP images are allowed.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const url = await uploadHotelImage(authFetch, compressed, itemId);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      {value && !hidePreview ? (
        <div style={styles.previewWrap}>
          <img src={value} alt="" style={styles.preview} />
          <button type="button" onClick={() => onChange("")} style={styles.removeBtn} aria-label="Remove image">
            ×
          </button>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          ...(compact ? styles.uploadBtnCompact : styles.uploadBtn),
          ...(dark ? (compact ? styles.darkBtnCompact : styles.darkBtn) : null),
        }}
      >
        <UploadCloud size={compact ? (dark ? 16 : 12) : 14} color={dark ? COLORS.primaryLight : COLORS.primary} aria-hidden />
        <span
          style={{
            ...(compact ? styles.uploadBtnTextCompact : styles.uploadBtnText),
            ...(dark ? styles.darkText : null),
            ...(dark && compact ? { fontSize: 13 } : null),
          }}
        >
          {uploading ? "Uploading…" : value ? "Change photo" : label}
        </span>
      </button>

      {error && (
        <p role="alert" style={{ ...styles.errorText, ...(dark ? { color: "#FF7A5C" } : null) }}>
          {error}{" "}
          <button type="button" onClick={() => inputRef.current?.click()} style={{ ...styles.retryLink, ...(dark ? { color: COLORS.primaryLight } : null) }}>
            Try again
          </button>
        </p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  previewWrap: { position: "relative", marginBottom: 10 },
  preview: { width: "100%", height: 140, borderRadius: RADIUS.sm, objectFit: "cover", backgroundColor: COLORS.borderSoft, display: "block" },
  removeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(0,0,0,0.55)",
    color: "#fff",
    border: "none",
    fontSize: 16,
    lineHeight: "26px",
    cursor: "pointer",
  },
  uploadBtn: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    border: `1.5px dashed ${COLORS.borderSoft}`,
    borderRadius: RADIUS.sm,
    padding: "12px 14px",
    backgroundColor: "transparent",
    cursor: "pointer",
  },
  uploadBtnText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary },
  uploadBtnCompact: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: RADIUS.sm,
    padding: "6px 10px",
    backgroundColor: "transparent",
    cursor: "pointer",
  },
  darkBtn: { border: "1px solid var(--mv-hairline)", backgroundColor: "var(--mv-surface-dark-2)", boxShadow: "var(--neu-dark-raised-sm)" },
  darkBtnCompact: { border: "1px solid var(--mv-hairline)", backgroundColor: "var(--mv-surface-dark-2)", boxShadow: "var(--neu-dark-raised-sm)", minHeight: 44, padding: "0 16px", gap: 8 },
  darkText: { color: COLORS.textOnDark },
  uploadBtnTextCompact: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.primary },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.danger, marginTop: 8 },
  retryLink: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.primary, textDecoration: "underline", background: "none", border: "none", padding: 0, cursor: "pointer" },
};
