import type { GroupKind } from "./categories";

/** Group banner colours: strong two-stop gradients that carry white artwork and text. */
export const BANNER_COLORS = {
  ocean: { label: "Ocean", from: "#1d4ed8", to: "#0891b2" },
  indigo: { label: "Indigo", from: "#3730a3", to: "#6d28d9" },
  violet: { label: "Violet", from: "#6b21a8", to: "#c026d3" },
  magenta: { label: "Magenta", from: "#9d174d", to: "#e11d48" },
  coral: { label: "Coral", from: "#c2410c", to: "#f43f5e" },
  sunset: { label: "Sunset", from: "#c2410c", to: "#d97706" },
  emerald: { label: "Emerald", from: "#065f46", to: "#059669" },
  teal: { label: "Teal", from: "#115e59", to: "#0e7490" },
  forest: { label: "Forest", from: "#14532d", to: "#3f6212" },
  graphite: { label: "Graphite", from: "#18181b", to: "#3f3f46" },
} as const;

export type BannerColor = keyof typeof BANNER_COLORS;
export const BANNER_COLOR_KEYS = Object.keys(BANNER_COLORS) as [BannerColor, ...BannerColor[]];

/**
 * Banner artwork: motifs per group type first, then two patterns that suit anything.
 * Keys are stored on groups, so they stay fixed; only the labels and drawings change.
 */
export const BANNER_ART = {
  mountains: "Ridges",
  beach: "Horizon",
  confetti: "Burst",
  balloons: "Orbits",
  stage: "Spotlight",
  tickets: "Ticket",
  homes: "Skyline",
  dinner: "Table",
  waves: "Flow",
  shapes: "Grid",
} as const;

export type BannerArt = keyof typeof BANNER_ART;
export const BANNER_ART_KEYS = Object.keys(BANNER_ART) as [BannerArt, ...BannerArt[]];

/** What a new group of each type starts with. */
export const BANNER_DEFAULTS: Record<GroupKind, { color: BannerColor; art: BannerArt }> = {
  trip: { color: "ocean", art: "mountains" },
  party: { color: "violet", art: "confetti" },
  event: { color: "indigo", art: "stage" },
  home: { color: "emerald", art: "homes" },
  dinner: { color: "coral", art: "dinner" },
  other: { color: "graphite", art: "shapes" },
};

export const isBannerColor = (v: unknown): v is BannerColor => typeof v === "string" && v in BANNER_COLORS;
export const isBannerArt = (v: unknown): v is BannerArt => typeof v === "string" && v in BANNER_ART;
