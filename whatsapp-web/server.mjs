import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState, normalizeMessageContent } from '@whiskeysockets/baileys';
import lockfile from 'proper-lockfile';
import P from 'pino';
import QRCode from 'qrcode';

const logger = P({ level: process.env.LOG_LEVEL || 'warn' });
const fail = (status, message) => Object.assign(new Error(message), { status });
const validCompany = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id);
export function normalizePhone(value) {
  if (typeof value !== 'string' || !/^\+?[\d\s().-]+$/.test(value)) throw fail(422, 'Número inválido. Informe código do país e DDD.');
  const phone = value.replace(/\D/g, '');
  if (!/^[1-9]\d{9,14}$/.test(phone)) throw fail(422, 'Número inválido. Informe código do país e DDD.');
  return phone;
}

// One manager owns the auth volume; injected dependencies exercise real race paths in tests.
export function createService({ secret, authRoot, callbackUrl, socketFactory = makeWASocket,
  loadAuth = useMultiFileAuthState, encodeQR = QRCode.toDataURL, fetchImpl = fetch,
  schedule = setTimeout, cancel = clearTimeout, retryBase = 2000 } = {}) {
  if (!secret || secret.length < 32) throw new Error('WHATSAPP_WEB_SECRET must have at least 32 characters');
  const root = path.resolve(authRoot);
  const instances = new Map();
  let shuttingDown = false, outboxTimer, flushing;
  const sessionDir = id => {
    if (!validCompany(id)) throw fail(422, 'company_id inválido');
    return path.join(root, id);
  };
  const stateFor = id => {
    sessionDir(id);
    if (!instances.has(id)) instances.set(id, {
      sock: null, qr: null, qrDataUrl: null, pairingCode: null, pairingNumber: null,
      status: 'disconnected', phone: '', name: '', lastError: '', starting: null,
      queue: Promise.resolve(), saves: Promise.resolve(), reconnectTimer: null, attempts: 0,
    });
    return instances.get(id);
  };
  // Creation, teardown and connection events share the same per-company queue.
  function exclusive(id, action) {
    const state = stateFor(id);
    const operation = state.queue.then(() => action(state));
    state.queue = operation.catch(() => {}); // caller still receives the rejection
    return operation;
  }
  const clearCodes = s => { s.qr = null; s.qrDataUrl = null; s.pairingCode = null; };
  const cancelReconnect = s => { if (s.reconnectTimer) cancel(s.reconnectTimer); s.reconnectTimer = null; };
  async function closeSocket(s) {
    cancelReconnect(s);
    const sock = s.sock;
    if (!sock) return;
    for (const [event, handler] of s.handlers || []) sock.ev.off(event, handler);
    // logout() starts Baileys.end() without awaiting it. A second end() can return
    // immediately while the original WebSocket is still closing: wait for its event.
    let onClosed, timer;
    const closed = new Promise(resolve => {
      onClosed = update => { if (update.connection === 'close') resolve(); };
      sock.ev.on('connection.update', onClosed);
    });
    try {
      await Promise.race([
        (async () => { await sock.end(new Error('Session stopped')); if (!sock.ws.isClosed) await closed; })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(fail(503, 'A conexão anterior ainda está encerrando. Tente novamente.')), 30000); }),
      ]);
    } finally { clearTimeout(timer); sock.ev.off('connection.update', onClosed); }
    if (!sock.ws.isClosed) throw fail(503, 'A conexão anterior ainda está encerrando. Tente novamente.');
    await s.saves;
    s.sock = null; s.handlers = [];
  }
  async function block(id, s, status, detail) {
    s.status = status; s.lastError = detail; clearCodes(s);
    await fs.writeFile(path.join(sessionDir(id), '.blocked.json'), JSON.stringify({ status, detail }), { mode: 0o600 });
    await closeSocket(s);
  }
  function reconnect(id, s) {
    if (shuttingDown) return;
    if (s.attempts >= 6) {
      s.status = 'error'; s.lastError = 'Limite de reconexões atingido. Clique em Reconectar.'; return;
    }
    s.status = 'reconnecting';
    const delay = Math.min(60000, retryBase * 2 ** s.attempts++);
    s.reconnectTimer = schedule(() => {
      s.reconnectTimer = null;
      start(id, { automatic: true }).catch(err => logger.error({ companyId: id, error: err.name }, 'reconnect failed'));
    }, delay);
    s.reconnectTimer?.unref?.();
  }
  async function connectionUpdate(id, s, sock, { connection, lastDisconnect, qr }) {
    if (s.sock !== sock || shuttingDown) return;
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      clearCodes(s);
      if (code === DisconnectReason.connectionReplaced) {
        await block(id, s, 'conflict', 'Conexão substituída (440). Clique em Reconectar para recuperar esta sessão.');
      } else if (code === DisconnectReason.loggedOut) {
        await block(id, s, 'logged_out', 'Sessão encerrada no WhatsApp (401). Autentique novamente.');
      } else {
        await closeSocket(s);
        s.lastError = `Conexão encerrada (${code || 'rede'}).`;
        if (code == null || [408, 428, 515, 503].includes(code)) reconnect(id, s);
        else await block(id, s, 'error', `${s.lastError} Clique em Reconectar.`);
      }
      return;
    }
    if (connection === 'open') {
      s.status = 'connected'; clearCodes(s); s.lastError = '';
      s.phone = (sock.user?.id || '').split(':')[0].split('@')[0]; s.name = sock.user?.name || '';
      s.openedAt = Date.now(); return;
    }
    if (qr && s.status !== 'connected' && !s.pairingNumber) {
      s.qr = qr; s.qrDataUrl = await encodeQR(qr, { margin: 1, width: 320 }); s.status = 'waiting_qr';
    }
  }
  const outbox = path.join(root, '.inbound');
  async function flushInbound() {
    if (flushing) return flushing;
    flushing = (async () => {
      await fs.mkdir(outbox, { recursive: true, mode: 0o700 });
      for (const name of (await fs.readdir(outbox)).filter(n => n.endsWith('.json'))) {
        if (shuttingDown) break;
        const file = path.join(outbox, name);
        try {
          const response = await fetchImpl(callbackUrl, { method: 'POST', signal: AbortSignal.timeout(120000),
            headers: { 'content-type': 'application/json', 'x-atende-internal-secret': secret },
            body: await fs.readFile(file, 'utf8') });
          if (!response.ok) { logger.warn({ status: response.status }, 'inbound retained for retry'); break; }
          await fs.unlink(file);
        } catch (err) { logger.warn({ error: err.name }, 'inbound retained for retry'); break; }
      }
    })();
    try { await flushing; } finally { flushing = null; }
  }
  async function inbound(id, sock, { messages, type }) {
    if (type !== 'notify' || shuttingDown || stateFor(id).sock !== sock) return;
    for (const message of messages) {
      if (message.key.fromMe || !message.message || !message.key.id) continue;
      let remote = message.key.remoteJid || '';
      if (remote.endsWith('@lid')) remote = message.key.remoteJidAlt || await sock.signalRepository?.lidMapping?.getPNForLID(remote) || '';
      if (!remote.endsWith('@s.whatsapp.net')) continue;
      const content = normalizeMessageContent(message.message);
      const text = content?.conversation || content?.extendedTextMessage?.text || content?.imageMessage?.caption || content?.videoMessage?.caption || '';
      if (!text.trim()) continue;
      const body = { company_id: id, external_id: message.key.id, phone: remote.split('@')[0],
        name: message.pushName || remote.split('@')[0], text: text.trim(),
        timestamp: Number(message.messageTimestamp) || Math.floor(Date.now() / 1000) };
      await fs.mkdir(outbox, { recursive: true, mode: 0o700 });
      const key = createHash('sha256').update(`${id}:${message.key.id}`).digest('hex');
      const file = path.join(outbox, `${key}.json`);
      await fs.writeFile(`${file}.tmp`, JSON.stringify(body), { mode: 0o600 });
      await fs.rename(`${file}.tmp`, file);
    }
    await flushInbound();
  }
  async function pairing(s, sock, number) {
    if (s.status === 'connected') return;
    if (s.pairingCode && s.pairingNumber === number) return;
    if (s.pairingNumber && s.pairingNumber !== number) throw fail(409, 'Desconecte antes de parear outro número.');
    s.pairingNumber = number;
    if (!s.registrationReady) await new Promise((resolve, reject) => {
      const done = err => { clearTimeout(timer); sock.ev.off('connection.update', handler); if (err) reject(err); else resolve(); };
      const handler = ({ qr, connection }) => {
        if (qr) done();
        else if (connection === 'close' || connection === 'open') done(fail(409, 'A conexão mudou durante o pareamento. Consulte o status.'));
      };
      const timer = setTimeout(() => done(fail(504, 'WhatsApp não disponibilizou pareamento. Tente novamente.')), 15000);
      sock.ev.on('connection.update', handler);
    });
    s.pairingCode = await sock.requestPairingCode(number);
    s.qr = null; s.qrDataUrl = null; s.status = 'waiting_pairing';
  }
  function start(id, options = {}) {
    const number = options.pairingNumber ? normalizePhone(options.pairingNumber) : null;
    return exclusive(id, async s => {
      if (shuttingDown) throw fail(503, 'Serviço encerrando.');
      if (s.sock && ['connecting', 'waiting_qr', 'waiting_pairing', 'connected'].includes(s.status)) {
        if (number) await pairing(s, s.sock, number);
        else if (s.pairingNumber && s.status !== 'connected') throw fail(409, 'Pareamento em andamento. Desconecte antes de mudar para QR.');
        return payload(id);
      }
      if (s.reconnectTimer) return payload(id);
      if (options.automatic && ['conflict', 'logged_out', 'error'].includes(s.status)) return payload(id);
      s.starting = (async () => {
        await closeSocket(s);
        if (s.status === 'logged_out') await fs.rm(sessionDir(id), { recursive: true, force: true });
        await fs.mkdir(sessionDir(id), { recursive: true, mode: 0o700 });
        await fs.rm(path.join(sessionDir(id), '.blocked.json'), { force: true });
        if (!options.automatic) s.attempts = 0;
        s.status = 'connecting'; s.lastError = ''; clearCodes(s); s.openedAt = null;
        s.registrationReady = false; s.pairingNumber = number;
        const { state: auth, saveCreds } = await loadAuth(sessionDir(id));
        const sock = socketFactory({ auth, browser: Browsers.ubuntu('Chrome'), logger: P({ level: 'silent' }),
          markOnlineOnConnect: false, syncFullHistory: false, connectTimeoutMs: 20000, defaultQueryTimeoutMs: 20000 });
        s.sock = sock;
        const onCreds = () => {
          s.saves = s.saves.then(saveCreds);
          s.saves.catch(() => { s.lastError = 'Falha ao persistir autenticação.'; logger.error({ companyId: id }, 'auth persistence failed'); });
        };
        const onConnection = update => {
          if (s.sock !== sock) return;
          if (update.qr) s.registrationReady = true;
          if (update.connection === 'close' && s.openedAt && Date.now() - s.openedAt > 60000) s.attempts = 0;
          exclusive(id, state => connectionUpdate(id, state, sock, update)).catch(err => {
            s.status = 'error'; s.lastError = 'Falha ao atualizar sessão. Reconecte.';
            logger.error({ companyId: id, error: err.name }, 'session transition failed');
          });
        };
        const onMessages = event => {
          const operation = (s.inbound || Promise.resolve()).then(() => inbound(id, sock, event));
          s.inbound = operation.catch(err => logger.error({ companyId: id, error: err.name }, 'inbound persistence failed'));
        };
        s.handlers = [['creds.update', onCreds], ['connection.update', onConnection], ['messages.upsert', onMessages]];
        for (const [event, handler] of s.handlers) sock.ev.on(event, handler);
        if (number && !auth.creds.registered) await pairing(s, sock, number);
      })();
      try { await s.starting; return payload(id); }
      catch (err) { s.status = 'error'; s.lastError = err.status ? err.message : 'Falha ao iniciar sessão.'; await closeSocket(s); throw err; }
      finally { s.starting = null; }
    });
  }
  function payload(id) {
    const s = stateFor(id);
    return { connected: s.status === 'connected' && s.sock?.ws.isOpen === true, status: s.status,
      phone_number: s.phone, display_name: s.name, qr: s.qrDataUrl || '', pairing_code: s.pairingCode || '', last_error: s.lastError };
  }
  async function disconnect(id) {
    return exclusive(id, async s => {
      s.status = 'disconnecting'; cancelReconnect(s);
      if (s.sock?.ws.isOpen) {
        try { await s.sock.logout(); }
        catch (err) { logger.warn({ companyId: id, error: err.name }, 'remote logout failed; removing local session'); }
      }
      await closeSocket(s);
      await fs.rm(sessionDir(id), { recursive: true, force: true });
      clearCodes(s); s.status = 'disconnected'; s.phone = ''; s.name = ''; s.lastError = ''; s.pairingNumber = null; s.attempts = 0;
    });
  }
  async function send(id, body) {
    const to = normalizePhone(body.phone);
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 4000) throw fail(422, 'Texto obrigatório, com até 4000 caracteres.');
    const s = stateFor(id), sock = s.sock;
    if (s.status === 'conflict') throw fail(409, 'Conflito 440. Reconecte o WhatsApp antes de enviar.');
    if (!sock || s.status !== 'connected' || sock.ws.isOpen !== true) throw fail(409, 'WhatsApp não está conectado.');
    const result = await sock.sendMessage(`${to}@s.whatsapp.net`, { text: body.text });
    if (!result?.key?.id) throw fail(502, 'WhatsApp não confirmou a aceitação da mensagem.');
    return { ok: true, message: 'Mensagem aceita pelo WhatsApp', message_id: result.key.id };
  }
  async function readBody(req) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 65536) throw fail(413, 'Payload muito grande'); chunks.push(chunk); }
    try {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
      return body;
    } catch { throw fail(400, 'JSON inválido'); }
  }
  async function route(req, res) {
    const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      const supplied = Buffer.from(String(req.headers['x-atende-internal-secret'] || '')), expected = Buffer.from(secret);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(401, { detail: 'unauthorized' });
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') return json(200, { ok: !shuttingDown });
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length !== 3 || parts[0] !== 'instances') return json(404, { detail: 'not found' });
      const id = parts[1]; sessionDir(id);
      if (req.method === 'GET' && parts[2] === 'status') return json(200, payload(id));
      if (req.method === 'POST' && parts[2] === 'qr') return json(200, await start(id));
      if (req.method === 'POST' && parts[2] === 'pairing') {
        const body = await readBody(req); return json(200, await start(id, { pairingNumber: normalizePhone(body.phone_number) }));
      }
      if (req.method === 'POST' && parts[2] === 'send') return json(200, await send(id, await readBody(req)));
      if (req.method === 'DELETE' && parts[2] === 'session') { await disconnect(id); return json(200, { ok: true }); }
      return json(404, { detail: 'not found' });
    } catch (err) {
      logger.warn({ error: err.name, status: err.status || 502 }, 'WhatsApp request failed');
      return json(err.status || 502, { detail: err.status ? err.message : 'Falha no serviço WhatsApp. Consulte o status e tente novamente.' });
    }
  }
  async function restore() {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (shuttingDown) break;
      if (!entry.isDirectory() || !validCompany(entry.name)) continue;
      const s = stateFor(entry.name);
      try {
        const blocked = await fs.readFile(path.join(sessionDir(entry.name), '.blocked.json'), 'utf8').then(JSON.parse).catch(err => { if (err.code === 'ENOENT') return null; throw err; });
        if (blocked) { s.status = blocked.status; s.lastError = blocked.detail; continue; }
        const creds = JSON.parse(await fs.readFile(path.join(sessionDir(entry.name), 'creds.json'), 'utf8'));
        // QR-linked sessions can retain registered=false; me identifies linked auth.
        if (!creds.me?.id || !creds.noiseKey || !creds.signedIdentityKey) continue;
        await start(entry.name, { automatic: true });
        const sock = s.sock;
        if (sock && s.status === 'connecting') await sock.waitForConnectionUpdate(u => u.connection === 'open' || u.connection === 'close', 25000).catch(err => logger.warn({ companyId: entry.name, error: err.name }, 'restore handshake not settled'));
      } catch (err) { s.status = 'error'; s.lastError = 'Sessão salva inválida ou indisponível. Reconecte.'; logger.warn({ companyId: entry.name, error: err.name }, 'restore failed'); }
    }
  }
  async function shutdown() {
    shuttingDown = true; if (outboxTimer) clearInterval(outboxTimer);
    for (const [id] of instances) await exclusive(id, async s => { await closeSocket(s); await s.inbound; });
  }
  function startOutbox() {
    outboxTimer = setInterval(() => flushInbound().catch(err => logger.error({ error: err.name }, 'inbound spool failed')), 15000);
    outboxTimer.unref();
  }
  return { route, start, send, disconnect, payload, restore, shutdown, startOutbox, flushInbound, instances };
}

async function main() {
  const authRoot = process.env.AUTH_ROOT || '/data/auth';
  await fs.mkdir(authRoot, { recursive: true, mode: 0o700 });
  // Fail before opening sockets when another process owns this persistent volume.
  const release = await lockfile.lock(authRoot, { lockfilePath: path.join(authRoot, '.manager.lock'), stale: 60000, update: 10000, retries: 0 });
  const service = createService({ secret: process.env.WHATSAPP_WEB_SECRET, authRoot,
    callbackUrl: process.env.BACKEND_CALLBACK_URL || 'http://backend:8001/api/whatsapp/web/inbound' });
  const server = http.createServer(service.route);
  server.requestTimeout = 30000;
  server.listen(Number(process.env.PORT || 3002), '0.0.0.0', () => {
    service.startOutbox(); service.restore().catch(err => logger.error({ error: err.name }, 'restore failed'));
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true; server.close();
    try { await service.shutdown(); await release(); }
    catch (err) { logger.error({ error: err.name }, 'shutdown failed'); process.exitCode = 1; }
  };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(err => { logger.error({ error: err.name, code: err.code }, 'startup failed'); process.exitCode = 1; });
}
