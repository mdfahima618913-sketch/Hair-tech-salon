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

import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp, TrendingDown, Award, Scissors,
  IndianRupee, ChevronDown, ChevronUp, Crown, Flame,
  BarChart3, Percent, Users, Calendar, X,
  ArrowLeft, Receipt, ChevronRight, ChevronLeft,
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
  start: Date,
  end: Date | null,
  staffList: StaffMember[],
): StaffStat[] {
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
    const d = toDate(inv.createdAt);
    if (d < start || (end && d > end)) return;
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

function localDate(s: string, endOfDay = false): Date {
  const [y, m, d] = s.split('-').map(Number);
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
}

function getPeriodLabel(period: Period, from: string, to: string): string {
  const now = new Date();
  if (from && to) {
    const f = localDate(from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const t = localDate(to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${f} – ${t}`;
  }
  if (period === 'week')  return 'Last 7 days';
  if (period === 'month') return now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  if (period === 'year')  return now.getFullYear().toString();
  return 'All time';
}

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
      <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">{label}</p>
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

// ─── Staff Profile Drill-down ──────────────────────────────────────────────────

function StaffProfileView({
  staffId, staff, staffInvoices, onBack,
}: {
  staffId: string;
  staff: StaffMember[];
  staffInvoices: Invoice[];
  onBack: () => void;
}) {
  const member = staff.find(s => s.id === staffId);

  // Own date filter — defaults to all-time so full history is shown
  const [profileFrom, setProfileFrom] = useState('');
  const [profileTo,   setProfileTo]   = useState('');

  // Derive start/end directly from primitive strings — avoids object reference equality issues
  const isFiltered  = !!(profileFrom && profileTo);
  const profileStart = isFiltered ? localDate(profileFrom)        : new Date(2000, 0, 1);
  const profileEnd   = isFiltered ? localDate(profileTo, true)    : null;
  const profileLabel = isFiltered
    ? `${localDate(profileFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${localDate(profileTo).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'All Time';

  // Invoices for this staff within the selected range
  const filteredInvoices = useMemo(() =>
    staffInvoices.filter(inv => {
      const d = toDate(inv.createdAt);
      return d >= profileStart && (profileEnd ? d <= profileEnd : true)
        && inv.items?.some(it => it.staffId === staffId);
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [staffInvoices, staffId, profileFrom, profileTo]);

  // Flat items for this staff in range
  const periodItems = useMemo(() =>
    filteredInvoices.flatMap(inv => (inv.items ?? []).filter(it => it.staffId === staffId)),
  [filteredInvoices, staffId]);

  // Summary KPIs
  const summary = useMemo(() => {
    const revenue    = periodItems.reduce((a, it) => a + (it.price ?? 0), 0);
    const services   = periodItems.length;
    const commission = periodItems.reduce((a, it) => a + (it.commissionAmount ?? 0), 0);
    return { revenue, services, commission, avg: services > 0 ? Math.round(revenue / services) : 0 };
  }, [periodItems]);

  // Service breakdown sorted by revenue
  const serviceBreakdown = useMemo(() => {
    const map: Record<string, { count: number; revenue: number; commission: number }> = {};
    periodItems.forEach(it => {
      const k = it.serviceName || 'Unknown';
      if (!map[k]) map[k] = { count: 0, revenue: 0, commission: 0 };
      map[k].count++; map[k].revenue += it.price ?? 0; map[k].commission += it.commissionAmount ?? 0;
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d, avg: d.count > 0 ? Math.round(d.revenue / d.count) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [periodItems]);

  // Monthly revenue — every month worked within the range (dynamic buckets)
  const monthlyRevenue = useMemo(() => {
    const bucketMap: Record<string, { label: string; sortKey: string; revenue: number; commission: number }> = {};
    const start = isFiltered ? localDate(profileFrom) : new Date(2000, 0, 1);
    const end   = isFiltered ? localDate(profileTo, true) : null;
    staffInvoices.forEach(inv => {
      const d = toDate(inv.createdAt);
      if (d < start || (end && d > end)) return;
      const myItems = (inv.items ?? []).filter(it => it.staffId === staffId);
      if (myItems.length === 0) return;
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label   = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      if (!bucketMap[sortKey]) bucketMap[sortKey] = { label, sortKey, revenue: 0, commission: 0 };
      myItems.forEach(it => {
        bucketMap[sortKey].revenue    += it.price ?? 0;
        bucketMap[sortKey].commission += it.commissionAmount ?? 0;
      });
    });
    return Object.values(bucketMap).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffInvoices, staffId, profileFrom, profileTo]);

  // Bills within range — non-mutating sort
  const filteredBills = useMemo(() =>
    [...filteredInvoices].sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime()),
  [filteredInvoices]);

  // Team comparison within the range
  const teamComparison = useMemo(() => {
    const start = isFiltered ? localDate(profileFrom) : new Date(2000, 0, 1);
    const end   = isFiltered ? localDate(profileTo, true) : null;
    const allStats = aggregateStats(staffInvoices, start, end, staff);
    const active   = allStats.filter(s => s.services > 0);
    const teamAvg  = active.length > 0 ? Math.round(active.reduce((a, s) => a + s.revenue, 0) / active.length) : 0;
    const rank     = active.findIndex(s => s.id === staffId) + 1;
    return { teamAvg, rank, total: active.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffInvoices, profileFrom, profileTo, staff, staffId]);

  // ── Days present: unique calendar days with a service item ──────────────
  const daysPresent = useMemo(() => {
    const days = new Set(filteredInvoices.map(inv => {
      const d = toDate(inv.createdAt);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }));
    return days.size;
  }, [filteredInvoices]);

  // ── Daily revenue map: YYYY-MM-DD → { revenue, commission, services } ──
  const dailyRevMap = useMemo(() => {
    const map: Record<string, { revenue: number; commission: number; services: number }> = {};
    filteredInvoices.forEach(inv => {
      const d = toDate(inv.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map[key]) map[key] = { revenue: 0, commission: 0, services: 0 };
      (inv.items ?? []).filter((it: BillItem) => it.staffId === staffId).forEach(it => {
        map[key].revenue    += it.price ?? 0;
        map[key].commission += it.commissionAmount ?? 0;
        map[key].services   += 1;
      });
    });
    return map;
  }, [filteredInvoices, staffId]);

  // ── Payout: pro-rated salary (monthlySalary/30 × daysPresent) + commission
  const payout = useMemo(() => {
    const monthlySalary = (member as any)?.salary ?? 0;
    const comm = summary.commission;
    const dailySalary   = monthlySalary > 0 ? Math.round(monthlySalary / 30) : 0;
    const proratedSalary = dailySalary * daysPresent;
    return { proratedSalary, commission: comm, total: proratedSalary + comm, dailySalary, monthlySalary };
  }, [member, summary.commission, daysPresent]);

  // ── Salon profit from this staff ────────────────────────────────────────
  const profitInfo = useMemo(() => {
    if (summary.revenue === 0) return { profit: 0, margin: 0 };
    const profit = summary.revenue - payout.total;
    const margin = payout.total > 0 ? Math.round((profit / summary.revenue) * 100) : 100;
    return { profit, margin };
  }, [summary.revenue, payout.total]);

  // ── Calendar month navigator ─────────────────────────────────────────────
  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (isFiltered && profileFrom) return profileFrom.slice(0, 7);
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  useEffect(() => {
    setCalendarMonth(
      isFiltered && profileFrom
        ? profileFrom.slice(0, 7)
        : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    );
  }, [profileFrom, isFiltered]);

  const maxSvcRev     = serviceBreakdown[0]?.revenue || 1;
  const maxMonthlyRev = Math.max(...monthlyRevenue.map(m => m.revenue), 1);

  return (
    <div className="space-y-5">

      {/* Back */}
      <button onClick={onBack}
        className="flex items-center gap-2 text-gray-400 hover:text-white text-sm font-bold transition-colors group">
        <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
        Back to Analytics
      </button>

      {/* Hero card */}
      <div className="bg-zinc-900 border border-gold/25 rounded-2xl p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-full bg-gold/15 border-2 border-gold/30 flex items-center justify-center text-gold font-black text-2xl shrink-0">
            {(member?.name ?? 'S').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-xl">{member?.name ?? 'Staff Member'}</p>
            {member?.role && <p className="text-gray-400 text-sm mt-0.5">{member.role}</p>}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {member?.commissionRate != null && (
                <span className="text-xs text-gold font-bold bg-gold/10 border border-gold/20 rounded-full px-2.5 py-0.5">
                  {member.commissionRate}% commission
                </span>
              )}
              {(member as any)?.salary > 0 && (
                <span className="text-xs text-gray-400 font-bold bg-white/5 rounded-full px-2.5 py-0.5">
                  ₹{((member as any).salary).toLocaleString('en-IN')}/mo salary
                </span>
              )}
            </div>
          </div>
          {/* Rank badge */}
          {teamComparison.rank > 0 && (
            <div className="text-center shrink-0 bg-white/5 rounded-xl px-4 py-3">
              <p className="text-2xl leading-none">{teamComparison.rank === 1 ? '🥇' : teamComparison.rank === 2 ? '🥈' : teamComparison.rank === 3 ? '🥉' : `#${teamComparison.rank}`}</p>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-1">of {teamComparison.total} staff</p>
            </div>
          )}
        </div>

        {/* ── Date range filter ─────────────────────────────────────────── */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-1 bg-zinc-800 border border-white/12 rounded-xl px-3 py-2">
            <Calendar size={12} className={isFiltered ? 'text-gold shrink-0' : 'text-gray-500 shrink-0'} />
            <input
              type="date" value={profileFrom}
              onChange={e => setProfileFrom(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none w-28 [color-scheme:dark]"
              placeholder="From"
            />
            <span className="text-gray-600 text-xs">–</span>
            <input
              type="date" value={profileTo} min={profileFrom}
              onChange={e => setProfileTo(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none w-28 [color-scheme:dark]"
              placeholder="To"
            />
            {isFiltered && (
              <button onClick={() => { setProfileFrom(''); setProfileTo(''); }}
                className="text-gray-500 hover:text-white transition-colors ml-auto shrink-0">
                <X size={12} />
              </button>
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-gold font-bold bg-gold/8 border border-gold/20 rounded-lg px-2.5 py-1.5 whitespace-nowrap">
            <Calendar size={10} /> {profileLabel}
          </span>
        </div>

        {/* KPI strip — 3 col on mobile, 6 col on sm+ */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4">
          {[
            { label: 'Revenue',       value: `₹${summary.revenue.toLocaleString('en-IN')}`,        color: 'text-gold'       },
            { label: 'Services',      value: summary.services.toString(),                            color: 'text-white'      },
            { label: 'Days Present',  value: daysPresent.toString(),                                 color: 'text-sky-400'    },
            { label: 'Commission',    value: `₹${summary.commission.toLocaleString('en-IN')}`,      color: 'text-purple-400' },
            { label: 'Avg / Service', value: `₹${summary.avg.toLocaleString('en-IN')}`,             color: 'text-emerald-400'},
            { label: 'Total Payout',  value: `₹${payout.total.toLocaleString('en-IN')}`,            color: 'text-orange-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center p-2.5 bg-white/5 rounded-xl">
              <p className={`font-black text-base ${color}`}>{value}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5 leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* vs team */}
        {teamComparison.teamAvg > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-gray-600">Team avg ₹{teamComparison.teamAvg.toLocaleString('en-IN')} ·</span>
            {summary.revenue >= teamComparison.teamAvg ? (
              <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                <TrendingUp size={10} /> ₹{(summary.revenue - teamComparison.teamAvg).toLocaleString('en-IN')} above avg
              </span>
            ) : (
              <span className="text-[11px] text-red-400 font-bold flex items-center gap-1">
                <TrendingDown size={10} /> ₹{(teamComparison.teamAvg - summary.revenue).toLocaleString('en-IN')} below avg
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Payout Breakdown + Profit Margin ─────────────────────────────── */}
      {(payout.monthlySalary > 0 || payout.commission > 0) && (
        <div className="bg-zinc-900 border border-white/12 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10">
            <p className="text-xs uppercase tracking-widest font-black text-gray-500 flex items-center gap-2">
              <Percent size={12} /> Payout Breakdown · Profit Analysis
            </p>
          </div>
          <div className="p-5 grid sm:grid-cols-2 gap-5">
            {/* Left: payout */}
            <div className="space-y-2.5">
              {payout.monthlySalary > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">
                    Salary <span className="text-[11px] text-gray-600">({daysPresent} days × ₹{payout.dailySalary.toLocaleString('en-IN')}/day)</span>
                  </span>
                  <span className="text-orange-400 font-black">₹{payout.proratedSalary.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Commission earned</span>
                <span className="text-purple-400 font-black">₹{payout.commission.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-2">
                <span className="text-white font-black text-sm">Total Payout</span>
                <span className="text-orange-400 font-black text-base">₹{payout.total.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Right: profit margin */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Revenue brought</span>
                <span className="text-gold font-black">₹{summary.revenue.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Total payout</span>
                <span className="text-orange-400 font-black">−₹{payout.total.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-2">
                <span className="text-white font-black text-sm">Salon Profit</span>
                <span className={`font-black text-base ${profitInfo.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ₹{Math.abs(profitInfo.profit).toLocaleString('en-IN')} {profitInfo.profit < 0 ? '(loss)' : ''}
                </span>
              </div>
              {/* Margin bar */}
              {summary.revenue > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-600">Profit margin</span>
                    <span className={`font-black ${profitInfo.margin >= 50 ? 'text-emerald-400' : profitInfo.margin >= 20 ? 'text-gold' : 'text-red-400'}`}>
                      {profitInfo.margin}%
                    </span>
                  </div>
                  <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(0, Math.min(100, profitInfo.margin))}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className={`h-full rounded-full ${profitInfo.margin >= 50 ? 'bg-emerald-500' : profitInfo.margin >= 20 ? 'bg-gold' : 'bg-red-500'}`}
                    />
                  </div>
                  <p className="text-[10px] text-gray-600">
                    {profitInfo.margin >= 60 ? 'Excellent contribution' : profitInfo.margin >= 40 ? 'Good contribution' : profitInfo.margin >= 20 ? 'Average — review performance' : 'Below break-even — attention needed'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Daily Attendance Calendar ──────────────────────────────────────── */}
      {Object.keys(dailyRevMap).length > 0 && (() => {
        const [calY, calM] = calendarMonth.split('-').map(Number);
        const firstDow = (new Date(calY, calM - 1, 1).getDay() + 6) % 7; // Mon=0
        const daysInMon = new Date(calY, calM, 0).getDate();
        const calLabel  = new Date(calY, calM - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        const today     = new Date();
        const prevMon = (() => { const d = new Date(calY, calM - 2, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();
        const nextMon = (() => { const d = new Date(calY, calM,     1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();

        type CalCell = { day: number; dateKey: string; data?: { revenue: number; commission: number; services: number }; inPeriod: boolean; isToday: boolean } | null;
        const cells: CalCell[] = [];
        for (let p = 0; p < firstDow; p++) cells.push(null);
        for (let d = 1; d <= daysInMon; d++) {
          const dateKey = `${calY}-${String(calM).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const dateObj = new Date(calY, calM - 1, d);
          cells.push({
            day: d, dateKey,
            data: dailyRevMap[dateKey],
            inPeriod: dateObj >= profileStart && (!profileEnd || dateObj <= profileEnd),
            isToday: dateObj.toDateString() === today.toDateString(),
          });
        }
        while (cells.length % 7 !== 0) cells.push(null);

        const calRevenue  = Object.entries(dailyRevMap).filter(([k]) => k.startsWith(calendarMonth)).reduce((a, [, v]) => a + v.revenue, 0);
        const calDaysWkd  = Object.keys(dailyRevMap).filter(k => k.startsWith(calendarMonth)).length;

        return (
          <div className="bg-zinc-900 border border-white/12 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest font-black text-gray-500 flex items-center gap-2">
                <Calendar size={12} /> Daily Attendance
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setCalendarMonth(prevMon)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-white font-bold w-28 text-center">{calLabel}</span>
                <button onClick={() => setCalendarMonth(nextMon)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            <div className="p-4">
              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                  <div key={d} className="text-center text-[10px] text-gray-600 font-bold py-0.5">{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell, i) => {
                  if (!cell) return <div key={`p-${i}`} className="min-h-[48px]" />;
                  const { day, dateKey, data, inPeriod, isToday } = cell;
                  const worked = !!(data && data.services > 0);
                  return (
                    <div key={dateKey}
                      title={worked ? `${data!.services} service${data!.services !== 1 ? 's' : ''} · ₹${data!.revenue.toLocaleString('en-IN')}` : undefined}
                      className={`relative min-h-[48px] rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all
                        ${worked ? 'bg-gold/15 border border-gold/35 hover:bg-gold/22' : inPeriod ? 'bg-white/[0.03] border border-white/5' : 'opacity-15'}
                        ${isToday ? 'ring-1 ring-offset-0 ring-gold/60' : ''}`}>
                      <span className={`text-[11px] font-bold leading-none ${worked ? 'text-gold' : 'text-gray-600'}`}>{day}</span>
                      {worked && (
                        <span className="text-[9px] text-gold/70 leading-none font-bold">
                          {data!.revenue >= 1000 ? `₹${Math.round(data!.revenue / 1000)}k` : `₹${data!.revenue}`}
                        </span>
                      )}
                      {worked && data!.services > 1 && (
                        <span className="text-[8px] text-gold/40 leading-none">{data!.services} svc</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend + month summary */}
            <div className="px-5 py-2.5 border-t border-white/8 bg-white/[0.01] flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="w-3 h-3 rounded bg-gold/25 border border-gold/35 shrink-0" /> Worked
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="w-3 h-3 rounded bg-white/8 border border-white/8 shrink-0" /> Off
                </span>
              </div>
              <div className="flex gap-3 text-[11px]">
                <span className="text-gray-500">Days: <span className="text-white font-black">{calDaysWkd}</span></span>
                {calRevenue > 0 && <span className="text-gray-500">Revenue: <span className="text-gold font-black">₹{calRevenue.toLocaleString('en-IN')}</span></span>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Monthly Revenue Trend — all months worked (dynamic) */}
      {monthlyRevenue.length > 0 && (
        <div className="bg-zinc-900 border border-white/12 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-widest font-black text-gray-500 flex items-center gap-2">
              <BarChart3 size={12} /> Monthly Revenue Trend
            </p>
            <span className="text-[11px] text-gray-600">
              {monthlyRevenue.length} month{monthlyRevenue.length !== 1 ? 's' : ''} · {profileLabel}
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="flex items-end gap-2 min-w-0" style={{ height: 100, minWidth: monthlyRevenue.length > 8 ? monthlyRevenue.length * 44 : undefined }}>
              {monthlyRevenue.map(({ label, revenue, commission }) => {
                const pct = Math.max(revenue > 0 ? 5 : 0, (revenue / maxMonthlyRev) * 100);
                return (
                  <div key={label} className="flex-1 min-w-[36px] flex flex-col items-center gap-1">
                    <span className="text-[9px] text-gold font-bold leading-none text-center">
                      {revenue > 0 ? `₹${revenue >= 1000 ? `${Math.round(revenue / 1000)}k` : revenue}` : ''}
                    </span>
                    <div className="w-full rounded-t-sm bg-white/8 overflow-hidden flex flex-col-reverse" style={{ height: 64 }}>
                      <motion.div
                        key={label + revenue}
                        initial={{ height: 0 }}
                        animate={{ height: `${pct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className="w-full bg-gold/55 rounded-t-sm relative group"
                        title={`₹${revenue.toLocaleString('en-IN')} revenue · ₹${commission.toLocaleString('en-IN')} commission`}
                      />
                    </div>
                    <span className="text-[9px] text-gray-600 font-bold whitespace-nowrap">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Totals row */}
          <div className="mt-3 pt-3 border-t border-white/8 flex gap-4 text-xs">
            <span className="text-gray-500">Total: <span className="text-gold font-black">₹{monthlyRevenue.reduce((a,m)=>a+m.revenue,0).toLocaleString('en-IN')}</span></span>
            <span className="text-gray-500">Commission: <span className="text-purple-400 font-black">₹{monthlyRevenue.reduce((a,m)=>a+m.commission,0).toLocaleString('en-IN')}</span></span>
          </div>
        </div>
      )}

      {/* Service Breakdown */}
      <div className="bg-zinc-900 border border-white/12 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest font-black text-gray-500 flex items-center gap-2">
            <Scissors size={12} /> Service Breakdown
          </p>
          <span className="text-[11px] text-gray-500">{serviceBreakdown.length} service types · {summary.services} total</span>
        </div>
        {serviceBreakdown.length === 0 ? (
          <div className="p-8 text-center">
            <Scissors size={28} className="text-gray-700 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No services in selected period</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-white/5">
              {serviceBreakdown.map((svc, i) => (
                <div key={svc.name} className="px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm shrink-0 w-5">{MEDAL[i] ?? ''}</span>
                    <span className="text-white text-sm font-bold flex-1 truncate">{svc.name}</span>
                    <span className="text-[11px] text-gray-500 shrink-0">{svc.count}×</span>
                    <span className="text-gold font-black text-sm shrink-0 w-20 text-right">
                      ₹{svc.revenue.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pl-8">
                    <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(svc.revenue / maxSvcRev) * 100}%` }}
                        transition={{ duration: 0.55, ease: 'easeOut' }}
                        className="h-full bg-gold/55 rounded-full"
                      />
                    </div>
                    <span className="text-[10px] text-gray-600 shrink-0">
                      avg ₹{svc.avg.toLocaleString('en-IN')} · comm ₹{svc.commission.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-2.5 border-t border-white/10 bg-white/[0.01] flex justify-between text-xs font-bold">
              <span className="text-gray-500">{summary.services} total services</span>
              <span className="text-gold">₹{summary.revenue.toLocaleString('en-IN')} · <span className="text-purple-400">₹{summary.commission.toLocaleString('en-IN')} comm</span></span>
            </div>
          </>
        )}
      </div>

      {/* Bills in period */}
      {filteredBills.length > 0 && (
        <div className="bg-zinc-900 border border-white/12 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest font-black text-gray-500 flex items-center gap-2">
              <Receipt size={12} /> Bills
            </p>
            <span className="text-[11px] text-gray-500">{filteredBills.length} invoice{filteredBills.length !== 1 ? 's' : ''} · {profileLabel}</span>
          </div>
          <div className="divide-y divide-white/5">
            {filteredBills.map((inv, i) => {
              const myItems   = (inv.items ?? []).filter(it => it.staffId === staffId);
              const myRevenue = myItems.reduce((a, it) => a + (it.price ?? 0), 0);
              const myComm    = myItems.reduce((a, it) => a + (it.commissionAmount ?? 0), 0);
              return (
                <div key={(inv as any).id ?? i} className="px-5 py-3 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] text-gray-500">
                          {toDate(inv.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {(inv as any).invoiceNumber && (
                          <span className="text-[10px] text-gray-700">· #{(inv as any).invoiceNumber}</span>
                        )}
                      </div>
                      <p className="text-white text-xs font-medium truncate">
                        {myItems.map(it => it.serviceName).join(', ')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-gold text-sm font-black">₹{myRevenue.toLocaleString('en-IN')}</p>
                      <p className="text-[11px] text-purple-400">comm ₹{myComm.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {summary.services === 0 && filteredBills.length === 0 && (
        <div className="text-center py-12">
          <Award size={36} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">No billing activity {isFiltered ? 'in selected date range' : 'for this staff member yet'}.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface StaffAnalyticsProps {
  staffInvoices: Invoice[];
  staff: StaffMember[];
}

export default function StaffAnalytics({ staffInvoices, staff }: StaffAnalyticsProps) {
  const [period,         setPeriod]         = useState<Period>('month');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [openService,    setOpenService]    = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  // ── Effective date window ─────────────────────────────────────────────────
  const dateWindow = useMemo(() => {
    if (dateFrom && dateTo) {
      return { start: localDate(dateFrom), end: localDate(dateTo, true) };
    }
    return { start: getPeriodStart(period), end: null };
  }, [period, dateFrom, dateTo]);

  // ── Core stats for selected period ────────────────────────────────────────
  const stats = useMemo(
    () => aggregateStats(staffInvoices, dateWindow.start, dateWindow.end, staff),
    [staffInvoices, dateWindow, staff],
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
    const monthStats = aggregateStats(staffInvoices, getPeriodStart('month'), null, staff).filter(
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
    const { start, end } = dateWindow;
    const svcMap: Record<
      string,
      Record<string, { name: string; count: number; revenue: number }>
    > = {};

    staffInvoices.forEach(inv => {
      const d = toDate(inv.createdAt);
      if (d < start || (end && d > end)) return;
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
  }, [staffInvoices, dateWindow]);

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

  if (selectedStaffId) {
    return (
      <StaffProfileView
        staffId={selectedStaffId}
        staff={staff}
        staffInvoices={staffInvoices}
        onBack={() => setSelectedStaffId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Period selector ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-white font-black text-lg uppercase tracking-tight flex items-center gap-2">
              <BarChart3 size={18} className="text-purple-400" />
              Staff Analytics
            </h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-gold font-bold bg-gold/8 border border-gold/20 rounded-lg px-2.5 py-1 mt-1">
              <Calendar size={10} /> {getPeriodLabel(period, dateFrom, dateTo)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick chips */}
            <div className="flex items-center gap-1 bg-zinc-800 border border-white/12 rounded-xl p-1">
              {(['week', 'month', 'year', 'all'] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => { setPeriod(p); setDateFrom(''); setDateTo(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                    period === p && !dateFrom
                      ? 'bg-purple-500/20 border border-purple-500/30 text-purple-400'
                      : 'text-gray-500 hover:text-white'
                  }`}
                >
                  {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : 'All Time'}
                </button>
              ))}
            </div>
            {/* Custom date range */}
            <div className="flex items-center gap-1.5 bg-zinc-800 border border-white/12 rounded-xl px-3 py-1.5">
              <Calendar size={11} className={dateFrom ? 'text-gold' : 'text-gray-400'} />
              <input
                type="date" value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none w-24 [color-scheme:dark]"
              />
              <span className="text-gray-400 text-xs">–</span>
              <input
                type="date" value={dateTo} min={dateFrom}
                onChange={e => setDateTo(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none w-24 [color-scheme:dark]"
              />
              {dateFrom && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="text-gray-400 hover:text-white transition-colors ml-1"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
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
            <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">
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
              <span className="text-xs font-black uppercase tracking-widest text-gold/70">
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
          <p className="text-gray-700 text-xs mt-1">
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
              <p className="text-xs uppercase tracking-widest font-black text-gray-500">
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
                    <span className={`text-xs font-black shrink-0 ${color}`}>
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
                    <span className="text-xs text-gray-400">—</span>
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
            <p className="text-xs uppercase tracking-widest font-black text-gray-500">
              Trending This Week
            </p>
            <span className="text-[11px] text-gray-400 ml-auto">
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
                  <p className="text-gray-400 text-[11px]">
                    ₹{s.thisWeek.toLocaleString('en-IN')} this week
                    {s.prevWeek > 0 && (
                      <> · ₹{s.prevWeek.toLocaleString('en-IN')} last week</>
                    )}
                  </p>
                </div>
                <div
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${
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
            <p className="text-xs uppercase tracking-widest font-black text-gray-500">
              Revenue Trend
            </p>
            <span className="text-[11px] text-gray-400 ml-auto">
              Last 4 weeks · rightmost bar = current week
            </span>
          </div>
          <p className="text-[11px] text-gray-700 mb-4">
            Gold bar = current week · lighter bars = previous weeks
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {revenueTrend.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStaffId(s.id)}
                className="flex items-center gap-3 bg-white/[0.02] hover:bg-white/[0.05] rounded-xl px-3 py-2.5 w-full text-left transition-colors group cursor-pointer"
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
                    <p className="text-gray-400 text-[11px] mt-0.5">{s.role}</p>
                  )}
                </div>
                {/* Current-week revenue */}
                <p className="text-gold text-xs font-black shrink-0">
                  ₹{s.weekValues[3].toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                {/* 4-week bars */}
                <div className="shrink-0">
                  <WeekBars weekValues={s.weekValues} />
                </div>
                <ChevronRight size={13} className="text-gray-700 group-hover:text-gold shrink-0 transition-colors" />
              </button>
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
              <p className="text-xs uppercase tracking-widest font-black text-gray-500">
                Full Performance Overview
              </p>
            </div>
            <p className="text-[11px] text-gray-400">
              {stats.filter(s => s.services > 0).length} active staff
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  {['Staff', 'Services', 'Revenue', 'Avg / Service', 'Commission', 'Rev Share', ''].map(
                    h => (
                      <th
                        key={h}
                        className="py-2.5 px-4 text-left text-[11px] font-black uppercase tracking-widest text-gray-400"
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
                        onClick={() => setSelectedStaffId(s.id)}
                        className="border-b border-white/10 hover:bg-white/[0.04] transition-colors cursor-pointer group"
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
                                <p className="text-gray-400 text-[11px] mt-0.5">
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
                            <span className="text-xs text-gray-500 font-bold w-7 text-right">
                              {share}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <ChevronRight size={13} className="text-gray-700 group-hover:text-gold transition-colors" />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            <div className="px-5 py-2.5 border-t border-white/10 bg-white/[0.01] flex justify-between text-xs text-gray-400 font-bold">
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
            <p className="text-xs uppercase tracking-widest font-black text-gray-500 flex items-center gap-2">
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
                        <span className="text-gray-400 text-[11px]">
                          {totalCount} booking{totalCount !== 1 ? 's' : ''} total
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-xs text-gray-500">
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
                              <span className="text-gold text-xs font-bold w-24 text-right">
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


