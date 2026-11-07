/** Absolute URL on this site, from APP_URL. */
export function appUrl(path = "") {
  return `${(process.env.APP_URL || "http://localhost:3002").replace(/\/$/, "")}${path}`;
}
