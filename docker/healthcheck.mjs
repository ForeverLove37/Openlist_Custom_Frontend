const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 4_000);
const port = Number(process.env.GATEWAY_PORT || 8080);

try {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid gateway port.");
  const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: controller.signal });
  if (!response.ok) process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
