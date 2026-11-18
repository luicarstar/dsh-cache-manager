/**
 * dsh-request-stats — Host half.
 *
 * Registers the `requestStats` session projection on ctx.sessionProjections.
 *
 * 口径（按次计费，不含自动重试）：agent-loop 对上游 LLM 的每一次 HTTP 请求在会话
 * 日志里恰好落一条事件——成功/带内容中断结算为 `assistant/message`，失败/无内容
 * 中断结算为 `assistant/attempt`（dsh-agent-loop/lib/index.js 是唯一追加这两种事件
 * 的包，每处追加都对应一次 llm.stream() 调用）。其中「自动失败重试」的重发请求
 * 不计入：dsh-llm-retry 退避后重发前必落一条 `llm/retry-started`，图片卸载重发前
 * 必落一条 `image/offload`，紧跟其后的下一次请求事件即同一逻辑请求的自动重发。
 * 因此：
 *
 *   上游请求发起数 = count(assistant/message) + count(assistant/attempt)
 *                    − 紧跟 llm/retry-started / image/offload 的重发次数
 *
 * 跳过标记是顺序消费的（一次标记只吞一次请求），并在 step/turn 边界防御性清零，
 * 退避中途被取消的调度不会误伤后续请求。被跳过的重发计入 `retries` 供展示。
 * 按事件自带的 data.turn 归属到轮次，即可得到「每次回答」与「会话累计」两个数。
 * 另按 event.time 的分钟桶（floor(time/60000)）滚动统计峰值 RPM 与活跃分钟数
 * （活跃分钟 = 至少发生过一次请求的分钟；平均 RPM = 总数 / 活跃分钟），
 * 并统计 tool/call 事件数（工具调用次数）、子代理调度次数（工具名为子代理族调度工具的 tool/call 或 tool/ptc-dispatch-start；子代理会话自身的请求计入各自会话的日志，不在本投影内）。
 *
 * 轮次元信息（turnMeta）：每轮 turn/end 落一条 { durationMs, model? }——
 * durationMs = turn/end.time − turn/start.time（从用户请求进入到回答完毕的墙钟
 * 时长）；model 取该轮最后一次请求结算时的 request/context 携带模型（模型切换
 * 时 request/context 才落事件，未变化的轮次靠 currentModel 携带补齐），供
 * 轮次尾部徽章展示「作答时长 + 模型号」。
 * 折叠是纯函数、无副作用；状态为普通 JSON（可被 projection-cache 持久化）。
 * schema 采用直通对象（.parse 恒等返回）：注册表只调用 .parse，本插件私有、
 * 自产自销，无需 zod 依赖。
 */
// Plugin registration lives in index.js; event folding and wire shaping live here.
/** 每个轮次的计数最多保留这么多条（防 wire 载荷无限增长；最老的先裁）。 */
const MAX_TURNS_KEPT = 400;

/** 裁剪 turn 键控映射到最近 MAX_TURNS_KEPT 条（按轮号升序保留尾部）。 */
function pruneTurnMap(map) {
	const keys = Object.keys(map);
	if (keys.length <= MAX_TURNS_KEPT) return map;
	const pruned = {};
	for (const kept of keys.sort((a, b) => Number(a) - Number(b)).slice(keys.length - MAX_TURNS_KEPT)) pruned[kept] = map[kept];
	return pruned;
}

/** 子代理族调度工具（会派生子会话的调用）；list_subagent_models 等查询工具不计。 */
const SUBAGENT_TOOLS = new Set(["subagent", "subagent_fork", "subagent_codex", "ralph", "spawn_teammate"]);

/** 直通 schema：注册表只调用 .parse(value)，恒等返回即可。 */
const passthroughSchema = { parse: (value) => value };

/** 事件是否为一次已结算的上游请求。 */
function isRequestEvent(event) {
	return event.type === "assistant/message" || event.type === "assistant/attempt";
}

/** 事件时间戳（毫秒），无效时返回 null。 */
function eventTime(event) {
	const time = event.time;
	return typeof time === "number" && Number.isFinite(time) && time >= 0 ? time : null;
}

