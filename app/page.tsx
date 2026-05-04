"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CATEGORIES,
  categoryBar,
  categoryChip,
  type Category,
} from "@/lib/categories";

type Tx = {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category: Category;
  date: string;
};

const STORAGE_KEY = "budget-app:transactions";

function todayLocalISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function localDayKey(iso: string) {
  const d = new Date(iso);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtCompact(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}

type SortMode = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

export default function Home() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [text, setText] = useState("");
  const [date, setDate] = useState<string>(todayLocalISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [openCategory, setOpenCategory] = useState<Category | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("date-desc");
  const [catSortMode, setCatSortMode] = useState<SortMode>("amount-desc");
  const [calMonth, setCalMonth] = useState<string>(() => todayLocalISO().slice(0, 7));
  const [showAllTx, setShowAllTx] = useState(false);
  const [showAllCat, setShowAllCat] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: Tx[] = JSON.parse(raw);
        setTxs(parsed.map((t) => ({ ...t, category: t.category ?? "Other" })));
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
  }, [txs, loaded]);

  const knownCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    for (const t of txs) set.add(t.category);
    return Array.from(set);
  }, [txs]);

  const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  const sortedTxs = useMemo(() => {
    const arr = [...txs];
    arr.sort((a, b) => {
      if (sortMode === "date-desc")
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (sortMode === "date-asc")
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (sortMode === "amount-desc") return b.amount - a.amount;
      return a.amount - b.amount;
    });
    return arr;
  }, [txs, sortMode]);

  const dayTotals = useMemo(() => {
    const map = new Map<string, { expense: number; income: number }>();
    for (const t of txs) {
      const key = localDayKey(t.date);
      const cur = map.get(key) ?? { expense: 0, income: 0 };
      if (t.type === "expense") cur.expense += t.amount;
      else cur.income += t.amount;
      map.set(key, cur);
    }
    return map;
  }, [txs]);

  const byCategory = useMemo(() => {
    const map = new Map<
      string,
      { expense: number; income: number; latest: number; earliest: number }
    >();
    for (const t of txs) {
      const ts = new Date(t.date).getTime();
      const cur =
        map.get(t.category) ?? {
          expense: 0,
          income: 0,
          latest: -Infinity,
          earliest: Infinity,
        };
      if (t.type === "expense") cur.expense += t.amount;
      else cur.income += t.amount;
      cur.latest = Math.max(cur.latest, ts);
      cur.earliest = Math.min(cur.earliest, ts);
      map.set(t.category, cur);
    }
    const arr = Array.from(map.entries()).map(([category, v]) => ({
      category,
      ...v,
      total: v.expense + v.income,
    }));
    arr.sort((a, b) => {
      if (catSortMode === "amount-desc") return b.total - a.total;
      if (catSortMode === "amount-asc") return a.total - b.total;
      if (catSortMode === "date-desc") return b.latest - a.latest;
      return a.earliest - b.earliest;
    });
    return arr;
  }, [txs, catSortMode]);
  const maxTotal = useMemo(
    () => byCategory.reduce((m, c) => Math.max(m, c.total), 0),
    [byCategory],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, knownCategories }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to parse.");
        return;
      }
      const dateISO = new Date(`${date}T12:00:00`).toISOString();
      setTxs((prev) => [
        {
          id: crypto.randomUUID(),
          description: data.description,
          amount: Number(data.amount),
          type: data.type,
          category: data.category,
          date: dateISO,
        },
        ...prev,
      ]);
      setText("");
      setDate(todayLocalISO());
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  function removeTx(id: string) {
    setTxs((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="flex flex-1 flex-col items-center font-sans">
      <main className="w-full max-w-2xl px-6 py-12 sm:py-16">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MoneyCounter />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-[#f4efe3]">
                Budget
              </h1>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-[#ecd092]/55">
                powered by LLM
              </p>
              <p className="mt-1 text-sm text-[#f4efe3]/60">
                Just type what you bought — the assistant figures out the rest.
              </p>
            </div>
          </div>
          <CalendarWidget
            month={calMonth}
            dayTotals={dayTotals}
            onClick={() => setShowCalendar(true)}
          />
        </div>

        <section className="mt-8 grid grid-cols-3 gap-3">
          <Card label="Balance" value={fmtUSD(balance)} accent="text-[#f4efe3]" />
          <Card label="Income" value={fmtUSD(income)} accent="text-emerald-300" />
          <Card label="Expense" value={fmtUSD(expense)} accent="text-rose-300" />
        </section>

        <form onSubmit={submit} className="surface mt-8 rounded-2xl p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e as unknown as React.FormEvent);
              }
            }}
            rows={2}
            placeholder="e.g. coffee 5.50  ·  3 perfumes $40 put in Gifts category  ·  got salary 4500"
            className="w-full resize-none bg-transparent px-2 py-2 text-sm text-[#f4efe3] outline-none placeholder:text-[#f4efe3]/35"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#f4efe3]/55">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="ink-input h-9 rounded-lg px-2 text-xs"
              />
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xs text-rose-300">{error}</p>
              <button
                type="submit"
                disabled={loading || !text.trim()}
                className="gold h-10 rounded-lg px-5 text-sm font-semibold transition-all"
              >
                {loading ? "Thinking…" : "Add"}
              </button>
            </div>
          </div>
        </form>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#ecd092]">
              Transactions
            </h2>
            <div className="flex items-center gap-1 text-xs">
              <SortBtn active={sortMode === "date-desc"} onClick={() => setSortMode("date-desc")}>
                Newest
              </SortBtn>
              <SortBtn active={sortMode === "date-asc"} onClick={() => setSortMode("date-asc")}>
                Oldest
              </SortBtn>
              <SortBtn active={sortMode === "amount-desc"} onClick={() => setSortMode("amount-desc")}>
                Highest
              </SortBtn>
              <SortBtn active={sortMode === "amount-asc"} onClick={() => setSortMode("amount-asc")}>
                Lowest
              </SortBtn>
            </div>
          </div>
          {txs.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-[#f4efe3]/45">
              No transactions yet.
            </p>
          ) : (
            <ul className="surface divide-y divide-white/5 overflow-hidden rounded-2xl">
              {(showAllTx ? sortedTxs : sortedTxs.slice(0, 5)).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-[#f4efe3]">
                        {t.description}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${categoryChip(t.category)}`}
                      >
                        {t.category}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#f4efe3]/50">
                      {new Date(t.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        t.type === "income" ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {t.type === "income" ? "+" : "-"}
                      {fmtUSD(t.amount)}
                    </span>
                    <button
                      onClick={() => removeTx(t.id)}
                      aria-label="Delete"
                      className="rounded-md p-1 text-[#f4efe3]/40 hover:bg-white/[.06] hover:text-rose-300"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {sortedTxs.length > 5 && (
            <button
              onClick={() => setShowAllTx((v) => !v)}
              className="mt-2 w-full rounded-lg py-2 text-xs font-medium text-[#ecd092]/80 hover:bg-white/[.04] hover:text-[#ecd092]"
            >
              {showAllTx ? "Show less" : `+ ${sortedTxs.length - 5} more`}
            </button>
          )}
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#ecd092]">
              By category
            </h2>
            <div className="flex items-center gap-1 text-xs">
              <SortBtn active={catSortMode === "date-desc"} onClick={() => setCatSortMode("date-desc")}>
                Newest
              </SortBtn>
              <SortBtn active={catSortMode === "date-asc"} onClick={() => setCatSortMode("date-asc")}>
                Oldest
              </SortBtn>
              <SortBtn active={catSortMode === "amount-desc"} onClick={() => setCatSortMode("amount-desc")}>
                Highest
              </SortBtn>
              <SortBtn active={catSortMode === "amount-asc"} onClick={() => setCatSortMode("amount-asc")}>
                Lowest
              </SortBtn>
            </div>
          </div>
          {byCategory.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 py-6 text-center text-sm text-[#f4efe3]/45">
              No data yet.
            </p>
          ) : (
            <ul className="surface space-y-2 rounded-2xl p-4">
              {(showAllCat ? byCategory : byCategory.slice(0, 5)).map((c) => {
                const barPct = maxTotal > 0 ? (c.total / maxTotal) * 100 : 0;
                return (
                  <li key={c.category}>
                    <button
                      type="button"
                      onClick={() => setOpenCategory(c.category)}
                      className="block w-full rounded-lg p-1 text-left transition-colors hover:bg-white/[.04]"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#f4efe3]">
                          {c.category}
                        </span>
                        <span className="tabular-nums text-[#f4efe3]/55">
                          {c.expense > 0 && (
                            <span className="text-rose-300">-{fmtUSD(c.expense)}</span>
                          )}
                          {c.expense > 0 && c.income > 0 && " · "}
                          {c.income > 0 && (
                            <span className="text-emerald-300">+{fmtUSD(c.income)}</span>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/[.06]">
                        <div
                          className={`h-full rounded-full ${categoryBar(c.category)}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {byCategory.length > 5 && (
            <button
              onClick={() => setShowAllCat((v) => !v)}
              className="mt-2 w-full rounded-lg py-2 text-xs font-medium text-[#ecd092]/80 hover:bg-white/[.04] hover:text-[#ecd092]"
            >
              {showAllCat ? "Show less" : `+ ${byCategory.length - 5} more`}
            </button>
          )}
        </section>
      </main>

      {openCategory && (
        <CategoryModal
          category={openCategory}
          txs={txs.filter((t) => t.category === openCategory)}
          onClose={() => setOpenCategory(null)}
        />
      )}

      {openDay && (
        <DayModal
          dayKey={openDay}
          txs={txs.filter((t) => localDayKey(t.date) === openDay)}
          onClose={() => setOpenDay(null)}
        />
      )}

      {showCalendar && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12 backdrop-blur-sm"
          onClick={() => setShowCalendar(false)}
        >
          <div
            className="surface w-full max-w-xl rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-end px-2 pt-2">
              <button
                onClick={() => setShowCalendar(false)}
                aria-label="Close"
                className="rounded-md p-2 text-[#f4efe3]/55 hover:bg-white/[.06] hover:text-[#f4efe3]"
              >
                ×
              </button>
            </div>
            <div className="px-4 pb-4">
              <Calendar
                month={calMonth}
                dayTotals={dayTotals}
                onPrev={() => setCalMonth(shiftMonth(calMonth, -1))}
                onNext={() => setCalMonth(shiftMonth(calMonth, 1))}
                onToday={() => setCalMonth(todayLocalISO().slice(0, 7))}
                onDay={(key) => setOpenDay(key)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MoneyCounter() {
  return (
    <img
      src="/mascot.png"
      alt=""
      aria-hidden
      width={336}
      height={288}
      className="shrink-0 rounded-md"
      style={{ width: 134, height: 115 }}
    />
  );
}

function CalendarWidget({
  month,
  dayTotals,
  onClick,
}: {
  month: string;
  dayTotals: Map<string, { expense: number; income: number }>;
  onClick: () => void;
}) {
  const today = todayLocalISO();
  const todayTotals = dayTotals.get(today);
  const [y, m] = month.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "short",
  });
  const dayNum = new Date().getDate();

  return (
    <button
      onClick={onClick}
      aria-label="Open calendar"
      className="platinum flex shrink-0 flex-col items-center rounded-xl px-3 py-2 transition-transform hover:-translate-y-0.5"
    >
      <span className="relative z-10 text-[10px] font-bold uppercase tracking-wide text-[#9c4a3c]">
        {monthLabel}
      </span>
      <span className="relative z-10 text-xl font-semibold leading-none text-[#1a2a28]">
        {dayNum}
      </span>
      <span className="relative z-10 mt-1 text-[10px] font-medium tabular-nums text-[#3b4a48]">
        {todayTotals && todayTotals.expense > 0 ? (
          <span className="text-[#a02a2a]">-{fmtCompact(todayTotals.expense)}</span>
        ) : todayTotals && todayTotals.income > 0 ? (
          <span className="text-[#0e6e3a]">+{fmtCompact(todayTotals.income)}</span>
        ) : (
          "—"
        )}
      </span>
    </button>
  );
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Calendar({
  month,
  dayTotals,
  onPrev,
  onNext,
  onToday,
  onDay,
}: {
  month: string;
  dayTotals: Map<string, { expense: number; income: number }>;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onDay: (key: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startWeekday = (first.getDay() + 6) % 7; // Monday-first
  const today = todayLocalISO();
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = first.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#ecd092]">
          {monthLabel}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            className="h-7 w-7 rounded-md text-[#f4efe3]/60 hover:bg-white/[.06] hover:text-[#f4efe3]"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            onClick={onToday}
            className="rounded-md px-2 py-1 text-xs text-[#f4efe3]/70 hover:bg-white/[.06] hover:text-[#f4efe3]"
          >
            Today
          </button>
          <button
            onClick={onNext}
            className="h-7 w-7 rounded-md text-[#f4efe3]/60 hover:bg-white/[.06] hover:text-[#f4efe3]"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-[#f4efe3]/45">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const key = `${month}-${String(day).padStart(2, "0")}`;
          const totals = dayTotals.get(key);
          const isToday = key === today;
          const hasData = !!totals && (totals.expense > 0 || totals.income > 0);
          return (
            <button
              key={i}
              onClick={() => hasData && onDay(key)}
              disabled={!hasData}
              className={`flex aspect-square flex-col items-center justify-center rounded-md p-1 text-[10px] transition-colors ${
                isToday ? "ring-1 ring-[#ecd092]/70" : ""
              } ${
                hasData
                  ? "cursor-pointer bg-white/[.04] hover:bg-white/[.10]"
                  : "text-[#f4efe3]/30"
              }`}
            >
              <span className="text-xs font-medium text-[#f4efe3]">{day}</span>
              {totals && totals.expense > 0 && (
                <span className="mt-0.5 truncate text-[9px] font-medium text-rose-300">
                  -{fmtCompact(totals.expense)}
                </span>
              )}
              {totals && totals.income > 0 && (
                <span className="truncate text-[9px] font-medium text-emerald-300">
                  +{fmtCompact(totals.income)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SortBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-1 transition-colors ${
        active
          ? "gold font-semibold"
          : "text-[#f4efe3]/55 hover:bg-white/[.06] hover:text-[#f4efe3]"
      }`}
    >
      {children}
    </button>
  );
}

function DayModal({
  dayKey,
  txs,
  onClose,
}: {
  dayKey: string;
  txs: Tx[];
  onClose: () => void;
}) {
  const sorted = [...txs].sort((a, b) => b.amount - a.amount);
  const totalExpense = sorted
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const totalIncome = sorted
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const [y, m, d] = dayKey.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="surface max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-[#f4efe3]">{label}</p>
            <p className="mt-1 text-sm tabular-nums text-[#f4efe3]/55">
              {totalExpense > 0 && (
                <span className="text-rose-300">-{fmtUSD(totalExpense)}</span>
              )}
              {totalExpense > 0 && totalIncome > 0 && " · "}
              {totalIncome > 0 && (
                <span className="text-emerald-300">+{fmtUSD(totalIncome)}</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-2 text-[#f4efe3]/55 hover:bg-white/[.06] hover:text-[#f4efe3]"
          >
            ×
          </button>
        </div>

        <div className="max-h-[calc(85vh-90px)] overflow-y-auto p-5">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#f4efe3]/55">No transactions.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {sorted.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-[#f4efe3]">
                        {t.description}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${categoryChip(t.category)}`}
                      >
                        {t.category}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      t.type === "income" ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {t.type === "income" ? "+" : "-"}
                    {fmtUSD(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryModal({
  category,
  txs,
  onClose,
}: {
  category: Category;
  txs: Tx[];
  onClose: () => void;
}) {
  const sorted = [...txs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const max = sorted.reduce((m, t) => Math.max(m, t.amount), 0);
  const totalExpense = sorted
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const totalIncome = sorted
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="surface max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${categoryChip(category)}`}
            >
              {category}
            </span>
            <p className="mt-2 text-sm tabular-nums text-[#f4efe3]/55">
              {totalExpense > 0 && (
                <span className="text-rose-300">-{fmtUSD(totalExpense)}</span>
              )}
              {totalExpense > 0 && totalIncome > 0 && " · "}
              {totalIncome > 0 && (
                <span className="text-emerald-300">+{fmtUSD(totalIncome)}</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-2 text-[#f4efe3]/55 hover:bg-white/[.06] hover:text-[#f4efe3]"
          >
            ×
          </button>
        </div>

        <div className="max-h-[calc(85vh-90px)] overflow-y-auto p-5">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#f4efe3]/55">No transactions.</p>
          ) : (
            <ul className="space-y-3">
              {sorted.map((t) => {
                const w = max > 0 ? (t.amount / max) * 100 : 0;
                return (
                  <li key={t.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#f4efe3]">
                        {t.description}
                      </span>
                      <span
                        className={`tabular-nums ${
                          t.type === "income" ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {t.type === "income" ? "+" : "-"}
                        {fmtUSD(t.amount)}
                      </span>
                    </div>
                    <div className="mt-1 h-3 w-full overflow-hidden rounded-md bg-white/[.06]">
                      <div
                        className={`h-full ${
                          t.type === "income" ? "bg-emerald-400" : categoryBar(category)
                        }`}
                        style={{ width: `${w}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-[#f4efe3]/45">
                      {new Date(t.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="surface-strong rounded-2xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ecd092]">
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}
