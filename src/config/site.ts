// Rename the app in one place.
export const site = {
  name: "Splitter",
  tagline: "Drop the bills. Splitter settles it.",
  description:
    "Trips, parties, events, dinners, the flat. Drop in every bill, say who paid what in your own words, and Splitter works out a fair split for the whole group.",
  repoUrl: "https://github.com/Studio1-OSS/Splitter",
  studioUrl: "https://studio1hq.com",
  /** Nebius Token Factory (and its builder program). */
  nebiusUrl: "https://dub.sh/aistudio",
  defaultCurrency: "USD",
  /** Display name of the AI model (the model id itself is NEBIUS_MODEL on the server). */
  model: process.env.NEXT_PUBLIC_AI_MODEL_LABEL || "Qwen3.8",
} as const;