/**
 * 把一次「计数事件」并入分钟滚动统计。
 * @param minute - 分钟桶状态 { current, count, peak, active }。
 * @param time - 事件时间戳。
 * @returns 更新后的分钟桶状态（引用不变时原样返回）。
 */
function foldMinute(minute, time) {
	const bucket = Math.floor(time / 60000);
	if (minute.current === bucket) {
		const count = minute.count + 1;
		return { ...minute, count, peak: Math.max(minute.peak, count) };
	}
	return { ...minute, current: bucket, count: 1, peak: Math.max(minute.peak, 1), active: minute.active + 1 };
}

const EMPTY_REQUEST_MINUTE = { current: null, count: 0, peak: 0, active: 0 };

/** 读取事件的轮号（非负整数），无效返回 null。 */
function eventTurn(event) {
	const data = event.data;
	return data !== null && typeof data === "object" && typeof data.turn === "number" && Number.isInteger(data.turn) && data.turn >= 0
		? data.turn
		: null;
}

/** 剥掉模型号里的站点来源前缀：provider+"/" 或 provider+"-" 开头时剥掉；
    兜底再剥最后一个 "/" 之前的部分。剥完为空则返回 null。 */
function stripSitePrefix(model, provider) {
	if (typeof model !== "string" || model === "") return null;
	let m = model;
	if (typeof provider === "string" && provider !== "" && m.startsWith(provider)) {
		const rest = m.slice(provider.length);
		if (rest.startsWith("/") || rest.startsWith("-")) m = rest.slice(1);
	}
	const slash = m.lastIndexOf("/");
	if (slash >= 0) m = m.slice(slash + 1);
	return m === "" ? null : m;
}

