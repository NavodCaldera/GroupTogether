/** Fail before migration, seeding, app startup or truncation can touch valuable data. */
export function assertTestDatabase(testUrl, developmentUrl) {
  if (!testUrl) throw new Error("TEST_DATABASE_URL is required");
  const parse = (value) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Database URL must be a valid PostgreSQL URL (credentials omitted)");
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol))
      throw new Error("Database URL must use PostgreSQL");
    for (const key of url.searchParams.keys()) {
      if (!["sslmode", "application_name", "connect_timeout", "schema"].includes(key))
        throw new Error("Database URL query options must not override connection targets");
      if (key === "schema" && url.searchParams.get(key) !== "public")
        throw new Error("Test database schema must be public");
    }
    return url;
  };
  const test = parse(testUrl);
  const host = (url) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ? "loopback" : url.hostname;
  if (host(test) !== "loopback" || decodeURIComponent(test.pathname) !== "/groupbasket_test")
    throw new Error("Tests require the disposable loopback database groupbasket_test");
  if (developmentUrl) {
    const dev = parse(developmentUrl);
    if (
      host(dev) === host(test) &&
      (dev.port || "5432") === (test.port || "5432") &&
      decodeURIComponent(dev.pathname) === decodeURIComponent(test.pathname)
    )
      throw new Error("Test and development databases must be distinct, regardless of credentials");
  }
  return testUrl;
}
