// counts tokens

// really dumb way to estimate tokens instantly. should get you in the ballpark.
export const countTokens = (text: string | undefined | null) => {
  if (!text || typeof text !== "string") {
    return 0;
  }
  const tokens = Math.round(text.length / 4.2);
  return tokens;
};
