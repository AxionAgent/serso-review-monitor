export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/** Local authentication is handled by the Admin login form using admin:admin. */
export const startLogin = () => {
  if (typeof window !== "undefined") window.location.assign("/admin");
};
