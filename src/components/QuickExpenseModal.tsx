import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, IndianRupee, Loader2, CheckCircle2, AlertCircle,
  Users, Package, Zap, Building2, Wrench, Coffee, Megaphone,
  ShoppingBag, Hammer, MoreHorizontal, Banknote, Smartphone,
  CreditCard, ArrowLeftRight, Calendar, MapPin
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { db } from '../lib/firebase';
import { BRANCHES, BranchName, DEFAULT_BRANCH_NAME } from '../lib/branches';

export const EXPENSE_CATEGORIES = [
  { id: 'supplies',    label: 'Supplies',         Icon: Package,        color: 'text-blue-400',   bg: 'bg-blue-500/12 border-blue-500/20' },
  { id: 'utilities',   label: 'Utilities',        Icon: Zap,            color: 'text-yellow-400', bg: 'bg-yellow-500/12 border-yellow-500/20' },
  { id: 'food',        label: 'Food & Snacks',    Icon: Coffee,         color: 'text-green-400',  bg: 'bg-green-500/12 border-green-500/20' },
  { id: 'maintenance', label: 'Maintenance',      Icon: Wrench,         color: 'text-amber-400',  bg: 'bg-amber-500/12 border-amber-500/20' },
  { id: 'salary',      label: 'Salary / Wages',  Icon: Users,          color: 'text-purple-400', bg: 'bg-purple-500/12 border-purple-500/20' },
  { id: 'rent',        label: 'Rent',             Icon: Building2,      color: 'text-orange-400', bg: 'bg-orange-500/12 border-orange-500/20' },
  { id: 'equipment',   label: 'Equipment',        Icon: ShoppingBag,    color: 'text-cyan-400',   bg: 'bg-cyan-500/12 border-cyan-500/20' },
  { id: 'marketing',   label: 'Marketing',        Icon: Megaphone,      color: 'text-pink-400',   bg: 'bg-pink-500/12 border-pink-500/20' },
  { id: 'renovation',  label: 'Renovation',       Icon: Hammer,         color: 'text-red-400',    bg: 'bg-red-500/12 border-red-500/20' },
  { id: 'misc',        label: 'Miscellaneous',    Icon: MoreHorizontal, color: 'text-gray-400',   bg: 'bg-gray-500/12 border-gray-500/20' },
] as const;

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash',          Icon: Banknote       },
  { id: 'upi',  label: 'UPI / GPay',    Icon: Smartphone     },
  { id: 'bank', label: 'Bank Transfer', Icon: ArrowLeftRight },
  { id: 'card', label: 'Card',          Icon: CreditCard     },
] as const;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultLocation?: string;
  onAdded?: (expense: any) => void;
}

