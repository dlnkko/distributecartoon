export const CANONICAL_HOST = "clickframes.app";
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

const ALIAS_HOSTS = new Set([
  "distribute.to",
  "www.distribute.to",
  "distributecartoon.vercel.app",
]);

export function isAliasHost(hostname: string) {
  const host = hostname.split(",")[0]?.split(":")[0]?.trim().toLowerCase() || "";
  return ALIAS_HOSTS.has(host);
}
