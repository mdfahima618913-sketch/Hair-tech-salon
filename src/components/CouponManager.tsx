import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Tag, Plus, Trash2, Loader2, AlertCircle, CheckCircle2,
  ToggleLeft, ToggleRight, Percent, IndianRupee, Copy, RefreshCw,
  Search, X,
} from 'lucide-react';
import {
  collection, getDocs, setDoc, deleteDoc,
  updateDoc, doc, serverTimestamp, orderBy, query,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Coupon {
  id:        string; // document ID = the code (uppercase)
  code:      string;
  type:      'percent' | 'flat';
  value:     number;
  minOrder:  number;
  maxUses:   number;
  usedCount: number;
  active:    boolean;
  expiresAt: string | null;
  createdAt?: any;
}

type CouponForm = Omit<Coupon, 'id' | 'usedCount' | 'createdAt'>;

const BLANK_FORM: CouponForm = {
  code:      '',
  type:      'percent',
  value:     10,
  minOrder:  499,
  maxUses:   0,
  active:    true,
  expiresAt: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusOf(c: Coupon): { label: string; color: string } {
  if (!c.active) return { label: 'Inactive',  color: 'text-gray-500 bg-gray-500/10 border-gray-500/20' };
  if (c.expiresAt && new Date(c.expiresAt) < new Date())
    return { label: 'Expired',   color: 'text-red-400 bg-red-500/10 border-red-500/20'   };
  if (c.maxUses > 0 && c.usedCount >= c.maxUses)
    return { label: 'Maxed Out', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
  return   { label: 'Active',    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
}

function randomCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CouponManager() {
  const [coupons,  setCoupons]  = useState<Coupon[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState<CouponForm>(BLANK_FORM);
  const [saving,   setSaving]   = useState(false);
  const [codeErr,  setCodeErr]  = useState('');
  const [toast,    setToast]    = useState<{ ok: boolean; text: string } | null>(null);
  const [search,   setSearch]   = useState('');

  const showToast = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'coupons'), orderBy('createdAt', 'desc')));
      setCoupons(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Coupon,'id'>) })));
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // ── Save coupon ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const code = form.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 3) { setCodeErr('Code must be at least 3 characters.'); return; }
    if (code.length > 20) { setCodeErr('Code must be 20 characters or fewer.'); return; }
    if (form.value <= 0)  { setCodeErr('Discount value must be greater than 0.'); return; }
    if (form.type === 'percent' && form.value > 90)
      { setCodeErr('Percentage discount cannot exceed 90%.'); return; }
    setCodeErr('');
    setSaving(true);
    try {
      await setDoc(doc(db, 'coupons', code), {
        code,
        type:      form.type,
        value:     form.value,
        minOrder:  form.minOrder,
        maxUses:   form.maxUses,
        usedCount: 0,
        active:    form.active,
        expiresAt: form.expiresAt || null,
        createdAt: serverTimestamp(),
      });
      await load();
      setShowForm(false);
      setForm(BLANK_FORM);
      showToast(true, `Coupon "${code}" created successfully.`);
    } catch {
      showToast(false, 'Failed to save coupon. Check Firestore rules.');
    } finally { setSaving(false); }
  };

  // ── Toggle active ────────────────────────────────────────────────────────────
  const handleToggle = async (c: Coupon) => {
    await updateDoc(doc(db, 'coupons', c.id), { active: !c.active });
    setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, active: !x.active } : x));
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async (c: Coupon) => {
    if (!confirm(`Delete coupon "${c.code}"? This cannot be undone.`)) return;
    await deleteDoc(doc(db, 'coupons', c.id));
    setCoupons(prev => prev.filter(x => x.id !== c.id));
    showToast(true, `Coupon "${c.code}" deleted.`);
  };

  // ── Copy code ────────────────────────────────────────────────────────────────
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    showToast(true, `"${code}" copied to clipboard.`);
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            <Tag size={18} className="text-gold" /> Coupon Codes
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Create discount codes customers can enter at checkout.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl bg-white/8 border border-white/10 text-gray-500 hover:text-white transition-all" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => { setShowForm(v => !v); setForm(BLANK_FORM); setCodeErr(''); }}
            className="flex items-center gap-2 px-4 py-2 bg-gold/10 border border-gold/30 rounded-xl text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/20 transition-all shrink-0"
          >
            <Plus size={13} /> New Coupon
          </button>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-bold ${
              toast.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                       : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}
          >
            {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create coupon form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-zinc-900 border border-gold/20 rounded-2xl p-6 space-y-5"
          >
            <p className="text-[10px] uppercase font-black tracking-widest text-gold">Create New Coupon</p>

            {/* Code + generate */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-2">
                Coupon Code <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. HAIR20"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                  maxLength={20}
                  className="flex-1 bg-white/8 border border-white/10 rounded-xl py-3 px-4 text-white font-mono text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500 uppercase tracking-wider"
                />
                <button
                  onClick={() => setForm(f => ({ ...f, code: randomCode() }))}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-white/8 border border-white/10 rounded-xl text-xs font-bold text-gray-400 hover:bg-white/10 hover:text-white transition-all shrink-0"
                >
                  <RefreshCw size={12} /> Auto
                </button>
              </div>
              {codeErr && <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1"><AlertCircle size={10} />{codeErr}</p>}
            </div>

            {/* Type + Value */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-2">Discount Type</label>
                <div className="flex gap-2">
                  {([['percent', 'Percent %', Percent], ['flat', 'Flat ₹', IndianRupee]] as const).map(([v, l, Icon]) => (
                    <button
                      key={v}
                      onClick={() => setForm(f => ({ ...f, type: v }))}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl border text-xs font-black uppercase tracking-wider transition-all ${
                        form.type === v
                          ? 'bg-gold/20 border-gold/40 text-gold'
                          : 'bg-white/8 border-white/10 text-gray-500 hover:text-white'
                      }`}
                    >
                      <Icon size={12} /> {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-2">
                  Discount Value {form.type === 'percent' ? '(%)' : '(₹)'}
                </label>
                <input
                  type="number" min={1} max={form.type === 'percent' ? 90 : 99999}
                  value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                  className="w-full bg-white/8 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all"
                />
              </div>
            </div>

            {/* Min order + Max uses */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-2">Min Order (₹)</label>
                <input
                  type="number" min={0}
                  value={form.minOrder}
                  onChange={e => setForm(f => ({ ...f, minOrder: Number(e.target.value) }))}
                  className="w-full bg-white/8 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all"
                />
                <p className="text-[9px] text-gray-700 mt-1">Set 0 for no minimum</p>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-2">Max Uses</label>
                <input
                  type="number" min={0}
                  value={form.maxUses}
                  onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) }))}
                  className="w-full bg-white/8 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all"
                />
                <p className="text-[9px] text-gray-700 mt-1">Set 0 for unlimited</p>
              </div>
            </div>

            {/* Expiry */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-2">Expiry Date (optional)</label>
              <input
                type="date"
                value={form.expiresAt ?? ''}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value || null }))}
                min={new Date().toISOString().slice(0, 10)}
                className="w-full bg-white/8 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all"
              />
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox" checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  className="accent-gold w-4 h-4"
                />
                <span className="text-sm text-gray-300 font-medium">Active (can be used at checkout)</span>
              </label>
            </div>

            {/* Preview */}
            {form.code && (
              <div className="flex items-center gap-3 px-4 py-3 bg-gold/8 border border-gold/20 rounded-xl">
                <Tag size={14} className="text-gold shrink-0" />
                <p className="text-gold text-sm font-bold">
                  <span className="font-black tracking-wider">{form.code || '…'}</span>
                  {' — '}
                  {form.type === 'percent' ? `${form.value}% off` : `₹${form.value} off`}
                  {form.minOrder > 0 && ` on orders above ₹${form.minOrder}`}
                  {form.maxUses > 0 && ` · max ${form.maxUses} uses`}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowForm(false); setForm(BLANK_FORM); setCodeErr(''); }}
                className="px-5 py-2.5 bg-white/8 border border-white/10 rounded-xl text-xs font-bold text-gray-400 hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-gold hover:bg-gold/90 rounded-xl text-black text-xs font-black uppercase tracking-wider disabled:opacity-40 transition-all"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Tag size={12} />}
                {saving ? 'Saving…' : 'Create Coupon'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      {coupons.length > 0 && (
        <div className="relative max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-white/10 rounded-xl py-2 pl-9 pr-8 text-white text-xs focus:outline-none focus:border-gold/40 transition-all placeholder:text-gray-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* Coupon list */}
      {loading ? (
        <div className="flex items-center justify-center py-14 gap-3 text-gray-500">
          <Loader2 size={20} className="animate-spin text-gold" /> Loading coupons…
        </div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-14 bg-zinc-900 border border-white/12 rounded-2xl space-y-3">
          <Tag size={36} className="text-gray-700 mx-auto" />
          <p className="text-gray-400 font-bold">No coupons yet</p>
          <p className="text-gray-400 text-sm">Create your first discount code for customers to use at checkout.</p>
        </div>
      ) : (() => {
        const q = search.toUpperCase().trim();
        const filtered = q ? coupons.filter(c => c.code.includes(q)) : coupons;
        return filtered.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No coupons match "{search}"</p>
        ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const { label, color } = statusOf(c);
            const usesDisplay = c.maxUses > 0 ? `${c.usedCount}/${c.maxUses}` : `${c.usedCount}/∞`;
            return (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-zinc-900 border border-white/12 rounded-2xl px-4 py-4"
              >
                {/* Code + type */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
                    <Tag size={15} className="text-gold" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-black text-sm tracking-wider font-mono">{c.code}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${color}`}>
                        {label}
                      </span>
                    </div>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {c.type === 'percent' ? `${c.value}% off` : `₹${c.value} off`}
                      {c.minOrder > 0 && ` · min ₹${c.minOrder}`}
                      {c.expiresAt && ` · expires ${new Date(c.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </p>
                  </div>
                </div>

                {/* Usage */}
                <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                  <span className="font-black text-white">{usesDisplay}</span>
                  <span>uses</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => copyCode(c.code)}
                    className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                    title="Copy code"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={() => handleToggle(c)}
                    className={`p-2 rounded-lg transition-all ${c.active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                    title={c.active ? 'Deactivate' : 'Activate'}
                  >
                    {c.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  </button>
                  <button
                    onClick={() => handleDelete(c)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Delete coupon"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
        );
      })()}
    </div>
  );
}

