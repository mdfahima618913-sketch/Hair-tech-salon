/**
 * StaffAnalytics.tsx
 * Staff Performance Analytics Dashboard
 *
 * Props:
 *   staffInvoices  — Invoice[] loaded by the Staff useEffect in AdminDashboard
 *   staff          — StaffMember[] already loaded alongside invoices
 *
 * Features:
 *   - Period selector: This Week / This Month / This Year / All Time
 *   - Summary KPI cards (revenue, services, commission)
 *   - Employee of the Month (always current calendar month, weighted score)
 *   - Three leaderboards: Top Revenue | Most Services | Highest Commission
 *   - Trending Staff (this week vs previous week, growth %)
 *   - Service Performance Leaderboard (collapsible accordion, top 3 per service)
 *   - Revenue Trend mini-bars: last 4 weeks of revenue per staff member
 *   - Full performance overview table
 *
 * No external chart libraries — all bars are pure CSS / SVG via motion/react.
 * Dark theme matching AdminDashboard (bg-zinc-900, gold accents, white text).
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp, TrendingDown, Award, Scissors,
  IndianRupee, ChevronDown, ChevronUp, Crown, Flame,
  BarChart3, Percent, Users,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BillItem {
  serviceId?: string;
  serviceName: string;
  price: number;
  staffId: string;
  staffName: string;
  commissionRate: number;
  commissionAmount: number;
}

interface Invoice {
  id?: string;
  items?: BillItem[];
  total?: number;
  createdAt?: any;
  source?: string;
}

interface StaffMember {
  id: string;
  name: string;
  role?: string;
  commissionRate?: number;
  salary?: number;
  isActive?: boolean;
}

type Period = 'week' | 'month' | 'year' | 'all';

interface StaffStat {
  id: string;
  name: string;
  role?: string;
  revenue: number;
  services: number;
  commission: number;
  avgPerService: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise a Firestore Timestamp, plain Date, or ISO string to a JS Date. */
function toDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (typeof ts.toDate === 'function') return ts.toDate();
  return new Date(ts);
}

/** Return the start boundary for a given period. */
function getPeriodStart(p: Period): Date {
  const d = new Date();
  if (p === 'week') {
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
  } else if (p === 'month') {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  } else if (p === 'year') {
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
  } else {
    // 'all' — go far back enough to include everything
    d.setFullYear(2000);
  }
  return d;
}

/**
 * Aggregate per-staff stats for invoices that fall within [start, now).
 * Active staff members are seeded from the staff list so they always appear,
 * even with zero invoices in the period.
 */
