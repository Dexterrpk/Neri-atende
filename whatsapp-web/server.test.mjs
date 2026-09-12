import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createService, normalizePhone } from './server.mjs';

async function fixture(t, overrides = {}) {
  const authRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'atende-whatsapp-'));
  const sockets = [], timers = [], deliveries = [];
  const secret = 'integration-test-secret-32-characters-long';
  const service = createService({ authRoot, secret, callbackUrl: 'http://backend/api/whatsapp/web/inbound',
    loadAuth: async () => ({ state: { creds: {} }, saveCreds: async () => {} }),
    socketFactory: () => {
      const sock = { ev: new EventEmitter(), ws: { isOpen: false, isClosed: false },
        user: { id: '5511999990000:1@s.whatsapp.net', name: 'Test' },
        async end() { this.ended = true; this.ws.isClosed = true; this.ws.isOpen = false; },
        async logout() { await this.end(); this.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } }); },
        async sendMessage(jid, message) { deliveries.push({ jid, message }); return { key: { id: 'accepted-1' } }; },
        async requestPairingCode() { this.pairings = (this.pairings || 0) + 1; return '1234ABCD'; },
        async waitForConnectionUpdate() {},
      };
      sockets.push(sock); return sock;
    },
    encodeQR: async qr => `data:image/png;base64,${qr}`,
    schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
    cancel: timer => { timer.cancelled = true; },
    fetchImpl: async () => ({ ok: true }), ...overrides,
  });
  t.after(async () => {
    await service.shutdown();
    assert.ok(path.resolve(authRoot).startsWith(path.join(os.tmpdir(), 'atende-whatsapp-')));
    await fs.rm(authRoot, { recursive: true, force: true });
  });
  const settle = async () => { await service.instances.get('tenant-a')?.queue; };
  const update = async event => { sockets.at(-1).ev.emit('connection.update', event); await settle(); };
  return { service, sockets, timers, deliveries, authRoot, secret, settle, update };
}

test('parallel QR and repeated polls create only one socket; QR cleared on open', async t => {
  const f = await fixture(t);
  await Promise.all(Array.from({ length: 40 }, () => f.service.start('tenant-a')));
  assert.equal(f.sockets.length, 1);
  await f.update({ qr: 'first' });
  await Promise.all(Array.from({ length: 40 }, () => f.service.start('tenant-a')));
  for (let i = 0; i < 40; i++) f.service.payload('tenant-a');
  assert.equal(f.sockets.length, 1);
  assert.equal(f.service.payload('tenant-a').status, 'waiting_qr');
  await f.update({ qr: 'second' });
  assert.match(f.service.payload('tenant-a').qr, /second$/);
  f.sockets[0].ws.isOpen = true;
  await f.update({ connection: 'open' });
  assert.equal(f.service.payload('tenant-a').connected, true);
  assert.equal(f.service.payload('tenant-a').qr, '');
});

test('440 is terminal, persists across restart, old listeners detached, explicit reconnect replaces once', async t => {
  const f = await fixture(t);
  await f.service.start('tenant-a');
  const old = f.sockets[0], oldHandler = old.ev.listeners('connection.update')[0];
  await f.update({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 440 } } } });
  assert.equal(f.service.payload('tenant-a').status, 'conflict');
  assert.equal(f.timers.length, 0); assert.equal(old.ended, true);
  assert.equal(old.ev.listenerCount('connection.update'), 0);
  await f.service.restore();
  assert.equal(f.sockets.length, 1);
  await assert.rejects(f.service.send('tenant-a', { phone: '5511999990000', text: 'hello' }), { status: 409 });
  await Promise.all([f.service.start('tenant-a'), f.service.start('tenant-a')]);
  assert.equal(f.sockets.length, 2);
  oldHandler({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 440 } } } });
  await f.settle();
  assert.equal(f.service.payload('tenant-a').status, 'connecting');
});

test('transient closes use bounded backoff; disconnect cancels reconnect', async t => {
  const f = await fixture(t);
  await f.service.start('tenant-a');
  for (let i = 0; i < 6; i++) {
    await f.update({ connection: 'close', lastDisconnect: { error: { output: { statusCode: [408, 428, 515][i % 3] } } } });
    assert.equal(f.timers[i].ms, Math.min(60000, 2000 * 2 ** i));
    await f.service.start('tenant-a'); // explicit polling-like start cannot bypass pending backoff
    assert.equal(f.sockets.length, i + 1);
    f.timers[i].fn(); await f.settle();
  }
  await f.update({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 408 } } } });
  assert.equal(f.service.payload('tenant-a').status, 'error');
  assert.equal(f.timers.length, 6);
  await f.service.start('tenant-a');
  await f.update({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 428 } } } });
  await f.service.disconnect('tenant-a');
  assert.equal(f.timers.at(-1).cancelled, true);
  assert.equal(f.service.payload('tenant-a').status, 'disconnected');
});

