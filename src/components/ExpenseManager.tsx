import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, X, Trash2, ChevronLeft, ChevronRight, IndianRupee,
  TrendingUp, TrendingDown, Loader2, AlertCircle, CheckCircle2,
  Users, Package, Zap, Building2, Wrench, Coffee, Megaphone,
  ShoppingBag, Hammer, MoreHorizontal, Banknote, Smartphone,
  CreditCard, ArrowLeftRight, Calendar, ReceiptText, Filter,
} from 'lucide-react';
import {
  collection, query, where, getDocs, addDoc, deleteDoc,
  doc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format, startOfMonth, addMonths, subMonths, parseISO } from 'date-fns';

// ─── Types ─────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'salary',      label: 'Salary / Wages',  Icon: Users,          color: 'text-purple-400', bg: 'bg-purple-500/12 border-purple-500/20', dot: 'bg-purple-400' },
  { id: 'supplies',    label: 'Supplies',         Icon: Package,        color: 'text-blue-400',   bg: 'bg-blue-500/12 border-blue-500/20',     dot: 'bg-blue-400'   },
  { id: 'utilities',   label: 'Utilities',        Icon: Zap,            color: 'text-yellow-400', bg: 'bg-yellow-500/12 border-yellow-500/20', dot: 'bg-yellow-400' },
  { id: 'rent',        label: 'Rent',             Icon: Building2,      color: 'text-orange-400', bg: 'bg-orange-500/12 border-orange-500/20', dot: 'bg-orange-400' },
  { id: 'maintenance', label: 'Maintenance',      Icon: Wrench,         color: 'text-amber-400',  bg: 'bg-amber-500/12 border-amber-500/20',   dot: 'bg-amber-400'  },
  { id: 'food',        label: 'Food & Snacks',    Icon: Coffee,         color: 'text-green-400',  bg: 'bg-green-500/12 border-green-500/20',   dot: 'bg-green-400'  },
  { id: 'marketing',   label: 'Marketing',        Icon: Megaphone,      color: 'text-pink-400',   bg: 'bg-pink-500/12 border-pink-500/20',     dot: 'bg-pink-400'   },
  { id: 'equipment',   label: 'Equipment',        Icon: ShoppingBag,    color: 'text-cyan-400',   bg: 'bg-cyan-500/12 border-cyan-500/20',     dot: 'bg-cyan-400'   },
  { id: 'renovation',  label: 'Renovation',       Icon: Hammer,         color: 'text-red-400',    bg: 'bg-red-500/12 border-red-500/20',       dot: 'bg-red-400'    },
  { id: 'misc',        label: 'Miscellaneous',    Icon: MoreHorizontal, color: 'text-gray-400',   bg: 'bg-gray-500/12 border-gray-500/20',     dot: 'bg-gray-400'   },
] as const;

type CategoryId = typeof CATEGORIES[number]['id'];

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash',         Icon: Banknote       },
  { id: 'upi',  label: 'UPI / GPay',   Icon: Smartphone     },
  { id: 'bank', label: 'Bank Transfer',Icon: ArrowLeftRight },
  { id: 'card', label: 'Card',         Icon: CreditCard     },
] as const;

