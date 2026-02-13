#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile, access, stat } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { homedir } from 'node:os';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');
const clientDir = join(distDir, 'client');
const pkg = JSON.parse(await readFile(resolve(__dirname, '..', 'package.json'), 'utf-8'));

// --- Argument parsing ---

const args = process.argv.slice(2);

function getArg(name, short) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` || (short && args[i] === `-${short}`)) {
      return args[i + 1] || true;
    }
    if (args[i].startsWith(`--${name}=`)) {
      return args[i].split('=')[1];
    }
  }
  return undefined;
}

const hasFlag = (name, short) => args.includes(`--${name}`) || (short && args.includes(`-${short}`));

if (hasFlag('help', 'h')) {
  console.log(`
Claude Session Dashboard v${pkg.version}

Usage: claude-dashboard [options]

Options:
  -p, --port <number>   Port to listen on (default: 3000)
  --host <hostname>     Host to bind to (default: localhost)
  -o, --open            Open browser after starting
  -v, --version         Show version number
  -h, --help            Show this help message
`);
  process.exit(0);
}

if (hasFlag('version', 'v')) {
  console.log(pkg.version);
  process.exit(0);
}

const port = Number(getArg('port', 'p')) || 3000;
const host = getArg('host') || 'localhost';
const shouldOpen = hasFlag('open', 'o');

// --- Pre-flight checks ---

const claudeDir = join(homedir(), '.claude');
try {
  await access(claudeDir);
} catch {
  console.warn(`\nWarning: ~/.claude directory not found. The dashboard may not show any sessions.\n`);
}

try {
  await access(join(distDir, 'server', 'server.js'));
} catch {
  console.error(`\nError: Built files not found at ${distDir}/server/server.js`);
  console.error('Run "npm run build" first, then try again.\n');
  process.exit(1);
}

// --- MIME types ---

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

// --- Server setup ---

process.env.NODE_ENV = 'production';

const serverModule = await import(join(distDir, 'server', 'server.js'));
const appServer = serverModule.default;

async function tryServeStatic(pathname) {
  const filePath = join(clientDir, pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(clientDir)) return null;

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return null;
    const content = await readFile(filePath);
    const ext = extname(filePath);
    return { content, contentType: MIME_TYPES[ext] || 'application/octet-stream' };
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);

    // Try static files first (client assets)
    const staticFile = await tryServeStatic(url.pathname);
    if (staticFile) {
      res.writeHead(200, {
        'Content-Type': staticFile.contentType,
        'Content-Length': staticFile.content.byteLength,
        'Cache-Control': url.pathname.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      res.end(staticFile.content);
      return;
    }

    // Build a standard Request from the Node.js request
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }

    const body = req.method !== 'GET' && req.method !== 'HEAD'
      ? await new Promise((resolve) => {
          const chunks = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', () => resolve(Buffer.concat(chunks)));
        })
      : undefined;

    const request = new Request(url.href, {
      method: req.method,
      headers,
      body,
      duplex: body ? 'half' : undefined,
    });

    // Delegate to the TanStack Start server
    const response = await appServer.fetch(request);

    // Write the response back
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));

    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); break; }
          res.write(value);
        }
      };
      await pump();
    } else {
      res.end();
    }
  } catch (err) {
    console.error('Request error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nError: Port ${port} is already in use.`);
    console.error(`Try a different port: claude-dashboard --port ${port + 1}\n`);
    process.exit(1);
  }
  console.error('Server error:', err);
  process.exit(1);
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}`;

  console.log(`
  Claude Session Dashboard v${pkg.version}
  Running at ${url}
  Reading sessions from ~/.claude

  Press Ctrl+C to stop
`);

  if (shouldOpen) {
    const cmd = process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
    exec(cmd, (err) => {
      if (err) console.log(`  Open ${url} in your browser`);
    });
  }
});
