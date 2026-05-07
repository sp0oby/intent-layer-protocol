import {describe, expect, it} from 'vitest';
import {createServer, type Server} from 'node:http';
import {WebSocket} from 'ws';
import type {AddressInfo} from 'node:net';
import {attachWsServer, type WsServerHandle} from '../src/services/ws-server';
import {createEventBus, type IntentEventBus} from '../src/services/event-bus';

const HASH_A = '0x' + 'a'.repeat(64);

interface Harness {
  port: number;
  bus: IntentEventBus;
  httpServer: Server;
  handle: WsServerHandle;
  teardown: () => Promise<void>;
}

async function setupHarness(): Promise<Harness> {
  const bus = createEventBus();
  const httpServer = createServer();
  const handle = attachWsServer(httpServer, bus);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
  const port = (httpServer.address() as AddressInfo).port;
  const teardown = async (): Promise<void> => {
    await handle.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };
  return {port, bus, httpServer, handle, teardown};
}

const closed = (ws: WebSocket): Promise<{code: number; reason: string}> =>
  new Promise((resolve) => {
    ws.once('close', (code, reason) => resolve({code, reason: reason.toString('utf8')}));
  });

const messages = (ws: WebSocket): {next: () => Promise<unknown>; all: () => unknown[]} => {
  const queue: unknown[] = [];
  const waiters: Array<(value: unknown) => void> = [];
  ws.on('message', (data) => {
    const parsed = JSON.parse(data.toString('utf8'));
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  return {
    next() {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      return new Promise((resolve) => waiters.push(resolve));
    },
    all() {
      return [...queue];
    },
  };
};

describe('WebSocket server', () => {
  it('rejects connections without intentHash', async () => {
    const h = await setupHarness();
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${h.port}/ws`);
      const close = await closed(ws);
      expect(close.code).toBe(1008);
      expect(close.reason).toMatch(/intentHash/);
    } finally {
      await h.teardown();
    }
  });

  it('rejects malformed intentHash', async () => {
    const h = await setupHarness();
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${h.port}/ws?intentHash=garbage`);
      const close = await closed(ws);
      expect(close.code).toBe(1008);
    } finally {
      await h.teardown();
    }
  });

  it('sends Subscribed and forwards bus events to the right client', async () => {
    const h = await setupHarness();
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${h.port}/ws?intentHash=${HASH_A}`);
      const inbox = messages(ws);
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });
      expect(await inbox.next()).toEqual({type: 'Subscribed', intentHash: HASH_A});
      h.bus.emit({type: 'StateChange', intentHash: HASH_A, newState: 'MATCHED', txHash: '0xfeed'});
      expect(await inbox.next()).toMatchObject({
        type: 'StateChange',
        newState: 'MATCHED',
        txHash: '0xfeed',
      });
      ws.close();
      await closed(ws);
    } finally {
      await h.teardown();
    }
  });

  it('does not deliver events for a different hash', async () => {
    const h = await setupHarness();
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${h.port}/ws?intentHash=${HASH_A}`);
      const inbox = messages(ws);
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });
      await inbox.next(); // Subscribed
      h.bus.emit({type: 'StateChange', intentHash: '0x' + 'b'.repeat(64), newState: 'MATCHED'});
      // Tiny grace period for the server to NOT route the event to us.
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(inbox.all()).toEqual([]);
      ws.close();
      await closed(ws);
    } finally {
      await h.teardown();
    }
  });

  it('cleans up the listener on close', async () => {
    const h = await setupHarness();
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${h.port}/ws?intentHash=${HASH_A}`);
      const inbox = messages(ws);
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });
      await inbox.next();
      expect(h.bus.listenerCount(HASH_A)).toBe(1);
      ws.close();
      await closed(ws);
      // Listener cleanup happens on the server's `close` handler — wait
      // for the server's view to converge, not the client's.
      for (let i = 0; i < 50; i += 1) {
        if (h.bus.listenerCount(HASH_A) === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(h.bus.listenerCount(HASH_A)).toBe(0);
    } finally {
      await h.teardown();
    }
  });
});