function aggregateStats(
  invoices: Invoice[],
  period: Period,
  staffList: StaffMember[],
): StaffStat[] {
  const start = getPeriodStart(period);
  const map: Record<string, StaffStat> = {};

  // Seed all active staff so no one is hidden
  staffList
    .filter(s => s.isActive !== false)
    .forEach(s => {
      map[s.id] = {
        id: s.id,
        name: s.name,
        role: s.role,
        revenue: 0,
        services: 0,
        commission: 0,
        avgPerService: 0,
      };
    });

  invoices.forEach(inv => {
    if (toDate(inv.createdAt) < start) return;
    (inv.items ?? []).forEach((it: BillItem) => {
      if (!it.staffId) return;
      if (!map[it.staffId]) {
        map[it.staffId] = {
          id: it.staffId,
          name: it.staffName || 'Unknown',
          revenue: 0,
          services: 0,
          commission: 0,
          avgPerService: 0,
        };
      }
      map[it.staffId].revenue    += it.price           ?? 0;
      map[it.staffId].services   += 1;
      map[it.staffId].commission += it.commissionAmount ?? 0;
    });
  });

  return Object.values(map)
    .map(s => ({
      ...s,
      avgPerService: s.services > 0 ? Math.round(s.revenue / s.services) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

const MEDAL = ['🥇', '🥈', '🥉'];

const PERIOD_LABELS: Record<Period, string> = {
  week:  'This Week',
  month: 'This Month',
  year:  'This Year',
  all:   'All Time',
};

// ─── Micro-components ──────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="text-center p-3 rounded-xl bg-white/8">
      <p className={`font-black text-lg ${color}`}>{value}</p>
      <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

/** Animated horizontal bar — value / max expressed as a percentage of width. */
function MiniBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 3;
  return (
    <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
  );
}

/**
 * Four small week-bars per staff member — used in the Revenue Trend section.
 * weekValues is an array of 4 numbers ordered oldest-to-newest (index 0 = 4 weeks ago).
 */
function WeekBars({ weekValues }: { weekValues: number[] }) {
  const max = Math.max(...weekValues, 1);
  return (
    <div className="flex items-end gap-0.5 h-6">
      {weekValues.map((v, i) => {
        const heightPct = Math.max(8, (v / max) * 100);
        const isLatest  = i === weekValues.length - 1;
        return (
          <motion.div
            key={i}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.5, delay: i * 0.06, ease: 'easeOut' }}
            style={{ height: `${heightPct}%`, transformOrigin: 'bottom' }}
            className={`w-3 rounded-sm ${isLatest ? 'bg-gold/80' : 'bg-white/15'}`}
            title={`Week ${i + 1}: ₹${v.toLocaleString('en-IN')}`}
          />
        );
      })}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface StaffAnalyticsProps {
  staffInvoices: Invoice[];
  staff: StaffMember[];
}

export default function StaffAnalytics({ staffInvoices, staff }: StaffAnalyticsProps) {
  const [period,      setPeriod]      = useState<Period>('month');
  const [openService, setOpenService] = useState<string | null>(null);

  // ── Core stats for selected period ────────────────────────────────────────
  const stats = useMemo(
    () => aggregateStats(staffInvoices, period, staff),
    [staffInvoices, period, staff],
  );

  // ── Summary totals ─────────────────────────────────────────────────────────
  const totals = useMemo(() => ({
    revenue:    stats.reduce((a, s) => a + s.revenue,    0),
    services:   stats.reduce((a, s) => a + s.services,   0),
    commission: stats.reduce((a, s) => a + s.commission, 0),
  }), [stats]);

  // ── Employee of the Month ─────────────────────────────────────────────────
  // Always uses the current calendar month, regardless of the period selector.
  // Scoring: services*1 + revenue/1000 + commission/100  (per spec)
  const employeeOfMonth = useMemo(() => {
    const monthStats = aggregateStats(staffInvoices, 'month', staff).filter(
      s => s.services > 0,
    );
    if (!monthStats.length) return null;

    const scored = monthStats.map(s => ({
      ...s,
      score: s.services * 1 + s.revenue / 1000 + s.commission / 100,
    }));
    return scored.sort((a, b) => b.score - a.score)[0];
  }, [staffInvoices, staff]);

  // ── Trending: this week vs previous week ──────────────────────────────────
  // Always compares the same two windows regardless of period selector so the
  // section header is always accurate ("vs previous week").
  const trending = useMemo(() => {
    const now           = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - 7);
    thisWeekStart.setHours(0, 0, 0, 0);
    const prevWeekStart = new Date(now);
    prevWeekStart.setDate(now.getDate() - 14);
    prevWeekStart.setHours(0, 0, 0, 0);

    const thisWeek: Record<string, number> = {};
    const prevWeek: Record<string, number> = {};

    staffInvoices.forEach(inv => {
      const d = toDate(inv.createdAt);
      (inv.items ?? []).forEach((it: BillItem) => {
        if (!it.staffId) return;
        if (d >= thisWeekStart) {
          thisWeek[it.staffId] = (thisWeek[it.staffId] ?? 0) + (it.price ?? 0);
        } else if (d >= prevWeekStart) {
          prevWeek[it.staffId] = (prevWeek[it.staffId] ?? 0) + (it.price ?? 0);
        }
      });
    });

    return staff
      .filter(s => s.isActive !== false && (thisWeek[s.id] || prevWeek[s.id]))
      .map(s => {
        const cur  = thisWeek[s.id] ?? 0;
        const prev = prevWeek[s.id] ?? 0;
        let pct: number;
        if (prev === 0 && cur === 0) return null;
        if (prev === 0)  pct = 100;
        else if (cur === 0) pct = -100;
        else pct = Math.round(((cur - prev) / prev) * 100);
        return { ...s, thisWeek: cur, prevWeek: prev, pct };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.thisWeek > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [staffInvoices, staff]);

  // ── Service leaderboard ───────────────────────────────────────────────────
  const serviceLeaderboard = useMemo(() => {
    const start = getPeriodStart(period);
    const svcMap: Record<
      string,
      Record<string, { name: string; count: number; revenue: number }>
    > = {};

    staffInvoices.forEach(inv => {
      if (toDate(inv.createdAt) < start) return;
      (inv.items ?? []).forEach((it: BillItem) => {
        if (!it.staffId || !it.serviceName) return;
        if (!svcMap[it.serviceName]) svcMap[it.serviceName] = {};
        if (!svcMap[it.serviceName][it.staffId]) {
          svcMap[it.serviceName][it.staffId] = {
            name:    it.staffName || 'Unknown',
            count:   0,
            revenue: 0,
          };
        }
        svcMap[it.serviceName][it.staffId].count   += 1;
        svcMap[it.serviceName][it.staffId].revenue += it.price ?? 0;
      });
    });

    return Object.entries(svcMap)
      .map(([svc, staffMap]) => ({
        service: svc,
        leaders: Object.values(staffMap)
          .sort((a, b) => b.count - a.count)
          .slice(0, 3),
        totalCount: Object.values(staffMap).reduce((s, v) => s + v.count, 0),
      }))
      .sort((a, b) => b.totalCount - a.totalCount)
      .slice(0, 12);
  }, [staffInvoices, period]);

  // ── Revenue trend: last 4 weeks per staff ─────────────────────────────────
  // weekBuckets[0] = oldest (4 weeks ago to 3 weeks ago), [3] = most recent.
  const revenueTrend = useMemo(() => {
    const now = new Date();

    // Build 4 week boundaries: each entry is [weekStart, weekEnd)
    const windows: Array<{ start: Date; end: Date }> = [];
    for (let w = 3; w >= 0; w--) {
      const end   = new Date(now);
      end.setDate(now.getDate() - w * 7);
      end.setHours(0, 0, 0, 0);
      const start = new Date(end);
      start.setDate(end.getDate() - 7);
      windows.push({ start, end });
    }
    // Last window's end should be "now" (inclusive of today)
    windows[3].end = new Date(now.getTime() + 86400000);

    // staffId -> [week0rev, week1rev, week2rev, week3rev]
    const trendMap: Record<string, number[]> = {};

    // Seed every active staff member with zeros
    staff
      .filter(s => s.isActive !== false)
      .forEach(s => {
        trendMap[s.id] = [0, 0, 0, 0];
      });

    staffInvoices.forEach(inv => {
      const d = toDate(inv.createdAt);
      (inv.items ?? []).forEach((it: BillItem) => {
        if (!it.staffId) return;
        if (!trendMap[it.staffId]) trendMap[it.staffId] = [0, 0, 0, 0];
        windows.forEach(({ start, end }, idx) => {
          if (d >= start && d < end) {
            trendMap[it.staffId][idx] += it.price ?? 0;
          }
        });
      });
    });

    // Return only staff with at least one non-zero week
    return staff
      .filter(s => s.isActive !== false)
      .map(s => ({
        id:         s.id,
        name:       s.name,
        role:       s.role,
        weekValues: trendMap[s.id] ?? [0, 0, 0, 0],
      }))
      .filter(s => s.weekValues.some(v => v > 0))
      .sort(
        (a, b) =>
          b.weekValues[3] - a.weekValues[3] ||
          a.name.localeCompare(b.name),
      );
  }, [staffInvoices, staff]);

  // ── Derived maxima for relative bars ─────────────────────────────────────
  const maxRevenue    = stats[0]?.revenue    || 1;
  const maxServices   = Math.max(...stats.map(s => s.services),   1);
  const maxCommission = Math.max(...stats.map(s => s.commission), 1);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Period selector ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-white font-black text-lg uppercase tracking-tight flex items-center gap-2">
            <BarChart3 size={18} className="text-purple-400" />
            Staff Analytics
          </h2>
          <p className="text-gray-500 text-xs mt-0.5">
            Performance insights · {PERIOD_LABELS[period]}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-zinc-800 border border-white/12 rounded-xl p-1">
          {(['week', 'month', 'year', 'all'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                period === p
                  ? 'bg-purple-500/20 border border-purple-500/30 text-purple-400'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary KPI cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: 'Total Revenue',
            value: `₹${totals.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
            color: 'text-gold',
            icon:  IndianRupee,
          },
          {
            label: 'Services Done',
            value: totals.services.toString(),
            color: 'text-emerald-400',
            icon:  Scissors,
          },
          {
            label: 'Commission',
            value: `₹${totals.commission.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
            color: 'text-purple-400',
            icon:  Percent,
          },
        ].map(({ label, value, color, icon: Icon }) => (
          <div
            key={label}
            className="bg-zinc-900 border border-white/12 rounded-2xl p-4 text-center"
          >
            <Icon size={18} className={`${color} mx-auto mb-2`} />
            <p className={`font-black text-xl ${color}`}>{value}</p>
            <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* ── Employee of the Month ───────────────────────────────────────── */}
      {employeeOfMonth ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-2xl overflow-hidden border border-gold/30"
          style={{
            background:
              'linear-gradient(135deg,#1a1200 0%,#2a1e00 50%,#1a1200 100%)',
          }}
        >
          {/* top shimmer line */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold to-transparent" />
          <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-full bg-gold/20 border-2 border-gold/40 flex items-center justify-center text-gold font-black text-2xl">
                {employeeOfMonth.name.charAt(0).toUpperCase()}
              </div>
              <Crown
                size={18}
                className="text-gold fill-current absolute -top-2 -right-1"
              />
            </div>
            {/* Title + name */}
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-gold/70">
                Employee of the Month
              </span>
              <p className="text-white font-black text-xl leading-tight mt-0.5">
                {employeeOfMonth.name}
              </p>
              {employeeOfMonth.role && (
                <p className="text-gray-500 text-xs mt-0.5">
                  {employeeOfMonth.role}
                </p>
              )}
            </div>
            {/* Stats pills */}
            <div className="grid grid-cols-3 gap-3 shrink-0 w-full sm:w-auto">
              <StatPill
                label="Services"
                value={employeeOfMonth.services.toString()}
                color="text-white"
              />
              <StatPill
                label="Revenue"
                value={`₹${Math.round(employeeOfMonth.revenue / 1000)}k`}
                color="text-gold"
              />
              <StatPill
                label="Commission"
                value={`₹${Math.round(employeeOfMonth.commission / 1000)}k`}
                color="text-emerald-400"
              />
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="bg-zinc-900 border border-white/12 rounded-2xl p-6 text-center">
          <Crown size={28} className="text-gray-700 mx-auto mb-2" />
          <p className="text-gray-500 text-xs">No activity yet this month</p>
          <p className="text-gray-700 text-[10px] mt-1">
            Employee of the Month will appear once invoices are generated.
          </p>
        </div>
      )}

      {/* ── Three leaderboards (Revenue / Services / Commission) ────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            title:  'Top Revenue',
            key:    'revenue'    as keyof StaffStat,
            format: (v: number) =>
              `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
            color:  'text-gold',
            bar:    'bg-gold/60',
            border: 'border-gold/20',
            max:    maxRevenue,
          },
          {
            title:  'Most Services',
            key:    'services'   as keyof StaffStat,
            format: (v: number) => `${v} svc`,
            color:  'text-emerald-400',
            bar:    'bg-emerald-500/60',
            border: 'border-emerald-500/20',
            max:    maxServices,
          },
          {
            title:  'Top Commission',
            key:    'commission' as keyof StaffStat,
            format: (v: number) =>
              `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
            color:  'text-purple-400',
            bar:    'bg-purple-500/60',
            border: 'border-purple-500/20',
            max:    maxCommission,
          },
        ].map(({ title, key, format, color, bar, border, max }) => {
          const sorted = [...stats]
            .sort(
              (a, b) =>
                (b[key] as number) - (a[key] as number) ||
                a.name.localeCompare(b.name),
            )
            .slice(0, 5);
          const active = sorted.filter(s => (s[key] as number) > 0);

          return (
            <div
              key={title}
              className={`bg-zinc-900 border ${border} rounded-2xl p-5 space-y-3`}
            >
              <p className="text-[10px] uppercase tracking-widest font-black text-gray-500">
                {title}
              </p>
              {active.length === 0 && (
                <p className="text-gray-400 text-xs text-center py-4">
                  No data for this period
                </p>
              )}
              {active.map((s, i) => (
                <div key={s.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm shrink-0">
                        {MEDAL[i] ?? `${i + 1}.`}
                      </span>
                      <span className="text-xs text-gray-300 font-medium truncate">
                        {s.name}
                      </span>
                    </div>
                    <span className={`text-[10px] font-black shrink-0 ${color}`}>
                      {format(s[key] as number)}
                    </span>
                  </div>
                  <MiniBar value={s[key] as number} max={max} color={bar} />
                </div>
              ))}
              {/* Zero-invoice staff shown dimmed at the bottom */}
              {sorted
                .filter(s => (s[key] as number) === 0)
                .slice(0, 3)
                .map(s => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 opacity-30"
                  >
                    <span className="text-xs text-gray-500 truncate">{s.name}</span>
                    <span className="text-[10px] text-gray-400">—</span>
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      {/* ── Trending this week ──────────────────────────────────────────── */}
      {trending.length > 0 && (
        <div className="bg-zinc-900 border border-white/12 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={16} className="text-orange-400" />
            <p className="text-[10px] uppercase tracking-widest font-black text-gray-500">
              Trending This Week
            </p>
            <span className="text-[9px] text-gray-400 ml-auto">
              vs previous 7 days
            </span>
          </div>
          <div className="space-y-3">
            {trending.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="text-sm w-5 shrink-0">
                  {MEDAL[i] ?? `${i + 1}.`}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-bold truncate">{s.name}</p>
                  <p className="text-gray-400 text-[9px]">
                    ₹{s.thisWeek.toLocaleString('en-IN')} this week
                    {s.prevWeek > 0 && (
                      <> · ₹{s.prevWeek.toLocaleString('en-IN')} last week</>
                    )}
                  </p>
                </div>
                <div
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${
                    s.pct > 0
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : s.pct < 0
                      ? 'bg-red-500/15 text-red-400'
                      : 'bg-white/8 text-gray-500'
                  }`}
                >
                  {s.pct > 0 ? (
                    <TrendingUp size={11} />
                  ) : s.pct < 0 ? (
                    <TrendingDown size={11} />
                  ) : (
                    <span>—</span>
                  )}
                  {s.pct > 0 ? '+' : ''}
                  {s.pct.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Revenue Trend mini-bars (last 4 weeks per staff) ─────────────── */}
      {revenueTrend.length > 0 && (
        <div className="bg-zinc-900 border border-white/12 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 size={14} className="text-purple-400" />
            <p className="text-[10px] uppercase tracking-widest font-black text-gray-500">
              Revenue Trend
            </p>
            <span className="text-[9px] text-gray-400 ml-auto">
              Last 4 weeks · rightmost bar = current week
            </span>
          </div>
          <p className="text-[9px] text-gray-700 mb-4">
            Gold bar = current week · lighter bars = previous weeks
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {revenueTrend.map(s => (
              <div
                key={s.id}
                className="flex items-center gap-3 bg-white/[0.02] rounded-xl px-3 py-2.5"
              >
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-purple-500/15 border border-purple-500/20 flex items-center justify-center text-purple-400 font-black text-xs shrink-0">
                  {s.name.charAt(0).toUpperCase()}
                </div>
                {/* Name + role */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-bold truncate leading-none">
                    {s.name}
                  </p>
                  {s.role && (
                    <p className="text-gray-400 text-[9px] mt-0.5">{s.role}</p>
                  )}
                </div>
                {/* Current-week revenue */}
                <p className="text-gold text-[10px] font-black shrink-0">
                  ₹{s.weekValues[3].toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                {/* 4-week bars */}
                <div className="shrink-0">
                  <WeekBars weekValues={s.weekValues} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Full staff performance table ─────────────────────────────────── */}
      {stats.filter(s => s.services > 0).length > 0 && (
        <div className="bg-zinc-900 border border-white/12 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/12 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={13} className="text-gray-500" />
              <p className="text-[10px] uppercase tracking-widest font-black text-gray-500">
                Full Performance Overview
              </p>
            </div>
            <p className="text-[9px] text-gray-400">
              {stats.filter(s => s.services > 0).length} active staff
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  {['Staff', 'Services', 'Revenue', 'Avg / Service', 'Commission', 'Rev Share'].map(
                    h => (
                      <th
                        key={h}
                        className="py-2.5 px-4 text-left text-[9px] font-black uppercase tracking-widest text-gray-400"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {stats
                  .filter(s => s.services > 0)
                  .map((s, i) => {
                    const share =
                      totals.revenue > 0
                        ? Math.round((s.revenue / totals.revenue) * 100)
                        : 0;
                    return (
                      <tr
                        key={s.id}
                        className="border-b border-white/10 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            {i < 3 && (
                              <span className="text-sm">{MEDAL[i]}</span>
                            )}
                            <div className="w-7 h-7 rounded-full bg-purple-500/15 border border-purple-500/20 flex items-center justify-center text-purple-400 font-black text-xs shrink-0">
                              {s.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-white text-xs font-bold leading-none">
                                {s.name}
                              </p>
                              {s.role && (
                                <p className="text-gray-400 text-[9px] mt-0.5">
                                  {s.role}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-white font-black text-sm">
                          {s.services}
                        </td>
                        <td className="py-3 px-4 text-gold font-black text-sm">
                          ₹{s.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs">
                          ₹{s.avgPerService.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-emerald-400 font-bold text-xs">
                          ₹{s.commission.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gold/50 rounded-full"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-500 font-bold w-7 text-right">
                              {share}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            <div className="px-5 py-2.5 border-t border-white/10 bg-white/[0.01] flex justify-between text-[10px] text-gray-400 font-bold">
              <span>Totals</span>
              <span className="flex gap-6">
                <span>{totals.services} services</span>
                <span>
                  ₹{totals.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
                <span>
                  ₹{totals.commission.toLocaleString('en-IN', { maximumFractionDigits: 0 })}{' '}
                  commission
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Service leaderboard (collapsible accordion) ──────────────────── */}
      {serviceLeaderboard.length > 0 && (
        <div className="bg-zinc-900 border border-white/12 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/12">
            <p className="text-[10px] uppercase tracking-widest font-black text-gray-500 flex items-center gap-2">
              <Scissors size={12} />
              Service Performance Leaderboard
            </p>
          </div>
          <div className="divide-y divide-white/5">
            {serviceLeaderboard.map(({ service, leaders, totalCount }) => {
              const isOpen = openService === service;
              return (
                <div key={service}>
                  <button
                    onClick={() => setOpenService(isOpen ? null : service)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-all text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-white/8 flex items-center justify-center shrink-0">
                        <Scissors size={12} className="text-gray-500" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-white text-sm font-bold truncate block">
                          {service}
                        </span>
                        <span className="text-gray-400 text-[9px]">
                          {totalCount} booking{totalCount !== 1 ? 's' : ''} total
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-[10px] text-gray-500">
                        {leaders[0]?.name} · {leaders[0]?.count}×
                      </span>
                      {isOpen ? (
                        <ChevronUp size={13} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={13} className="text-gray-400" />
                      )}
                    </div>
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-4 pt-1 space-y-2">
                          {leaders.map((l, i) => (
                            <div
                              key={l.name}
                              className="flex items-center gap-3 py-1"
                            >
                              <span className="text-sm w-5 shrink-0">
                                {MEDAL[i] ?? `${i + 1}.`}
                              </span>
                              <span className="flex-1 text-gray-300 text-xs">
                                {l.name}
                              </span>
                              <span className="text-white text-xs font-black">
                                {l.count}×
                              </span>
                              <span className="text-gold text-[10px] font-bold w-24 text-right">
                                ₹{l.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {totals.services === 0 && (
        <div className="text-center py-16 space-y-3">
          <Award size={40} className="text-gray-700 mx-auto" />
          <p className="text-gray-400 font-bold">No billing data yet</p>
          <p className="text-gray-400 text-sm">
            Analytics will appear once invoices are generated for staff members.
          </p>
        </div>
      )}
    </div>
  );
}


