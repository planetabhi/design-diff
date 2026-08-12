const ENV_VAR = "DESIGN_DIFF_FIGMA_TOKEN";

export function getFigmaToken(): string {
  const token = process.env[ENV_VAR];
  if (!token || token.trim().length === 0) {
    throw new Error(
      `Missing Figma token. Set ${ENV_VAR} to a Figma personal access token (Figma → Settings → Security), or use --png instead.`
    );
  }
  return token.trim();
}
