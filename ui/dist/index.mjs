import { jsxs as i, jsx as e, Fragment as T } from "react/jsx-runtime";
import { useAppApi as z } from "@kirocrew/app-sdk";
import { useState as p, useEffect as S, useRef as A, useCallback as M } from "react";
import { createPortal as j } from "react-dom";
const g = "/apps/floating-todo/api", I = 3e4, P = (n) => `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`, E = (n, r) => {
  const l = /* @__PURE__ */ new Date(`${n}T12:00:00`);
  return l.setDate(l.getDate() + r), P(l);
}, k = (n) => (/* @__PURE__ */ new Date(`${n}T12:00:00`)).toLocaleDateString(void 0, { weekday: "short", month: "short", day: "numeric" }), R = `
.ft{box-sizing:border-box;height:100%;min-height:0;display:flex;flex-direction:column;gap:10px;padding:12px;
  font:13px/1.4 system-ui,sans-serif;background:var(--bg,#fff);color:var(--text,#111)}
.ft *{box-sizing:border-box}
.ft button{font:inherit;color:inherit;background:none;border:1px solid var(--border,#8884);border-radius:6px;padding:2px 8px;cursor:pointer}
.ft button:hover{background:var(--hover,#8882)}
.ft-head{display:flex;align-items:center;gap:6px}
.ft-head b{flex:1;text-align:center}
.ft-bar{height:6px;border-radius:3px;background:var(--border,#8883);overflow:hidden}
.ft-bar i{display:block;height:100%;background:var(--accent,#3b82f6);transition:width .2s}
.ft-sum{display:flex;justify-content:space-between;opacity:.7;font-size:12px}
.ft input[type=text]{width:100%;padding:6px 8px;font:inherit;color:inherit;background:transparent;border:1px solid var(--border,#8886);border-radius:6px}
.ft ul{list-style:none;margin:0;padding:0;overflow-y:auto;flex:1;min-height:0}
.ft li{display:flex;align-items:center;gap:8px;padding:4px 0}
.ft li span{flex:1;word-break:break-word}
.ft li.done span{text-decoration:line-through;opacity:.5}
.ft h4{margin:4px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.6}
.ft-x{border:none!important;opacity:.4;padding:0 4px!important}
.ft-x:hover{opacity:1}
.ft-hist{display:flex;gap:4px;align-items:flex-end;height:32px}
.ft-hist div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px;font-size:10px;opacity:.8}
.ft-hist em{display:block;width:100%;border-radius:2px;background:var(--accent,#3b82f6);min-height:2px}
.ft-err{color:#d33}
`;
function N({ api: n, onFloat: r, floating: l }) {
  const s = P(/* @__PURE__ */ new Date()), [a, h] = p(s), [o, d] = p(null), [x, f] = p(""), [u, v] = p(""), $ = A(a);
  $.current = a;
  const m = M(async () => {
    try {
      const t = await n.get(`${g}/todos?date=${$.current}`);
      d(t), v("");
    } catch (t) {
      v(t instanceof Error ? t.message : "Could not load");
    }
  }, [n]);
  S(() => {
    m();
    const t = setInterval(m, I);
    return () => clearInterval(t);
  }, [m, a]);
  const y = async (t) => {
    try {
      await t();
    } catch (b) {
      v(b instanceof Error ? b.message : "Request failed");
      return;
    }
    await m();
  }, F = () => {
    const t = x.trim();
    t && (f(""), y(() => n.post(`${g}/todos`, { text: t, date: a })));
  }, c = (o == null ? void 0 : o.items) ?? [], C = c.filter((t) => t.done).length, w = c.length ? Math.round(C / c.length * 100) : 0, L = Math.max(1, ...((o == null ? void 0 : o.history) ?? []).map((t) => t.total)), D = (t, b) => /* @__PURE__ */ i("li", { className: t.done ? "done" : "", children: [
    /* @__PURE__ */ e(
      "input",
      {
        type: "checkbox",
        checked: t.done,
        "aria-label": t.text,
        onChange: () => y(() => n.patch(`${g}/todos/${t.id}`, { done: !t.done }))
      }
    ),
    /* @__PURE__ */ e("span", { children: t.text }),
    b,
    /* @__PURE__ */ e("button", { className: "ft-x", "aria-label": `Delete ${t.text}`, onClick: () => y(() => n.del(`${g}/todos/${t.id}`)), children: "×" })
  ] }, t.id);
  return /* @__PURE__ */ i("div", { className: "ft", children: [
    /* @__PURE__ */ e("style", { children: R }),
    /* @__PURE__ */ i("div", { className: "ft-head", children: [
      /* @__PURE__ */ e("button", { "aria-label": "Previous day", onClick: () => h(E(a, -1)), children: "‹" }),
      /* @__PURE__ */ e("b", { children: a === s ? `Today · ${k(a)}` : k(a) }),
      /* @__PURE__ */ e("button", { "aria-label": "Next day", onClick: () => h(E(a, 1)), children: "›" }),
      a !== s && /* @__PURE__ */ e("button", { onClick: () => h(s), children: "Today" }),
      r && !l && /* @__PURE__ */ e("button", { onClick: r, title: "Open as a floating window", children: "Float" })
    ] }),
    /* @__PURE__ */ e("div", { className: "ft-bar", role: "progressbar", "aria-valuenow": w, "aria-valuemin": 0, "aria-valuemax": 100, children: /* @__PURE__ */ e("i", { style: { width: `${w}%` } }) }),
    /* @__PURE__ */ i("div", { className: "ft-sum", children: [
      /* @__PURE__ */ i("span", { children: [
        C,
        "/",
        c.length,
        " done"
      ] }),
      /* @__PURE__ */ i("span", { children: [
        w,
        "%"
      ] })
    ] }),
    /* @__PURE__ */ e(
      "input",
      {
        type: "text",
        value: x,
        maxLength: 200,
        placeholder: "Add a task and press Enter",
        "aria-label": "New task",
        onChange: (t) => f(t.target.value),
        onKeyDown: (t) => t.key === "Enter" && F()
      }
    ),
    u && /* @__PURE__ */ e("div", { className: "ft-err", role: "alert", children: u }),
    /* @__PURE__ */ i("ul", { children: [
      c.map((t) => D(t)),
      !c.length && /* @__PURE__ */ e("li", { children: /* @__PURE__ */ e("span", { style: { opacity: 0.5 }, children: "Nothing planned for this day." }) }),
      !!(o != null && o.carryover.length) && /* @__PURE__ */ i(T, { children: [
        /* @__PURE__ */ e("h4", { children: "From earlier" }),
        o.carryover.map((t) => D(t, /* @__PURE__ */ e("button", { title: "Move to this day", onClick: () => y(() => n.patch(`${g}/todos/${t.id}`, { date: a })), children: "→" })))
      ] })
    ] }),
    /* @__PURE__ */ e("div", { className: "ft-hist", "aria-label": "Last 7 days", children: ((o == null ? void 0 : o.history) ?? []).map((t) => /* @__PURE__ */ i("div", { title: `${t.date}: ${t.done}/${t.total}`, children: [
      /* @__PURE__ */ e("em", { style: { height: `${t.total / L * 20}px`, opacity: t.total ? 0.3 + 0.7 * t.done / t.total : 0.15 } }),
      k(t.date).slice(0, 1)
    ] }, t.date)) })
  ] });
}
const q = () => window.documentPictureInPicture;
function K() {
  const n = z(), [r, l] = p(null), [s, a] = p(""), h = async () => {
    const o = q();
    if (!o) {
      a("Floating windows need Document Picture-in-Picture (Chrome/Edge or the desktop app).");
      return;
    }
    try {
      const d = await o.requestWindow({ width: 340, height: 480 }), x = getComputedStyle(document.documentElement);
      for (const f of ["--bg", "--text", "--border", "--accent", "--hover"]) {
        const u = x.getPropertyValue(f);
        u && d.document.documentElement.style.setProperty(f, u);
      }
      d.document.body.style.margin = "0", d.addEventListener("pagehide", () => l(null)), l(d), a("");
    } catch (d) {
      a(d instanceof Error ? d.message : "Could not open the floating window");
    }
  };
  return S(() => () => r == null ? void 0 : r.close(), [r]), /* @__PURE__ */ i("div", { style: { height: "100%", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }, children: [
    s && /* @__PURE__ */ e("div", { role: "status", style: { padding: "8px 12px", opacity: 0.8 }, children: s }),
    r ? /* @__PURE__ */ e("div", { style: { padding: 16, opacity: 0.7 }, children: "Floating window is open. Close it to bring the list back here." }) : /* @__PURE__ */ e(N, { api: n, onFloat: h }),
    r && j(/* @__PURE__ */ e(N, { api: n, floating: !0 }), r.document.body)
  ] });
}
export {
  K as default
};