interface Expense {
  id: string;
  yearMonth: string;
  date: string;
  category: CategoryId;
  description: string;
  amount: number;
  paymentMethod: string;
  paidTo: string;
  notes: string;
  createdAt: any;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getCat(id: string) {
  return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

function fmt(n: number) {
  return n.toLocaleString('en-IN');
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ExpenseManager() {
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
  const [expenses,      setExpenses]      = useState<Expense[]>([]);
  const [revenue,       setRevenue]       = useState<number | null>(null);
  const [revenueCount,  setRevenueCount]  = useState(0);
  const [loading,       setLoading]       = useState(false);
  const [showForm,      setShowForm]      = useState(false);
  const [filterCat,     setFilterCat]     = useState<CategoryId | 'all'>('all');
  const [deletingId,    setDeletingId]    = useState<string | null>(null);

  // Form state
  const blankForm = () => ({
    date:     format(new Date(), 'yyyy-MM-dd'),
    category: 'misc' as CategoryId,
    description: '',
    amount:   '',
    payment:  'cash',
    paidTo:   '',
    notes:    '',
  });
  const [form,      setForm]      = useState(blankForm);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedMsg,  setSavedMsg]  = useState('');

  // ── Data loading ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const yearMonth = format(selectedMonth, 'yyyy-MM');
    setLoading(true);

    // Expenses for this month
    getDocs(query(collection(db, 'expenses'), where('yearMonth', '==', yearMonth)))
      .then(snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
        list.sort((a, b) => b.date.localeCompare(a.date));
        setExpenses(list);
      })
      .catch(() => setExpenses([]))
      .finally(() => setLoading(false));

    // Revenue from invoices this month (best-effort — may fail if index not ready)
    const monthStart = Timestamp.fromDate(startOfMonth(selectedMonth));
    const monthEnd   = Timestamp.fromDate(startOfMonth(addMonths(selectedMonth, 1)));
    getDocs(query(
      collection(db, 'invoices'),
      where('createdAt', '>=', monthStart),
      where('createdAt', '<', monthEnd),
    ))
      .then(snap => {
        const total = snap.docs.reduce((a, d) => {
          const inv = d.data() as any;
          return a + (inv.amountPaid ?? inv.total ?? 0);
        }, 0);
        setRevenue(Math.round(total));
        setRevenueCount(snap.docs.length);
      })
      .catch(() => { setRevenue(null); setRevenueCount(0); });
  }, [selectedMonth]);

  // ── Derived stats ─────────────────────────────────────────────────────────────

  const totalExpenses = useMemo(() => expenses.reduce((a, e) => a + e.amount, 0), [expenses]);

  const catTotals = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach(e => { map[e.category] = (map[e.category] ?? 0) + e.amount; });
    return CATEGORIES
      .map(c => ({ ...c, total: map[c.id] ?? 0 }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const grouped = useMemo(() => {
    const filtered = filterCat === 'all' ? expenses : expenses.filter(e => e.category === filterCat);
    const map: Record<string, Expense[]> = {};
    filtered.forEach(e => { (map[e.date] ??= []).push(e); });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [expenses, filterCat]);

  // ── Add expense ───────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.description.trim()) { setSaveError('Please enter a description.'); return; }
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { setSaveError('Please enter a valid amount.'); return; }

    setSaving(true); setSaveError('');
    try {
      const payload = {
        yearMonth:     format(parseISO(form.date), 'yyyy-MM'),
        date:          form.date,
        category:      form.category,
        description:   form.description.trim(),
        amount:        amt,
        paymentMethod: form.payment,
        paidTo:        form.paidTo.trim(),
        notes:         form.notes.trim(),
        createdAt:     serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'expenses'), payload);
      const newExp: Expense = { id: ref.id, ...payload, createdAt: new Date() };

      // Only show in list if it belongs to selected month
      if (payload.yearMonth === format(selectedMonth, 'yyyy-MM')) {
        setExpenses(prev => [newExp, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      }

      setSavedMsg(`₹${fmt(amt)} expense added!`);
      setTimeout(() => setSavedMsg(''), 2500);
      setForm(blankForm());
      setShowForm(false);
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'expenses', id));
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch { /* silent */ }
    finally { setDeletingId(null); }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const netProfit    = revenue !== null ? revenue - totalExpenses : null;
  const expRatio     = revenue && revenue > 0 ? Math.min(100, Math.round((totalExpenses / revenue) * 100)) : 0;
  const isProfit     = netProfit !== null && netProfit >= 0;
  const monthLabel   = format(selectedMonth, 'MMMM yyyy');

  return (
    <div className="space-y-5 pb-8">

      {/* ── Month navigation ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedMonth(m => subMonths(m, 1))}
            className="w-8 h-8 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/12 transition-all"
          >
            <ChevronLeft size={15} />
          </button>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gold" />
            <span className="text-white font-black text-sm">{monthLabel}</span>
          </div>
          <button
            onClick={() => setSelectedMonth(m => addMonths(m, 1))}
            disabled={format(addMonths(selectedMonth, 1), 'yyyy-MM') > format(new Date(), 'yyyy-MM')}
            className="w-8 h-8 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/12 transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <button
          onClick={() => { setShowForm(v => !v); setSaveError(''); setForm(blankForm()); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-all ${
            showForm
              ? 'bg-gold/15 border-gold/30 text-gold'
              : 'bg-white/8 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
          }`}
        >
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? 'Cancel' : 'Add Expense'}
        </button>
      </div>

      {/* ── P&L Overview Card ── */}
      <div className="rounded-2xl bg-zinc-900 border border-white/10 overflow-hidden">
        {/* Top 3-col summary */}
        <div className="grid grid-cols-3 divide-x divide-white/8">
          {/* Revenue */}
          <div className="p-4 space-y-1">
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
              <TrendingUp size={9} /> Revenue
            </p>
            {revenue === null ? (
              <p className="text-gray-600 text-xs">—</p>
            ) : (
              <p className="text-emerald-400 font-black text-lg leading-none">₹{fmt(revenue)}</p>
            )}
            <p className="text-[11px] text-gray-600">{revenueCount} invoice{revenueCount !== 1 ? 's' : ''}</p>
          </div>

          {/* Expenses */}
          <div className="p-4 space-y-1">
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
              <TrendingDown size={9} /> Expenses
            </p>
            <p className="text-red-400 font-black text-lg leading-none">₹{fmt(totalExpenses)}</p>
            <p className="text-[11px] text-gray-600">{expenses.length} entr{expenses.length !== 1 ? 'ies' : 'y'}</p>
          </div>

          {/* Net */}
          <div className="p-4 space-y-1">
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
              <IndianRupee size={9} /> Net Profit
            </p>
            {netProfit === null ? (
              <p className="text-gray-600 text-xs">Revenue unavailable</p>
            ) : (
              <>
                <p className={`font-black text-lg leading-none ${isProfit ? 'text-gold' : 'text-red-400'}`}>
                  {isProfit ? '+' : ''}₹{fmt(Math.abs(netProfit))}
                </p>
                <p className={`text-[11px] font-bold ${isProfit ? 'text-emerald-500' : 'text-red-500'}`}>
                  {isProfit ? `${100 - expRatio}% margin` : `${expRatio}% over revenue`}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Expense vs Revenue bar */}
        {revenue !== null && revenue > 0 && (
          <div className="px-4 pb-4 pt-2 space-y-2">
            <div className="flex justify-between text-[11px] text-gray-500">
              <span>Expenses {expRatio}% of revenue</span>
              <span className={isProfit ? 'text-emerald-500' : 'text-red-500'}>
                {isProfit ? 'Profitable' : 'Loss'}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/8 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, expRatio)}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className={`h-full rounded-full ${expRatio > 80 ? 'bg-red-500' : expRatio > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              />
            </div>
          </div>
        )}

        {/* Category breakdown */}
        {catTotals.length > 0 && (
          <div className="border-t border-white/8 px-4 py-3 space-y-2">
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">Breakdown by Category</p>
            <div className="space-y-2">
              {catTotals.map(c => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 w-28 shrink-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                    <span className="text-xs text-gray-400 truncate">{c.label}</span>
                  </div>
                  <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: totalExpenses > 0 ? `${Math.round((c.total / totalExpenses) * 100)}%` : '0%' }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className={`h-full rounded-full ${c.dot}`}
                    />
                  </div>
                  <span className="text-xs font-black text-gray-300 w-20 text-right shrink-0">
                    ₹{fmt(c.total)}
                  </span>
                  <span className="text-[11px] text-gray-600 w-8 text-right shrink-0">
                    {totalExpenses > 0 ? Math.round((c.total / totalExpenses) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Saved confirmation ── */}
      <AnimatePresence>
        {savedMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm font-bold"
          >
            <CheckCircle2 size={15} /> {savedMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add Expense Form ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-zinc-900 border border-gold/20 rounded-2xl p-5 space-y-4">
              <p className="text-xs font-black uppercase tracking-widest text-gold flex items-center gap-1.5">
                <ReceiptText size={11} /> New Expense
              </p>

              {/* Date + Amount row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-500">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-500">Amount (₹)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold pointer-events-none">₹</span>
                    <input
                      type="number" min={1} placeholder="0"
                      value={form.amount}
                      onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                      className="w-full bg-zinc-800 border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Category tiles */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-gray-500">Category</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setForm(p => ({ ...p, category: c.id }))}
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-[11px] font-bold transition-all ${
                        form.category === c.id
                          ? `${c.bg} ${c.color} border-current`
                          : 'bg-white/[0.04] border-white/8 text-gray-500 hover:text-gray-300 hover:border-white/15'
                      }`}
                    >
                      <c.Icon size={13} />
                      <span className="text-center leading-tight">{c.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-gray-500">Description *</label>
                <input
                  type="text" placeholder="e.g. Wella Color Products, Electricity Bill, Rahul Salary…"
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50 placeholder:text-gray-600 transition-all"
                />
              </div>

              {/* Paid To + Payment Method */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-500">Paid To (optional)</label>
                  <input
                    type="text" placeholder="Person or vendor name"
                    value={form.paidTo}
                    onChange={e => setForm(p => ({ ...p, paidTo: e.target.value }))}
                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50 placeholder:text-gray-600 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-500">Payment Method</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PAYMENT_METHODS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setForm(p => ({ ...p, payment: m.id }))}
                        className={`flex items-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-bold transition-all ${
                          form.payment === m.id
                            ? 'bg-gold/15 border-gold/35 text-gold'
                            : 'bg-white/[0.04] border-white/8 text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        <m.Icon size={11} /> {m.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-gray-500">Notes (optional)</label>
                <input
                  type="text" placeholder="Any extra detail…"
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50 placeholder:text-gray-600 transition-all"
                />
              </div>

              {saveError && (
                <p className="flex items-center gap-1.5 text-red-400 text-xs font-bold">
                  <AlertCircle size={12} /> {saveError}
                </p>
              )}

              <div className="flex gap-2 pt-1 border-t border-white/10">
                <button
                  onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#F0D060] rounded-xl text-black text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  Save Expense
                </button>
                <button
                  onClick={() => { setShowForm(false); setSaveError(''); }}
                  className="px-4 py-2.5 rounded-xl text-gray-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Expense List ── */}
      <div className="space-y-3">
        {/* Filter chips */}
        {expenses.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
            <Filter size={11} className="text-gray-600 shrink-0" />
            <button
              onClick={() => setFilterCat('all')}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                filterCat === 'all' ? 'bg-gold text-black' : 'bg-white/[0.06] text-gray-400 hover:text-white'
              }`}
            >
              All ({expenses.length})
            </button>
            {catTotals.map(c => (
              <button
                key={c.id}
                onClick={() => setFilterCat(filterCat === c.id ? 'all' : c.id)}
                className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                  filterCat === c.id
                    ? `${c.bg} ${c.color} border-current`
                    : 'bg-white/[0.04] border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <c.Icon size={10} /> {c.label.split(' ')[0]}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
            <Loader2 size={16} className="animate-spin text-gold" /> Loading…
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-14 space-y-2">
            <ReceiptText size={32} className="text-gray-700 mx-auto" />
            <p className="text-gray-500 text-sm font-bold">No expenses recorded</p>
            <p className="text-gray-600 text-xs">
              {filterCat !== 'all' ? 'Try clearing the filter' : `Tap "Add Expense" to log your first entry for ${monthLabel}`}
            </p>
          </div>
        ) : (
          grouped.map(([date, dayExpenses]) => (
            <div key={date} className="space-y-1.5">
              {/* Date header */}
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-600 px-1">
                {format(parseISO(date), 'EEE, d MMM yyyy')}
                <span className="ml-2 text-gray-700">
                  ₹{fmt(dayExpenses.reduce((a, e) => a + e.amount, 0))}
                </span>
              </p>

              {/* Expense rows */}
              {dayExpenses.map(exp => {
                const cat = getCat(exp.category);
                const pm  = PAYMENT_METHODS.find(m => m.id === exp.paymentMethod);
                return (
                  <motion.div
                    key={exp.id}
                    layout
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 border border-white/8 hover:border-white/12 transition-all group"
                  >
                    {/* Category icon */}
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${cat.bg} ${cat.color}`}>
                      <cat.Icon size={15} />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-bold truncate">{exp.description}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {exp.paidTo && (
                          <span className="text-xs text-gray-500">→ {exp.paidTo}</span>
                        )}
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full border ${cat.bg} ${cat.color}`}>
                          {cat.label}
                        </span>
                        {pm && (
                          <span className="flex items-center gap-0.5 text-[11px] text-gray-600">
                            <pm.Icon size={9} /> {pm.label.split(' ')[0]}
                          </span>
                        )}
                        {exp.notes && (
                          <span className="text-[11px] text-gray-600 truncate max-w-[120px]">{exp.notes}</span>
                        )}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right shrink-0">
                      <p className="text-red-400 font-black text-sm">−₹{fmt(exp.amount)}</p>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(exp.id)}
                      disabled={deletingId === exp.id}
                      className="w-7 h-7 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shrink-0"
                    >
                      {deletingId === exp.id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Trash2 size={12} />
                      }
                    </button>
                  </motion.div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
