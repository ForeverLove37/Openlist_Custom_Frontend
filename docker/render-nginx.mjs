import { readFile, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dockerDir = path.dirname(fileURLToPath(import.meta.url));
const templateFile = process.env.NGINX_TEMPLATE_PATH || path.join(dockerDir, "nginx.conf.template");
const outputFile = process.env.NGINX_CONFIG_PATH || "/tmp/openlist-drive-nginx.conf";

function parseUpstream(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OPENLIST_UPSTREAM must be a valid HTTP or HTTPS URL.");
  }

  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("OPENLIST_UPSTREAM must use http:// or https://.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("OPENLIST_UPSTREAM must be an origin without credentials, a path, a query, or a fragment.");
  }
  return { origin: url.origin, hostname: url.hostname };
}

function gatewayAddress(value) {
  if (isIP(value) !== 4) throw new Error("GATEWAY_LISTEN_ADDRESS must be an IPv4 address.");
  return value;
}

function gatewayPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("GATEWAY_PORT must be an integer between 1024 and 65535.");
  }
  return String(port);
}

async function resolverAddress() {
  const configured = process.env.NGINX_RESOLVER?.trim();
  if (configured) {
    if (!isIP(configured)) throw new Error("NGINX_RESOLVER must be an IP address.");
    return isIP(configured) === 6 ? `[${configured}]` : configured;
  }

  const resolvConf = await readFile("/etc/resolv.conf", "utf8");
  const address = resolvConf.match(/^nameserver\s+(\S+)/m)?.[1];
  if (!address || !isIP(address)) throw new Error("No usable DNS resolver was found in /etc/resolv.conf.");
  return isIP(address) === 6 ? `[${address}]` : address;
}

try {
  const upstream = parseUpstream(process.env.OPENLIST_UPSTREAM || "http://openlist:5244");
  const replacements = new Map([
    ["@@OPENLIST_UPSTREAM@@", upstream.origin],
    ["@@OPENLIST_UPSTREAM_HOST@@", upstream.hostname],
    ["@@GATEWAY_LISTEN_ADDRESS@@", gatewayAddress(process.env.GATEWAY_LISTEN_ADDRESS || "0.0.0.0")],
    ["@@GATEWAY_PORT@@", gatewayPort(process.env.GATEWAY_PORT || "8080")],
    ["@@DNS_RESOLVER@@", await resolverAddress()],
  ]);

  let config = await readFile(templateFile, "utf8");
  for (const [token, value] of replacements) config = config.replaceAll(token, value);
  if (config.includes("@@")) throw new Error("The generated Nginx configuration contains an unresolved token.");
  await writeFile(outputFile, config, { mode: 0o644 });
} catch (error) {
  console.error(`[entrypoint] ${error instanceof Error ? error.message : "Could not render the Nginx configuration."}`);
  process.exitCode = 1;
}