export default function QuickExpenseModal({ isOpen, onClose, defaultLocation, onAdded }: Props) {
  const [amount, setAmount]           = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory]       = useState<string>('supplies');
  const [payment, setPayment]         = useState<string>('cash');
  const [paidTo, setPaidTo]           = useState('');
  const [notes, setNotes]             = useState('');
  const [date, setDate]               = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [location, setLocation]       = useState<BranchName>(() => {
    if (defaultLocation && (defaultLocation.toLowerCase().includes('chandani') || defaultLocation.toLowerCase().includes('chowk'))) {
      return 'Chandani Chowk';
    }
    return DEFAULT_BRANCH_NAME;
  });

  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Sync defaultLocation whenever modal opens and listen for Escape key
  useEffect(() => {
    if (isOpen) {
      if (defaultLocation && (defaultLocation.toLowerCase().includes('chandani') || defaultLocation.toLowerCase().includes('chowk'))) {
        setLocation('Chandani Chowk');
      } else {
        setLocation(DEFAULT_BRANCH_NAME);
      }
      setError('');
      setSuccessMsg('');

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, defaultLocation, onClose]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError('Please enter a valid amount (greater than ₹0).');
      return;
    }

    const catObj = EXPENSE_CATEGORIES.find(c => c.id === category);
    const finalDesc = description.trim() || `${catObj?.label || 'General'} Expense`;

    setSaving(true);
    setError('');

    try {
      const payload = {
        yearMonth:     format(parseISO(date), 'yyyy-MM'),
        date,
        category,
        description:   finalDesc,
        amount:        parsedAmount,
        paymentMethod: payment,
        paidTo:        paidTo.trim(),
        notes:         notes.trim(),
        location,
        createdAt:     serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'expenses'), payload);
      const created = { id: docRef.id, ...payload, createdAt: new Date() };

      setSuccessMsg(`₹${parsedAmount.toLocaleString('en-IN')} expense added successfully for ${location}!`);
      if (onAdded) onAdded(created);

      setTimeout(() => {
        setAmount('');
        setDescription('');
        setPaidTo('');
        setNotes('');
        setSuccessMsg('');
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to save expense. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            className="relative w-full max-w-lg bg-zinc-950 border border-white/15 rounded-3xl shadow-2xl overflow-hidden z-10 max-h-[92vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <IndianRupee size={18} />
                </div>
                <div>
                  <h2 className="text-white font-black text-base uppercase tracking-tight">Add Expense</h2>
                  <p className="text-gray-400 text-xs">Record daily salon expense to Tools → Expenses</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col scrollbar-hide">
              <div className="p-6 space-y-5 flex-1">
                {error && (
                  <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-bold animate-pulse">
                    <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {/* Branch Store Switcher */}
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-400 block mb-2 flex items-center gap-1.5">
                    <MapPin size={12} className="text-gold" /> Branch / Store Location <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {BRANCHES.map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setLocation(b.name as BranchName)}
                        className={`py-2.5 px-3 rounded-xl border text-left transition-all ${
                          location === b.name
                            ? 'bg-amber-500/15 border-amber-400 text-amber-300 font-black shadow-sm'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/8'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-black">
                          <span>{b.shortName}</span>
                          {location === b.name && <CheckCircle2 size={13} className="text-amber-400" />}
                        </div>
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">{b.address}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount (Hero Input) */}
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-400 block mb-2">
                    Amount (₹) <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-amber-400 select-none">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      autoFocus
                      placeholder="0"
                      value={amount}
                      onChange={e => { setAmount(e.target.value); setError(''); }}
                      className="w-full bg-white/5 border-2 border-white/15 focus:border-amber-400 rounded-2xl py-3 pl-12 pr-4 text-2xl font-black text-white focus:outline-none transition-all placeholder:text-gray-700"
                    />
                  </div>
                </div>

                {/* Category Selector */}
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-400 block mb-2">
                    Category <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {EXPENSE_CATEGORIES.map(cat => {
                      const Icon = cat.Icon;
                      const isSel = category === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCategory(cat.id)}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all text-left ${
                            isSel
                              ? `${cat.bg} ${cat.color} font-black ring-1 ring-white/20 shadow-sm`
                              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/8 hover:text-white'
                          }`}
                        >
                          <Icon size={14} className={isSel ? cat.color : 'text-gray-400'} />
                          <span className="truncate">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-400 block mb-2">
                    Description <span className="text-gray-500 font-normal">(optional — defaults to category)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Shampoo bottle stock, Snacks for guests, Electricity bill"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 focus:border-amber-400 rounded-xl py-2.5 px-3.5 text-sm text-white focus:outline-none transition-all placeholder:text-gray-600"
                  />
                </div>

                {/* Payment Method + Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-gray-400 block mb-2">
                      Payment Method
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {PAYMENT_METHODS.map(m => {
                        const Icon = m.Icon;
                        const isSel = payment === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setPayment(m.id)}
                            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-[11px] font-bold transition-all ${
                              isSel
                                ? 'bg-amber-400 text-black border-amber-400 shadow-sm'
                                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/8'
                            }`}
                          >
                            <Icon size={12} />
                            <span>{m.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-gray-400 block mb-2 flex items-center gap-1">
                      <Calendar size={11} className="text-gold" /> Date
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 focus:border-amber-400 rounded-xl py-2.5 px-3 text-xs text-white focus:outline-none transition-all [color-scheme:dark]"
                    />
                  </div>
                </div>

                {/* Optional Paid To */}
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                    Paid To <span className="text-gray-600 text-[10px] font-normal">(Optional vendor/person name)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Local store, Electrician, Ravi"
                    value={paidTo}
                    onChange={e => setPaidTo(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 focus:border-amber-400 rounded-xl py-2 px-3 text-xs text-white focus:outline-none transition-all placeholder:text-gray-600"
                  />
                </div>
              </div>

              {/* Footer Actions — INSIDE FORM */}
              <div className="p-5 border-t border-white/10 bg-zinc-900/60 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_4px_20px_-4px_rgba(245,158,11,0.5)] hover:scale-105 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {saving ? <Loader2 size={14} className="animate-spin text-black" /> : <IndianRupee size={14} />}
                  <span>Save Expense</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
