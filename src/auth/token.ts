// Figma auth (plan §5): PAT from env var, injected by the MCP client's env config.

const ENV_VAR = "DESIGN_DIFF_FIGMA_TOKEN";

/** Read the Figma personal access token from the environment. */
export function getFigmaToken(): string {
  const token = process.env[ENV_VAR];
  if (!token || token.trim().length === 0) {
    throw new Error(
      `Missing Figma token. Set the ${ENV_VAR} environment variable in your MCP client config.`
    );
  }
  return token.trim();
}
