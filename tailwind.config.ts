import type { Config } from "tailwindcss";
import sharedPreset from "./packages/shared/tailwind-preset";

/**
 * Hamza General Store — design tokens now live in the shared preset
 * (packages/shared/tailwind-preset.ts), consumed by both apps. This config adds
 * the content globs (including the shared package so its UI component classes are
 * not purged).
 */
const config: Config = {
  presets: [sharedPreset],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
    "./packages/shared/src/**/*.{ts,tsx}",
  ],
  plugins: [],
};

export default config;
