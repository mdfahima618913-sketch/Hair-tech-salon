/**
 * BillingModule.tsx
 *
 * Standalone billing module for Hair Tech Salon admin dashboard.
 * Handles two flows:
 *   1. Walk-in / Express billing  — search/create customer → services → staff → payment → invoice
 *   2. Online booking billing     — pre-populated from booking → add staff → generate invoice
 *
 * Firestore collections used:
 *   customers/{phone}   — master customer data
 *   staff/{id}          — staff members with commission rates
 *   invoices/{id}       — generated bills
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, UserPlus, X, Plus, Minus, ChevronDown, ChevronUp,
  Receipt, CreditCard, Banknote, Smartphone, CheckCircle2,
  Loader2, AlertCircle, User, Phone, Scissors, Tag,
  ArrowLeft, Printer, Download, ShoppingBag, Percent,
  IndianRupee, Clock, Star, RefreshCw, UserCheck,
  Wallet, Building2,
} from 'lucide-react';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp, Timestamp,
  limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { servicesData, Service } from '../constants/services';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Customer {
  phone: string;         // document ID
  name: string;
  visitCount: number;
  totalSpend: number;
  firstVisit: string;    // ISO
  lastVisit: string;     // ISO
  notes?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  phone?: string;
  role?: string;
  commissionRate: number;  // percentage e.g. 5
  salary: number;          // fixed monthly salary in ₹
  isActive: boolean;
  email?: string;          // Firebase Auth email for staff portal login
}

export interface BillItem {
  serviceId: string;
  serviceName: string;
  price: number;
  staffId: string;
  staffName: string;
  commissionRate: number;
  commissionAmount: number;
}

export type PaymentMethod =
  | 'online'    // Razorpay — already paid
  | 'cash'
  | 'upi'
  | 'card'
  | 'gpay'
  | 'phonepe'
  | 'paytm';

export interface Invoice {
  id?: string;
  invoiceNumber: string;
  customerPhone: string;
  customerName: string;
  bookingId?: string;          // if generated from online booking
  items: BillItem[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentId?: string;          // Razorpay ID for online
  status: 'paid' | 'due';
  source: 'walkin' | 'online';
  createdAt?: Timestamp;
}

// Pre-populated from an online booking to skip customer/service steps
export interface OnlineBookingPrefill {
  bookingId: string;
  customerName: string;
  customerPhone: string;
  serviceNames: string;        // comma-separated
  totalAmount: number;
  paymentId?: string;
  bookingTime?: string;
  paymentMethod?: string;      // e.g. 'pay_at_salon' — full amount due at counter
}

interface BillingModuleProps {
  // Pass this to trigger online-booking billing from the dashboard bookings table
  prefill?: OnlineBookingPrefill | null;
  onClose?: () => void;
  onInvoiceCreated?: (invoice: Invoice) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: 'cash',    label: 'Cash',     icon: <Banknote   size={15} /> },
  { id: 'upi',     label: 'UPI',      icon: <Smartphone size={15} /> },
  { id: 'gpay',    label: 'GPay',     icon: <Smartphone size={15} /> },
  { id: 'phonepe', label: 'PhonePe',  icon: <Smartphone size={15} /> },
  { id: 'paytm',   label: 'Paytm',    icon: <Wallet     size={15} /> },
  { id: 'card',    label: 'Card',     icon: <CreditCard size={15} /> },
];

const DEFAULT_COMMISSION = 5; // percent

// Group services by category for the picker
const SERVICE_CATEGORIES = Array.from(new Set(servicesData.map(s => s.category)));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateInvoiceNumber(): string {
  const now  = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `HT-${date}-${rand}`;
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2);
  return digits;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Step indicator
function Steps({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => (
        <React.Fragment key={i}>
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black transition-all ${
              i < current  ? 'bg-emerald-500 text-white'
              : i === current ? 'bg-gold text-black scale-110 shadow-[0_0_12px_rgba(212,175,55,0.4)]'
              : 'bg-white/8 text-gray-400 border border-white/10'
            }`}>
              {i < current ? <CheckCircle2 size={12} /> : i + 1}
            </div>
            <span className={`text-[10px] font-black uppercase tracking-wider hidden sm:inline ${
              i === current ? 'text-gold' : i < current ? 'text-emerald-400' : 'text-gray-400'
            }`}>{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-8 h-[1px] mx-1 ${i < current ? 'bg-emerald-500/50' : 'bg-white/8'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// Customer search + create — with live suggestions from local customer list
function CustomerStep({
  onSelect,
}: {
  onSelect: (customer: Customer, isNew: boolean) => void;
}) {
  const [phone,        setPhone]        = useState('');
  const [name,         setName]         = useState('');
  const [found,        setFound]        = useState<Customer | null | 'not-found'>(null);
  const [searching,    setSearching]    = useState(false);
  const [creating,     setCreating]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [suggestions,  setSuggestions]  = useState<Customer[]>([]);
  const [showDrop,     setShowDrop]     = useState(false);
  const [dropPos,      setDropPos]      = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load customer list once on mount for instant local suggestions
  useEffect(() => {
    getDocs(query(collection(db, 'customers'), orderBy('lastVisit', 'desc'), limit(500)))
      .then(snap => setCustomerList(snap.docs.map(d => ({ ...d.data(), phone: d.id } as Customer))))
      .catch(() => {});
    inputRef.current?.focus();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Calculate fixed viewport position so dropdown escapes overflow-y-auto clipping
  useEffect(() => {
    if (showDrop && wrapperRef.current) {
      const r = wrapperRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [showDrop, suggestions]);

  // Live suggestions from local list after 3+ chars (phone digits or name)
  useEffect(() => {
    const raw    = phone.trim();
    const digits = raw.replace(/\D/g, '');
    if (raw.length < 3) { setSuggestions([]); setShowDrop(false); return; }
    if (found && found !== 'not-found') return;
    const matches = customerList.filter((c: Customer) =>
      digits.length >= 3
        ? c.phone.includes(digits)
        : c.name.toLowerCase().includes(raw.toLowerCase())
    ).slice(0, 8);
    setSuggestions(matches);
    setShowDrop(matches.length > 0);
  }, [phone, customerList, found]);

  // Firestore exact lookup once 10 digits are present
  useEffect(() => {
    const clean = normalisePhone(phone);
    if (clean.length < 10) { setFound(null); setError(null); return; }
    setShowDrop(false);
    const t = setTimeout(async () => {
      setSearching(true); setError(null);
      try {
        const custSnap = await getDoc(doc(db, 'customers', clean));
        if (custSnap.exists()) { setFound(custSnap.data() as Customer); return; }
        const bookSnaps = await Promise.all(
          [clean, `+91${clean}`, `+91 ${clean}`, `91${clean}`, `0${clean}`].map(
            fmt => getDocs(query(collection(db, 'bookings'), where('customerPhone', '==', fmt)))
          )
        );
        const firstHit = bookSnaps.find(s => !s.empty);
        if (firstHit) {
          const b = firstHit.docs[0].data();
          setFound({ phone: clean, name: b.customerName ?? '', visitCount: 0, totalSpend: 0, firstVisit: '', lastVisit: '' } as Customer);
        } else {
          setFound('not-found');
        }
      } catch (e: any) { setError(e.message); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [phone]);

  const pickSuggestion = (c: Customer) => {
    setPhone(c.phone);
    setName(c.name);
    setFound(c);
    setShowDrop(false);
    setSuggestions([]);
  };

  const handleCreate = async () => {
    const clean = normalisePhone(phone);
    if (!name.trim()) { setError('Enter customer name.'); return; }
    setCreating(true); setError(null);
    try {
      const now = new Date().toISOString();
      const customer: Customer = { phone: clean, name: name.trim(), visitCount: 0, totalSpend: 0, firstVisit: now, lastVisit: now };
      await setDoc(doc(db, 'customers', clean), customer);
      onSelect(customer, true);
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-white font-black text-lg uppercase tracking-tight mb-1">Find Customer</h3>
        <p className="text-gray-400 text-xs">Type phone or name — suggestions appear after 3 characters.</p>
      </div>

      <div ref={wrapperRef} className="relative">
        <Phone size={15} className="absolute left-3 top-3.5 text-gray-400 z-10" />
        <input
          ref={inputRef}
          type="tel"
          placeholder="Phone number or customer name…"
          value={phone}
          onChange={e => { setPhone(e.target.value); setFound(null); }}
          onFocus={() => suggestions.length > 0 && setShowDrop(true)}
          className="w-full bg-white/8 border border-white/10 rounded-xl py-3 pl-9 pr-10 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
        />
        {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gold animate-spin" />}

        {/* Live suggestions dropdown — rendered with fixed position to escape overflow-y-auto clipping */}
        <AnimatePresence>
          {showDrop && dropPos && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
              className="bg-zinc-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden"
            >
              {suggestions.map((c: Customer) => (
                <button
                  key={c.phone}
                  onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); pickSuggestion(c); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/8 transition-colors text-left border-b border-white/12 last:border-0"
                >
                  <div className="w-8 h-8 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center text-gold text-xs font-black shrink-0">
                    {(c.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-bold truncate">{c.name}</p>
                    <p className="text-gray-400 text-xs">{c.phone}</p>
                  </div>
                  {(c.visitCount ?? 0) > 0 && (
                    <span className="text-[9px] text-amber-400 font-black shrink-0">{c.visitCount} visit{c.visitCount !== 1 ? 's' : ''}</span>
                  )}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {/* Found existing customer */}
        {found && found !== 'not-found' && (
          <motion.div key="found" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black">
                  {found.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-bold">{found.name}</p>
                  <p className="text-gray-400 text-xs">{found.phone}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[9px] text-emerald-400 font-black uppercase">{found.visitCount} visits</span>
                    <span className="text-[9px] text-gray-500">·</span>
                    <span className="text-[9px] text-gray-400">₹{found.totalSpend.toLocaleString('en-IN')} total spend</span>
                    {found.visitCount > 0 && (
                      <span className="flex items-center gap-0.5 text-[9px] text-amber-400 font-black">
                        <Star size={8} className="fill-current" /> Returning
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onSelect(found as Customer, false)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-black font-black text-xs uppercase tracking-wider transition-all"
              >
                Select →
              </button>
            </div>
          </motion.div>
        )}

        {/* Not found — create new */}
        {found === 'not-found' && (
          <motion.div key="notfound" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-white/8 border border-white/10 rounded-2xl space-y-4"
          >
            <div className="flex items-center gap-2 text-amber-400">
              <UserPlus size={15} />
              <p className="text-xs font-bold">No customer found — add new customer</p>
            </div>
            <div className="relative">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Customer full name"
                value={name}
                onChange={e => { setName(e.target.value); setError(null); }}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
                className="w-full bg-white/8 border border-white/10 rounded-xl py-3 pl-9 pr-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              className="w-full py-3 bg-gold/10 border border-gold/30 rounded-xl text-gold font-black text-xs uppercase tracking-wider hover:bg-gold/20 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              Create & Continue
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="flex items-center gap-2 text-red-400 text-xs font-bold">
          <AlertCircle size={12} /> {error}
        </p>
      )}
    </div>
  );
}

// Service picker — one staff per bill
function ServiceStep({
  items, onAdd, onRemove, staff, onStaffSelect, selectedStaffId,
}: {
  items: BillItem[];
  onAdd: (service: Service) => void;
  onRemove: (idx: number) => void;
  staff: StaffMember[];
  onStaffSelect: (staffId: string) => void;
  selectedStaffId: string;
}) {
  const [search,        setSearch]        = useState('');
  const [openCat,       setOpenCat]       = useState<string | null>(SERVICE_CATEGORIES[0]);
  const [showCatalogue, setShowCatalogue] = useState(true);

  const filtered = useMemo(() => {
    if (!search.trim()) return servicesData;
    const q = search.toLowerCase();
    return servicesData.filter(s =>
      s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
    );
  }, [search]);

  const grouped = useMemo(() => {
    const g: Record<string, Service[]> = {};
    filtered.forEach(s => { (g[s.category] = g[s.category] ?? []).push(s); });
    return g;
  }, [filtered]);

  const addedIds    = new Set(items.map(i => i.serviceId));
  const activeStaff = staff.filter(s => s.isActive);
  const assignedStaff = activeStaff.find(s => s.id === selectedStaffId);
  const totalCommission = items.reduce((a, i) => a + i.commissionAmount, 0);

  return (
    <div className="space-y-4">

      {/* ── Single staff selector for the whole bill ── */}
      <div className="p-3 rounded-2xl bg-gold/8 border border-gold/25 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserCheck size={14} className="text-gold shrink-0" />
            <p className="text-gold text-xs font-black uppercase tracking-wider">Staff for this Bill</p>
          </div>
          {selectedStaffId && items.length > 0 && (
            <span className="text-[9px] font-black text-emerald-400 flex items-center gap-1">
              <CheckCircle2 size={10} /> Assigned
            </span>
          )}
          {!selectedStaffId && items.length > 0 && (
            <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
              Not assigned yet
            </span>
          )}
        </div>
        {activeStaff.length === 0 ? (
          <p className="text-amber-400 text-[10px]">⚠ No active staff found. Add staff in the Staff module first.</p>
        ) : (
          <select
            value={selectedStaffId}
            onChange={e => onStaffSelect(e.target.value)}
            className="w-full bg-zinc-900 border border-gold/30 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold/60 transition-all"
          >
            <option value="">— Select staff member —</option>
            {activeStaff.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.role ? ` · ${s.role}` : ''} · {s.commissionRate}% commission
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── Bill items table ── */}
      {items.length > 0 && (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-4 py-2.5 bg-white/[0.03] border-b border-white/12 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
              Bill Items ({items.length})
            </p>
            <span className="text-gold font-black text-sm">
              ₹{items.reduce((a, i) => a + i.price, 0).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="divide-y divide-white/5">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-bold truncate">{item.serviceName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-gold text-xs font-black">₹{item.price.toLocaleString('en-IN')}</p>
                    {item.staffName && (
                      <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-0.5">
                        <UserCheck size={9} /> {item.staffName}
                        {item.commissionAmount > 0 && ` · ₹${item.commissionAmount.toLocaleString('en-IN')}`}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => onRemove(idx)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          {/* Commission summary row */}
          {selectedStaffId && totalCommission > 0 && (
            <div className="px-4 py-2.5 border-t border-white/12 bg-white/[0.02] flex items-center justify-between">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                Total Commission ({items[0]?.commissionRate ?? 0}%)
              </span>
              <span className="text-emerald-400 font-black text-sm">₹{totalCommission.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Live calculation summary ── */}
      {items.length > 0 && (
        <div className="px-4 py-3 bg-zinc-800/60 border border-white/10 rounded-xl space-y-1.5">
          <p className="text-[9px] uppercase tracking-widest font-black text-gray-400 mb-2">Bill Summary</p>
          {items.map((it, i) => (
            <div key={i} className="flex justify-between text-[10px]">
              <span className="text-gray-500 truncate flex-1 pr-2">{it.serviceName}</span>
              <span className="text-white font-bold shrink-0">₹{it.price.toLocaleString('en-IN')}</span>
            </div>
          ))}
          <div className="border-t border-white/12 pt-1.5 flex justify-between text-sm font-black">
            <span className="text-gray-400">Subtotal</span>
            <span className="text-gold">₹{items.reduce((a, i) => a + i.price, 0).toLocaleString('en-IN')}</span>
          </div>
          {selectedStaffId && totalCommission > 0 && (
            <div className="flex justify-between text-[10px] text-emerald-400 font-bold">
              <span>Commission ({items[0]?.commissionRate ?? 0}%)</span>
              <span>₹{totalCommission.toLocaleString('en-IN')}</span>
            </div>
          )}
          <p className="text-[9px] text-gray-700 pt-0.5">Discount &amp; final total set on the next step →</p>
        </div>
      )}

      {/* ── Service catalogue — collapsible to save space ── */}
      <div>
        <button
          onClick={() => setShowCatalogue(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border border-white/12 rounded-xl hover:bg-white/[0.05] transition-all"
        >
          <div className="flex items-center gap-2">
            <Scissors size={13} className="text-gold" />
            <span className="text-xs font-black uppercase tracking-wider text-gray-300">
              {items.length > 0 ? 'Add More Services' : 'Select Services'}
            </span>
          </div>
          {showCatalogue ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
        </button>

        <AnimatePresence>
          {showCatalogue && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 space-y-2">
                {/* Search */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search services…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-white/8 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
                  />
                  {search && (
                    <button onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Catalogue */}
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-hide">
                  {Object.entries(grouped).map(([cat, services]) => (
                    <div key={cat} className="border border-white/12 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setOpenCat(openCat === cat ? null : cat)}
                        className="w-full flex items-center justify-between px-4 py-2 bg-white/[0.03] hover:bg-white/[0.06] transition-all"
                      >
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{cat}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-gray-400">{services.length}</span>
                          {openCat === cat ? <ChevronUp size={11} className="text-gray-400" /> : <ChevronDown size={11} className="text-gray-400" />}
                        </div>
                      </button>
                      <AnimatePresence>
                        {openCat === cat && (
                          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                            <div className="divide-y divide-white/5">
                              {services.map(service => {
                                const added = addedIds.has(service.id);
                                return (
                                  <div key={service.id}
                                    className={`flex items-center justify-between px-4 py-2 transition-all ${added ? 'bg-gold/5' : 'hover:bg-white/[0.03]'}`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className={`text-xs font-medium truncate ${added ? 'text-gold' : 'text-gray-300'}`}>{service.name}</p>
                                      <p className="text-[9px] text-gray-400">{service.time}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0 ml-3">
                                      <span className="text-xs font-black text-white">{service.price}</span>
                                      <button
                                        onClick={() => added
                                          ? onRemove(items.findIndex(i => i.serviceId === service.id))
                                          : onAdd(service)
                                        }
                                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                                          added
                                            ? 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30'
                                            : 'bg-gold/20 border border-gold/30 text-gold hover:bg-gold/30'
                                        }`}
                                      >
                                        {added ? <Minus size={10} /> : <Plus size={10} />}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Payment step
function PaymentStep({
  subtotal, discountPercent, onDiscountChange, paymentMethod,
  onPaymentChange, isOnline, alreadyPaidAmount = 0, isPayAtSalon = false,
}: {
  subtotal: number;
  discountPercent: number;
  onDiscountChange: (v: number) => void;
  paymentMethod: PaymentMethod;
  onPaymentChange: (m: PaymentMethod) => void;
  isOnline: boolean;
  alreadyPaidAmount?: number;
  isPayAtSalon?: boolean;
}) {
  const discountAmt  = Math.round(subtotal * discountPercent / 100);
  const total        = subtotal - discountAmt;
  const balanceDue   = Math.max(0, total - alreadyPaidAmount);
  const hasExtra     = alreadyPaidAmount > 0 && total > alreadyPaidAmount;
  // True only when there's a genuine Razorpay pre-payment AND extra services were added
  const isBalance    = isOnline && alreadyPaidAmount > 0 && balanceDue > 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-white font-black text-lg uppercase tracking-tight mb-1">Payment</h3>
        <p className="text-gray-500 text-xs">
          {isOnline && !isPayAtSalon ? 'Already paid online via Razorpay — just confirm.' : 'Select payment method and apply discount if any.'}
        </p>
      </div>

      {/* Pay-at-salon notice */}
      {isOnline && isPayAtSalon && alreadyPaidAmount === 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
          <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300 text-xs font-bold leading-relaxed">
            Pay at Salon booking — full amount due. Collect payment before generating invoice.
          </p>
        </div>
      )}

      {/* Bill summary */}
      <div className="bg-white/8 border border-white/12 rounded-2xl p-5 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Subtotal</span>
          <span className="text-white font-bold">₹{subtotal.toLocaleString('en-IN')}</span>
        </div>
        {!isOnline && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Discount</span>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} max={100}
                value={discountPercent}
                onChange={e => onDiscountChange(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-12 bg-zinc-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-gold/40"
              />
              <span className="text-gray-500 text-xs">%</span>
              {discountAmt > 0 && <span className="text-red-400 text-xs font-bold">-₹{discountAmt.toLocaleString('en-IN')}</span>}
            </div>
          </div>
        )}
        <div className="pt-3 border-t border-white/10 flex justify-between">
          <span className="text-white font-black uppercase tracking-wide">Total</span>
          <span className="text-gold text-2xl font-black">₹{total.toLocaleString('en-IN')}</span>
        </div>
        {/* Razorpay pre-paid balance breakdown */}
        {alreadyPaidAmount > 0 && (
          <>
            <div className="flex justify-between text-sm text-emerald-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={12} /> Paid via Razorpay
              </span>
              <span className="font-bold">-₹{alreadyPaidAmount.toLocaleString('en-IN')}</span>
            </div>
            <div className={`pt-2 border-t border-white/10 flex justify-between font-black text-lg ${balanceDue > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              <span>{balanceDue > 0 ? 'Balance Due' : 'No Balance Due ✓'}</span>
              <span>₹{balanceDue.toLocaleString('en-IN')}</span>
            </div>
          </>
        )}
      </div>

      {/* Already paid section — shown for online bookings */}
      {alreadyPaidAmount > 0 && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <div>
            <p className="text-emerald-400 font-black text-sm">
              ₹{alreadyPaidAmount.toLocaleString('en-IN')} Paid via Razorpay
            </p>
            <p className="text-gray-500 text-xs">
              {balanceDue > 0
                ? `₹${balanceDue.toLocaleString('en-IN')} balance due for additional services`
                : 'Fully paid — no balance due'}
            </p>
          </div>
        </div>
      )}

      {/* Payment method */}
      {(!isOnline || balanceDue > 0) && (
        <div>
          <p className="text-[10px] uppercase tracking-widest font-black text-gray-500 mb-1">
            {isBalance
              ? `Pay ₹${balanceDue.toLocaleString('en-IN')} Balance`
              : `Payment Method — ₹${total.toLocaleString('en-IN')} to collect`}
          </p>
          {isBalance && (
            <p className="text-amber-400 text-[10px] mb-3">
              Customer already paid ₹{alreadyPaidAmount.toLocaleString('en-IN')} via Razorpay. Collect only the remaining balance.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.filter(m => m.id !== 'online').map(m => (
              <button
                key={m.id}
                onClick={() => onPaymentChange(m.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all ${
                  paymentMethod === m.id
                    ? 'bg-gold/20 border-gold/40 text-gold'
                    : 'bg-white/8 border-white/10 text-gray-500 hover:border-white/20 hover:text-white'
                }`}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Invoice preview + print
function InvoicePreview({ invoice, customer, onClose }: {
  invoice: Invoice;
  customer: Customer;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const discountLine = invoice.discountAmount > 0
      ? `<div class="row"><span>Discount (${invoice.discountPercent}%)</span><span style="color:#c00">-&#8377;${invoice.discountAmount.toLocaleString('en-IN')}</span></div>`
      : '';
    const commissionRows = Object.entries(
      invoice.items.reduce((acc: Record<string,number>, it) => {
        if (it.staffId) acc[it.staffName] = (acc[it.staffName] ?? 0) + it.commissionAmount;
        return acc;
      }, {})
    ).map(([name, amt]) =>
      `<div class="row sm"><span>${name}</span><span>&#8377;${(amt as number).toLocaleString('en-IN')}</span></div>`
    ).join('');

    w.document.write(`<!DOCTYPE html><html><head>
      <title>Invoice ${invoice.invoiceNumber}</title>
      <meta charset="utf-8"/>
      <style>
        @page { size: 80mm auto; margin: 0; }
        * { box-sizing: border-box; }
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 12px; width: 80mm; margin: 0 auto;
          padding: 6mm 4mm; color: #000;
        }
        .center { text-align: center; }
        .bold   { font-weight: 700; }
        .lg     { font-size: 15px; }
        .xl     { font-size: 20px; font-weight: 900; }
        .sm     { font-size: 10px; color: #555; }
        .dash   { border-top: 1px dashed #888; margin: 5px 0; }
        .row    { display: flex; justify-content: space-between; padding: 2px 0; }
        .row.total { font-size: 15px; font-weight: 900; padding-top: 4px; }
        .row.balance { font-size: 14px; font-weight: 900; color: #c07000; }
        .badge  { display:inline-block; background:#eee; padding:1px 5px; border-radius:3px; font-size:9px; }
        .green  { color: #007700; }
        .svc    { margin: 3px 0; }
        .staff-hint { font-size: 9px; color: #888; margin-left: 8px; }
      </style>
    </head><body>
      <div class="center" style="margin-bottom:8px">
        <div class="xl">Hair Tech</div>
        <div class="bold">Unisex Salon, Araria</div>
        <div class="sm">+91 87896 03343</div>
        <div class="sm" style="margin-top:4px">
          <span class="badge">${invoice.source === 'online' ? 'Online Booking' : 'Walk-in'}</span>
        </div>
      </div>
      <div class="dash"></div>
      <div class="sm">Invoice: <span class="bold">${invoice.invoiceNumber}</span></div>
      <div class="sm">${new Date().toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
      <div class="dash"></div>
      <div class="row"><span>Customer</span><span class="bold">${invoice.customerName}</span></div>
      <div class="row sm"><span>Phone</span><span>${invoice.customerPhone}</span></div>
      <div class="dash"></div>
      <div class="bold sm" style="margin-bottom:4px">SERVICES</div>
      ${invoice.items.map(it => `
        <div class="svc">
          <div class="row"><span>${it.serviceName}</span><span class="bold">&#8377;${it.price.toLocaleString('en-IN')}</span></div>
          ${it.staffName ? `<div class="staff-hint">Staff: ${it.staffName} · ${it.commissionRate}% = &#8377;${it.commissionAmount.toLocaleString('en-IN')}</div>` : ''}
        </div>`).join('')}
      <div class="dash"></div>
      <div class="row"><span>Subtotal</span><span>&#8377;${invoice.subtotal.toLocaleString('en-IN')}</span></div>
      ${discountLine}
      <div class="row total"><span>TOTAL</span><span>&#8377;${invoice.total.toLocaleString('en-IN')}</span></div>
      <div class="row sm" style="margin-top:3px"><span>Payment</span><span class="bold" style="text-transform:uppercase">${invoice.paymentMethod}</span></div>
      ${invoice.paymentId ? `<div class="row sm"><span>Razorpay ID</span><span>${invoice.paymentId}</span></div>` : ''}
      ${commissionRows ? `<div class="dash"></div><div class="sm bold">Staff Commission</div>${commissionRows}` : ''}
      <div class="dash"></div>
      <div class="center sm" style="margin-top:6px">
        Thank you for visiting Hair Tech Salon!<br/>
        Follow us &#64;hairtech111
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-black text-lg uppercase tracking-tight">Invoice Generated</h3>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-2 bg-white/8 border border-white/10 rounded-xl text-xs font-bold text-gray-300 hover:bg-white/10 transition-all">
            <Printer size={13} /> Print
          </button>
          <button onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-xs font-bold text-emerald-400 hover:bg-emerald-500/30 transition-all">
            Done ✓
          </button>
        </div>
      </div>

      {/* Invoice card — thermal receipt style */}
      <div ref={printRef} className="bg-white text-black rounded-2xl p-5 font-mono text-xs max-w-[340px] mx-auto shadow-xl border border-gray-200">
        {/* Header */}
        <div className="text-center mb-4">
          <p className="font-black text-xl uppercase tracking-tight">Hair Tech</p>
          <p className="font-bold text-sm">Unisex Salon, Araria</p>
          <p className="text-gray-500 text-[10px]">+91 87896 03343</p>
          <div className="flex justify-center gap-1 mt-2">
            <span className={`text-[9px] px-2 py-0.5 rounded border ${invoice.source === 'online' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              {invoice.source === 'online' ? 'Online Booking' : 'Walk-in'}
            </span>
          </div>
          <div className="mt-2 text-[9px] text-gray-400 space-y-0.5">
            <p>Invoice: <span className="font-black text-black">{invoice.invoiceNumber}</span></p>
            <p>{new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>

        {/* Customer */}
        <div className="border-t border-dashed border-gray-300 pt-3 mb-3 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Customer</span>
            <span className="text-black font-bold">{invoice.customerName}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Phone</span>
            <span className="text-gray-700">{invoice.customerPhone}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Source</span>
            <span className={`text-[9px] px-2 py-0.5 rounded border font-bold ${invoice.source === 'online' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              {invoice.source === 'online' ? 'Online Booking' : 'Walk-in'}
            </span>
          </div>
        </div>

        {/* Items */}
        <div className="border-t border-dashed border-gray-300 pt-3 mb-3 space-y-2.5">
          <p className="text-[9px] font-black uppercase tracking-wider text-gray-500">Services</p>
          {invoice.items.map((item, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex justify-between items-start">
                <span className="text-gray-800 truncate flex-1 pr-2 text-xs">{item.serviceName}</span>
                <span className="text-black font-bold shrink-0 text-xs">₹{item.price.toLocaleString('en-IN')}</span>
              </div>
              {item.staffName && (
                <p className="text-[9px] text-gray-400 pl-1">
                  Staff: {item.staffName} · {item.commissionRate}% (₹{item.commissionAmount.toLocaleString('en-IN')})
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="border-t border-dashed border-gray-300 pt-3 space-y-1.5">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Subtotal</span><span>₹{invoice.subtotal.toLocaleString('en-IN')}</span>
          </div>
          {invoice.discountAmount > 0 && (
            <div className="flex justify-between text-xs text-red-600">
              <span>Discount ({invoice.discountPercent}%)</span>
              <span>-₹{invoice.discountAmount.toLocaleString('en-IN')}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-sm pt-1.5 border-t border-dashed border-gray-300">
            <span>TOTAL</span>
            <span style={{ color: '#B8941F' }}>₹{invoice.total.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 pt-1">
            <span>Payment</span>
            <span className="uppercase font-bold text-black">{invoice.paymentMethod}</span>
          </div>
          {invoice.paymentId && (
            <div className="flex justify-between text-[9px] text-gray-400">
              <span>Payment ID</span><span className="font-mono">{invoice.paymentId}</span>
            </div>
          )}
        </div>

        {/* Commission summary */}
        {invoice.items.some(i => i.commissionAmount > 0) && (
          <div className="border-t border-dashed border-gray-300 pt-2.5 mt-2.5">
            <p className="text-[9px] text-gray-400 font-black uppercase tracking-wider mb-1.5">Staff Commission</p>
            {Object.entries(
              invoice.items.reduce((acc, item) => {
                if (!item.staffId) return acc;
                acc[item.staffName] = (acc[item.staffName] ?? 0) + item.commissionAmount;
                return acc;
              }, {} as Record<string, number>)
            ).map(([name, amt]) => (
              <div key={name} className="flex justify-between text-[10px] text-gray-400">
                <span>{name}</span><span>₹{(amt as number).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-dashed border-gray-300 mt-4 pt-3 text-center text-[9px] text-gray-400">
          Thank you for visiting Hair Tech Salon!<br/>Follow us @hairtech111
        </div>
      </div>
    </div>
  );
}

// ─── Main BillingModule ───────────────────────────────────────────────────────

export default function BillingModule({ prefill, onClose, onInvoiceCreated }: BillingModuleProps) {
  const isOnlineFlow = !!prefill;

  // Wizard step: 0=customer, 1=services, 2=payment, 3=invoice
  const [step, setStep]         = useState(isOnlineFlow ? 1 : 0);
  const [customer, setCustomer] = useState<Customer | null>(
    isOnlineFlow
      ? {
          phone: normalisePhone(prefill.customerPhone),
          name: prefill.customerName,
          visitCount: 0, totalSpend: 0,
          firstVisit: new Date().toISOString(),
          lastVisit: new Date().toISOString(),
        }
      : null
  );

  const [items, setItems]             = useState<BillItem[]>([]);
  const [discountPercent, setDiscount] = useState(0);
  const [paymentMethod, setPayment]   = useState<PaymentMethod>(isOnlineFlow ? 'online' : 'cash');
  const [staff, setStaff]             = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [billStaffId, setBillStaffId] = useState('');
  const billStaffRef = useRef(''); // kept in sync for use inside callbacks
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [invoice, setInvoice]         = useState<Invoice | null>(null);

  // Amount already paid via Razorpay (online flow only).
  // pay_at_salon bookings are confirmed but nothing has been collected yet — treat as ₹0 paid.
  const alreadyPaidAmount = (isOnlineFlow && prefill?.paymentMethod !== 'pay_at_salon') ? (prefill?.totalAmount ?? 0) : 0;

  const STEPS = isOnlineFlow
    ? ['Services', 'Payment', 'Invoice']
    : ['Customer', 'Services', 'Payment', 'Invoice'];

  const stepOffset = isOnlineFlow ? 1 : 0; // step index offset

  // Pre-populate services from online booking
  useEffect(() => {
    if (!isOnlineFlow || !prefill) return;
    // Map service names back to service objects — best effort
    const names = prefill.serviceNames.split(',').map(s => s.trim());
    const matched = names.flatMap(name => {
      const svc = servicesData.find(s => s.name === name);
      return svc ? [{
        serviceId:        svc.id,
        serviceName:      svc.name,
        price:            svc.priceValue,
        staffId:          '',
        staffName:        '',
        commissionRate:   DEFAULT_COMMISSION,
        commissionAmount: 0,
      }] : [];
    });
    // If no match (name drift), create generic items from total
    if (matched.length === 0) {
      setItems([{
        serviceId:        'online-booking',
        serviceName:      prefill.serviceNames,
        price:            prefill.totalAmount,
        staffId:          '',
        staffName:        '',
        commissionRate:   DEFAULT_COMMISSION,
        commissionAmount: 0,
      }]);
    } else {
      setItems(matched);
    }
  }, []);

  // Load staff from Firestore
  useEffect(() => {
    getDocs(query(collection(db, 'staff'), where('isActive', '==', true), orderBy('name')))
      .then(snap => {
        setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
      })
      .catch(() => setStaff([]))
      .finally(() => setStaffLoading(false));
  }, []);

  // Derived totals
  const subtotal = useMemo(
    () => items.reduce((a, i) => a + i.price, 0),
    [items]
  );
  const discountAmount = Math.round(subtotal * discountPercent / 100);
  const total          = subtotal - discountAmount;

  // Assign one staff to ALL items (and remember for future adds)
  const assignStaffToAll = useCallback((staffId: string) => {
    setBillStaffId(staffId);
    billStaffRef.current = staffId;
    const member = staff.find(s => s.id === staffId);
    const rate   = member?.commissionRate ?? DEFAULT_COMMISSION;
    setItems(prev => prev.map(item => ({
      ...item,
      staffId,
      staffName:        member?.name ?? '',
      commissionRate:   rate,
      commissionAmount: Math.round(item.price * rate / 100),
    })));
  }, [staff]);

  // Add service — auto-applies current bill staff
  const addService = useCallback((service: Service) => {
    const staffId = billStaffRef.current;
    const member  = staffId ? staff.find(s => s.id === staffId) : null;
    const rate    = member?.commissionRate ?? DEFAULT_COMMISSION;
    setItems(prev => [...prev, {
      serviceId:        service.id,
      serviceName:      service.name,
      price:            service.priceValue,
      staffId:          staffId,
      staffName:        member?.name ?? '',
      commissionRate:   staffId ? rate : DEFAULT_COMMISSION,
      commissionAmount: staffId ? Math.round(service.priceValue * rate / 100) : 0,
    }]);
  }, [staff]);

  const removeService = useCallback((idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // Save invoice to Firestore
  const handleGenerateInvoice = async () => {
    if (!customer) return;
    setSaving(true);
    setSaveError(null);
    try {
      const inv: Omit<Invoice, 'id'> = {
        invoiceNumber:  generateInvoiceNumber(),
        customerPhone:  customer.phone,
        customerName:   customer.name,
        ...(prefill?.bookingId && { bookingId: prefill.bookingId }),
        items,
        subtotal,
        discountPercent,
        discountAmount,
        total,
        paymentMethod,
        ...(prefill?.paymentId && { paymentId: prefill.paymentId }),
        status:    'paid',
        source:    isOnlineFlow ? 'online' : 'walkin',
        createdAt: serverTimestamp() as any,
      };

      // Write invoice
      const invoiceRef = await addDoc(collection(db, 'invoices'), inv);

      // Update customer master — stats (visitCount, totalSpend) are derived from invoices at display time,
      // so here we only maintain identity fields: name, phone, source, timestamps.
      const invoiceSource = isOnlineFlow ? 'online' : 'walkin';
      const custRef  = doc(db, 'customers', customer.phone);
      const custSnap = await getDoc(custRef);
      if (custSnap.exists()) {
        const existing   = custSnap.data() as Customer & { source?: string };
        const prevSource = existing.source ?? 'walkin';
        const mergedSource = (prevSource === invoiceSource || prevSource === 'both') ? prevSource : 'both';
        await setDoc(custRef, {
          ...existing,
          name:      customer.name || existing.name,
          source:    mergedSource,
          lastVisit: new Date().toISOString(),
        });
      } else {
        await setDoc(custRef, {
          phone:      customer.phone,
          name:       customer.name,
          source:     invoiceSource,
          firstVisit: new Date().toISOString(),
          lastVisit:  new Date().toISOString(),
        });
      }

      // Update staff commission totals
      const staffCommissions = items.reduce((acc, item) => {
        if (!item.staffId) return acc;
        acc[item.staffId] = (acc[item.staffId] ?? 0) + item.commissionAmount;
        return acc;
      }, {} as Record<string, number>);

      await Promise.all(Object.entries(staffCommissions).map(async ([staffId, commission]) => {
        const staffRef  = doc(db, 'staff', staffId);
        const staffSnap = await getDoc(staffRef);
        if (staffSnap.exists()) {
          const s = staffSnap.data() as StaffMember & { totalCommission?: number; totalServices?: number };
          await setDoc(staffRef, {
            ...s,
            totalCommission: (s.totalCommission ?? 0) + commission,
            totalServices:   (s.totalServices ?? 0) + items.filter(i => i.staffId === staffId).length,
          });
        }
      }));

      // Mark the linked online booking as completed + store invoice breakup
      if (prefill?.bookingId) {
        await updateDoc(doc(db, 'bookings', prefill.bookingId), {
          status:           'completed',
          invoiceId:        invoiceRef.id,
          invoiceBreakdown: items.map(i => ({
            name:           i.serviceName,
            price:          i.price,
            staffName:      i.staffName  || null,
            commissionRate: i.commissionRate,
            commissionAmt:  i.commissionAmount,
          })),
          discountPercent,
          discountAmount,
          finalAmount: total,
          updatedAt:   serverTimestamp(),
        });
      }

      const finalInvoice = { ...inv, id: invoiceRef.id };
      setInvoice(finalInvoice);
      setStep(isOnlineFlow ? 3 : 4); // move to invoice preview
      onInvoiceCreated?.(finalInvoice);
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const balanceDue             = Math.max(0, total - alreadyPaidAmount);
  const canProceedFromServices = items.length > 0;
  // Can proceed when: fully paid online with no balance, OR a non-online payment method is selected
  const canProceedFromPayment  = (isOnlineFlow && balanceDue === 0) || paymentMethod !== 'online';

  // ── Render ─────────────────────────────────────────────────────────────────

  const displayStep = step - stepOffset; // 0-indexed display step

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="relative w-full max-w-2xl bg-[#0f0f0f] border border-white/15 rounded-[28px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/12 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
              <Receipt size={15} className="text-gold" />
            </div>
            <div>
              <p className="text-white font-black uppercase tracking-tight text-sm leading-none">
                {isOnlineFlow ? 'Online Booking Bill' : 'Express Billing'}
              </p>
              {customer && <p className="text-gray-400 text-[10px] mt-0.5">{customer.name} · {customer.phone}</p>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Steps current={displayStep} steps={STEPS} />
            {onClose && (
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-6 scrollbar-hide">
          <AnimatePresence mode="wait">
            {/* Step 0: Customer (walk-in only) */}
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
                <CustomerStep onSelect={(c, isNew) => { setCustomer(c); setStep(1); }} />
              </motion.div>
            )}

            {/* Step 1: Services */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
                {staffLoading ? (
                  <div className="flex items-center gap-3 py-8 justify-center text-gray-500">
                    <Loader2 size={18} className="animate-spin text-gold" />
                    <span className="text-xs">Loading staff…</span>
                  </div>
                ) : (
                  <ServiceStep
                    items={items} onAdd={addService} onRemove={removeService}
                    staff={staff} onStaffSelect={assignStaffToAll} selectedStaffId={billStaffId}
                  />
                )}
              </motion.div>
            )}

            {/* Step 2: Payment */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
                <PaymentStep
                  subtotal={subtotal} discountPercent={discountPercent}
                  onDiscountChange={setDiscount} paymentMethod={paymentMethod}
                  onPaymentChange={setPayment} isOnline={isOnlineFlow}
                  alreadyPaidAmount={alreadyPaidAmount}
                  isPayAtSalon={prefill?.paymentMethod === 'pay_at_salon'}
                />
              </motion.div>
            )}

            {/* Step 3/4: Invoice preview */}
            {(step === 3 || step === 4) && invoice && customer && (
              <motion.div key="s3" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
                <InvoicePreview invoice={invoice} customer={customer} onClose={() => onClose?.()} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer navigation */}
        {step < (isOnlineFlow ? 3 : 4) && !invoice && (
          <div className="px-7 py-5 border-t border-white/12 shrink-0 flex items-center justify-between gap-4">
            {/* Bill summary pill */}
            {items.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <ShoppingBag size={13} className="text-gold" />
                <span>{items.length} service{items.length !== 1 ? 's' : ''}</span>
                <span className="text-gold font-black">₹{total.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="flex items-center gap-3 ml-auto">
              {step > (isOnlineFlow ? 1 : 0) && (
                <button onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/8 border border-white/10 rounded-xl text-xs font-bold text-gray-300 hover:bg-white/10 transition-all">
                  <ArrowLeft size={13} /> Back
                </button>
              )}

              {/* Next / Generate */}
              {step < 2 ? (
                <button
                  disabled={step === 1 && !canProceedFromServices}
                  onClick={() => setStep(s => s + 1)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#F0D060] rounded-xl text-black font-black text-xs uppercase tracking-wider disabled:opacity-40 disabled:grayscale transition-all"
                >
                  Continue →
                </button>
              ) : (
                <button
                  onClick={handleGenerateInvoice}
                  disabled={saving || !canProceedFromPayment}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#F0D060] rounded-xl text-black font-black text-xs uppercase tracking-wider disabled:opacity-40 disabled:grayscale transition-all"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Receipt size={13} />}
                  Generate Invoice
                </button>
              )}
            </div>
          </div>
        )}

        {saveError && (
          <div className="px-7 pb-4 shrink-0">
            <p className="flex items-center gap-2 text-red-400 text-xs font-bold">
              <AlertCircle size={12} /> {saveError}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

