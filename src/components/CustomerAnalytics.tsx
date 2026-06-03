/**
 * CustomerAnalytics.tsx
 * Customer Intelligence Dashboard
 * Props: customers — merged array from AdminDashboard (customers + bookings collections)
 * Each customer: { phone, name, visitCount, totalSpend, lastVisit, firstVisit?, source }
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Crown, Heart, Star, Flame, UserX, Users, Search, X,
  IndianRupee, Calendar, TrendingUp, Award, Filter,
  ChevronDown, ChevronUp, Clock, AlertCircle,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Customer {
  phone: string; name: string;
  visitCount: number; totalSpend: number;
  lastVisit?: string; firstVisit?: string;
  source?: string;
}

type Segment = 'all' | 'vip' | 'loyal' | 'new' | 'at_risk' | 'inactive';
type SortKey = 'spend' | 'visits' | 'recent';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(iso?: string): number {
  if (!iso) return 999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function monthsSince(iso?: string): number {
  if (!iso) return 0;
  const d = new Date(iso);
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

function loyaltyScore(c: Customer): number {
  const tenure = monthsSince(c.firstVisit || c.lastVisit);
  return Math.min(100, Math.round(c.visitCount * 2 + c.totalSpend / 500 + tenure * 0.5));
}

function loyaltyTier(score: number): { tier: string; color: string; bg: string; border: string } {
  if (score >= 70) return { tier: 'Gold',   color: 'text-gold',        bg: 'bg-gold/10',        border: 'border-gold/30'        };
  if (score >= 40) return { tier: 'Silver', color: 'text-gray-300',    bg: 'bg-white/8',        border: 'border-white/20'       };
  if (score >= 20) return { tier: 'Bronze', color: 'text-amber-600',   bg: 'bg-amber-900/20',   border: 'border-amber-700/30'   };
  return             { tier: 'New',    color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20'    };
}

function classifySegment(c: Customer): Segment {
  if (c.totalSpend >= 5000 || c.visitCount >= 10) return 'vip';
  if (daysSince(c.lastVisit) > 60) return 'inactive';
  if (daysSince(c.lastVisit) > 30 && c.visitCount >= 3) return 'at_risk';
  if (c.visitCount <= 1) return 'new';
  if (c.visitCount >= 5) return 'loyal';
  return 'all';
}

const SEG_META: Record<Segment, { label: string; icon: any; cls: string }> = {
  all:      { label: 'All',      icon: Users,     cls: 'bg-white/5  border-white/10  text-gray-400'  },
  vip:      { label: 'VIP',      icon: Crown,     cls: 'bg-gold/10  border-gold/20   text-gold'      },
  loyal:    { label: 'Loyal',    icon: Heart,     cls: 'bg-pink-500/10 border-pink-500/20 text-pink-400' },
  new:      { label: 'New',      icon: Star,      cls: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
  at_risk:  { label: 'At-Risk',  icon: AlertCircle, cls: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
  inactive: { label: 'Inactive', icon: UserX,     cls: 'bg-red-500/10 border-red-500/20 text-red-400'  },
};

// ─── Main Component ────────────────────────────────────────────────────────────

interface Props { customers: any[]; }

export default function CustomerAnalytics({ customers: rawCustomers }: Props) {
  const [search,    setSearch]    = useState('');
  const [segment,   setSegment]   = useState<Segment>('all');
  const [sortBy,    setSortBy]    = useState<SortKey>('spend');
  const [openCust,  setOpenCust]  = useState<string | null>(null);
  const [visitTab,  setVisitTab]  = useState<'active' | 'inactive'>('active');

  const customers: Customer[] = rawCustomers;

  // ── Segment counts ──────────────────────────────────────────────────────────
  const segCounts = useMemo(() => {
    const counts: Record<Segment, number> = { all: customers.length, vip: 0, loyal: 0, new: 0, at_risk: 0, inactive: 0 };
    customers.forEach(c => { const s = classifySegment(c); if (s !== 'all') counts[s]++; });
    return counts;
  }, [customers]);

  // ── KPI summary ─────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const newThisMonth  = customers.filter(c => c.firstVisit && new Date(c.firstVisit) >= monthStart).length;
    const newLastMonth  = customers.filter(c => c.firstVisit && new Date(c.firstVisit) >= prevMonthStart && new Date(c.firstVisit) < monthStart).length;
    const repeatRate    = customers.length > 0 ? Math.round(customers.filter(c => c.visitCount >= 2).length / customers.length * 100) : 0;
    const vipCount      = segCounts.vip;
    const inactiveCount = segCounts.inactive + segCounts.at_risk;
    const totalRevenue  = customers.reduce((a, c) => a + (c.totalSpend ?? 0), 0);
    const avgSpend      = customers.length > 0 ? Math.round(totalRevenue / customers.length) : 0;
    const growth        = newLastMonth > 0 ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100) : newThisMonth > 0 ? 100 : 0;

    return { newThisMonth, repeatRate, vipCount, inactiveCount, avgSpend, growth, totalRevenue };
  }, [customers, segCounts]);

  // ── Filtered + sorted list ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = customers.filter(c => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!c.name?.toLowerCase().includes(q) && !c.phone?.includes(q)) return false;
      }
      if (segment !== 'all' && classifySegment(c) !== segment) return false;
      return true;
    });
    if (sortBy === 'spend')  list = [...list].sort((a, b) => (b.totalSpend ?? 0) - (a.totalSpend ?? 0));
    if (sortBy === 'visits') list = [...list].sort((a, b) => (b.visitCount ?? 0) - (a.visitCount ?? 0));
    if (sortBy === 'recent') list = [...list].sort((a, b) => new Date(b.lastVisit ?? 0).getTime() - new Date(a.lastVisit ?? 0).getTime());
    return list;
  }, [customers, search, segment, sortBy]);

  const maxSpend = customers[0] ? Math.max(...customers.map(c => c.totalSpend ?? 0), 1) : 1;

  // ── Source breakdown ─────────────────────────────────────────────────────────
  const sourceBreak = useMemo(() => {
    const online = customers.filter(c => c.source === 'online').length;
    const walkin = customers.filter(c => c.source === 'walkin').length;
    const both   = customers.filter(c => c.source === 'both').length;
    const total  = customers.length || 1;
    return [
      { label: '🌐 Online',  count: online, pct: Math.round(online/total*100), color: 'bg-blue-500/60'   },
      { label: '🏪 Walk-in', count: walkin, pct: Math.round(walkin/total*100), color: 'bg-purple-500/60' },
      { label: '⭐ Both',    count: both,   pct: Math.round(both/total*100),   color: 'bg-gold/60'       },
    ];
  }, [customers]);

  // ── Visit analytics ──────────────────────────────────────────────────────────
  const activeList   = useMemo(() => customers.filter(c => daysSince(c.lastVisit) <= 30).sort((a,b) => new Date(b.lastVisit??0).getTime()-new Date(a.lastVisit??0).getTime()), [customers]);
  const inactiveList = useMemo(() => customers.filter(c => daysSince(c.lastVisit) > 30).sort((a,b) => daysSince(b.lastVisit) - daysSince(a.lastVisit)), [customers]);

  const MEDALS = ['🥇','🥈','🥉'];

  return (
    <div className="space-y-6">

      {/* ── Header + search ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-white font-black text-lg uppercase tracking-tight flex items-center gap-2">
            <Users size={18} className="text-blue-400"/> Customer Intelligence
          </h2>
          <p className="text-gray-500 text-xs mt-0.5">{customers.length} customers · {kpi.newThisMonth} new this month</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"/>
          <input type="text" placeholder="Search name or phone…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-white/10 rounded-xl py-2 pl-9 pr-8 text-white text-xs focus:outline-none focus:border-gold/40 transition-all placeholder:text-gray-700"/>
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white"><X size={12}/></button>}
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Customers', value: customers.length.toString(),             color: 'text-white',       icon: Users      },
          { label: 'New This Month',  value: `${kpi.newThisMonth}${kpi.growth !== 0 ? ` (${kpi.growth > 0 ? '+' : ''}${kpi.growth}%)` : ''}`, color: 'text-blue-400', icon: Star },
          { label: 'Repeat Rate',     value: `${kpi.repeatRate}%`,                   color: 'text-emerald-400', icon: TrendingUp  },
          { label: 'VIP Customers',   value: kpi.vipCount.toString(),                 color: 'text-gold',        icon: Crown      },
          { label: 'At-Risk/Inactive',value: kpi.inactiveCount.toString(),            color: 'text-red-400',     icon: AlertCircle},
          { label: 'Avg Spend',       value: `₹${kpi.avgSpend.toLocaleString('en-IN')}`, color: 'text-purple-400', icon: IndianRupee},
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-zinc-900 border border-white/8 rounded-2xl p-3 text-center">
            <Icon size={16} className={`${color} mx-auto mb-1.5`}/>
            <p className={`font-black text-lg leading-none ${color}`}>{value}</p>
            <p className="text-[8px] text-gray-600 uppercase tracking-wider mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Segment filter pills ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter size={12} className="text-gray-600"/>
        {(Object.keys(SEG_META) as Segment[]).map(seg => {
          const { label, icon: Icon, cls } = SEG_META[seg];
          const active = segment === seg;
          return (
            <button key={seg} onClick={() => setSegment(seg)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all ${
                active ? cls : 'bg-white/3 border-white/8 text-gray-600 hover:text-white hover:border-white/15'
              }`}>
              <Icon size={10}/> {label}
              <span className={`ml-0.5 text-[9px] ${active ? 'opacity-80' : 'text-gray-700'}`}>
                {seg === 'all' ? customers.length : segCounts[seg]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Source breakdown ── */}
      <div className="bg-zinc-900 border border-white/8 rounded-2xl p-5 space-y-3">
        <p className="text-[10px] uppercase tracking-widest font-black text-gray-500">Customer Sources</p>
        {sourceBreak.filter(s => s.count > 0).map(s => (
          <div key={s.label} className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400 font-bold w-20 shrink-0">{s.label}</span>
            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${s.pct}%` }} transition={{ duration: 0.7, ease: 'easeOut' }}
                className={`h-full rounded-full ${s.color}`}/>
            </div>
            <span className="text-white text-xs font-black w-6 text-right shrink-0">{s.count}</span>
            <span className="text-gray-600 text-[10px] w-7 text-right shrink-0">{s.pct}%</span>
          </div>
        ))}
      </div>

      {/* ── Best Customers + Most Loyal (side by side) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Best by spend */}
        <div className="bg-zinc-900 border border-white/8 rounded-2xl p-5 space-y-3">
          <p className="text-[10px] uppercase tracking-widest font-black text-gray-500 flex items-center gap-2">
            <Crown size={12} className="text-gold"/> Best Customers
          </p>
          {[...customers].sort((a,b) => (b.totalSpend??0)-(a.totalSpend??0)).slice(0,8).filter(c => c.totalSpend > 0).map((c, i) => (
            <div key={c.phone} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm shrink-0">{MEDALS[i] ?? <span className="text-[10px] text-gray-600 w-4">{i+1}.</span>}</span>
                  <div className="min-w-0">
                    <p className="text-white text-xs font-bold truncate">{c.name}</p>
                    <p className="text-gray-600 text-[9px]">{c.visitCount} visits</p>
                  </div>
                </div>
                <span className="text-gold font-black text-sm shrink-0">₹{(c.totalSpend??0).toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
              </div>
              <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gold/50 rounded-full" style={{ width: `${Math.max(4,((c.totalSpend??0)/maxSpend)*100)}%` }}/>
              </div>
            </div>
          ))}
        </div>

        {/* Most loyal by visits */}
        <div className="bg-zinc-900 border border-white/8 rounded-2xl p-5 space-y-3">
          <p className="text-[10px] uppercase tracking-widest font-black text-gray-500 flex items-center gap-2">
            <Heart size={12} className="text-pink-400"/> Most Loyal
          </p>
          {[...customers].sort((a,b) => (b.visitCount??0)-(a.visitCount??0)).slice(0,8).filter(c => c.visitCount > 0).map((c, i) => {
            const maxV = customers[0] ? Math.max(...customers.map(x => x.visitCount??0), 1) : 1;
            return (
              <div key={c.phone} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0">{MEDALS[i] ?? <span className="text-[10px] text-gray-600">{i+1}.</span>}</span>
                    <div className="min-w-0">
                      <p className="text-white text-xs font-bold truncate">{c.name}</p>
                      {c.firstVisit && <p className="text-gray-600 text-[9px]">Since {new Date(c.firstVisit).toLocaleDateString('en-IN',{month:'short',year:'numeric'})}</p>}
                    </div>
                  </div>
                  <span className="text-pink-400 font-black text-sm shrink-0">{c.visitCount} visits</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-pink-500/50 rounded-full" style={{ width: `${Math.max(4,((c.visitCount??0)/maxV)*100)}%` }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Loyalty Tiers ── */}
      {customers.length > 0 && (
        <div className="bg-zinc-900 border border-white/8 rounded-2xl p-5">
          <p className="text-[10px] uppercase tracking-widest font-black text-gray-500 mb-4">Loyalty Tiers</p>
          {(['Gold','Silver','Bronze','New'] as const).map(tier => {
            const list = customers.filter(c => loyaltyTier(loyaltyScore(c)).tier === tier);
            if (!list.length) return null;
            const meta = loyaltyTier(tier === 'Gold' ? 70 : tier === 'Silver' ? 40 : tier === 'Bronze' ? 20 : 0);
            return (
              <div key={tier} className="mb-3 last:mb-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-black uppercase tracking-wider ${meta.color}`}>{tier}</span>
                  <span className="text-gray-500 text-[10px]">{list.length} customers</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.slice(0, 8).map(c => {
                    const score = loyaltyScore(c);
                    return (
                      <div key={c.phone} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border ${meta.bg} ${meta.border}`}>
                        <span className={`text-[10px] font-bold ${meta.color}`}>{c.name.split(' ')[0]}</span>
                        <span className={`text-[9px] ${meta.color} opacity-60`}>{score}</span>
                      </div>
                    );
                  })}
                  {list.length > 8 && <span className="text-gray-600 text-[10px] self-center">+{list.length-8} more</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Visit Analytics ── */}
      <div className="bg-zinc-900 border border-white/8 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-1 px-5 pt-4 pb-0">
          {(['active','inactive'] as const).map(tab => (
            <button key={tab} onClick={() => setVisitTab(tab)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                visitTab === tab
                  ? tab === 'active' ? 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400'
                                     : 'bg-red-500/15 border border-red-500/25 text-red-400'
                  : 'text-gray-500 hover:text-white'
              }`}>
              {tab === 'active' ? `✓ Active (≤30d)` : `⚠ Inactive (>30d)`}
              <span className="ml-1.5 text-[9px] opacity-70">
                {tab === 'active' ? activeList.length : inactiveList.length}
              </span>
            </button>
          ))}
        </div>
        <div className="p-5 space-y-2 max-h-72 overflow-y-auto scrollbar-hide">
          {(visitTab === 'active' ? activeList : inactiveList).slice(0,20).map(c => {
            const days = daysSince(c.lastVisit);
            return (
              <div key={c.phone} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 font-black text-xs shrink-0">
                  {c.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-bold truncate">{c.name}</p>
                  <p className="text-gray-600 text-[9px]">{c.phone} · {c.visitCount} visits</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-[10px] font-black ${days <= 7 ? 'text-emerald-400' : days <= 30 ? 'text-blue-400' : days <= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                    {days === 0 ? 'Today' : `${days}d ago`}
                  </p>
                  <p className="text-gray-600 text-[9px]">₹{(c.totalSpend??0).toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
                </div>
              </div>
            );
          })}
          {(visitTab === 'active' ? activeList : inactiveList).length === 0 && (
            <p className="text-gray-600 text-sm text-center py-8">
              {visitTab === 'active' ? 'No customers visited in the last 30 days' : 'All customers are active!'}
            </p>
          )}
        </div>
      </div>

      {/* ── Full customer list (filtered) ── */}
      <div className="bg-zinc-900 border border-white/8 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between flex-wrap gap-2">
          <p className="text-[10px] uppercase tracking-widest font-black text-gray-500">
            {filtered.length} customer{filtered.length !== 1 ? 's' : ''} {search || segment !== 'all' ? '(filtered)' : ''}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-gray-600 font-bold uppercase">Sort:</span>
            {([['spend','Spend'],['visits','Visits'],['recent','Recent']] as [SortKey,string][]).map(([k,l]) => (
              <button key={k} onClick={() => setSortBy(k)}
                className={`px-2 py-0.5 rounded text-[9px] font-black uppercase transition-all ${sortBy === k ? 'text-gold bg-gold/10' : 'text-gray-600 hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-hide">
          {filtered.slice(0, 50).map(c => {
            const score  = loyaltyScore(c);
            const tier   = loyaltyTier(score);
            const seg    = classifySegment(c);
            const segM   = SEG_META[seg === 'all' ? 'new' : seg];
            const isOpen = openCust === c.phone;
            return (
              <div key={c.phone} className="border-b border-white/5 last:border-0">
                <button onClick={() => setOpenCust(isOpen ? null : c.phone)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-all text-left">
                  <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center font-black text-gray-400 text-sm shrink-0">
                    {c.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white text-sm font-bold">{c.name}</p>
                      {seg !== 'all' && (
                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${segM.cls}`}>
                          {segM.label}
                        </span>
                      )}
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${tier.bg} ${tier.border} ${tier.color}`}>
                        {tier.tier}
                      </span>
                    </div>
                    <p className="text-gray-600 text-[10px]">{c.phone}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-gold font-black text-sm">₹{(c.totalSpend??0).toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
                    <p className="text-gray-600 text-[9px]">{c.visitCount} visits</p>
                  </div>
                  {isOpen ? <ChevronUp size={13} className="text-gray-600 shrink-0"/> : <ChevronDown size={13} className="text-gray-600 shrink-0"/>}
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-5 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Total Spend',   value: `₹${(c.totalSpend??0).toLocaleString('en-IN',{maximumFractionDigits:0})}`, color: 'text-gold'       },
                          { label: 'Visits',        value: c.visitCount?.toString() ?? '0',                                             color: 'text-white'      },
                          { label: 'Loyalty Score', value: `${score}/100`,                                                              color: tier.color        },
                          { label: 'Last Visit',    value: c.lastVisit ? `${daysSince(c.lastVisit)}d ago` : '—',                        color: 'text-gray-400'   },
                          { label: 'Avg/Visit',     value: c.visitCount > 0 ? `₹${Math.round((c.totalSpend??0)/c.visitCount).toLocaleString('en-IN')}` : '—', color: 'text-emerald-400' },
                          { label: 'Source',        value: c.source ?? '—',                                                             color: 'text-blue-400'   },
                          { label: 'First Visit',   value: c.firstVisit ? new Date(c.firstVisit).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—', color: 'text-gray-400' },
                          { label: 'Status',        value: seg === 'all' ? 'Regular' : SEG_META[seg].label,                             color: segM.cls.split(' ')[2] },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="bg-white/[0.03] rounded-xl p-2.5">
                            <p className="text-[8px] uppercase tracking-wider text-gray-600 mb-0.5">{label}</p>
                            <p className={`text-xs font-black ${color}`}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-sm">No customers match the current filter.</div>
          )}
        </div>
        {filtered.length > 50 && (
          <div className="px-5 py-2.5 border-t border-white/5 text-[10px] text-gray-600 font-bold uppercase tracking-widest text-center">
            Showing top 50 of {filtered.length} — refine search to see more
          </div>
        )}
      </div>
    </div>
  );
}
