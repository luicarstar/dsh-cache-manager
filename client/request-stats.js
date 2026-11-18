/** 请求统计与缓存 TTL（自 dsh-request-stats 0.1.0 合并入 UI TWEAK）。
 *  A. 输入框下方「⇅ 本轮 N · 累计 M 次」请求统计丸（点击弹出详情面板）。
 *  B. 回答底部模型号徽章；用量详情对话框补「用时」行。
 *  C. 缓存 TTL 倒计时丸与「设置 → 缓存 TTL」配置页（localStorage，键名不变）。
 *  数据来自 Host 侧 requestStats 会话投影（request-stats-projection.js）。 */
export function createRequestStatsModule({React, h, createPortal}) {

		/* ── 样式：统计丸逐条对齐官方 StatsPills；面板逐条对齐官方 stat-dialog ── */
		const CSS = [
".dsh-ttl-settings{max-width:820px;display:grid;gap:20px;color:var(--dsw-alias-label-primary)}.dsh-ttl-card{padding:20px;border:1px solid var(--dsw-alias-border-l2,#5555);border-radius:12px;display:grid;gap:14px}.dsh-ttl-card h3{margin:0;font-size:15px}.dsh-ttl-note{margin:0;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:1.6}.dsh-ttl-settings input{box-sizing:border-box;min-width:0;border:1px solid var(--dsw-alias-border-l2,#666);border-radius:6px;padding:8px 10px;background:var(--dsw-specific-menu,#222);color:inherit;font:inherit}.dsh-ttl-settings input:focus-visible,.dsh-ttl-settings button:focus-visible{outline:2px solid var(--dsw-alias-label-link,#75aaff);outline-offset:2px}.dsh-ttl-settings button{border:1px solid var(--dsw-alias-border-l2,#666);border-radius:6px;padding:8px 12px;color:inherit;background:var(--dsw-alias-interactive-bg-hover,#ffffff0a);cursor:pointer;white-space:nowrap}.dsh-ttl-settings button:disabled{opacity:.45;cursor:default}.dsh-ttl-default{display:flex;align-items:center;gap:12px}.dsh-ttl-default input{width:130px}.dsh-ttl-presets{display:flex;gap:8px;flex-wrap:wrap}.dsh-ttl-add{display:flex;gap:10px}.dsh-ttl-add input{flex:1}.dsh-ttl-model{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid var(--dsw-alias-border-l2,#5555);padding-top:12px}.dsh-ttl-model label{display:grid;grid-template-columns:minmax(100px,1fr) 110px auto;align-items:center;gap:12px;min-width:0;flex:1}.dsh-ttl-model label>span:first-child{overflow-wrap:anywhere;font-size:13px}.dsh-ttl-footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.dsh-ttl-footer [role=status]{flex:1;font-size:12px;color:var(--dsw-alias-label-tertiary,#999)}.dsh-ttl-footer button[type=submit]{background:var(--dsw-alias-label-link,#497bbb);color:white}.dsh-ttl-error{color:#f39191;margin:0;font-size:13px}.dsh-ttl-empty{margin:0;padding:14px 0;color:var(--dsw-alias-label-tertiary,#999);font-size:13px}@media(max-width:620px){.dsh-ttl-card{padding:14px}.dsh-ttl-model{align-items:flex-start;flex-wrap:wrap}.dsh-ttl-model label{grid-template-columns:minmax(100px,1fr) 100px}.dsh-ttl-model .dsh-ttl-note{grid-column:1/-1}.dsh-ttl-add{flex-wrap:wrap}}",
			".dsh-reqstats-anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}",
			".dsh-reqstats-pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm,6px);max-width:100%;color:var(--dsw-alias-label-tertiary,#9a958c);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex;cursor:pointer}",
			".dsh-reqstats-pill svg{flex:none;width:14px;height:14px}",
			".dsh-reqstats-pill:hover,.dsh-reqstats-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-secondary)}",
			".dsh-reqstats-label{text-overflow:ellipsis;min-width:0;overflow:hidden}",
			".dsh-reqstats-tail{order:1;display:inline-flex;align-items:center;gap:4px;color:var(--dsw-alias-label-tertiary,#9a958c);font-size:12px;line-height:20px;font-variant-numeric:tabular-nums;user-select:none;white-space:nowrap}",
			"[data-turn-tail] [data-clock=end]:has(>.dsh-reqstats-tail)>span:last-child:not(.dsh-reqstats-tail){order:2}",
			".dsh-reqstats-tail:empty{display:none}",
			".dsh-reqstats-panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg,14px);background:var(--dsw-specific-menu,#2a2a2a);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}",
			".dsh-reqstats-title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}",
			".dsh-reqstats-titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}",
			".dsh-reqstats-titleValue{font-variant-numeric:tabular-nums}",
			".dsh-reqstats-titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}",
			".dsh-reqstats-titleLabel svg{flex:none;width:14px;height:14px}",
			".dsh-reqstats-details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}",
			".dsh-reqstats-details dt,.dsh-reqstats-details dd{min-width:0;margin:0}",
			".dsh-reqstats-details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}",
			".dsh-reqstats-pill[data-keepalive=on]{color:var(--dsw-alias-label-link,#75aaff)}",
			".dsh-ka-switch{position:relative;flex:none;width:30px;height:18px;border-radius:9px;border:0;padding:0;background:var(--dsw-alias-border-l2,#5558);cursor:pointer;transition:background .15s}.dsh-ka-switch[aria-checked=true]{background:var(--dsw-alias-label-link,#497bbb)}.dsh-ka-switch:disabled{opacity:.45;cursor:default}.dsh-ka-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .15s}.dsh-ka-switch[aria-checked=true] .dsh-ka-knob{transform:translateX(12px)}",
			".dsh-ka-stepper{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l2,#5558);border-radius:6px;overflow:hidden;font-variant-numeric:tabular-nums}.dsh-ka-stepper button{border:0!important;border-radius:0!important;padding:0 7px!important;height:22px;background:transparent!important;color:inherit;cursor:pointer;font-size:13px;line-height:22px}.dsh-ka-stepper button:disabled{opacity:.35;cursor:default}.dsh-ka-stepper-value{min-width:22px;text-align:center;font-size:12px}",
			".dsh-ka-panel{min-width:280px}.dsh-ka-panel .dsh-reqstats-title{align-items:center}.dsh-ka-route{display:flex;align-items:center;gap:6px;margin:-2px 0 10px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}.dsh-ka-panel dd{display:flex;justify-content:flex-end}.dsh-ka-action{margin-top:12px;width:100%;border:1px solid var(--dsw-alias-border-l2,#5558);border-radius:6px;padding:6px;background:transparent;color:inherit;cursor:pointer}.dsh-ka-action:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff10)}.dsh-ka-hint{margin:12px 0 0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}.dsh-ka-err{color:#f39191!important;overflow-wrap:anywhere}",
			".dsh-ka-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.dsh-ka-head h3{margin:0 0 6px}.dsh-ka-search{width:200px;flex:none}.dsh-ka-list{display:grid;grid-auto-rows:max-content;align-content:start;gap:6px;max-height:520px;overflow:auto;margin:0 -6px;padding:0 6px}",
			".dsh-ka-group{border:1px solid var(--dsw-alias-border-l2,#5554);border-radius:10px;overflow:hidden}.dsh-ka-group-head{display:flex;justify-content:space-between;align-items:center;padding:7px 12px;background:var(--dsw-alias-interactive-bg-hover,#ffffff08);font-size:12px}.dsh-ka-group-name{font-weight:500;color:var(--dsw-alias-label-primary)}.dsh-ka-group-meta{color:var(--dsw-alias-label-tertiary)}",
			".dsh-ka-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;align-items:center;gap:14px;padding:7px 12px;border-top:1px solid var(--dsw-alias-border-l2,#5553);font-size:13px}.dsh-ka-row:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff06)}.dsh-ka-model{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-ka-row[data-on='0'] .dsh-ka-model{color:var(--dsw-alias-label-secondary)}.dsh-ka-ttl{color:var(--dsw-alias-label-tertiary);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}",
			"@media(max-width:620px){.dsh-ka-head{flex-direction:column}.dsh-ka-search{width:100%}.dsh-ka-row{grid-template-columns:minmax(0,1fr) auto auto;gap:10px}.dsh-ka-ttl{display:none}}",
			".dsh-ttl-channel{display:inline-block;margin-right:6px;padding:0 6px;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-secondary);font-size:12px}",
			".dsh-ttl-settings select{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#666);border-radius:6px;padding:8px 10px;background:var(--dsw-specific-menu,#222);color:inherit;font:inherit}.dsh-ttl-ka select{padding:4px 6px;font-size:12px}.dsh-ttl-ka{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px}.dsh-ttl-ka input[type=number]{width:70px}.dsh-ttl-ka input[type=checkbox]{width:auto}",
			".dsh-ttl-default{flex-wrap:wrap}.dsh-ttl-default .dsh-ttl-presets{margin-left:auto}.dsh-ttl-presets button[aria-pressed=true]{border-color:var(--dsw-alias-label-link,#75aaff);color:var(--dsw-alias-label-link,#75aaff)}",
			".dsh-tm-cols,.dsh-tm-row{display:grid;grid-template-columns:minmax(0,1fr) 112px 78px 34px;align-items:center;gap:14px;padding:6px 12px}.dsh-tm-cols{position:sticky;top:0;z-index:1;padding-top:2px;padding-bottom:4px;background:var(--dsw-specific-settings-bg,var(--dsw-specific-menu,#222));color:var(--dsw-alias-label-tertiary,#999);font-size:11px}.dsh-tm-cols span:nth-child(n+2){text-align:center}",
			".dsh-tm-row{border-top:1px solid var(--dsw-alias-border-l2,#5553);font-size:13px}.dsh-tm-row:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff06)}.dsh-tm-row>*:nth-child(n+3){justify-self:center}.dsh-tm-model{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-tm-row[data-on='0'][data-custom='0'] .dsh-tm-model{color:var(--dsw-alias-label-secondary)}",
			".dsh-tm-ttl{display:flex;align-items:center;gap:4px}.dsh-ttl-settings input.dsh-tm-input{width:84px;padding:4px 8px;text-align:right;font-variant-numeric:tabular-nums}.dsh-ttl-settings .dsh-tm-input::placeholder{color:var(--dsw-alias-label-tertiary,#888);opacity:.8}.dsh-ttl-settings .dsh-tm-input[aria-invalid=true]{border-color:#f39191}.dsh-ttl-default input.dsh-tm-input{width:96px;padding:8px 10px}",
			".dsh-ttl-settings button.dsh-tm-reset{width:22px;height:22px;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#999);font-size:14px;line-height:22px}.dsh-ttl-settings button.dsh-tm-reset:hover{color:var(--dsw-alias-label-primary)}span.dsh-tm-reset{display:inline-block;width:22px}",
			".dsh-ttl-settings button.dsh-tm-group-head{width:100%;display:flex;align-items:center;gap:8px;border:0;border-radius:0;padding:7px 12px;background:var(--dsw-alias-interactive-bg-hover,#ffffff08);font-size:12px;text-align:left}.dsh-ttl-settings button.dsh-tm-group-head:disabled{opacity:1;cursor:default}.dsh-tm-group-head .dsh-ka-group-meta{margin-left:auto}",
			".dsh-tm-other>summary{cursor:pointer;list-style:none;display:flex;align-items:center}.dsh-tm-other>summary::-webkit-details-marker{display:none}.dsh-tm-other>summary::before{content:'▸';margin-right:8px;color:var(--dsw-alias-label-tertiary)}.dsh-tm-other[open]>summary::before{content:'▾'}.dsh-tm-other-row{grid-template-columns:minmax(0,1fr) 112px auto}.dsh-ttl-add input.dsh-tm-input{flex:none;width:84px}",
			/* 设置页的通用 button 样式优先级更高，开关需单独复位，否则会被撑成带边框的大按钮。 */
			".dsh-ttl-settings button.dsh-ka-switch{border:0;border-radius:9px;padding:0;width:30px;height:18px;background:var(--dsw-alias-border-l2,#5558)}.dsh-ttl-settings button.dsh-ka-switch[aria-checked=true]{background:var(--dsw-alias-label-link,#497bbb)}",
			"@media(max-width:620px){.dsh-tm-cols,.dsh-tm-row{grid-template-columns:minmax(0,1fr) 96px 70px 34px;gap:8px;padding-left:8px;padding-right:8px}.dsh-ttl-settings input.dsh-tm-input{width:64px}.dsh-ttl-default .dsh-ttl-presets{margin-left:0}}"
		];

		function ensureStyle() {
			const tagId = "dsh-request-stats";
			const existing = document.querySelector(`style[data-plugin-css="${tagId}"]`);
			if (existing !== null) {
				existing.textContent = CSS.join("\n");
				return;
			}
			const tag = document.createElement("style");
			tag.setAttribute("data-plugin-css", tagId);
			tag.textContent = CSS.join("\n");
			document.head.appendChild(tag);
		}

		/** ⇅ 上下双箭头图标（与官方统计丸的线性图标同风格）。 */
		function RequestIcon() {
			return h("svg", {
				viewBox: "0 0 16 16",
				width: 14,
				height: 14,
				"aria-hidden": true,
				fill: "none",
				stroke: "currentColor",
				"stroke-width": 1.5,
				"stroke-linecap": "round",
				"stroke-linejoin": "round"
			},
				h("path", { d: "M5 12.5v-9" }),
				h("path", { d: "M2.8 5.7 5 3.5l2.2 2.2" }),
				h("path", { d: "M11 3.5v9" }),
				h("path", { d: "M8.8 10.3 11 12.5l2.2-2.2" })
			);
		}

		const MEASURE_STYLE = { visibility: "hidden", left: 0, top: 0 };

		/**
		 * 锚定弹窗：打开后先隐形渲染量尺寸，再定位到锚点上方（放不下则下方）；
		 * Escape 或点击外部关闭。逻辑对齐官方 useStatDialog。
		 */
		function useAnchoredDialog() {
			const [open, setOpen] = React.useState(false);
			const rootRef = React.useRef(null);
			const panelRef = React.useRef(null);
			const [pos, setPos] = React.useState(null);
			React.useLayoutEffect(() => {
				if (!open) {
					setPos(null);
					return;
				}
				const anchor = rootRef.current === null ? null : rootRef.current.getBoundingClientRect();
				const panel = panelRef.current === null ? null : panelRef.current.getBoundingClientRect();
				if (anchor === null || panel === null || panel.width === 0) return;
				const margin = 12;
				const gap = 8;
				let left = anchor.left;
				left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - panel.width - margin));
				let top = anchor.top - panel.height - gap;
				if (top < margin) top = Math.min(anchor.bottom + gap, Math.max(margin, window.innerHeight - panel.height - margin));
				setPos({ left: Math.round(left), top: Math.round(top) });
			}, [open]);
			React.useEffect(() => {
				if (!open) return;
				const onKeyDown = (e) => {
					if (e.key === "Escape") setOpen(false);
				};
				const onClick = (e) => {
					if (e.target instanceof Node && rootRef.current?.contains(e.target) !== true && panelRef.current?.contains(e.target) !== true) setOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				document.addEventListener("click", onClick, true);
				return () => {
					document.removeEventListener("keydown", onKeyDown);
					document.removeEventListener("click", onClick, true);
				};
			}, [open]);
			return { open, setOpen, rootRef, panelRef, pos };
		}

		function readCount(stats, turn) {
			if (stats === void 0 || stats === null) return null;
			if (typeof turn !== "number") return null;
			const turns = stats.turns;
			if (turns === null || typeof turns !== "object") return null;
			const value = turns[String(turn)];
			return typeof value === "number" && value >= 0 ? value : 0;
		}

		/** 该轮的元信息 { durationMs, model? } | null。 */
		function readTurnMeta(stats, turn) {
			if (stats === void 0 || stats === null) return null;
			if (typeof turn !== "number") return null;
			const turnMeta = stats.turnMeta;
			if (turnMeta === null || typeof turnMeta !== "object") return null;
			const meta = turnMeta[String(turn)];
			return meta !== null && typeof meta === "object" ? meta : null;
		}

		/** 毫秒 → 人类可读时长：58秒 / 12分34秒 / 2小时13分。 */
		function formatDuration(ms) {
			if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
			const totalSec = Math.round(ms / 1000);
			if (totalSec < 60) return `${String(totalSec)}秒`;
			const min = Math.floor(totalSec / 60);
			const sec = totalSec % 60;
			if (min < 60) return sec > 0 ? `${String(min)}分${String(sec)}秒` : `${String(min)}分`;
			const hr = Math.floor(min / 60);
			const m = min % 60;
			return m > 0 ? `${String(hr)}小时${String(m)}分` : `${String(hr)}小时`;
		}

		function perMinute(minute) {
			if (minute === null || typeof minute !== "object") return { peak: 0, active: 0, avg: 0 };
			const peak = typeof minute.peak === "number" && minute.peak >= 0 ? minute.peak : 0;
			const active = typeof minute.active === "number" && minute.active >= 0 ? minute.active : 0;
			return { peak, active, avg: active > 0 ? minute.count / active : 0 };
		}

		function rate(total, active) {
			if (active <= 0) return "—";
			const value = total / active;
			return `${value >= 10 ? String(Math.round(value)) : value.toFixed(1)} 次/分`;
		}

		/* ── A. 输入框下方统计条旁的请求计数丸（可点击弹出详情） ── */
		const RequestPill = React.memo(function RequestPill({ useProjection }) {
			if (typeof useProjection !== "function") return null;
			const stats = useProjection("requestStats");
			const { open, setOpen, rootRef, panelRef, pos } = useAnchoredDialog();
			if (stats === void 0 || stats === null) return null;
			const total = typeof stats.total === "number" && stats.total >= 0 ? stats.total : 0;
			if (total === 0) return null;
			const lastTurn = stats.lastTurn;
			const current = readCount(stats, lastTurn) ?? 0;
			const requestRate = perMinute(stats.requestMinute);
			const retries = typeof stats.retries === "number" && stats.retries >= 0 ? stats.retries : 0;
			const toolCalls = typeof stats.toolCalls === "number" && stats.toolCalls >= 0 ? stats.toolCalls : 0;
			const subagents = typeof stats.subagents === "number" && stats.subagents >= 0 ? stats.subagents : 0;
			return h("span", { ref: rootRef, className: "dsh-reqstats-anchor", "data-composer-stat": "requests" },
				h("button", {
					type: "button",
					className: "dsh-reqstats-pill",
					"aria-haspopup": "dialog",
					"aria-expanded": open,
					"aria-label": `上游 API 请求：本轮 ${String(current)} 次，会话累计 ${String(total)} 次`,
					title: `上游 API 请求发起次数（不含自动失败重试）：本轮 ${String(current)} 次 · 会话累计 ${String(total)} 次${retries > 0 ? ` · 另有 ${String(retries)} 次自动重试未计入` : ""}${subagents > 0 ? ` · 子代理调度 ${String(subagents)} 次` : ""} — 点击查看详情`,
					onClick: () => { setOpen(!open); }
				},
					h(RequestIcon),
					h("span", { className: "dsh-reqstats-label" }, `本轮 ${String(current)} · 累计 ${String(total)} 次${subagents > 0 ? ` · 子代理 ${String(subagents)}` : ""}`)
				),
				open && createPortal(h("div", {
					ref: panelRef,
					className: "dsh-reqstats-panel",
					role: "dialog",
					"aria-label": "请求统计",
					style: pos ?? MEASURE_STYLE
				},
					h("div", { className: "dsh-reqstats-title" },
						h("span", { className: "dsh-reqstats-titleLabel" }, h(RequestIcon), "请求统计"),
						h("span", { className: "dsh-reqstats-titleValue" }, `${String(total)} 次`)
					),
					h("div", { className: "dsh-reqstats-titleRule", "aria-hidden": true }),
					h("dl", { className: "dsh-reqstats-details", "data-request-stats-details": true },
						h("dt", null, "API 请求"),
						h("dd", null, `${String(total)} 次`),
						h("dt", null, "自动重试"),
						h("dd", null, `${String(retries)} 次${retries > 0 ? "（未计入）" : ""}`),
						h("dt", null, "峰值 RPM"),
						h("dd", null, `${String(requestRate.peak)} 次/分`),
						h("dt", null, "平均 RPM"),
						h("dd", null, rate(total, requestRate.active)),
						h("dt", null, "工具调用"),
						h("dd", null, `${String(toolCalls)} 次`),
						h("dt", null, "子代理调用"),
						h("dd", null, `${String(subagents)} 次`)
					)
				), document.body)
			);
		});

		/** 按回复 messageId 反查轮次元信息（官方操作行徽章用）。 */
		function findTurnMeta(stats, messageId) {
			if (stats === void 0 || stats === null || typeof messageId !== "string" || messageId === "") return null;
			const turnMeta = stats.turnMeta;
			if (turnMeta === null || typeof turnMeta !== "object") return null;
			for (const [turn, meta] of Object.entries(turnMeta)) {
				if (meta !== null && typeof meta === "object" && meta.messageId === messageId) {
					return { turn: Number(turn), meta };
				}
			}
			return null;
		}

		/* ── B. 回答底部只显示模型；用时进入官方用量详情 ── */
		const StatsAction = React.memo(function StatsAction({ useProjection, messageId }) {
			if (typeof useProjection !== "function" || typeof messageId !== "string" || messageId === "") return null;
			const stats = useProjection("requestStats");
			const found = findTurnMeta(stats, messageId);
			if (found === null) return null;
			const duration = formatDuration(found.meta.durationMs);
			const model = typeof found.meta.model === "string" && found.meta.model !== "" ? found.meta.model : null;
			if (duration === null && model === null) return null;
			return h("span", {
				className: "dsh-reqstats-tail",
				"data-dsh-duration": duration ?? undefined,
				title: model === null ? undefined : `作答模型 ${model}`
			}, model ?? "");
		});

		/** Enrich only the clicked turn's native usage dialog, preserving token accounting. */
		function installUsageDuration() {
			let activeRow = null;
			let frame = null;
			function update() {
				if (!activeRow?.isConnected) return;
				const trigger = activeRow.querySelector('[data-clock=end] button[aria-haspopup="dialog"][aria-expanded="true"]');
				const duration = activeRow.querySelector('.dsh-reqstats-tail')?.getAttribute("data-dsh-duration");
				if (!trigger || !duration) return;
				for (const details of document.querySelectorAll("[data-turn-usage-details]")) {
					if (details.querySelector("[data-dsh-usage-duration]")) continue;
					const label = document.createElement("dt"), value = document.createElement("dd");
					label.dataset.dshUsageDuration = "label";
					value.dataset.dshUsageDuration = "value";
					label.textContent = "用时";
					value.textContent = duration;
					details.append(label, value);
					// The native dialog measured itself before the extra row was inserted.
					const panel = details.closest('[role="dialog"]');
					if (panel) {
						const anchor = trigger.getBoundingClientRect();
						const box = panel.getBoundingClientRect();
						const above = anchor.top - box.height - 8;
						panel.style.top = `${Math.max(12, above >= 12 ? above : Math.min(anchor.bottom + 8, window.innerHeight - box.height - 12))}px`;
					}
				}
			}
			function schedule() {
				if (frame !== null) return;
				frame = requestAnimationFrame(() => { frame = null; update(); });
			}
			function onClick(event) {
				const button = event.target instanceof Element ? event.target.closest('button[aria-haspopup="dialog"]') : null;
				const row = button?.closest("[data-turn-tail]");
				if (row && button.closest('[data-clock="end"]')) { activeRow = row; schedule(); }
			}
			const observer = new MutationObserver(schedule);
			observer.observe(document.body, { childList: true, subtree: true });
			document.addEventListener("click", onClick, true);
			return () => {
				observer.disconnect();
				document.removeEventListener("click", onClick, true);
				if (frame !== null) cancelAnimationFrame(frame);
				for (const node of document.querySelectorAll("[data-dsh-usage-duration]")) node.remove();
			};
		}

        /* Cache TTL is a local estimate, not the upstream cache policy. */
        const TTL_STORAGE_KEY = "dsh-request-stats:cache-ttl";
        const SEEN_MODELS_KEY = "dsh-request-stats:seen-models";
        const TTL_EVENT = "dsh-request-stats:ttl-changed";
        const MAX_TTL = 525600;
        function validMinutes(v) { return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_TTL; }
        function normalizeTtl(parsed) {
            const models = {};
            if (parsed?.models && typeof parsed.models === "object" && !Array.isArray(parsed.models)) {
                for (const [name,value] of Object.entries(parsed.models)) {
                    if (name.trim() && validMinutes(value)) Object.defineProperty(models,name,{value,enumerable:true,writable:true,configurable:true});
                }
            }
            return {defaultMinutes:validMinutes(parsed?.defaultMinutes)?parsed.defaultMinutes:60,models};
        }
        function ttlSnapshot() { try {return window.localStorage.getItem(TTL_STORAGE_KEY)??"";} catch {return "";} }
        function readTtlConfig(raw=ttlSnapshot()) { try {return normalizeTtl(JSON.parse(raw));} catch {return normalizeTtl(null);} }
        function subscribeTtl(listener) {
            const storage=e=>{if(e.key===TTL_STORAGE_KEY||e.key===null)listener();};
            window.addEventListener("storage",storage);window.addEventListener(TTL_EVENT,listener);
            return ()=>{window.removeEventListener("storage",storage);window.removeEventListener(TTL_EVENT,listener);};
        }
        function useTtlConfig() {const raw=React.useSyncExternalStore(subscribeTtl,ttlSnapshot,()=>"");return React.useMemo(()=>readTtlConfig(raw),[raw]);}
        function writeTtlConfig(config) {
            try {window.localStorage.setItem(TTL_STORAGE_KEY,JSON.stringify(config));} catch(error) {throw new Error("保存失败：本地存储不可用或空间不足；修改尚未保存。",{cause:error});}
            window.dispatchEvent(new Event(TTL_EVENT));
        }
        function ttlFor(config,model,provider) {
            const full=channelId(provider,model);
            if(typeof full==="string"&&Object.hasOwn(config.models,full))return config.models[full];
            return typeof model==="string"&&Object.hasOwn(config.models,model)?config.models[model]:config.defaultMinutes;
        }
        function seenModels() {try {const data=JSON.parse(window.localStorage.getItem(SEEN_MODELS_KEY)??"[]");return Array.isArray(data)?data.filter(x=>typeof x==="string"&&x.trim()):[];}catch{return [];}}
        function recordSeenModel(model) {if(!model)return;try{const seen=seenModels();if(!seen.includes(model))window.localStorage.setItem(SEEN_MODELS_KEY,JSON.stringify([...seen,model].slice(-500)));}catch{}}
        function readCurrentModel(stats) {const meta=stats?.turnMeta?.[String(stats.lastTurn)];return typeof meta?.model==="string"&&meta.model?meta.model:null;}
        function readCurrentProvider(stats) {const meta=stats?.turnMeta?.[String(stats.lastTurn)];return typeof meta?.provider==="string"&&meta.provider?meta.provider:null;}
        /** 带渠道的显示/配置键：「渠道 / 模型」。 */
        const SEP=" / ";
        /* 与 Host 的 stripSitePrefix 一致：剥掉渠道前缀与最后一个 "/" 之前的部分，保证配置键两端对齐。 */
        function stripModel(model,provider){let m=String(model);if(provider&&m.startsWith(provider)){const r=m.slice(provider.length);if(r[0]==="/"||r[0]==="-")m=r.slice(1);}const i=m.lastIndexOf("/");if(i>=0)m=m.slice(i+1);return m||String(model);}
        function channelId(provider,model){return provider&&model?provider+SEP+model:model;}
        function splitChannel(id){const i=typeof id==="string"?id.indexOf(SEP):-1;return i>0?{provider:id.slice(0,i),model:id.slice(i+SEP.length)}:{provider:null,model:id};}
        function ChannelLabel({id}){const {provider,model}=splitChannel(id);return provider?h("span",null,h("span",{className:"dsh-ttl-channel"},provider),model):h("span",null,model);}
        function formatRemaining(ms) {
            if(ms<=0)return "预计已过期";
            const seconds=Math.ceil(ms/1000);
            if(seconds<60)return `${seconds} 秒`;
            const minutes=Math.ceil(seconds/60);
            if(minutes<60)return `${minutes} 分`;
            if(minutes<1440)return `${Math.floor(minutes/60)} 小时 ${minutes%60} 分`;
            return `${Math.floor(minutes/1440)} 天 ${Math.floor(minutes%1440/60)} 小时`;
        }
        function ClockIcon(){return h("svg",{viewBox:"0 0 16 16",width:14,height:14,"aria-hidden":true,fill:"none",stroke:"currentColor",strokeWidth:1.5},h("circle",{cx:8,cy:8,r:6.25}),h("path",{d:"M8 4.75V8l2.2 1.6"}));}
        /* 闪电：实心 = 续缓存开，空心 = 关。 */
        function BoltIcon({filled}){
            return h("svg",{viewBox:"0 0 16 16",width:14,height:14,"aria-hidden":true,fill:filled?"currentColor":"none",stroke:"currentColor",strokeWidth:1.5,strokeLinejoin:"round"},h("path",{d:"M9 1.75 3.5 9h4L7 14.25 12.5 7h-4L9 1.75Z"}));
        }
        function Switch({checked,disabled,onChange,label}){
            return h("button",{type:"button",role:"switch","aria-checked":checked,"aria-label":label,disabled,className:"dsh-ka-switch",onClick:()=>onChange(!checked)},h("span",{className:"dsh-ka-knob"}));
        }
        function Stepper({value,disabled,onChange,label}){
            const set=v=>{if(Number.isInteger(v)&&v>=1&&v<=100&&v!==value)onChange(v);};
            return h("span",{className:"dsh-ka-stepper","aria-label":label},
                h("button",{type:"button",disabled:disabled||value<=1,onClick:()=>set(value-1),"aria-label":"减少"},"−"),
                h("span",{className:"dsh-ka-stepper-value"},String(value)),
                h("button",{type:"button",disabled:disabled||value>=100,onClick:()=>set(value+1),"aria-label":"增加"},"+"));
        }
        /* 续缓存丸：只要当前会话有渠道/模型就常驻；点击弹出开关面板。
           注意：所有 hook 必须在任何条件 return 之前调用，否则切换会话时
           hooks 数量变化会让整个 composer 渲染崩溃。 */
        const KeepalivePill=React.memo(function KeepalivePill({useProjection,sessionId}){
            const stats=typeof useProjection==="function"?useProjection("requestStats"):null;
            const ttlConfig=useTtlConfig();
            const ka=useKeepaliveStore(sessionId);
            const {open,setOpen,rootRef,panelRef,pos}=useAnchoredDialog();
            const [busy,setBusy]=React.useState(false);
            const [err,setErr]=React.useState("");
            const [now,setNow]=React.useState(Date.now);

            const model=readCurrentModel(stats),provider=readCurrentProvider(stats);
            const ttl=ttlFor(ttlConfig,model,provider);
            const key=provider&&model?kaKey(provider,model):null;
            const rule=key?ka.config?.rules?.[key]:undefined;
            const on=rule?.enabled===true;
            const session=ka.session;
            const mine=key!==null&&session?.key===key?session:null;
            const max=rule?.maxRenewals??1,done=mine?mine.done:0;
            const status=mine?mine.status:null;

            const lastTime=Number.isFinite(stats?.lastTime)&&stats.lastTime>0?stats.lastTime:null;
            const base=Math.max(lastTime??0,mine?.lastAt??0)||null;
            /* 未设 TTL 时按 5 分钟估算，保证按钮上永远有缓存时间可看（与续缓存默认一致）。 */
            const est=!(ttl>0),effTtl=est?5:ttl;

            React.useEffect(()=>recordSeenModel(channelId(provider,model)),[model,provider]);
            React.useEffect(()=>{setNow(Date.now());if(!base)return;const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer);},[base,effTtl]);

            if(key===null)return null;

            const save=async patch=>{setBusy(true);setErr("");try{await kaSaveRule(ka.config,key,{ttlMinutes:effTtl,...patch});}catch(e){setErr(e.message);}finally{setBusy(false);}};
            const pause=async()=>{if(!mine)return;setBusy(true);setErr("");try{await kaFetch({op:status==="paused"?"resume":"pause",sessionId});window.dispatchEvent(new Event(KA_EVENT));}catch(e){setErr(e.message);}finally{setBusy(false);}};
            const remaining=base?base+effTtl*60000-now:null;
            const label=remaining===null?"缓存 —":remaining<=0?"缓存过期":`缓存 ${formatRemaining(remaining)}${est?"*":""}`;
            const tip=`${provider} / ${model}。缓存剩余为本地估算：TTL ${effTtl} 分钟${est?"（未单独设置，按默认 5 分钟估算）":""}，基准为本会话最近请求${mine?.lastAt?"/续缓存":""}时间。实际命中以服务商为准。续缓存${on?`已开启 ${done}/${max}`:"未开启"}${status&&KA_STATUS[status]?`（${KA_STATUS[status]}）`:""}。点击设置。`;
            return h("span",{ref:rootRef,className:"dsh-reqstats-anchor","data-composer-stat":"keepalive"},
                h("button",{type:"button",className:"dsh-reqstats-pill","data-keepalive":on?"on":"off",title:tip,"aria-haspopup":"dialog","aria-expanded":open,onClick:()=>setOpen(!open)},h(BoltIcon,{filled:on}),h("span",{className:"dsh-reqstats-label"},label)),
                open?createPortal(h("div",{ref:panelRef,className:"dsh-reqstats-panel dsh-ka-panel",role:"dialog","aria-label":"续缓存",style:pos??MEASURE_STYLE},
                    h("div",{className:"dsh-reqstats-title"},h("span",{className:"dsh-reqstats-titleLabel"},h(BoltIcon,{filled:on}),"续缓存"),h(Switch,{checked:on,disabled:busy||!ka.config,label:"续缓存开关",onChange:v=>save({enabled:v})})),
                    h("div",{className:"dsh-ka-route"},h("span",{className:"dsh-ttl-channel"},provider),h("span",null,model)),
                    h("div",{className:"dsh-reqstats-titleRule","aria-hidden":true}),
                    h("dl",{className:"dsh-reqstats-details"},
                        h("dt",null,"自动续期"),h("dd",null,h(Stepper,{value:max,disabled:busy||!on,label:"自动续期次数",onChange:v=>save({maxRenewals:v})})),
                        h("dt",null,"缓存 TTL"),h("dd",null,`${effTtl} 分钟${est?"（默认）":""}`),
                        h("dt",null,"本会话"),h("dd",null,on?(mine?`${done}/${max}${status&&KA_STATUS[status]?" · "+KA_STATUS[status]:""}`:"等待下一次回复"):"未开启"),
                        on&&mine?.nextAt?[h("dt",{key:"a"},"下次续期"),h("dd",{key:"b"},new Date(mine.nextAt).toLocaleTimeString())]:null,
                        on&&mine?.lastCacheRead!=null?[h("dt",{key:"c"},"上次缓存读"),h("dd",{key:"d"},`${mine.lastCacheRead} tok`)]:null,
                        mine?.lastError?[h("dt",{key:"e"},"上次失败"),h("dd",{key:"f",className:"dsh-ka-err"},mine.lastError)]:null),
                    on&&mine&&["scheduled","paused","error"].includes(status)?h("button",{type:"button",className:"dsh-ka-action",disabled:busy,onClick:pause},status==="paused"||status==="error"?"恢复本会话续期":"暂停本会话续期"):null,
                    err?h("p",{className:"dsh-ka-err"},err):null,
                    h("p",{className:"dsh-ka-hint"},"你发消息、AI 答完后，在缓存过期前自动发一条仅用于续缓存的请求；不写入会话。每次续期消耗一次上游请求。")
                ),document.body):null);
        });
        /* ── 续缓存（Host 调度；配置存 Host 文件，键为 渠道::模型） ── */
        const KA_URL="/dsh-cache-manager/cache-keepalive";
        const KA_EVENT="dsh-ui-tweak:keepalive-changed";
        const kaKey=(provider,model)=>provider&&model?provider+"::"+model:null;
        async function kaFetch(body,sessionId){
            const res=body===undefined?await fetch(KA_URL+(sessionId?"?sessionId="+encodeURIComponent(sessionId):"")):await fetch(KA_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
            const data=await res.json();if(!res.ok||data.ok!==true)throw new Error(data.error||"续缓存接口失败");return data;
        }
        function useKeepaliveStore(sessionId){
            const [state,setState]=React.useState({config:null,session:null});
            React.useEffect(()=>{let live=true;const load=()=>kaFetch(undefined,sessionId).then(d=>{if(live)setState({config:d.config,session:d.session});}).catch(()=>{});
                load();const timer=setInterval(load,5000);window.addEventListener(KA_EVENT,load);
                return ()=>{live=false;clearInterval(timer);window.removeEventListener(KA_EVENT,load);};},[sessionId]);
            return state;
        }
        async function kaSaveRule(config,key,patch){
            if(!config||!key)throw new Error("续缓存配置尚未加载");
            const current=config.rules[key]??{enabled:false,maxRenewals:1,ttlMinutes:5};
            const d=await kaFetch({op:"save",config:{...config,rules:{...config.rules,[key]:{...current,...patch}}}});
            window.dispatchEvent(new Event(KA_EVENT));return d.config;
        }
        const KA_STATUS={scheduled:"待续",sending:"续期中",done:"已用完",paused:"已暂停",error:"失败",cancelled:"已取消",idle:"",off:""};
        /* ── 设置页：TTL 输入（回车/失焦即保存，Esc 撤销，留空 = 跟随默认） ── */
        function TtlInput({value,placeholder,label,title,allowEmpty,onCommit}){
            const [text,setText]=React.useState(value);const [bad,setBad]=React.useState(false);
            React.useEffect(()=>{setText(value);setBad(false);},[value]);
            const commit=()=>{const t=text.trim();if(t===value){setBad(false);return;}
                if(t===""){if(allowEmpty){setBad(false);onCommit(null);}else{setText(value);setBad(false);}return;}
                if(!/^\d+$/.test(t)||!validMinutes(Number(t))){setBad(true);return;}
                setBad(false);onCommit(Number(t));};
            return h("input",{type:"text",inputMode:"numeric",className:"dsh-tm-input",value:text,placeholder,title,"aria-label":label,"aria-invalid":bad||undefined,
                onChange:e=>{setText(e.target.value);setBad(false);},onBlur:commit,
                onKeyDown:e=>{if(e.key==="Enter"){e.preventDefault();commit();}else if(e.key==="Escape"){e.preventDefault();setText(value);setBad(false);}}});
        }
        function ChevronIcon({open}){return h("svg",{viewBox:"0 0 16 16",width:12,height:12,"aria-hidden":true,fill:"none",stroke:"currentColor",strokeWidth:1.6,style:{transform:open?"rotate(90deg)":"none",transition:"transform .15s"}},h("path",{d:"M6 3.5 10.5 8 6 12.5"}));}
        const TTL_PRESETS=[[5,"5 分钟"],[60,"1 小时"],[1440,"1 天"]];
        const CacheTtlSettings=React.memo(function CacheTtlSettings(){
            const config=useTtlConfig();
            const [ka,setKa]=React.useState(null),[kaError,setKaError]=React.useState(""),[kaBusy,setKaBusy]=React.useState(false);
            const [catalog,setCatalog]=React.useState(null),[q,setQ]=React.useState(""),[toggled,setToggled]=React.useState(()=>new Set());
            const [status,setStatus]=React.useState(""),[error,setError]=React.useState(""),[addName,setAddName]=React.useState(""),[addMin,setAddMin]=React.useState("");
            const listId=React.useId();
            React.useEffect(()=>{fetch(KA_URL+"?catalog=1").then(r=>r.json()).then(d=>{if(d.ok!==true)throw new Error(d.error||"续缓存接口失败");setKa(d.config);setCatalog((d.catalog??[]).map(c=>({provider:c.provider,models:[...new Set(c.models.map(m=>stripModel(m,c.provider)))]})));}).catch(e=>{setKaError(e.message);setCatalog([]);});},[]);
            React.useEffect(()=>{if(!status)return;const t=setTimeout(()=>setStatus(""),2500);return ()=>clearTimeout(t);},[status]);
            const effFor=(cfg,provider,model)=>{const t=ttlFor(cfg,model,provider);return t>0?t:5;};
            const kaWrite=async rules=>{setKaBusy(true);setKaError("");try{const d=await kaFetch({op:"save",config:{...ka,rules}});setKa(d.config);window.dispatchEvent(new Event(KA_EVENT));setStatus("已保存");}catch(e){setKaError(e.message);}finally{setKaBusy(false);}};
            const kaSave=(provider,model,patch)=>{if(!ka)return;const key=kaKey(provider,model);const cur=ka.rules[key]??{enabled:false,maxRenewals:1,ttlMinutes:5};kaWrite({...ka.rules,[key]:{...cur,ttlMinutes:effFor(config,provider,model),...patch}});};
            /* 续缓存规则里的 TTL 跟随倒计时生效值，保证两边一致。 */
            const syncKa=next=>{if(!ka)return;let changed=false;const rules={...ka.rules};
                for(const [key,rule] of Object.entries(rules)){const i=key.indexOf("::");if(i<=0)continue;const eff=effFor(next,key.slice(0,i),key.slice(i+2));if(rule.ttlMinutes!==eff){rules[key]={...rule,ttlMinutes:eff};changed=true;}}
                if(changed)kaWrite(rules);};
            const commitTtl=mutate=>{try{const cur=readTtlConfig();const next=mutate({defaultMinutes:cur.defaultMinutes,models:{...cur.models}});writeTtlConfig(next);setError("");setStatus("已保存");syncKa(next);}catch(e){setError(e.message||"保存失败");}};
            const setModelTtl=(name,v)=>commitTtl(c=>{if(v===null)delete c.models[name];else Object.defineProperty(c.models,name,{value:v,enumerable:true,writable:true,configurable:true});return c;});
            const setDefault=v=>commitTtl(c=>({...c,defaultMinutes:v}));
            const has=name=>Object.hasOwn(config.models,name);
            const catalogKeys=new Set((catalog??[]).flatMap(c=>c.models.map(m=>channelId(c.provider,m))));
            const others=catalog===null?[]:Object.entries(config.models).filter(([n])=>!catalogKeys.has(n));
            const totalModels=(catalog??[]).reduce((n,c)=>n+c.models.length,0);
            const query=q.trim().toLowerCase();
            const addOther=()=>{const name=addName.trim();if(!name){setError("请填写「渠道 / 模型」或模型 ID。");return;}
                if(has(name)){setError("该项已有单独设置。");return;}
                const t=addMin.trim();if(!/^\d+$/.test(t)||!validMinutes(Number(t))){setError("请填写 0–525600 的整数分钟。");return;}
                setModelTtl(name,Number(t));setAddName("");setAddMin("");};
            const defaultHint=config.defaultMinutes>0?"":"（0 = 未设置，按 5 分钟估算）";
            const row=(provider,model)=>{
                const name=channelId(provider,model),explicit=has(name)?String(config.models[name]):"";
                const general=has(model),inherited=general?config.models[model]:config.defaultMinutes;
                const key=kaKey(provider,model),rule=ka?.rules?.[key],on=rule?.enabled===true;
                const from=general?`通用设置「${model}」`:"默认 TTL";
                return h("div",{key:model,className:"dsh-tm-row","data-on":on?"1":"0","data-custom":explicit?"1":"0"},
                    h("span",{className:"dsh-tm-model",title:provider+" / "+model},model),
                    h("span",{className:"dsh-tm-ttl"},
                        h(TtlInput,{value:explicit,allowEmpty:true,placeholder:inherited>0?String(inherited):"5*",label:provider+" / "+model+" 缓存 TTL（分钟）",
                            title:explicit?"单独设置；清空后跟随"+from:"跟随"+from+(inherited>0?`（${inherited} 分钟）`:"（未设置，按 5 分钟估算）")+"；输入数字即单独设置",
                            onCommit:v=>setModelTtl(name,v)}),
                        explicit?h("button",{type:"button",className:"dsh-tm-reset",title:"恢复跟随"+from,"aria-label":"恢复 "+model+" 跟随"+from,onClick:()=>setModelTtl(name,null)},"↺"):h("span",{className:"dsh-tm-reset","aria-hidden":true})),
                    h(Stepper,{value:rule?.maxRenewals??1,disabled:kaBusy||!ka||!on,label:provider+" / "+model+" 自动续期次数",onChange:v=>kaSave(provider,model,{maxRenewals:v})}),
                    h(Switch,{checked:on,disabled:kaBusy||!ka,label:provider+" / "+model+" 续缓存",onChange:v=>kaSave(provider,model,{enabled:v})}));
            };
            const groups=(catalog??[]).map(c=>{
                const models=c.models.filter(m=>!query||m.toLowerCase().includes(query)||c.provider.toLowerCase().includes(query));if(models.length===0)return null;
                const enabled=c.models.filter(m=>ka?.rules?.[kaKey(c.provider,m)]?.enabled===true).length;
                const custom=c.models.filter(m=>has(channelId(c.provider,m))).length;
                const auto=totalModels<=15||enabled>0||custom>0;
                const open=query?true:toggled.has(c.provider)?!auto:auto;
                const meta=[`${c.models.length} 个模型`,custom?`${custom} 个单独 TTL`:"",enabled?`${enabled} 个续缓存`:""].filter(Boolean).join(" · ");
                return h("section",{key:c.provider,className:"dsh-ka-group"},
                    h("button",{type:"button",className:"dsh-tm-group-head","aria-expanded":open,disabled:!!query,onClick:()=>setToggled(s=>{const n=new Set(s);n.has(c.provider)?n.delete(c.provider):n.add(c.provider);return n;})},
                        h(ChevronIcon,{open}),h("span",{className:"dsh-ka-group-name"},c.provider),h("span",{className:"dsh-ka-group-meta"},meta)),
                    open?models.map(m=>row(c.provider,m)):null);
            }).filter(Boolean);
            const seen=seenModels().filter(m=>!catalogKeys.has(m)&&!has(m));
            return h("div",{className:"dsh-ttl-settings"},
                h("div",{className:"dsh-ttl-card"},
                    h("h3",null,"默认缓存 TTL"),
                    h("p",{className:"dsh-ttl-note"},"输入框下方的缓存倒计时按这里估算，基准为本会话最近一次请求完成时间。只影响本地显示，不改变服务商的缓存策略。"),
                    h("div",{className:"dsh-ttl-default"},
                        h(TtlInput,{value:String(config.defaultMinutes),label:"默认 TTL（分钟）",onCommit:setDefault}),h("span",null,"分钟"+defaultHint),
                        h("div",{className:"dsh-ttl-presets"},...TTL_PRESETS.map(([v,label])=>h("button",{type:"button",key:v,"aria-pressed":config.defaultMinutes===v,onClick:()=>setDefault(v)},label))))),
                h("div",{className:"dsh-ttl-card"},
                    h("div",{className:"dsh-ka-head"},
                        h("div",null,h("h3",null,"渠道与模型"),
                            h("p",{className:"dsh-ttl-note"},"TTL 留空即跟随默认，灰色数字是当前生效值；输入后按回车或点别处即保存，Esc 撤销。续缓存：AI 答完后在缓存过期前 "+(ka?.leadSeconds??30)+" 秒自动发一条仅用于续缓存的请求，不写入会话，每次续期消耗一次上游请求。")),
                        catalog&&catalog.length?h("input",{type:"search",className:"dsh-ka-search",placeholder:"筛选渠道或模型","aria-label":"筛选渠道或模型",value:q,onChange:e=>setQ(e.target.value)}):null),
                    catalog===null?h("p",{className:"dsh-ttl-empty"},"正在读取渠道…"):catalog.length===0?h("p",{className:"dsh-ttl-empty"},"没有读到渠道。"):
                    h("div",{className:"dsh-ka-list"},
                        h("div",{className:"dsh-tm-cols","aria-hidden":true},h("span",null,"模型"),h("span",null,"TTL（分钟）"),h("span",null,"续期次数"),h("span",null,"续缓存")),
                        ...(groups.length?groups:[h("p",{key:"none",className:"dsh-ttl-empty"},"没有匹配的渠道或模型。")])),
                    kaError?h("p",{role:"alert",className:"dsh-ttl-error"},"续缓存："+kaError):null),
                h("details",{className:"dsh-ttl-card dsh-tm-other",open:others.length>0||undefined},
                    h("summary",null,h("h3",null,"其他单独设置"+(others.length?`（${others.length}）`:""))),
                    h("p",{className:"dsh-ttl-note"},"只写模型 ID 的通用设置对所有渠道生效（上方列表中会作为灰色跟随值显示）；不在上方列表中的渠道模型也放在这里。"),
                    others.length===0?h("p",{className:"dsh-ttl-empty"},"暂无。"):null,
                    ...others.map(([name,v])=>h("div",{key:name,className:"dsh-tm-row dsh-tm-other-row"},
                        h("span",{className:"dsh-tm-model",title:name},h(ChannelLabel,{id:name})),
                        h("span",{className:"dsh-tm-ttl"},h(TtlInput,{value:String(v),label:name+" TTL（分钟）",onCommit:x=>setModelTtl(name,x)}),h("span",{className:"dsh-tm-reset","aria-hidden":true})),
                        h("button",{type:"button","aria-label":"删除 "+name+" 的单独设置",onClick:()=>setModelTtl(name,null)},"删除"))),
                    h("div",{className:"dsh-ttl-add"},
                        h("input",{type:"text",list:listId,placeholder:"渠道 / 模型，或只填模型 ID","aria-label":"添加单独设置的模型",value:addName,onChange:e=>setAddName(e.target.value),onKeyDown:e=>{if(e.key==="Enter"){e.preventDefault();addOther();}}}),
                        h("datalist",{id:listId},...seen.map(m=>h("option",{key:m,value:m}))),
                        h("input",{type:"text",inputMode:"numeric",className:"dsh-tm-input",placeholder:"分钟","aria-label":"新设置的 TTL（分钟）",value:addMin,onChange:e=>setAddMin(e.target.value),onKeyDown:e=>{if(e.key==="Enter"){e.preventDefault();addOther();}}}),
                        h("button",{type:"button",onClick:addOther},"添加"))),
                error?h("p",{role:"alert",className:"dsh-ttl-error"},error):null,
                h("div",{className:"dsh-ttl-footer"},h("span",{role:"status","aria-live":"polite"},status?"✓ "+status:"所有修改即时保存。")));
        });

		/* ── 装配 ── */
	return {
			apply(ctx) {
				ensureStyle();
				ctx.effect(installUsageDuration, "request-stats: usage duration");
				ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register(
					{
						name: "conversation.composer.dock",
						id: "request-stats",
						order: 2
					},
					RequestPill
				));
				ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register(
					{
						name: "conversation.composer.dock",
						id: "request-stats-keepalive",
						order: 4,
						inject: sessionId => ({ sessionId })
					},
					KeepalivePill
				));
				ctx.slots.inject("settings.section", () => ctx.slots.register(
					{
						name: "settings.section",
						id: "request-stats-cache-ttl",
						order: 116,
						label: () => "缓存 TTL"
					},
					CacheTtlSettings
				));
				ctx.slots.inject("conversation.chat.assistant-actions", () => ctx.slots.register(
					{
						name: "conversation.chat.assistant-actions",
						id: "request-stats",
						order: 5
					},
					StatsAction
				));
			}
	};
}
