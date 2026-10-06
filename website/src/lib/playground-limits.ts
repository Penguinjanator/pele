export const playgroundLimits = Object.freeze({
  source: 100_000,
  hash: 400_000,
});

export const maxHighlightLineLength = 2_000;

export const playgroundSizeError = `Source is too large. The limit is ${playgroundLimits.source.toLocaleString()} characters.`;