/** `requestStats` 投影单元：state 与 wire view 同形（skipNextRequest/openTurn/currentModel/currentProvider 为内部折叠状态，不入 view）。 */
const requestStatsProjection = {
	key: "requestStats",
	/* stateVersion 9：turnMeta 增加 provider（渠道），作废旧检查点以冷重放补齐。
	   stateVersion 8：补计 code-mode 的 tool/ptc-dispatch-start；
	   作废旧检查点，冷重放历史日志以补齐遗漏的子代理调度次数。 */
	stateVersion: 9,
	stateSchema: passthroughSchema,
	init: () => ({
		total: 0,
		lastTurn: null,
		turns: {},
		firstTime: null,
		lastTime: null,
		requestMinute: EMPTY_REQUEST_MINUTE,
		toolCalls: 0,
		subagents: 0,
		retries: 0,
		skipNextRequest: false,
		currentModel: null,
		currentProvider: null,
		openTurn: null,
		turnMeta: {}
	}),
	apply: (state, event) => {
		if (event.type === "llm/retry-started" || event.type === "image/offload") {
			/* 自动失败重试已排定：紧随其后的下一次请求是重发，不计数。 */
			return state.skipNextRequest ? state : { ...state, skipNextRequest: true };
		}
		if (event.type === "request/context") {
			/* 模型路由快照：仅在变化时落一条，靠携带补齐未变化的轮次。
			   provider 与 model 同步携带，供模型号剥站点前缀用。 */
			const data = event.data;
			const model = data !== null && typeof data === "object" && typeof data.model === "string" && data.model !== "" ? data.model : null;
			const provider = data !== null && typeof data === "object" && typeof data.provider === "string" && data.provider !== "" ? data.provider : null;
			if (model === null || (model === state.currentModel && provider === state.currentProvider)) return state;
			return { ...state, currentModel: model, currentProvider: provider };
		}
		if (event.type === "turn/start") {
			const next = state.skipNextRequest ? { ...state, skipNextRequest: false } : state;
			const turn = eventTurn(event);
			const time = eventTime(event);
			if (turn === null || time === null) return next;
			return { ...next, openTurn: { turn, startTime: time, model: null, messageId: null } };
		}
		if (event.type === "turn/end") {
			const next = state.skipNextRequest ? { ...state, skipNextRequest: false } : state;
			const turn = eventTurn(event);
			const time = eventTime(event);
			const open = next.openTurn;
			if (turn === null || time === null || open === null || open.turn !== turn) return next;
			const stripped = open.model === null ? null : (stripSitePrefix(open.model, open.provider) ?? open.model);
			const meta = {
				durationMs: Math.max(0, Math.round(time - open.startTime)),
				...stripped === null ? {} : { model: stripped },
				...typeof open.provider === "string" && open.provider !== "" ? { provider: open.provider } : {},
				...open.messageId === null || open.messageId === undefined ? {} : { messageId: open.messageId }
			};
			return { ...next, openTurn: null, turnMeta: pruneTurnMap({ ...next.turnMeta, [String(turn)]: meta }) };
		}
		if (event.type === "step/start" || event.type === "step/end") {
			/* 边界防御性清零：重试从不跨 step，残留标记只可能来自被取消的退避。 */
			return state.skipNextRequest ? { ...state, skipNextRequest: false } : state;
		}
		if (isRequestEvent(event)) {
			/* 先记该轮最后一次请求使用的模型（无论该请求是否计数，重试也更新），
			   以及最后一条带文本回复的 messageId（官方操作行徽章反查轮次用）。 */
			const turn = eventTurn(event);
			let base = state;
			if (event.type === "assistant/message" && turn !== null && base.openTurn !== null && base.openTurn.turn === turn) {
				const id = typeof event.data?.message?.id === "string" ? event.data.message.id : null;
				const content = event.data?.message?.content;
				const hasText = Array.isArray(content) && content.some((b) => b?.type === "text" && typeof b.text === "string" && b.text.trim() !== "");
				if (id !== null && hasText && base.openTurn.messageId !== id) {
					base = { ...base, openTurn: { ...base.openTurn, messageId: id } };
				}
			}
			if (turn !== null && base.openTurn !== null && base.openTurn.turn === turn && state.currentModel !== null && (base.openTurn.model !== state.currentModel || base.openTurn.provider !== state.currentProvider)) {
				base = { ...base, openTurn: { ...base.openTurn, model: state.currentModel, provider: state.currentProvider } };
			}
			if (base.skipNextRequest) {
				/* 同一逻辑请求的自动重发：计入 retries，不计入请求统计。 */
				return { ...base, skipNextRequest: false, retries: base.retries + 1 };
			}
			const time = eventTime(event);
			const next = {
				...base,
				total: base.total + 1,
				...time === null ? {} : {
					firstTime: base.firstTime === null ? time : Math.min(base.firstTime, time),
					lastTime: base.lastTime === null ? time : Math.max(base.lastTime, time),
					requestMinute: foldMinute(base.requestMinute, time)
				}
			};
			if (turn === null) return next;
			const key = String(turn);
			const turns = {
				...base.turns,
				[key]: (Object.hasOwn(base.turns, key) ? base.turns[key] : 0) + 1
			};
			return { ...next, lastTurn: turn, turns: pruneTurnMap(turns) };
		}
		if (event.type === "tool/ptc-dispatch-start") {
			/* Code-mode 嵌套调度只记开始事件；完成事件不再计数。
			   toolCalls 仍保持顶层 tool/call 的原有口径。 */
			const data = event.data;
			return data !== null && typeof data === "object" && typeof data.name === "string" && SUBAGENT_TOOLS.has(data.name)
				? { ...state, subagents: state.subagents + 1 }
				: state;
		}
		if (event.type === "tool/call") {
			const data = event.data;
			const isSubagent = data !== null && typeof data === "object" && typeof data.name === "string" && SUBAGENT_TOOLS.has(data.name);
			return {
				...state,
				toolCalls: state.toolCalls + 1,
				...(isSubagent ? { subagents: state.subagents + 1 } : {})
			};
		}
		return state;
	},
	wire: {
		viewSchema: passthroughSchema,
		view: (state) => ({
			total: state.total,
			lastTurn: state.lastTurn,
			turns: state.turns,
			firstTime: state.firstTime,
			lastTime: state.lastTime,
			requestMinute: state.requestMinute,
			toolCalls: state.toolCalls,
			subagents: state.subagents,
			retries: state.retries,
			turnMeta: state.turnMeta
		})
	}
};

export { requestStatsProjection, stripSitePrefix };
