/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Soft Romantic Neumorphism, blue as the couple's favorite color: background and card
        // surface stay in the same soft powder-blue family (close in value, not high-contrast —
        // what lets a gentle shadow alone read as "raised" rather than needing a bold fill
        // change) with a dusty cornflower-blue accent for anything interactive. Semantic names
        // (blush/rose/ink/clay/cream) are unchanged so every existing className keeps working —
        // only the hex values moved from warm terracotta to this palette.
        blush: '#D9E6F8',
        rose: '#5B7FBE',
        ink: '#1F2A3C',
        clay: '#7186A3',
        cream: '#EAF1FB',
        // Reserved for a genuinely different signal than the primary accent — "you're
        // approaching a limit", never a form-validation error (those stay `rose`, unrelated
        // concern). A muted warm coral reads as "pay attention" without introducing a harsh red.
        warning: '#C97C6D',

        // Additive semantic layer for the modern-fintech Money redesign — sits alongside the
        // palette above rather than replacing it (every existing className keeps working
        // unchanged). `surface`/`border` give cards a flat, bordered look instead of a shadowed
        // tinted block; `textPrimary`/`textSecondary`/`textMuted` give a real 3-tier text
        // hierarchy; `success`/`error` are genuinely distinct signals from the softer `warning`
        // ("healthy" vs. "approaching a limit" vs. "over/overdue").
        surface: '#FFFFFF',
        border: '#DCE3EE',
        textPrimary: '#1F2A3C', // = ink
        textSecondary: '#7186A3', // = clay
        textMuted: '#9AA8BE',
        accent: '#5B7FBE', // = rose
        success: '#3FA66B',
        error: '#D14F45',
      },
    },
  },
  plugins: [],
};
