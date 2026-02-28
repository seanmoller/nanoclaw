/**
 * TCP proxy: 0.0.0.0:11234 -> 127.0.0.1:1234
 * Exposes LM Studio (localhost-only) to Apple Container VMs.
 * Run with: node scripts/lm-studio-proxy.mjs
 */

import net from 'net';

const LISTEN_PORT = 11234;
const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = 1234;

const server = net.createServer((client) => {
  const target = net.connect(TARGET_PORT, TARGET_HOST, () => {
    client.pipe(target);
    target.pipe(client);
  });
  target.on('error', () => client.destroy());
  client.on('error', () => target.destroy());
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`LM Studio proxy: 0.0.0.0:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`);
});
