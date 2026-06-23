/** The six pastel accent ramps from the reference design. */
export type Accent = "blue" | "teal" | "green" | "amber" | "coral" | "purple";

/** Tailwind classes for an accent's pastel tile + saturated icon color. */
export const ACCENT_TILE: Record<Accent, string> = {
  blue: "bg-blue-tile text-blue-icon",
  teal: "bg-teal-tile text-teal-icon",
  green: "bg-green-tile text-green-icon",
  amber: "bg-amber-tile text-amber-icon",
  coral: "bg-coral-tile text-coral-icon",
  purple: "bg-purple-tile text-purple-icon",
};

/** Raw hex for charts (which need literal colors, not classes). */
export const ACCENT_HEX: Record<Accent, { tile: string; icon: string; text: string }> = {
  blue: { tile: "#E7EEFC", icon: "#1863D5", text: "#0B5BBE" },
  teal: { tile: "#E0F2F8", icon: "#0E9BC0", text: "#0A7C99" },
  green: { tile: "#E7F6EA", icon: "#16A34A", text: "#076809" },
  amber: { tile: "#FCEFD9", icon: "#D97706", text: "#B45309" },
  coral: { tile: "#FCE9E7", icon: "#E2615B", text: "#B42318" },
  purple: { tile: "#F3E9FA", icon: "#7C3AED", text: "#6D28D9" },
};
