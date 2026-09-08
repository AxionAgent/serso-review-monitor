import type { Express } from "express";

/** OAuth is intentionally disabled for this deployment; local auth is handled by auth.login. */
export function registerOAuthRoutes(_app: Express) {
  return;
}