test('QR and pairing share one socket, one code; switching numbers is rejected', async t => {
  const f = await fixture(t);
  await f.service.start('tenant-a'); await f.update({ qr: 'ready' });
  await Promise.all(Array.from({ length: 10 }, () => f.service.start('tenant-a', { pairingNumber: '+55 (11) 99999-0000' })));
  assert.equal(f.sockets.length, 1); assert.equal(f.sockets[0].pairings, 1);
  assert.equal(f.service.payload('tenant-a').qr, '');
  assert.equal(f.service.payload('tenant-a').pairing_code, '1234ABCD');
  await assert.rejects(f.service.start('tenant-a', { pairingNumber: '5511999991111' }), { status: 409 });
  await assert.rejects(f.service.start('tenant-a'), { status: 409 });
});

test('disconnect queued during auth creation cannot leave an orphan socket', async t => {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { loadAuth: async () => { await ready; return { state: { creds: {} }, saveCreds: async () => {} }; } });
  const starting = f.service.start('tenant-a');
  const disconnecting = f.service.disconnect('tenant-a');
  release(); await Promise.all([starting, disconnecting]);
  assert.equal(f.sockets.length, 1); assert.equal(f.sockets[0].ended, true);
  assert.equal(f.service.payload('tenant-a').connected, false);
});

test('send requires OPEN and an accepted ID; no false success', async t => {
  const f = await fixture(t); await f.service.start('tenant-a');
  await assert.rejects(f.service.send('tenant-a', { phone: '5511999990000', text: 'hello' }), { status: 409 });
  await f.update({ connection: 'open' });
  assert.equal(f.service.payload('tenant-a').connected, false);
  await assert.rejects(f.service.send('tenant-a', { phone: '5511999990000', text: 'hello' }), { status: 409 });
  f.sockets[0].ws.isOpen = true;
  const result = await f.service.send('tenant-a', { phone: '+55 (11) 99999-0000', text: 'hello' });
  assert.equal(result.message_id, 'accepted-1');
  assert.equal(f.deliveries[0].jid, '5511999990000@s.whatsapp.net');
  f.sockets[0].sendMessage = async () => undefined;
  await assert.rejects(f.service.send('tenant-a', { phone: '5511999990000', text: 'hello' }), { status: 502 });
  for (const phone of ['abc5511999990000', '123', '00000000000', '../foo']) assert.throws(() => normalizePhone(phone));
});

test('disconnect waits for an asynchronous Baileys logout already in progress', async t => {
  const f = await fixture(t); await f.service.start('tenant-a');
  const sock = f.sockets[0]; sock.ws.isOpen = true;
  sock.logout = async () => {
    sock.ws.isOpen = false;
    sock.end = async () => {}; // Baileys short-circuits a second end call
    setImmediate(() => { sock.ws.isClosed = true; sock.ev.emit('connection.update', { connection: 'close' }); });
  };
  await f.service.disconnect('tenant-a');
  assert.equal(sock.ws.isClosed, true);
  assert.equal(f.service.payload('tenant-a').status, 'disconnected');
});

test('real HTTP auth, read-only status, malformed JSON and disconnected send', async t => {
  const f = await fixture(t), server = http.createServer(f.service.route);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/instances/tenant-a`;
  const headers = { 'x-atende-internal-secret': f.secret, 'content-type': 'application/json' };
  assert.equal((await fetch(`${url}/status`)).status, 401);
  for (let i = 0; i < 5; i++) assert.equal((await fetch(`${url}/status`, { headers })).status, 200);
  assert.equal(f.sockets.length, 0);
  assert.equal((await fetch(`${url}/send`, { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await fetch(`${url}/send`, { method: 'POST', headers, body: JSON.stringify({ phone: '5511999990000', text: 'test' }) })).status, 409);
});

test('inbound retained on callback error and redelivered with original company and message ID', async t => {
  const callbacks = []; let available = false;
  const f = await fixture(t, { fetchImpl: async (_url, req) => { callbacks.push(JSON.parse(req.body)); return { ok: available, status: 503 }; } });
  await f.service.start('tenant-a');
  f.sockets[0].ev.emit('messages.upsert', { type: 'notify', messages: [{ key: { id: 'wa-id', remoteJid: '5511999990000@s.whatsapp.net' }, message: { conversation: 'Olá' }, messageTimestamp: 1700000000 }] });
  await f.service.instances.get('tenant-a').inbound;
  assert.equal((await fs.readdir(path.join(f.authRoot, '.inbound'))).length, 1);
  available = true; await f.service.flushInbound();
  assert.equal(callbacks.at(-1).company_id, 'tenant-a');
  assert.equal(callbacks.at(-1).external_id, 'wa-id');
  assert.equal(callbacks.at(-1).timestamp, 1700000000);
  assert.equal((await fs.readdir(path.join(f.authRoot, '.inbound'))).length, 0);
});

test('restore accepts QR-linked credentials with registered=false, skips unlinked auth', async t => {
  const f = await fixture(t);
  for (const [id, me] of [['tenant-a', {id:'5511999990000@s.whatsapp.net'}], ['tenant-b', null]]) {
    const dir = path.join(f.authRoot, id);
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'creds.json'), JSON.stringify({registered:false, me, noiseKey:{}, signedIdentityKey:{}}));
  }
  await f.service.restore();
  assert.equal(f.sockets.length, 1);
  assert.equal(f.service.payload('tenant-a').status, 'connecting');
  assert.equal(f.service.payload('tenant-b').connected, false);
  await f.service.restore();
  assert.equal(f.sockets.length, 1);
});
