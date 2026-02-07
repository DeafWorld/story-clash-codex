"use client";

import { useEffect, useMemo, useState } from "react";

type ModerationType = "confession" | "ask_question" | "ask_answer" | "binary_question";

type ModerationItem = {
  id: string;
  type: ModerationType;
  content: string;
  flag_count: number;
  hidden: boolean;
  status?: string | null;
  created_at: string;
};

const typeOptions: { label: string; value: ModerationType | "" }[] = [
  { label: "All", value: "" },
  { label: "Confessions", value: "confession" },
  { label: "Ask questions", value: "ask_question" },
  { label: "Ask answers", value: "ask_answer" },
  { label: "Binary questions", value: "binary_question" },
];

export default function AdminConsole() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [type, setType] = useState<"" | ModerationType>("");
  const [search, setSearch] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (search) params.set("search", search);
    if (!onlyFlagged) params.set("onlyFlagged", "false");
    return params.toString();
  }, [type, search, onlyFlagged]);

  async function load() {
    setMessage(null);
    const res = await fetch(`/api/admin/moderation?${query}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setSelected(new Set());
  }

  useEffect(() => {
    load();
  }, [query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(items.map((item) => item.id)));
  }

  async function applyAction(action: "hide" | "unhide" | "archive" | "restore") {
    const payload = items
      .filter((item) => selected.has(item.id))
      .map((item) => ({ id: item.id, type: item.type }));
    if (!payload.length) return;

    const res = await fetch("/api/admin/moderation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, items: payload }),
    });
    if (res.ok) {
      setMessage("Moderation updated.");
      load();
    } else {
      const data = await res.json();
      setMessage(data.error || "Update failed.");
    }
  }

  return (
    <section className="glass card">
      <div className="section-title">Moderation console</div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <select className="input" value={type} onChange={(e) => setType(e.target.value as any)}>
          {typeOptions.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Search content"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={(e) => setOnlyFlagged(e.target.checked)}
          />
          Flagged only
        </label>
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <button className="btn" onClick={() => applyAction("hide")}>Hide</button>
        <button className="btn" onClick={() => applyAction("unhide")}>Unhide</button>
        <button className="btn" onClick={() => applyAction("archive")}>Archive</button>
        <button className="btn" onClick={() => applyAction("restore")}>Restore</button>
        <span className="muted">Selected {selected.size}</span>
        {message && <span className="text-amber-200">{message}</span>}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-300">
            <tr>
              <th className="py-2">
                <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} />
              </th>
              <th className="py-2">Type</th>
              <th className="py-2">Content</th>
              <th className="py-2">Flags</th>
              <th className="py-2">Hidden</th>
              <th className="py-2">Status</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-white/10">
                <td className="py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                </td>
                <td className="py-3 text-xs">{item.type}</td>
                <td className="py-3 max-w-md">
                  <div className="text-sm leading-snug">{item.content}</div>
                </td>
                <td className="py-3">{item.flag_count}</td>
                <td className="py-3">{item.hidden ? "Yes" : "No"}</td>
                <td className="py-3">{item.status ?? "—"}</td>
                <td className="py-3 text-xs">{new Date(item.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-slate-400">
                  No items match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
