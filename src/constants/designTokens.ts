export const designTokens = {
  colors: {
    brand: {
      50: "#f4f8ff",
      100: "#e8f0ff",
      200: "#c8d9ff",
      300: "#9dbcff",
      400: "#6c9dff",
      500: "#4d84ff",
      600: "#2d6df5",
      700: "#1f55c8",
      800: "#1c46a1",
      900: "#183b81"
    },
    accent: {
      50: "#effcf9",
      100: "#c9f7ee",
      200: "#95f0df",
      300: "#5ce0cc",
      400: "#2dc8b4",
      500: "#16b6a6",
      600: "#0f8b82",
      700: "#0f6e6f",
      800: "#12595c",
      900: "#144b4f"
    },
    slate: {
      50: "#f8fafc",
      100: "#f1f5f9",
      200: "#e2e8f0",
      300: "#cbd5e1",
      400: "#94a3b8",
      500: "#64748b",
      600: "#475569",
      700: "#334155",
      800: "#1e293b",
      900: "#0f172a"
    },
    surface: {
      50: "#f9fbff",
      100: "#eef3ff",
      200: "#dfe8ff",
      300: "#c8d7ff",
      950: "#050816"
    },
    ink: {
      50: "#f4f7fb",
      100: "#e9eef6",
      200: "#cdd7e6",
      300: "#aab7d0",
      400: "#7f8faf",
      500: "#5a6c89",
      600: "#44556d",
      700: "#304155",
      800: "#1d2a3b",
      900: "#111827",
      950: "#050816"
    }
  },
  typography: {
    display: ["3.5rem", "3.75rem"],
    h1: ["2.5rem", "2.75rem"],
    h2: ["2rem", "2.25rem"],
    h3: ["1.5rem", "2rem"],
    h4: ["1.125rem", "1.5rem"],
    body: ["1rem", "1.5rem"],
    caption: ["0.875rem", "1.25rem"]
  },
  spacing: {
    18: "4.5rem",
    22: "5.5rem",
    24: "6rem"
  },
  radius: {
    sm: "0.5rem",
    md: "0.875rem",
    lg: "1.125rem",
    xl: "1.375rem",
    "2xl": "1.75rem",
    "3xl": "2rem"
  },
  shadows: {
    soft: "0 20px 45px -24px rgba(15, 23, 42, 0.45)",
    elevated: "0 25px 60px -24px rgba(77, 132, 255, 0.35)",
    glow: "0 0 0 1px rgba(255,255,255,0.06), 0 18px 60px -24px rgba(77,132,255,0.45)",
    panel: "0 10px 40px -24px rgba(2, 6, 23, 0.65)"
  },
  animation: {
    fast: "200ms ease",
    normal: "300ms ease",
    slow: "500ms ease"
  }
} as const;

export const typographyScale = designTokens.typography;
export const spacingScale = designTokens.spacing;
export const radiusScale = designTokens.radius;
export const shadowScale = designTokens.shadows;
