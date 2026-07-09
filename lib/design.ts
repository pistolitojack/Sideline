// Design tokens lifted from sideline-prototype-v3.jsx — the single source of truth
// for the app's look. The accent color becomes dynamic (per coach) in Phase 2.

export const SYS =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif";

export const BASE = {
  paper: "#F6F5F2",
  card: "#FFFFFF",
  ink: "#1A1915",
  muted: "#8A867C",
  faint: "#E8E6E0",
  good: "#1E7F4F",
};

export type Accent = { name: string; a: string; d: string };

export const ACCENTS: Accent[] = [
  { name: "Signal Red", a: "#C8102E", d: "#7E0A1D" },
  { name: "Court Blue", a: "#1D4FD7", d: "#122F84" },
  { name: "Turf Green", a: "#0E7C4A", d: "#08522F" },
  { name: "Heat Orange", a: "#E35311", d: "#93330A" },
];

export const TYPE_COLORS: Record<string, string> = {
  Montage: "#0E7C4A",
  Teaching: "#C8102E",
  Hype: "#D97706",
  Story: "#8A4FBF",
  "Behind the scenes": "#3B5BDB",
};
