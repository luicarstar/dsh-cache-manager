import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createKeepalive, KeepaliveStore, ruleKey} from './cache-keepalive.js';

function harness({provider = 'chanA', model = 'm1', human = true, reason = 'completed'} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ka-'));
  const store = new KeepaliveStore(join(dir, 'ka.json'));
  let clock = 1_000_000;
  const timers = [];
  const setTimer = (fn, ms) => { const t = {fn, at: clock + ms, live: true}; timers.push(t); return t; };
  const clearTimer = t => { if (t) t.live = false; };
  const events = [
    {seq: 0, type: 'turn/start', data: {turn: 0}, time: clock - 5000},
    {seq: 1, type: 'user/message', data: {source: {kind: human ? 'user' : 'runtime-context'}, content: []}},
    {seq: 2, type: 'assistant/message', data: {turn: 0}, time: clock - 1000},
    {seq: 3, type: 'turn/end', data: {turn: 0, reason: {kind: reason}}, time: clock - 900}
  ];
  const calls = [];
  const session = {id: 's1', header: {}, snapshotEvents: () => events, requestContext: () => ({provider, model}),
    requestHeader: () => ({config: {provider, model}}), deriveMessages: () => [{role: 'user'}], toolHistory: () => undefined};
  const agent = {id: 's1', status: 'idle', session};
  const llm = {stream(options) { calls.push(options); return (async function* () { yield {type: 'usage', usage: {cacheReadTokens: 42, inputTokens: 50}}; yield {type: 'text-delta', text: 'O'}; yield {type: 'text-delta', text: 'K'}; })(); }};
  const ka = createKeepalive({logger: {warn() {}}}, {store, now: () => clock, setTimer, clearTimer});
  ka.attach(llm);
  const run = async () => { const due = timers.filter(t => t.live).sort((a, b) => a.at - b.at)[0]; if (!due) return false; clock = due.at; due.live = false; await due.fn(); return true; };
  return {ka, agent, events, calls, run, timers, store, cleanup: () => rmSync(dir, {recursive: true, force: true}), get clock() { return clock; }};
}

test('disabled by default: no schedule, no request', async t => {
  const h = harness(); t.after(h.cleanup);
  h.ka.onStatus(h.agent, 'idle');
  assert.equal(h.ka.status('s1').status, 'off');
  assert.equal(await h.run(), false);
  assert.equal(h.calls.length, 0);
});

test('enabled rule renews N times then stops; requests carry session context and abort after first output', async t => {
  const h = harness(); t.after(h.cleanup);
  h.ka.saveConfig({leadSeconds: 30, rules: {[ruleKey('chanA', 'm1')]: {enabled: true, maxRenewals: 2, ttlMinutes: 5}}});
  h.ka.onStatus(h.agent, 'idle');
  const s = h.ka.status('s1');
  assert.equal(s.status, 'scheduled');
  assert.equal(s.nextAt, 1_000_000 - 1000 + 5 * 60_000 - 30_000);
  await h.run();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].sessionId, 's1');
  assert.equal(h.calls[0].messages.length, 2);
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.ka.status('s1').done, 1);
  assert.equal(h.ka.status('s1').lastCacheRead, 42);
  await h.run();
  assert.equal(h.calls.length, 2);
  assert.equal(h.ka.status('s1').status, 'done');
  assert.equal(await h.run(), false);
});

test('user activity (running) cancels pending renewal', async t => {
  const h = harness(); t.after(h.cleanup);
  h.ka.saveConfig({rules: {'chanA::m1': {enabled: true, maxRenewals: 3, ttlMinutes: 5}}});
  h.ka.onStatus(h.agent, 'idle');
  h.ka.onStatus(h.agent, 'running');
  assert.equal(h.ka.status('s1').status, 'cancelled');
  assert.equal(await h.run(), false);
  assert.equal(h.calls.length, 0);
});

test('non-human turns and failed turns are not renewed', async t => {
  for (const opts of [{human: false}, {reason: 'error'}]) {
    const h = harness(opts); t.after(h.cleanup);
    h.ka.saveConfig({rules: {'chanA::m1': {enabled: true, maxRenewals: 3, ttlMinutes: 5}}});
    h.ka.onStatus(h.agent, 'idle');
    assert.equal(h.ka.status('s1'), null);
    assert.equal(await h.run(), false);
  }
});

test('other channel with same model is unaffected; pause/resume and disabling', async t => {
  const h = harness({provider: 'chanB'}); t.after(h.cleanup);
  h.ka.saveConfig({rules: {'chanA::m1': {enabled: true, maxRenewals: 3, ttlMinutes: 5}}});
  h.ka.onStatus(h.agent, 'idle');
  assert.equal(h.ka.status('s1').status, 'off');
  h.ka.saveConfig({rules: {'chanB::m1': {enabled: true, maxRenewals: 3, ttlMinutes: 5}}});
  assert.equal(h.ka.status('s1').status, 'scheduled');
  h.ka.pause('s1');
  assert.equal(await h.run(), false);
  h.ka.resume('s1');
  assert.equal(h.ka.status('s1').status, 'scheduled');
  h.ka.saveConfig({rules: {'chanB::m1': {enabled: false, maxRenewals: 3, ttlMinutes: 5}}});
  assert.equal(h.ka.status('s1').status, 'off');
  assert.equal(await h.run(), false);
  assert.equal(h.calls.length, 0);
});

test('upstream error is recorded and stops the chain', async t => {
  const h = harness(); t.after(h.cleanup);
  h.ka.attach({stream: () => (async function* () { yield {type: 'finish', reason: {kind: 'error', failure: {message: 'RATE_LIMIT'}}}; })()});
  h.ka.saveConfig({rules: {'chanA::m1': {enabled: true, maxRenewals: 3, ttlMinutes: 5}}});
  h.ka.onStatus(h.agent, 'idle');
  await h.run();
  const s = h.ka.status('s1');
  assert.equal(s.status, 'error');
  assert.equal(s.lastError, 'RATE_LIMIT');
  assert.equal(s.done, 0);
});
