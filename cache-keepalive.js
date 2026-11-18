// 缓存续期（cache keepalive）— Host 侧调度器。
//
// 语义：某个「渠道::模型」规则开启后，人工发起的一轮（turn 内含 source.kind === "user"
// 的 user/message）由 AI 正常答完（turn/end reason completed/max-tokens）且会话转为空闲时，
// 在「最近一次请求完成时间 + TTL − 提前量」发一次与会话同前缀的上游请求，仅为刷新服务商
// 的提示词缓存。可选自动续期 N 次；每次成功续期后以续期完成时间为新基准再排下一次。
//
// 续期请求：会话现有上下文（deriveMessages / toolHistory / 当前 request header 的
// config + tools）末尾追加一条极短的保活 user 消息，经 llm.stream（因此仍走限速插件等
// llm/stream 中间件），收到首个输出块即中止。它不写入会话日志、不进模型上下文、不产生
// 轮次。会话再次开始运行（新消息/重试/编辑）、会话销毁、规则关闭时立即取消。
//
// 计费：每次续期都是一次真实上游请求，会消耗配额（输入按缓存读计价时仍有费用）。默认关闭。
import {randomUUID} from 'node:crypto';
import {readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {dshHomeDir} from './profile-paths.js';
import {stripSitePrefix} from './request-stats-projection.js';

let active;
export const setActiveKeepalive = value => { active = value; };
export const activeKeepalive = () => active;
export const KEEPALIVE_FILE = () => join(dshHomeDir(), 'ui-tweak-cache-keepalive.json');
const MAX_RENEWALS = 100;
const MAX_TTL_MINUTES = 525600;
const SEND_TIMEOUT_MS = 120_000;
const KEEPALIVE_PROMPT = '[cache keepalive] 这是一条仅用于延续提示词缓存的自动请求，无需处理，回复 OK 即可。';

export function ruleKey(provider, model) {
  if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') return null;
  return provider + '::' + (stripSitePrefix(model, provider) ?? model);
}

const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
export function normalizeKeepaliveConfig(raw) {
  const rules = {};
  if (raw?.rules && typeof raw.rules === 'object' && !Array.isArray(raw.rules)) {
    for (const [key, r] of Object.entries(raw.rules)) {
      if (typeof key !== 'string' || !/^[^:]+::.+$/.test(key) || r === null || typeof r !== 'object') continue;
      Object.defineProperty(rules, key, {enumerable: true, writable: true, configurable: true, value: {
        enabled: r.enabled === true,
        maxRenewals: int(r.maxRenewals, 1, MAX_RENEWALS) ? r.maxRenewals : 1,
        ttlMinutes: int(r.ttlMinutes, 1, MAX_TTL_MINUTES) ? r.ttlMinutes : 5
      }});
    }
  }
  const leadSeconds = int(raw?.leadSeconds, 5, 3600) ? raw.leadSeconds : 30;
  return {version: 1, leadSeconds, rules};
}

export class KeepaliveStore {
  constructor(file = KEEPALIVE_FILE()) { this.file = file; this.cache = undefined; }
  read() {
    if (this.cache !== undefined) return this.cache;
    let parsed = null;
    try { parsed = JSON.parse(readFileSync(this.file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('续缓存配置文件无法解析，已保留原文件：' + error.message); }
    this.cache = normalizeKeepaliveConfig(parsed);
    return this.cache;
  }
  write(next) {
    const config = normalizeKeepaliveConfig(next);
    const text = JSON.stringify(config, null, 2);
    mkdirSync(dirname(this.file), {recursive: true});
    const temp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, text, {flag: 'wx'});
      renameSync(temp, this.file);
    } finally { try { unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    this.cache = config;
    return config;
  }
}

/** turn 是否由人工输入发起且正常答完。 */
function humanCompletedTurn(events) {
  let end = -1;
  for (let i = events.length - 1; i >= 0; i--) if (events[i].type === 'turn/end') { end = i; break; }
  if (end < 0) return null;
  const turn = events[end].data?.turn;
  const kind = events[end].data?.reason?.kind;
  if (kind !== 'completed' && kind !== 'max-tokens') return null;
  let start = -1;
  for (let i = end - 1; i >= 0; i--) if (events[i].type === 'turn/start' && events[i].data?.turn === turn) { start = i; break; }
  if (start < 0) return null;
  let human = false, lastRequest = null;
  for (let i = start + 1; i < end; i++) {
    const e = events[i];
    if (e.type === 'user/message' && e.data?.source?.kind === 'user') human = true;
    if ((e.type === 'assistant/message' || e.type === 'assistant/attempt') && typeof e.time === 'number') lastRequest = e.time;
  }
  if (!human) return null;
  return {turn, endSeq: events[end].seq, baseTime: lastRequest ?? events[end].time ?? Date.now()};
}

export function createKeepalive(ctx, {store = new KeepaliveStore(), now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  const logger = ctx.logger;
  /** sessionId -> 调度状态（仅内存；重启后随下一次人工轮次重建）。 */
  const states = new Map();
  let llm;
  let disposed = false;

  const view = (s) => s === undefined ? null : {
    key: s.key, status: s.status, done: s.done, max: s.max, turn: s.turn,
    nextAt: s.nextAt ?? null, lastAt: s.lastAt ?? null, baseTime: s.baseTime,
    lastError: s.lastError ?? null, lastCacheRead: s.lastCacheRead ?? null, lastInput: s.lastInput ?? null
  };
  function stop(sessionId, status = 'cancelled') {
    const s = states.get(sessionId);
    if (!s) return;
    if (s.timer !== undefined) clearTimer(s.timer);
    s.timer = undefined;
    s.abort?.abort(new Error('keepalive cancelled'));
    s.abort = undefined;
    s.nextAt = undefined;
    if (s.status === 'scheduled' || s.status === 'sending') s.status = status;
  }
  function rulesFor(key) {
    const rule = key === null ? undefined : store.read().rules[key];
    return rule?.enabled ? rule : undefined;
  }
  function arm(s) {
    const {leadSeconds} = store.read();
    const rule = rulesFor(s.key);
    if (!rule) { s.status = 'off'; return; }
    s.max = rule.maxRenewals;
    if (s.done >= s.max) { s.status = 'done'; return; }
    const ttlMs = rule.ttlMinutes * 60_000;
    const lead = Math.min(leadSeconds * 1000, Math.floor(ttlMs / 2));
    const at = s.baseTime + ttlMs - lead;
    s.nextAt = at;
    s.status = 'scheduled';
    if (s.timer !== undefined) clearTimer(s.timer);
    s.timer = setTimer(() => { s.timer = undefined; return fire(s).catch(error => logger?.warn?.("[UI TWEAK] cache keepalive: " + String(error?.message ?? error))); }, Math.max(0, at - now()));
    s.timer?.unref?.();
  }
  function evaluate(agent) {
    if (disposed || agent?.session === undefined) return;
    const session = agent.session;
    const id = String(session.id ?? agent.id);
    if (session.header?.origin === 'subagent') return;
    const events = session.snapshotEvents();
    const turn = humanCompletedTurn(events);
    const context = session.requestContext?.();
    const key = ruleKey(context?.provider, context?.model);
    const previous = states.get(id);
    if (turn === null || key === null) { if (previous) stop(id, 'idle'); return; }
    if (previous && previous.endSeq === turn.endSeq && previous.key === key) {
      // 同一轮的再次空闲（例如续期请求本身不会触发；其他插件状态抖动）：保持进度。
      if (previous.status === 'off' || previous.status === 'cancelled' || previous.status === 'paused') return;
      if (previous.timer === undefined && previous.status === 'scheduled') arm(previous);
      return;
    }
    if (previous) stop(id);
    const s = {sessionId: id, agent, key, turn: turn.turn, endSeq: turn.endSeq, baseTime: turn.baseTime, done: 0, max: 0, status: 'off'};
    states.set(id, s);
    arm(s);
  }
  async function fire(s) {
    if (disposed || states.get(s.sessionId) !== s || s.status !== 'scheduled') return;
    const agent = s.agent, session = agent.session;
    if (agent.status !== 'idle') { s.status = 'cancelled'; return; }
    const events = session.snapshotEvents();
    const latest = humanCompletedTurn(events);
    if (latest === null || latest.endSeq !== s.endSeq) { s.status = 'cancelled'; return; }
    if (!rulesFor(s.key)) { s.status = 'off'; return; }
    if (llm === undefined || typeof llm.stream !== 'function') { s.status = 'error'; s.lastError = 'LLM 服务不可用'; return; }
    const header = session.requestHeader?.();
    if (header?.config === undefined) { s.status = 'error'; s.lastError = '会话没有可复用的请求头'; return; }
    s.status = 'sending';
    const abort = new AbortController();
    s.abort = abort;
    const timeout = setTimer(() => abort.abort(new Error('keepalive timeout')), SEND_TIMEOUT_MS);
    timeout?.unref?.();
    let usage, gotOutput = false, failure;
    try {
      const messages = [...session.deriveMessages(), {
        id: randomUUID(), role: 'user', content: [{type: 'text', text: KEEPALIVE_PROMPT}],
        source: {kind: 'user', rpcId: 'dsh-ui-tweak:cache-keepalive'}
      }];
      const stream = llm.stream({
        ...header.config,
        messages,
        toolHistory: session.toolHistory?.(),
        ...header.tools !== undefined ? {tools: header.tools} : {},
        sessionId: session.id,
        signal: abort.signal
      });
      for await (const chunk of stream) {
        if (chunk?.type === 'usage') usage = chunk.usage;
        if (chunk?.type === 'finish') {
          if (chunk.reason?.kind === 'error') failure = chunk.reason.failure?.message ?? chunk.reason.failure?.code ?? 'error';
          break;
        }
        if (chunk?.type === 'text-delta' || chunk?.type === 'reasoning-delta' || chunk?.type === 'block-start' || chunk?.type === 'block-end') {
          gotOutput = true;
          // 上游已处理完整前缀并开始出字：缓存已刷新。中止以免继续计费输出。
          abort.abort(new Error('keepalive: first output received'));
          break;
        }
      }
    } catch (error) {
      if (!gotOutput) failure = String(error?.message ?? error);
    } finally {
      clearTimer(timeout);
      s.abort = undefined;
    }
    if (states.get(s.sessionId) !== s || s.status !== 'sending') return; // 期间被取消
    if (failure !== undefined && !gotOutput) {
      s.status = 'error';
      s.lastError = failure;
      logger?.warn?.(`[UI TWEAK] cache keepalive ${s.key} failed: ${failure}`);
      return;
    }
    s.done += 1;
    s.lastAt = now();
    s.baseTime = s.lastAt;
    s.lastError = undefined;
    if (usage) { s.lastCacheRead = usage.cacheReadTokens ?? 0; s.lastInput = usage.inputTokens ?? null; }
    arm(s);
  }

  return {
    attach(llmService) { llm = llmService; },
    onStatus(agent, status) {
      if (disposed || agent === undefined) return;
      const id = String(agent.session?.id ?? agent.id);
      if (status === 'running') { stop(id); return; }
      if (status === 'idle') {
        try { evaluate(agent); } catch (error) { logger?.warn?.('[UI TWEAK] cache keepalive evaluate: ' + String(error?.message ?? error)); }
      }
    },
    onDisposed(agent) { const id = String(agent?.session?.id ?? agent?.id); stop(id); states.delete(id); },
    /** 配置变更后重排所有会话（关闭的规则立即取消）。 */
    reschedule() {
      for (const s of states.values()) {
        if (s.status === 'sending') continue;
        if (!rulesFor(s.key)) { stop(s.sessionId, 'off'); s.status = 'off'; continue; }
        if (['scheduled', 'off', 'done'].includes(s.status)) arm(s);
      }
    },
    pause(sessionId) { const s = states.get(sessionId); if (!s) return null; stop(sessionId, 'paused'); s.status = 'paused'; return view(s); },
    resume(sessionId) { const s = states.get(sessionId); if (!s) return null; if (s.status === 'paused' || s.status === 'error') arm(s); return view(s); },
    status(sessionId) { return view(states.get(sessionId)); },
    /** 已注册渠道及其模型（只读目录查询，不发上游请求；目录失败的渠道返回空列表）。 */
    async catalog() {
      if (llm === undefined || typeof llm.listProviders !== 'function') return [];
      const providers = llm.listProviders().map(p => p?.id).filter(id => typeof id === 'string' && id);
      return Promise.all(providers.map(async provider => {
        try {
          const models = typeof llm.listModels === 'function' ? await Promise.race([llm.listModels(provider), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000).unref?.())]) : [];
          return {provider, models: (models ?? []).map(m => m?.id).filter(id => typeof id === 'string' && id)};
        } catch { return {provider, models: []}; }
      }));
    },
    config: () => store.read(),
    saveConfig(next) { const saved = store.write(next); this.reschedule(); return saved; },
    dispose() { disposed = true; for (const id of [...states.keys()]) stop(id); states.clear(); }
  };
}
