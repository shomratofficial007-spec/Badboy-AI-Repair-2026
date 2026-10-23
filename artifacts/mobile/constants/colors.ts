/**
 * Semantic design tokens for JARVIS-style AI Assistant.
 */

const colors = {
  light: {
    // Core surfaces
    background: '#090d16',
    foreground: '#e2f1f8',

    // Cards / elevated surfaces
    card: '#0f172a',
    cardForeground: '#e2f1f8',

    // Primary action color (Neon Cyan / JARVIS glow)
    primary: '#00e5ff',
    primaryForeground: '#050b14',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#1e293b',
    secondaryForeground: '#38bdf8',

    // Muted / subdued elements
    muted: '#1e293b',
    mutedForeground: '#94a3b8',

    // Accent highlights
    accent: '#0369a1',
    accentForeground: '#e0f2fe',

    // Destructive actions
    destructive: '#f43f5e',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#1e293b',
    input: '#334155',

    text: '#e2f1f8',
    tint: '#00e5ff',
  },

  dark: {
    text: '#e2f1f8',
    tint: '#00e5ff',
    background: '#050b14',
    foreground: '#e2f1f8',
    card: '#0c1626',
    cardForeground: '#e2f1f8',
    primary: '#00e5ff',
    primaryForeground: '#050b14',
    secondary: '#111e33',
    secondaryForeground: '#38bdf8',
    muted: '#17253d',
    mutedForeground: '#88a2c0',
    accent: '#0c3d5e',
    accentForeground: '#bae6fd',
    destructive: '#f43f5e',
    destructiveForeground: '#ffffff',
    border: '#1a2e4a',
    input: '#223c61',
  },

  radius: 18,
};

export default colors;
