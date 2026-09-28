/**
 * Cloudflare Worker for Battle of Talingchan
 * Handles static assets + Serverless WebSocket Signaling for online battles
 */

export class SignalServer {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.rooms = new Map(); // code -> { host: ws, guest: ws }
  }

  async fetch(request) {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();
    server._sigCode = '';

    server.addEventListener('message', (event) => {
      let m;
      try {
        m = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch (e) {
        return;
      }
      this.handleMessage(server, m);
    });

    const onClose = () => {
      this.leave(server);
    };
    server.addEventListener('close', onClose);
    server.addEventListener('error', onClose);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  leave(ws) {
    const code = ws._sigCode;
    if (!code) return;
    const slot = this.rooms.get(code);
    if (!slot) {
      ws._sigCode = '';
      return;
    }
    const other = slot.host === ws ? slot.guest : slot.host;
    if (other) {
      try {
        other.send(JSON.stringify({ t: 'gone' }));
      } catch (e) {}
    }
    if (slot.host === ws) {
      this.rooms.delete(code);
    } else if (slot.guest === ws) {
      slot.guest = null;
    }
    ws._sigCode = '';
  }

  handleMessage(ws, m) {
    if (!m || !m.t) return;

    if (m.t === 'host') {
      const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (code.length !== 6) {
        ws.send(JSON.stringify({ t: 'error', m: 'รหัสห้องไม่ถูกต้อง' }));
        return;
      }
      const old = this.rooms.get(code);
      if (old && old.host && old.host !== ws) {
        ws.send(JSON.stringify({ t: 'busy' }));
        return;
      }
      this.leave(ws);
      this.rooms.set(code, { host: ws, guest: (old && old.host === ws) ? old.guest : null });
      ws._sigCode = code;
      ws.send(JSON.stringify({ t: 'ok', code }));
      return;
    }

    if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      const slot = this.rooms.get(code);
      if (!slot || !slot.host) {
        ws.send(JSON.stringify({ t: 'nohost' }));
        return;
      }
      if (slot.guest && slot.guest !== ws) {
        ws.send(JSON.stringify({ t: 'full' }));
        return;
      }
      this.leave(ws);
      slot.guest = ws;
      ws._sigCode = code;
      ws.send(JSON.stringify({ t: 'ok', code }));
      try {
        slot.host.send(JSON.stringify({ t: 'guest' }));
      } catch (e) {}
      return;
    }

    if (m.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong' }));
      return;
    }

    if (m.t === 'relay') {
      const slot = this.rooms.get(ws._sigCode);
      if (!slot) return;
      const other = slot.host === ws ? slot.guest : slot.host;
      if (!other) return;
      try {
        other.send(JSON.stringify({ t: 'relay', msg: m.msg }));
      } catch (e) {}
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // WebSocket /signal for online multiplayer matching
    if (path === '/signal' || path === '/signal/' || path === '/ws' || path === '/ws/') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      if (env.SIGNAL_DO) {
        const id = env.SIGNAL_DO.idFromName('global_signal');
        const stub = env.SIGNAL_DO.get(id);
        return stub.fetch(request);
      }
      return new Response(JSON.stringify({
        error: 'SIGNAL_DO Durable Object binding is not configured in Cloudflare Dashboard.'
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Version API for auto-update checker
    if (path === '/api/version') {
      return new Response(JSON.stringify({ version: '2026.09.28' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Feedback webhook (Discord)
    if (path === '/feedback' && request.method === 'POST') {
      const webhook = env.DISCORD_FEEDBACK_WEBHOOK || env.FEEDBACK_WEBHOOK;
      if (!webhook) {
        return new Response(JSON.stringify({ ok: false, error: 'Webhook not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      try {
        const body = await request.json();
        const text = `**[Bug Feedback]**\n${body.text || '(ไม่มีข้อความ)'}\n_Client: ${request.headers.get('User-Agent') || '-'}_`;
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text })
        });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Serve static files via Cloudflare Assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
