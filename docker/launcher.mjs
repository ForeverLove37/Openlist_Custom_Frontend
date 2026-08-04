import { spawn } from "node:child_process";

const services = [
  {
    name: "bff",
    command: process.execPath,
    args: ["/app/server.js"],
  },
  {
    name: "nginx",
    command: "/usr/sbin/nginx",
    args: ["-c", process.env.NGINX_CONFIG_PATH || "/tmp/openlist-drive-nginx.conf", "-g", "daemon off;"],
  },
];

const children = new Map();
let stopping = false;
let exitCode = 0;
let killTimer;

function signalChildren(signal) {
  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill(signal);
      } catch {
        // The process may have exited between the status check and kill().
      }
    }
  }
}

function beginShutdown(code, reason) {
  if (stopping) {
    signalChildren("SIGKILL");
    return;
  }

  stopping = true;
  exitCode = code;
  console.log(`[launcher] stopping services (${reason})`);
  signalChildren("SIGTERM");
  killTimer = setTimeout(() => signalChildren("SIGKILL"), 10_000);
}

for (const service of services) {
  const child = spawn(service.command, service.args, {
    cwd: "/app",
    env: process.env,
    stdio: "inherit",
  });
  children.set(service.name, child);
  console.log(`[launcher] started ${service.name} (pid ${child.pid})`);

  child.once("close", (code, signal) => {
    children.delete(service.name);
    const detail = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    console.log(`[launcher] ${service.name} exited with ${detail}`);

    if (!stopping) {
      beginShutdown(code === 0 ? 1 : (code ?? 1), `${service.name} exited`);
    }

    if (children.size === 0) {
      clearTimeout(killTimer);
      process.exit(exitCode);
    }
  });
}

process.on("SIGINT", () => beginShutdown(0, "SIGINT"));
process.on("SIGTERM", () => beginShutdown(0, "SIGTERM"));
