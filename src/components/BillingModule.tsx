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
  Search, UserPlus, X, Plus, Minus,
  Receipt, CreditCard, Banknote, Smartphone, CheckCircle2,
  Loader2, AlertCircle, User, Phone, Users,
  ArrowLeft, Printer, Star, Wallet, Tag, Crown, Calendar, Edit2,
} from 'lucide-react';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp, Timestamp,
  limit,
} from 'firebase/firestore';
import { startOfDay, addDays } from 'date-fns';
import { db } from '../lib/firebase';
import { servicesData, Service } from '../constants/services';
import { useLanguage } from '../lib/LanguageContext';
import { getServiceImage } from '../lib/serviceImages';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Customer {
  phone: string;         // document ID
  name: string;
  visitCount: number;
  totalSpend: number;
  firstVisit: string;    // ISO
  lastVisit: string;     // ISO
  notes?: string;
  /** Unused credit balance carried forward from over-payments (e.g. no change available) */
  advanceBalance?: number;
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

export interface StaffCommissionSplit {
  staffId: string;
  staffName: string;
  splitPercent: number;    // share of the base commission, all splits sum to 100
  commissionAmount: number;
}

export interface BillItem {
  serviceId: string;
  serviceName: string;
  unitPrice: number;    // price per 1 unit
  quantity: number;     // default 1
  lineDiscount: number; // per-item discount % (default 0)
  price: number;        // line total = unitPrice × qty × (1 - lineDiscount/100)
  staffId: string;      // primary staff (first in splits, or single staff for backward compat)
  staffName: string;
  commissionRate: number;
  commissionAmount: number; // total commission for the line item
  staffSplits?: StaffCommissionSplit[]; // when multiple staff share a service
}

export type PaymentMethod =
  | 'online'    // Razorpay — already paid
  | 'cash'
  | 'upi'
  | 'card'
  | 'gpay'
  | 'phonepe'
  | 'paytm';

/** One entry in a split-payment bill */
export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
  ref?: string;       // optional UPI/card reference
  isAdvance?: boolean; // true when this split was pre-collected at walk-in booking time
}

export interface Invoice {
  id?: string;
  invoiceNumber: string;
  customerPhone: string;
  customerName: string;
  bookingId?: string;
  items: BillItem[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  /** Primary method (first split) — kept for backward compat */
  paymentMethod: PaymentMethod;
  paymentId?: string;
  /** Split payment entries */
  paymentSplits: PaymentSplit[];
  /** Total actually collected (sum of splits) */
  amountPaid: number;
  /** Unpaid balance the customer owes later */
  amountDue: number;
  /** Difference between total and amountPaid written off as round-off (not a payment line item) */
  roundOffAmount?: number;
  /** Amount from previous due invoices settled in this bill */
  dueSettlementAmount?: number;
  /** Over-payment on this bill saved as a credit for the customer's next visit */
  advanceAmount?: number;
  /** Previously-saved advance credit applied to reduce this bill's total */
  advanceSettlementAmount?: number;
  status: 'paid' | 'due';
  source: 'walkin' | 'online';
  /** VIP tier — defaults to 'standard' when absent */
  billingType?: 'standard' | 'vvip';
  /** Promo lottery coupon codes — 1 per ₹1000 spent */
  promoCoupons?: string[];
  createdAt?: Timestamp;
}

// Pre-populated from an online booking to skip customer/service steps
export interface OnlineBookingPrefill {
  bookingId: string;
  customerName: string;
  customerPhone: string;
  serviceNames: string;        // comma-separated (display only; use serviceItems for billing when available)
  serviceItems?: Array<{ id: string; name: string; qty: number; priceValue: number }>;
  totalAmount: number;
  paymentId?: string;
  bookingTime?: string;
  paymentMethod?: string;      // e.g. 'pay_at_salon' — full amount due at counter
  advanceAmount?: number;      // advance collected at walk-in booking time
  advancePaymentMethod?: string; // how the advance was paid (cash/upi/card)
  bookingSource?: string;      // 'walk_in' keeps source as walkin even when prefilled
}

interface BillingModuleProps {
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

// 'YYYY-MM-DD' in local time — for <input type="date"> values
function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Combine a 'YYYY-MM-DD' date with the current time-of-day
function billingDateToTimestamp(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const now = new Date();
  return new Date(y, (m ?? 1) - 1, d ?? 1, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Step indicator
function Steps({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => (
        <React.Fragment key={i}>
          <div className="flex items-center gap-1.5">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
              i < current    ? 'bg-emerald-500 text-white'
              : i === current ? 'bg-gold text-black scale-110 shadow-[0_0_12px_rgba(212,175,55,0.4)]'
              : 'bg-white/8 text-gray-400 border border-white/10'
            }`}>
              {i < current ? <CheckCircle2 size={13} /> : i + 1}
            </div>
            <span className={`text-xs font-black uppercase tracking-wider ${
              i === current ? 'text-gold' : i < current ? 'text-emerald-400' : 'text-gray-500'
            }`}>{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-4 sm:w-8 h-[1px] mx-1 ${i < current ? 'bg-emerald-500/50' : 'bg-white/8'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// Customer search + create — with live suggestions from local customer list
function CustomerStep({
  onSelect, onBookingFound, layout = 'compact',
}: {
  onSelect: (customer: Customer, isNew: boolean) => void;
  onBookingFound?: (prefill: OnlineBookingPrefill) => void;
  /** 'compact' = modal interior; 'page' = full-screen spacious */
  layout?: 'compact' | 'page';
}) {
  const [phone,        setPhone]        = useState('');
  const [name,         setName]         = useState('');
  const [found,        setFound]        = useState<Customer | null | 'not-found'>(null);
  const [searching,    setSearching]    = useState(false);
  const [creating,     setCreating]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [suggestions,  setSuggestions]  = useState<Customer[]>([]);
  const [showDrop,     setShowDrop]     = useState(false);
  const [dropPos,      setDropPos]      = useState<{ top: number; left: number; width: number } | null>(null);
  const [outstandingDue, setOutstandingDue] = useState(0);
  const inputRef   = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch outstanding dues whenever a customer is found
  useEffect(() => {
    if (!found || found === 'not-found') { setOutstandingDue(0); return; }
    getDocs(query(
      collection(db, 'invoices'),
      where('customerPhone', '==', (found as Customer).phone),
      where('status', '==', 'due')
    )).then(snap => {
      const total = snap.docs.reduce((a, d) => a + (d.data().amountDue ?? 0), 0);
      setOutstandingDue(total);
    }).catch(() => setOutstandingDue(0));
  }, [found]);

  // Focus the search input on mount
  useEffect(() => {
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

  // Live suggestions via Firestore prefix search after 3+ chars (debounced)
  // — avoids loading the entire customer list (3000+ docs) up front.
  useEffect(() => {
    const raw    = phone.trim();
    const digits = raw.replace(/\D/g, '');
    if (raw.length < 3) { setSuggestions([]); setShowDrop(false); return; }
    if (found && found !== 'not-found') return;

    const t = setTimeout(async () => {
      try {
        let results: Customer[] = [];
        if (digits.length >= 3) {
          // Prefix search on phone number (doc ID is the normalised phone)
          const snap = await getDocs(query(
            collection(db, 'customers'),
            orderBy('phone'),
            where('phone', '>=', digits),
            where('phone', '<', digits + ''),
            limit(8)
          ));
          results = snap.docs.map(d => ({ ...d.data(), phone: d.id } as Customer));
        } else {
          // Prefix search on name — try as typed and with first-letter case toggled
          const variants = new Set([
            raw,
            raw.charAt(0).toUpperCase() + raw.slice(1),
            raw.charAt(0).toLowerCase() + raw.slice(1),
          ]);
          const snaps = await Promise.all(
            Array.from(variants).map(v => getDocs(query(
              collection(db, 'customers'),
              orderBy('name'),
              where('name', '>=', v),
              where('name', '<', v + ''),
              limit(8)
            )))
          );
          const seen = new Set<string>();
          snaps.forEach(snap => snap.docs.forEach(d => {
            if (seen.has(d.id)) return;
            seen.add(d.id);
            results.push({ ...d.data(), phone: d.id } as Customer);
          }));
        }
        results = results.slice(0, 8);
        setSuggestions(results);
        setShowDrop(results.length > 0);
      } catch {
        setSuggestions([]);
        setShowDrop(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [phone, found]);

  // Resolve customer once 10 digits are present.
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

  // Check if this customer has a confirmed/paid booking today → auto-prefill billing
  const selectAndCheckBooking = async (c: Customer, isNew: boolean) => {
    onSelect(c, isNew);
    if (!onBookingFound) return;
    const digits = c.phone.replace(/\D/g, '').slice(-10);
    const todayStart = startOfDay(new Date()).toISOString();
    const tomorrowStart = startOfDay(addDays(new Date(), 1)).toISOString();
    try {
      const variants = [digits, `+91${digits}`, `+91 ${digits}`, `91${digits}`, `0${digits}`];
      const snaps = await Promise.all(variants.map(fmt =>
        getDocs(query(
          collection(db, 'bookings'),
          where('customerPhone', '==', fmt),
          where('startTime', '>=', todayStart),
          where('startTime', '<', tomorrowStart),
        ))
      ));
      const allDocs = snaps.flatMap(s => s.docs);
      const match = allDocs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .find(b => ['paid', 'confirmed', 'completed'].includes(b.status) && !b.invoiceId);
      if (match) {
        onBookingFound({
          bookingId:            match.id,
          customerName:         match.customerName ?? c.name,
          customerPhone:        digits,
          serviceNames:         match.serviceNames ?? '',
          serviceItems:         match.serviceItems,
          totalAmount:          match.totalAmount ?? 0,
          paymentId:            match.paymentId,
          bookingTime:          match.bookingTime,
          paymentMethod:        match.paymentMethod,
          advanceAmount:        match.advanceAmount,
          advancePaymentMethod: match.advancePaymentMethod,
          bookingSource:        match.bookingSource,
        });
      }
    } catch {}
  };

  // Clicking a dropdown suggestion auto-advances — no extra "Select" click needed
  const pickSuggestion = (c: Customer) => {
    setShowDrop(false);
    setSuggestions([]);
    selectAndCheckBooking(c, false);
  };

  const handleCreate = async () => {
    const clean = normalisePhone(phone);
    if (!name.trim()) { setError('Enter customer name.'); return; }
    setCreating(true); setError(null);
    try {
      const now = new Date().toISOString();
      const customer: Customer = { phone: clean, name: name.trim(), visitCount: 0, totalSpend: 0, firstVisit: now, lastVisit: now };
      await setDoc(doc(db, 'customers', clean), customer);
      selectAndCheckBooking(customer, true);
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const { t } = useLanguage();

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-white font-black text-xl mb-1">{t('customer')}</h3>
        <p className="text-gray-400 text-sm">{t('phoneHint')}</p>
      </div>

      <div ref={wrapperRef} className="relative">
        <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          placeholder={t('searchCustomer')}
          value={phone}
          onChange={e => { setPhone(e.target.value); setFound(null); }}
          onFocus={() => suggestions.length > 0 && setShowDrop(true)}
          className="w-full bg-white/8 border border-white/10 rounded-2xl py-4 pl-12 pr-10 text-white text-base focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
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
                    <span className="text-[11px] text-amber-400 font-black shrink-0">{c.visitCount} visit{c.visitCount !== 1 ? 's' : ''}</span>
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
                  {(found.name || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-bold">{found.name || '—'}</p>
                  <p className="text-gray-400 text-xs">{found.phone}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-emerald-400 font-black uppercase">{found.visitCount ?? 0} visits</span>
                    <span className="text-[11px] text-gray-500">·</span>
                    <span className="text-[11px] text-gray-400">₹{(found.totalSpend ?? 0).toLocaleString('en-IN')} total spend</span>
                    {(found.visitCount ?? 0) > 0 && (
                      <span className="flex items-center gap-0.5 text-[11px] text-amber-400 font-black">
                        <Star size={8} className="fill-current" /> Returning
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => selectAndCheckBooking(found as Customer, false)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-black font-black text-xs uppercase tracking-wider transition-all"
              >
                Select →
              </button>
            </div>
            {/* Outstanding due alert — shown for returning customers with unpaid balance */}
            {outstandingDue > 0 && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-start gap-2.5 p-3 bg-red-500/10 border border-red-500/30 rounded-xl"
              >
                <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-400 text-sm font-black leading-none">
                    ⚠ Outstanding Due: ₹{outstandingDue.toLocaleString('en-IN')}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Unpaid balance from a previous visit. Remind the customer to settle this.
                  </p>
                </div>
              </motion.div>
            )}
            {/* Advance credit alert — shown for customers with unused over-payment credit */}
            {(found.advanceBalance ?? 0) > 0 && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-start gap-2.5 p-3 bg-sky-500/10 border border-sky-500/30 rounded-xl"
              >
                <Wallet size={15} className="text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sky-400 text-sm font-black leading-none">
                    Advance Available: ₹{(found.advanceBalance ?? 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Credit from a previous over-payment — can be applied to this bill.
                  </p>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Not found — create new */}
        {found === 'not-found' && (
          <motion.div key="notfound" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-5 bg-white/8 border border-white/10 rounded-2xl space-y-4"
          >
            <div className="flex items-center gap-2 text-amber-400">
              <UserPlus size={16} />
              <p className="text-sm font-bold">{t('noCustomerFound')} — {t('addNewCustomer')}</p>
            </div>
            <div className="relative">
              <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t('customerName')}
                value={name}
                onChange={e => { setName(e.target.value); setError(null); }}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
                className="w-full bg-white/8 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-base focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              className="w-full py-4 bg-gold/10 border border-gold/30 rounded-2xl text-gold font-black text-base hover:bg-gold/20 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              {t('createAndContinue')}
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

// ─── Quick-add service form (used inside ServiceStep) ────────────────────────

interface QuickAddForm { name: string; category: string; newCatName: string; priceValue: number; time: string; }
const QUICK_BLANK: QuickAddForm = { name: '', category: '', newCatName: '', priceValue: 0, time: '30 min' };

async function saveQuickService(
  form: QuickAddForm,
  onSaved: (svc: Service) => void,
  setSaving: (v: boolean) => void,
  setError: (v: string) => void,
) {
  const name     = form.name.trim();
  const category = (form.newCatName.trim() || form.category.trim());
  if (!name)                { setError('Service name is required.'); return; }
  if (!category)            { setError('Category is required.'); return; }
  if (form.priceValue <= 0) { setError('Price must be greater than 0.'); return; }
  setSaving(true);
  setError('');
  try {
    const id = `${category.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 14)}-${Date.now().toString(36)}`;
    const data = {
      name,
      price:       `₹${form.priceValue}`,
      priceValue:  Number(form.priceValue),
      time:        form.time.trim() || '30 min',
      category,
      active:      true,
      imageUrl:    '',
      description: '',
      updatedAt:   new Date(),
    };
    await setDoc(doc(db, 'services', id), data, { merge: true });
    onSaved({ id, ...data } as Service);
  } catch (e: any) {
    setError('Failed to save: ' + (e.message ?? 'Unknown error'));
  } finally {
    setSaving(false);
  }
}

// Service catalogue (left panel) — cart items rendered with CartItemRow
function ServiceStep({
  items, onAdd, onRemove, onRemoveLast, onUpdateStaff, onAddStaff, onRemoveStaff, onUpdateSplits, onUpdateQty, onUpdateUnitPrice, onUpdateLineDiscount, staff,
}: {
  items: BillItem[];
  onAdd: (service: Service) => void;
  onRemove: (idx: number) => void;
  onRemoveLast: (serviceId: string) => void;
  onUpdateStaff: (idx: number, staffId: string) => void;
  onAddStaff: (idx: number, staffId: string) => void;
  onRemoveStaff: (idx: number, staffId: string) => void;
  onUpdateSplits: (idx: number, splits: StaffCommissionSplit[]) => void;
  onUpdateQty: (idx: number, qty: number) => void;
  onUpdateUnitPrice: (idx: number, price: number) => void;
  onUpdateLineDiscount: (idx: number, disc: number) => void;
  staff: StaffMember[];
}) {
  const [search,       setSearch]      = useState('');
  const [openCat,      setOpenCat]     = useState<string | null>(null);
  const [firestoreServices, setFirestoreServices] = useState<Service[]>([]);
  const [popularity, setPopularity] = useState<Record<string, number>>({});
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [addForm,      setAddForm]      = useState<QuickAddForm>({ ...QUICK_BLANK });
  const [addSaving,    setAddSaving]    = useState(false);
  const [addError,     setAddError]     = useState('');
  const [applyAllStaff, setApplyAllStaff] = useState('');

  const allCategories_memo = useMemo(
    () => Array.from(new Set(firestoreServices.map(s => s.category))),
    [firestoreServices]
  );

  const handleQuickSave = () => saveQuickService(
    addForm,
    (svc) => {
      setFirestoreServices(prev => [...prev, svc]);
      setShowAddForm(false);
      setAddForm({ ...QUICK_BLANK });
      setSearch(svc.name); // highlight it in the list
      onAdd(svc);          // auto-add to cart
    },
    setAddSaving,
    setAddError,
  );

  // Load services from Firestore (same collection used by Tools → Services tab)
  useEffect(() => {
    getDocs(query(collection(db, 'services'), orderBy('category'), orderBy('name')))
      .then(snap => {
        const valid = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Service))
          .filter(s => (s as any).active !== false && typeof s.priceValue === 'number' && !isNaN(s.priceValue));
        setFirestoreServices(valid);
      })
      .catch(() => {});
  }, []);

  // Load recent invoices to rank services by how often they're picked.
  // Cached in localStorage for a day so this heavy scan only runs once daily.
  useEffect(() => {
    const CACHE_KEY = 'billing_service_popularity_v1';
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { computedAt, counts } = JSON.parse(cached);
        if (Date.now() - computedAt < ONE_DAY_MS) {
          setPopularity(counts);
          return;
        }
      }
    } catch { /* ignore corrupt cache */ }

    getDocs(query(collection(db, 'invoices'), orderBy('createdAt', 'desc'), limit(300)))
      .then(snap => {
        const counts: Record<string, number> = {};
        snap.docs.forEach(d => {
          const items = (d.data().items ?? []) as any[];
          items.forEach(it => {
            const key = it.serviceId || it.serviceName;
            if (!key) return;
            counts[key] = (counts[key] ?? 0) + (it.quantity ?? 1);
          });
        });
        setPopularity(counts);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ computedAt: Date.now(), counts }));
        } catch { /* storage full/unavailable — non-fatal */ }
      })
      .catch(() => {});
  }, []);

  // Load admin-pinned trending services (Tools → Trending)
  useEffect(() => {
    getDoc(doc(db, 'settings', 'trending_services'))
      .then(snap => {
        if (snap.exists()) setPinnedIds((snap.data().serviceIds ?? []) as string[]);
      })
      .catch(() => {});
  }, []);

  // Merge: Firestore services take precedence; static catalogue fills any gaps.
  // Manually pinned services (Tools → Trending) come first in their configured order,
  // then the rest sorted by how frequently each has been picked in recent bills.
  const allServices = useMemo(() => {
    const fsNames = new Set(firestoreServices.map(s => s.name.toLowerCase()));
    const staticOnly = servicesData.filter(s => !fsNames.has(s.name.toLowerCase()));
    const merged = [...firestoreServices, ...staticOnly];

    const byId = new Map(merged.map(s => [s.id, s]));
    const pinned = pinnedIds.map(id => byId.get(id)).filter((s): s is Service => !!s);
    const pinnedSet = new Set(pinned.map(s => s.id));
    const rest = merged.filter(s => !pinnedSet.has(s.id)).sort((a, b) => {
      const pa = popularity[a.id] ?? popularity[a.name] ?? 0;
      const pb = popularity[b.id] ?? popularity[b.name] ?? 0;
      return pb - pa;
    });

    return [...pinned, ...rest];
  }, [firestoreServices, popularity, pinnedIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allServices;
    const q = search.toLowerCase();
    return allServices.filter(s =>
      s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
    );
  }, [search, allServices]);

  const allCategories = useMemo(
    () => Array.from(new Set(allServices.map(s => s.category))),
    [allServices]
  );

  const { t } = useLanguage();
  // Count how many of each service are in the cart (for badge display)
  const serviceCounts = items.reduce((acc, item) => {
    acc[item.serviceId] = (acc[item.serviceId] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const activeStaff     = staff.filter(s => s.isActive);
  const totalCommission = items.reduce((a, i) => a + i.commissionAmount, 0);

  return (
    <div className="space-y-4">

      {/* ── Cart items (CartItemRow per line) ── */}
      {items.length > 0 && (
        <div className="space-y-3">
          {/* Apply one staff member to all services, still editable per-row below */}
          {items.length > 1 && (
            <div className="flex items-center gap-2 bg-zinc-800/40 border border-white/10 rounded-xl px-3 py-2">
              <Users size={13} className="text-gray-400 shrink-0" />
              <select value={applyAllStaff} onChange={e => setApplyAllStaff(e.target.value)}
                className="flex-1 min-w-0 bg-zinc-900 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-gold/40 cursor-pointer"
              >
                <option value="">— Set staff for all services —</option>
                {activeStaff.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.role ? ` · ${s.role}` : ''} · {s.commissionRate}% comm</option>
                ))}
              </select>
              <button
                onClick={() => items.forEach((_, idx) => onUpdateStaff(idx, applyAllStaff))}
                disabled={!applyAllStaff}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-gold/15 border border-gold/30 text-gold text-xs font-black uppercase tracking-wide hover:bg-gold/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply to All
              </button>
            </div>
          )}
          {items.map((item, idx) => (
            <CartItemRow key={idx} item={item} idx={idx} staff={staff}
              onRemove={onRemove} onUpdateQty={onUpdateQty}
              onUpdateUnitPrice={onUpdateUnitPrice} onUpdateLineDiscount={onUpdateLineDiscount}
              onUpdateStaff={onUpdateStaff}
              onAddStaff={onAddStaff} onRemoveStaff={onRemoveStaff} onUpdateSplits={onUpdateSplits}
            />
          ))}
          {totalCommission > 0 && (
            <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total Commission</span>
              <span className="text-emerald-400 font-black text-sm">₹{totalCommission.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Service catalogue: chip filter + flat list ── */}
      <div className="pt-2 space-y-3">
        {/* Search + Add New Service */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="text" placeholder={t('searchServices')} value={search}
              onChange={e => { setSearch(e.target.value); setOpenCat(null); }}
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl py-2.5 pl-9 pr-9 text-white text-sm focus:outline-none focus:border-gold/40 placeholder:text-gray-600"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X size={13} />
              </button>
            )}
          </div>
          <button
            onClick={() => { setShowAddForm(v => !v); setAddError(''); setAddForm({ ...QUICK_BLANK, category: allCategories_memo[0] ?? '' }); }}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
              showAddForm
                ? 'bg-gold/20 border-gold/40 text-gold'
                : 'bg-white/[0.06] border-white/10 text-gray-400 hover:text-gold hover:border-gold/30'
            }`}
          >
            <Plus size={13} /> New
          </button>
        </div>

        {/* Quick-add service form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="bg-zinc-900 border border-gold/20 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-gold flex items-center gap-1.5">
                  <Tag size={10} /> Add New Service
                </p>

                {/* Name */}
                <input
                  autoFocus
                  type="text" placeholder="Service name *"
                  value={addForm.name}
                  onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-white/8 border border-white/12 rounded-xl py-2 px-3 text-white text-sm focus:outline-none focus:border-gold/50 placeholder:text-gray-500 transition-all"
                />

                <div className="grid grid-cols-2 gap-2">
                  {/* Category */}
                  <div className="space-y-1.5">
                    {allCategories_memo.length > 0 && !addForm.newCatName && (
                      <select
                        value={addForm.category}
                        onChange={e => {
                          if (e.target.value === '__new__') setAddForm(p => ({ ...p, newCatName: ' ', category: '' }));
                          else setAddForm(p => ({ ...p, category: e.target.value, newCatName: '' }));
                        }}
                        className="w-full bg-white/8 border border-white/12 rounded-xl py-2 px-3 text-white text-sm focus:outline-none focus:border-gold/50 transition-all"
                      >
                        {allCategories_memo.map(c => <option key={c} value={c} className="bg-zinc-900">{c}</option>)}
                        <option value="__new__" className="bg-zinc-900">＋ New category…</option>
                      </select>
                    )}
                    {(allCategories_memo.length === 0 || addForm.newCatName) && (
                      <input
                        type="text" placeholder="Category *"
                        value={addForm.newCatName.trim() === '' ? addForm.category : addForm.newCatName}
                        onChange={e => {
                          if (addForm.newCatName) setAddForm(p => ({ ...p, newCatName: e.target.value }));
                          else setAddForm(p => ({ ...p, category: e.target.value }));
                        }}
                        className="w-full bg-white/8 border border-gold/30 rounded-xl py-2 px-3 text-white text-sm focus:outline-none focus:border-gold/50 placeholder:text-gray-500 transition-all"
                      />
                    )}
                  </div>

                  {/* Price */}
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">₹</span>
                    <input
                      type="number" min={0} placeholder="Price *"
                      value={addForm.priceValue || ''}
                      onChange={e => setAddForm(p => ({ ...p, priceValue: Number(e.target.value) }))}
                      className="w-full bg-white/8 border border-white/12 rounded-xl py-2 pl-7 pr-3 text-white text-sm focus:outline-none focus:border-gold/50 placeholder:text-gray-500 transition-all"
                    />
                  </div>
                </div>

                {/* Duration */}
                <input
                  type="text" placeholder="Duration (e.g. 30 min)"
                  value={addForm.time}
                  onChange={e => setAddForm(p => ({ ...p, time: e.target.value }))}
                  className="w-full bg-white/8 border border-white/12 rounded-xl py-2 px-3 text-white text-sm focus:outline-none focus:border-gold/50 placeholder:text-gray-500 transition-all"
                />

                {addError && (
                  <p className="text-red-400 text-xs flex items-center gap-1.5"><AlertCircle size={11}/>{addError}</p>
                )}

                <div className="flex gap-2 pt-1 border-t border-white/10">
                  <button
                    onClick={handleQuickSave} disabled={addSaving}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gold/15 border border-gold/30 rounded-xl text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/25 transition-all disabled:opacity-50"
                  >
                    {addSaving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                    Add &amp; Bill
                  </button>
                  <button
                    onClick={() => { setShowAddForm(false); setAddError(''); }}
                    className="px-4 py-2 rounded-xl text-gray-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category chips — horizontal scroll */}
        {!search && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button onClick={() => setOpenCat(null)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                openCat === null ? 'bg-gold text-black' : 'bg-white/[0.06] text-gray-400 hover:text-white'
              }`}>
              All
            </button>
            {allCategories.map(cat => (
              <button key={cat} onClick={() => setOpenCat(openCat === cat ? null : cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  openCat === cat ? 'bg-gold text-black' : 'bg-white/[0.06] text-gray-400 hover:text-white'
                }`}>
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Service card grid */}
        <div className="max-h-[52vh] overflow-y-auto scrollbar-hide">
          {(() => {
            const visibleServices = search
              ? filtered
              : openCat
                ? allServices.filter(s => s.category === openCat)
                : allServices;
            if (visibleServices.length === 0) return (
              <div className="text-center py-8 space-y-2">
                <p className="text-gray-500 text-sm">No services found</p>
                <button onClick={() => { setShowAddForm(true); setAddForm(p => ({ ...p, name: search })); }}
                  className="text-gold text-xs font-bold hover:underline flex items-center gap-1 mx-auto">
                  <Plus size={11}/> Add "{search}" as a new service
                </button>
              </div>
            );
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-2">
                {visibleServices.map(service => {
                  const count = serviceCounts[service.id] ?? 0;
                  const imgSrc = getServiceImage(service.name, service.category, (service as any).imageUrl);
                  return (
                    <div key={service.id}
                      className={`flex flex-col rounded-2xl border overflow-hidden transition-all ${
                        count > 0
                          ? 'border-gold/40 shadow-[0_0_12px_-4px_rgba(212,175,55,0.3)]'
                          : 'border-white/10 hover:border-white/20'
                      } bg-zinc-900`}
                    >
                      {/* Image area — same pattern as ServiceManager */}
                      <div className="relative h-20 bg-gradient-to-br from-zinc-800 to-zinc-950 overflow-hidden">
                        <img
                          src={imgSrc}
                          alt={service.name}
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                        {count > 0 && (
                          <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-gold text-black text-[11px] font-black flex items-center justify-center z-10">
                            {count}
                          </span>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex flex-col flex-1 p-2.5 gap-2">
                        <div className="flex-1 min-h-0">
                          <p className={`text-xs font-bold leading-snug line-clamp-2 ${count > 0 ? 'text-gold' : 'text-gray-100'}`}>
                            {service.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{service.price} · {service.time}</p>
                        </div>

                        {/* Qty counter */}
                        {count === 0 ? (
                          <button onClick={() => onAdd(service)}
                            className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg bg-gold/15 border border-gold/30 text-gold text-xs font-black hover:bg-gold/25 transition-all">
                            <Plus size={11} /> Add
                          </button>
                        ) : (
                          <div className="flex items-center justify-between bg-white/[0.06] border border-white/10 rounded-lg px-1 py-1">
                            <button onClick={() => onRemoveLast(service.id)}
                              className="w-6 h-6 rounded-md text-gray-400 hover:bg-red-500/15 hover:text-red-400 flex items-center justify-center transition-all">
                              <Minus size={11} />
                            </button>
                            <span className="text-gold font-black text-xs">{count}</span>
                            <button onClick={() => onAdd(service)}
                              className="w-6 h-6 rounded-md bg-gold/25 text-gold hover:bg-gold/40 flex items-center justify-center transition-all">
                              <Plus size={11} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* ── New service hint ── */}
        <p className="text-center text-xs text-gray-600 pt-1">
          Service missing? Add it via <span className="text-gray-400 font-bold">Tools → Services</span>
        </p>
      </div>
    </div>
  );
}

// Split payment step — supports multiple payment methods + due tracking
function SplitPaymentStep({
  subtotal, discountPercent, onDiscountChange,
  splits, onSplitsChange, amountDue, onDueChange,
  isOnline, alreadyPaidAmount = 0, isPayAtSalon = false,
}: {
  subtotal: number;
  discountPercent: number;
  onDiscountChange: (v: number) => void;
  splits: PaymentSplit[];
  onSplitsChange: (s: PaymentSplit[]) => void;
  amountDue: number;
  onDueChange: (v: number) => void;
  isOnline: boolean;
  alreadyPaidAmount?: number;
  isPayAtSalon?: boolean;
}) {
  const { t } = useLanguage();
  const discountAmt     = Math.round(subtotal * discountPercent / 100);
  const total           = subtotal - discountAmt;
  // How much still needs to be covered by splits + due (after online pre-payment)
  const remainingToCover = Math.max(0, total - alreadyPaidAmount);
  const splitTotal      = splits.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const unaccounted     = Math.round((remainingToCover - splitTotal - amountDue) * 100) / 100;
  const isBalanced      = Math.abs(unaccounted) < 1;

  const addSplit = () => onSplitsChange([...splits, { method: 'cash', amount: 0 }]);
  const removeSplit = (i: number) => onSplitsChange(splits.filter((_, idx) => idx !== i));
  const updateSplit = (i: number, patch: Partial<PaymentSplit>) =>
    onSplitsChange(splits.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  const markAsDue = () => { onDueChange(Math.round(unaccounted)); };
  const clearDue  = () => { onDueChange(0); };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-white font-black text-xl mb-1">{t('payment')}</h3>
        <p className="text-gray-500 text-sm">Add one or more payment entries. Remaining can be marked as Due.</p>
      </div>

      {/* Pay-at-salon notice */}
      {isOnline && isPayAtSalon && alreadyPaidAmount === 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
          <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300 text-sm font-bold leading-relaxed">
            Pay at Salon booking — collect full payment now.
          </p>
        </div>
      )}

      {/* Bill summary + discount */}
      <div className="bg-white/8 border border-white/12 rounded-2xl p-5 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">{t('subtotal')}</span>
          <span className="text-white font-bold">₹{subtotal.toLocaleString('en-IN')}</span>
        </div>
        {!isOnline && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">{t('discount')}</span>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={100} value={discountPercent}
                onChange={e => onDiscountChange(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-14 bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-gold/40"
              />
              <span className="text-gray-500 text-sm">%</span>
              {discountAmt > 0 && <span className="text-red-400 text-sm font-bold">-₹{discountAmt.toLocaleString('en-IN')}</span>}
            </div>
          </div>
        )}
        <div className="pt-3 border-t border-white/10 flex justify-between items-center">
          <span className="text-white font-black text-lg">{t('total')}</span>
          <span className="text-gold text-3xl font-black">₹{total.toLocaleString('en-IN')}</span>
        </div>
        {alreadyPaidAmount > 0 && (
          <div className="flex justify-between text-sm text-emerald-400 pt-1 border-t border-white/8">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={13} /> Paid via Razorpay</span>
            <span className="font-bold">-₹{alreadyPaidAmount.toLocaleString('en-IN')}</span>
          </div>
        )}
        {alreadyPaidAmount > 0 && (
          <div className="flex justify-between font-black text-base">
            <span className="text-gray-400">Balance to collect</span>
            <span className="text-amber-400">₹{remainingToCover.toLocaleString('en-IN')}</span>
          </div>
        )}
      </div>

      {/* Split payment entries */}
      {(!isOnline || remainingToCover > 0) && (
        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">
            {t('paymentMethod')}
          </p>

          {splits.map((split, i) => (
            <div key={i} className="flex items-center gap-2">
              {/* Method picker */}
              <select
                value={split.method}
                onChange={e => updateSplit(i, { method: e.target.value as PaymentMethod })}
                className="bg-zinc-900 border border-white/12 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-gold/50 transition-all shrink-0"
              >
                {PAYMENT_METHODS.filter(m => m.id !== 'online').map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>

              {/* Amount */}
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base font-bold">₹</span>
                <input
                  type="number" min={0} inputMode="numeric"
                  placeholder="0"
                  value={split.amount || ''}
                  onChange={e => updateSplit(i, { amount: Math.max(0, Number(e.target.value)) })}
                  className="w-full bg-zinc-900 border border-white/12 rounded-xl py-3 pl-8 pr-4 text-white text-base font-black focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-600"
                />
              </div>

              {/* Delete — only if more than one entry */}
              {splits.length > 1 && (
                <button onClick={() => removeSplit(i)}
                  className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 flex items-center justify-center shrink-0 transition-all">
                  <X size={15} />
                </button>
              )}
            </div>
          ))}

          {/* Add split button */}
          <button onClick={addSplit}
            className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-white/20 rounded-xl text-gray-400 hover:text-white hover:border-white/35 text-sm font-bold transition-all">
            <Plus size={15} /> Add another payment
          </button>
        </div>
      )}

      {/* Running total + due controls */}
      {(!isOnline || remainingToCover > 0) && (
        <div className={`rounded-2xl border p-4 space-y-3 ${
          isBalanced ? 'bg-emerald-500/8 border-emerald-500/25' :
          unaccounted < 0 ? 'bg-red-500/8 border-red-500/25' :
          'bg-amber-500/8 border-amber-500/25'
        }`}>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Collected</span>
            <span className="text-white font-black">₹{splitTotal.toLocaleString('en-IN')}</span>
          </div>
          {amountDue > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-amber-400 flex items-center gap-1.5">
                <AlertCircle size={12} /> Marked as Due
              </span>
              <span className="text-amber-400 font-black">₹{amountDue.toLocaleString('en-IN')}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-black border-t border-white/10 pt-2">
            <span className={isBalanced ? 'text-emerald-400' : unaccounted < 0 ? 'text-red-400' : 'text-amber-400'}>
              {isBalanced ? '✓ Balanced' : unaccounted < 0 ? `Over by ₹${Math.abs(unaccounted).toLocaleString('en-IN')}` : `₹${unaccounted.toLocaleString('en-IN')} unaccounted`}
            </span>
            {!isBalanced && unaccounted > 0 && (
              <div className="flex gap-2">
                {amountDue > 0 && (
                  <button onClick={clearDue}
                    className="text-xs px-3 py-1 rounded-lg bg-white/8 border border-white/12 text-gray-300 hover:text-white transition-all">
                    Clear Due
                  </button>
                )}
                <button onClick={markAsDue}
                  className="text-xs px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 transition-all font-black">
                  Mark ₹{unaccounted.toLocaleString('en-IN')} as Due
                </button>
              </div>
            )}
            {amountDue > 0 && isBalanced && (
              <button onClick={clearDue}
                className="text-xs px-3 py-1 rounded-lg bg-white/8 border border-white/12 text-gray-400 hover:text-white transition-all">
                Clear Due
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Commission Split Editor (inline panel inside CartItemRow) ────────────────

function CommissionSplitEditor({ splits, totalCommission, onUpdate, onClose }: {
  splits: StaffCommissionSplit[];
  totalCommission: number;
  onUpdate: (splits: StaffCommissionSplit[]) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState(() => splits.map(s => ({ ...s })));
  const sumPct = local.reduce((a, s) => a + s.splitPercent, 0);
  const isValid = sumPct === 100;

  const handlePctChange = (i: number, val: number) => {
    setLocal(prev => prev.map((s, si) => si !== i ? s : {
      ...s,
      splitPercent: Math.max(0, Math.min(100, val)),
      commissionAmount: Math.round(totalCommission * Math.max(0, Math.min(100, val)) / 100),
    }));
  };

  const save = () => {
    if (!isValid) return;
    onUpdate(local);
    onClose();
  };

  return (
    <div className="bg-zinc-900 border border-gold/20 rounded-xl p-3 space-y-2.5">
      <p className="text-xs font-black uppercase tracking-widest text-gold">Commission Split — ₹{totalCommission.toLocaleString('en-IN')} total</p>
      {local.map((s, i) => (
        <div key={s.staffId} className="flex items-center gap-2">
          <span className="flex-1 text-xs text-white truncate">{s.staffName}</span>
          <div className="flex items-center gap-1 bg-zinc-800 border border-white/10 rounded-lg px-2 py-1">
            <input type="number" min={0} max={100} value={s.splitPercent}
              onChange={e => handlePctChange(i, Number(e.target.value))}
              className="w-10 bg-transparent text-xs text-white text-right focus:outline-none"
            />
            <span className="text-gray-500 text-xs">%</span>
          </div>
          <span className="text-emerald-400 text-xs font-bold w-16 text-right">
            ₹{Math.round(totalCommission * s.splitPercent / 100).toLocaleString('en-IN')}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1 border-t border-white/8">
        <span className={`text-xs font-bold ${isValid ? 'text-emerald-400' : 'text-red-400'}`}>
          Total: {sumPct}% {!isValid && '(must be 100%)'}
        </span>
        <div className="flex gap-2">
          <button onClick={onClose} className="text-gray-500 text-xs font-bold hover:text-white">Cancel</button>
          <button onClick={save} disabled={!isValid}
            className="px-3 py-1 rounded-lg bg-gold/20 border border-gold/30 text-gold text-xs font-black disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cart Item Row ────────────────────────────────────────────────────────────

function CartItemRow({ item, idx, staff, onRemove, onUpdateQty, onUpdateUnitPrice, onUpdateLineDiscount, onUpdateStaff, onAddStaff, onRemoveStaff, onUpdateSplits }: {
  item: BillItem;
  idx: number;
  staff: StaffMember[];
  onRemove: (idx: number) => void;
  onUpdateQty: (idx: number, qty: number) => void;
  onUpdateUnitPrice: (idx: number, price: number) => void;
  onUpdateLineDiscount: (idx: number, disc: number) => void;
  onUpdateStaff: (idx: number, staffId: string) => void;
  onAddStaff: (idx: number, staffId: string) => void;
  onRemoveStaff: (idx: number, staffId: string) => void;
  onUpdateSplits: (idx: number, splits: StaffCommissionSplit[]) => void;
}) {
  const activeStaff = staff.filter(s => s.isActive);
  const qty      = item.quantity     ?? 1;
  const unitPx   = item.unitPrice    ?? item.price;
  const lineDisc = item.lineDiscount ?? 0;
  const splits   = item.staffSplits ?? [];
  const isMulti  = splits.length > 1;
  const [showSplitEditor, setShowSplitEditor] = useState(false);
  const [dropdownOpen, setDropdownOpen]       = useState(false);
  const [staffQuery, setStaffQuery]           = useState('');
  const assignedIds = new Set(isMulti ? splits.map(s => s.staffId) : (item.staffId ? [item.staffId] : []));
  const dropdownRef = useRef<HTMLDivElement>(null);
  const staffInputRef = useRef<HTMLInputElement>(null);

  const filteredStaff = staffQuery.trim()
    ? activeStaff.filter(s => s.name.toLowerCase().includes(staffQuery.toLowerCase()))
    : activeStaff;

  useEffect(() => {
    if (!dropdownOpen) { setStaffQuery(''); return; }
    setTimeout(() => staffInputRef.current?.focus(), 50);
    const handler = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  return (
    <div className="bg-zinc-800/60 border border-white/12 rounded-2xl p-3.5 space-y-3">
      {/* Row 1: name · price · delete */}
      <div className="flex items-start gap-2">
        <p className="flex-1 text-white font-semibold text-base leading-snug">{item.serviceName}</p>
        <span className="text-white font-black text-base shrink-0">₹{item.price.toLocaleString('en-IN')}</span>
        <button onClick={() => onRemove(idx)}
          className="w-6 h-6 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-all shrink-0 -mt-0.5">
          <X size={11} />
        </button>
      </div>

      {/* Row 2: qty · unit price · discount · commission */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Qty stepper */}
        <div className="flex items-center gap-0.5 bg-zinc-900 border border-white/12 rounded-lg px-1.5 py-1">
          <button onClick={() => onUpdateQty(idx, qty - 1)}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <Minus size={10} />
          </button>
          <span className="px-2 text-white font-black text-sm min-w-[1.5rem] text-center">{qty}</span>
          <button onClick={() => onUpdateQty(idx, qty + 1)}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <Plus size={10} />
          </button>
        </div>

        {/* Unit price */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-white/12 rounded-lg px-2 py-1.5">
          <span className="text-gray-500 text-sm">₹</span>
          <input type="number" min={0} value={unitPx}
            onChange={e => onUpdateUnitPrice(idx, Number(e.target.value))}
            className="w-16 bg-transparent text-sm text-gray-200 text-right focus:outline-none focus:text-white transition-colors"
          />
        </div>

        {/* Discount */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-white/12 rounded-lg px-2 py-1.5">
          <input type="number" min={0} max={100} value={lineDisc}
            onChange={e => onUpdateLineDiscount(idx, Number(e.target.value))}
            className="w-10 bg-transparent text-sm text-gray-200 text-right focus:outline-none focus:text-white transition-colors"
          />
          <span className="text-gray-500 text-sm">%</span>
        </div>

        {item.commissionAmount > 0 && (
          <span className="ml-auto text-xs text-emerald-400 font-bold bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-2.5 py-1 shrink-0">
            comm ₹{item.commissionAmount.toLocaleString('en-IN')}
          </span>
        )}
      </div>

      {/* Row 3: staff multi-select dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full bg-zinc-900 border border-white/25 rounded-xl px-3 py-2.5 text-left text-sm text-white focus:outline-none focus:border-gold/50 cursor-pointer flex items-center gap-2"
        >
          {assignedIds.size === 0 ? (
            <span className="text-gray-500">— Assign staff (optional) —</span>
          ) : (
            <span className="flex-1 flex flex-wrap gap-1">
              {(isMulti ? splits : (item.staffId ? [{ staffId: item.staffId, staffName: item.staffName, splitPercent: 100, commissionAmount: item.commissionAmount }] : [])).map(s => (
                <span key={s.staffId} className="inline-flex items-center gap-1 bg-white/10 rounded-md px-1.5 py-0.5 text-xs">
                  {s.staffName}{isMulti && <span className="text-gold font-bold">{s.splitPercent}%</span>}
                </span>
              ))}
            </span>
          )}
          <Users size={14} className="text-gray-400 shrink-0" />
        </button>

        {dropdownOpen && (
          <div className="absolute z-20 mt-1 w-full bg-zinc-900 border border-white/20 rounded-xl shadow-xl overflow-hidden">
            <div className="px-2.5 pt-2.5 pb-1.5">
              <input
                ref={staffInputRef}
                type="text"
                value={staffQuery}
                onChange={e => setStaffQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && filteredStaff.length === 1) {
                    const s = filteredStaff[0];
                    if (!assignedIds.has(s.id)) {
                      if (assignedIds.size === 0) onUpdateStaff(idx, s.id);
                      else onAddStaff(idx, s.id);
                    }
                    setStaffQuery('');
                    setDropdownOpen(false);
                  }
                }}
                placeholder="Type staff name…"
                className="w-full bg-zinc-800 border border-white/15 rounded-lg px-2.5 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-gold/40"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredStaff.length === 0 ? (
                <p className="px-3 py-3 text-gray-500 text-xs text-center">No staff found</p>
              ) : filteredStaff.map(s => {
                const selected = assignedIds.has(s.id);
                return (
                  <button key={s.id}
                    onClick={() => {
                      if (selected) {
                        onRemoveStaff(idx, s.id);
                      } else {
                        if (assignedIds.size === 0) { onUpdateStaff(idx, s.id); }
                        else { onAddStaff(idx, s.id); }
                      }
                      setStaffQuery('');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-white/8 transition-colors ${selected ? 'bg-gold/8' : ''}`}
                  >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selected ? 'border-gold bg-gold' : 'border-white/25'}`}>
                      {selected && <CheckCircle2 size={10} className="text-black" />}
                    </span>
                    <span className="flex-1 text-white truncate">{s.name}{s.role ? <span className="text-gray-500"> · {s.role}</span> : ''}</span>
                    <span className="text-gray-500 text-xs font-bold">{s.commissionRate}%</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Selected staff tags + edit commission (multi-staff mode) */}
      {isMulti && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowSplitEditor(!showSplitEditor)}
            className="flex items-center gap-1.5 text-xs font-bold text-gold hover:text-yellow-300"
          >
            <Edit2 size={10} /> Edit Commission Split
          </button>
        </div>
      )}

      {/* Inline commission split editor */}
      {showSplitEditor && isMulti && (
        <CommissionSplitEditor
          splits={splits}
          totalCommission={item.commissionAmount}
          onUpdate={newSplits => onUpdateSplits(idx, newSplits)}
          onClose={() => setShowSplitEditor(false)}
        />
      )}
    </div>
  );
}

// ─── Summary Panel (right side, step 1) ──────────────────────────────────────

function SummaryPanel({ subtotal, discountPercent, onDiscountChange, total, itemCount, onContinue, dueSettlementAmount = 0, advanceSettlementAmount = 0 }: {
  subtotal: number;
  discountPercent: number;
  onDiscountChange: (v: number) => void;
  total: number;
  itemCount: number;
  onContinue: () => void;
  dueSettlementAmount?: number;
  advanceSettlementAmount?: number;
}) {
  const { t } = useLanguage();
  const discAmt = Math.round(subtotal * discountPercent / 100);
  return (
    <div className="flex flex-col h-full p-4 sm:p-6 gap-4 sm:gap-5">
      <p className="text-xs font-black uppercase tracking-widest text-gray-400">Payment Details</p>

      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Item sub-total</span>
          <span className="text-white font-bold">₹{subtotal.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-sm">Additional discount</span>
          <div className="flex items-center gap-1.5">
            <input type="number" min={0} max={100} value={discountPercent}
              onChange={e => onDiscountChange(Math.min(100, Math.max(0, Number(e.target.value))))}
              className="w-14 bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-gold/40"
            />
            <span className="text-gray-500 text-xs">%</span>
            {discAmt > 0 && <span className="text-red-400 text-xs font-bold shrink-0">-₹{discAmt.toLocaleString('en-IN')}</span>}
          </div>
        </div>
        {dueSettlementAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-amber-400 flex items-center gap-1"><AlertCircle size={11} /> Previous Dues</span>
            <span className="text-amber-400 font-bold">+₹{dueSettlementAmount.toLocaleString('en-IN')}</span>
          </div>
        )}
        {advanceSettlementAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-sky-400 flex items-center gap-1"><CheckCircle2 size={11} /> Advance Applied</span>
            <span className="text-sky-400 font-bold">-₹{advanceSettlementAmount.toLocaleString('en-IN')}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Taxes</span>
          <span className="text-gray-500 text-xs">0% GST · ₹0.00</span>
        </div>
      </div>

      <div className="border-t border-white/12 pt-5 flex justify-between items-center">
        <span className="text-white font-black text-base">Amount Payable</span>
        <span className="text-gold text-3xl font-black">₹{total.toLocaleString('en-IN')}</span>
      </div>

      <div className="mt-auto">
        <button onClick={onContinue} disabled={itemCount === 0}
          className="w-full py-4 bg-gradient-to-r from-[#D4AF37] to-[#F0D060] rounded-2xl text-black font-black text-base disabled:opacity-40 disabled:grayscale transition-all flex items-center justify-center gap-2">
          Continue to Payment →
        </button>
      </div>
    </div>
  );
}

// ─── Payment Tile Panel (right side, step 2) ──────────────────────────────────

const TILE_METHODS = [
  { id: 'cash',    label: 'Cash',    icon: <Banknote  size={14}/>, color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  { id: 'card',    label: 'Card',    icon: <CreditCard size={14}/>, color: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
  { id: 'upi',     label: 'UPI',     icon: <Smartphone size={14}/>, color: 'text-violet-400 bg-violet-500/15 border-violet-500/30' },
  { id: 'gpay',    label: 'GPay',    icon: <Smartphone size={14}/>, color: 'text-teal-400 bg-teal-500/15 border-teal-500/30' },
  { id: 'phonepe', label: 'PhonePe', icon: <Smartphone size={14}/>, color: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30' },
  { id: 'paytm',   label: 'Paytm',   icon: <Wallet    size={14}/>, color: 'text-sky-400 bg-sky-500/15 border-sky-500/30' },
] as const;

function PaymentTilePanel({ total, alreadyPaidAmount, splits, onSplitsChange, amountDue, onDueChange,
  roundOffAmount, onRoundOffChange, newAdvanceAmount, onNewAdvanceChange,
  promoCoupons, onPromoCouponsChange,
  onCheckout, onBack, saving, isOnline, paidLabel = 'Paid online', dueSettlementAmount = 0 }: {
  total: number;
  alreadyPaidAmount: number;
  splits: PaymentSplit[];
  onSplitsChange: (s: PaymentSplit[]) => void;
  amountDue: number;
  onDueChange: (v: number) => void;
  roundOffAmount: number;
  onRoundOffChange: (v: number) => void;
  newAdvanceAmount: number;
  onNewAdvanceChange: (v: number) => void;
  promoCoupons: string[];
  onPromoCouponsChange: (c: string[]) => void;
  onCheckout: () => void;
  onBack: () => void;
  saving: boolean;
  isOnline: boolean;
  paidLabel?: string;
  dueSettlementAmount?: number;
}) {
  const remainingToCover = Math.max(0, total - alreadyPaidAmount);
  const splitTotal       = splits.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const unaccounted      = Math.round((remainingToCover - splitTotal - amountDue - roundOffAmount + newAdvanceAmount) * 100) / 100;
  const isBalanced       = Math.abs(unaccounted) < 1;

  const addTile = (method: PaymentMethod) => {
    const existingIdx = splits.findIndex(s => s.method === method);
    if (existingIdx !== -1) {
      // Toggle off — only remove if there are other splits
      if (splits.length > 1) onSplitsChange(splits.filter((_, i) => i !== existingIdx));
      return;
    }
    if (splits.length === 1) {
      // Single payment mode: replace the current method, keep amount
      const amt = splits[0].amount > 0 ? splits[0].amount : Math.max(0, Math.round(unaccounted));
      onSplitsChange([{ method, amount: amt }]);
    } else {
      // Split mode: update the most recently added row's method instead of
      // appending yet another row
      const lastIdx = splits.length - 1;
      onSplitsChange(splits.map((s, i) => i === lastIdx ? { ...s, method } : s));
    }
  };

  const updateAmount = (i: number, amount: number) =>
    onSplitsChange(splits.map((s, idx) => idx === i ? { ...s, amount: Math.max(0, amount) } : s));

  const updateMethod = (i: number, method: PaymentMethod) =>
    onSplitsChange(splits.map((s, idx) => idx === i ? { ...s, method } : s));

  const removeSplit = (i: number) =>
    onSplitsChange(splits.filter((_, idx) => idx !== i));

  const tileColor = (id: string) =>
    TILE_METHODS.find(m => m.id === id)?.color ?? 'text-gold bg-gold/15 border-gold/30';

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-white font-black text-lg">Payment</p>
        <span className={`text-xs font-black px-2.5 py-1 rounded-full border ${
          isBalanced && amountDue === 0
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
            : amountDue > 0
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
              : 'bg-red-500/15 border-red-500/30 text-red-400'
        }`}>
          {amountDue > 0 ? `Due: ₹${amountDue.toLocaleString('en-IN')}` : `Bal: ₹${Math.max(0, unaccounted).toLocaleString('en-IN')}`}
        </span>
      </div>

      {/* Round-off notice */}
      {roundOffAmount !== 0 && (
        <div className="flex items-center justify-between px-3 py-2.5 bg-sky-500/8 border border-sky-500/25 rounded-xl">
          <span className="flex items-center gap-2 text-sky-400 text-xs font-bold">
            <Tag size={13} /> Round Off
          </span>
          <div className="flex items-center gap-2">
            <p className="text-sky-400 font-black text-sm">₹{roundOffAmount.toLocaleString('en-IN')}</p>
            <button onClick={() => onRoundOffChange(0)}
              className="text-gray-500 hover:text-white transition-all">
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* New advance-credit notice — over-payment saved for the customer's next visit */}
      {newAdvanceAmount > 0 && (
        <div className="flex items-center justify-between px-3 py-2.5 bg-emerald-500/8 border border-emerald-500/25 rounded-xl">
          <span className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
            <Wallet size={13} /> Saved as Advance
          </span>
          <div className="flex items-center gap-2">
            <p className="text-emerald-400 font-black text-sm">₹{newAdvanceAmount.toLocaleString('en-IN')}</p>
            <button onClick={() => onNewAdvanceChange(0)}
              className="text-gray-500 hover:text-white transition-all">
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Due settlement notice */}
      {dueSettlementAmount > 0 && (
        <div className="flex items-center justify-between px-3 py-2.5 bg-amber-500/8 border border-amber-500/25 rounded-xl">
          <span className="flex items-center gap-2 text-amber-400 text-xs font-bold">
            <CheckCircle2 size={13} /> Previous Dues Included
          </span>
          <p className="text-amber-400 font-black text-sm">+₹{dueSettlementAmount.toLocaleString('en-IN')}</p>
        </div>
      )}

      {/* Pre-paid / advance notice */}
      {alreadyPaidAmount > 0 && (
        <div className="flex items-center justify-between px-3 py-2.5 bg-emerald-500/8 border border-emerald-500/25 rounded-xl">
          <span className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
            <CheckCircle2 size={13} /> {paidLabel}
          </span>
          <div className="text-right">
            <p className="text-emerald-400 font-black text-sm">-₹{alreadyPaidAmount.toLocaleString('en-IN')}</p>
            <p className="text-gray-500 text-xs">Bal: ₹{remainingToCover.toLocaleString('en-IN')}</p>
          </div>
        </div>
      )}

      {/* Tile grid */}
      {(!isOnline || remainingToCover > 0) && (
        <>
          <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">Payment Modes</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TILE_METHODS.map(m => {
              const active = splits.some(s => s.method === m.id);
              return (
                <button key={m.id} onClick={() => addTile(m.id as PaymentMethod)}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border transition-all text-xs font-bold ${
                    active
                      ? m.color
                      : 'bg-white/[0.04] border-white/10 text-gray-400 hover:bg-white/8 hover:text-white hover:border-white/20'
                  }`}
                >
                  {m.icon}
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Breakdown */}
      <div className="flex-1 space-y-2">
        <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">Payment Breakdown</p>
        {splits.map((split, i) => (
          <div key={i} className="flex items-center gap-2">
            {/* Editable method — dropdown so user can change after adding */}
            <select
              value={split.method}
              onChange={e => updateMethod(i, e.target.value as PaymentMethod)}
              className="shrink-0 bg-zinc-900 border border-white/15 rounded-xl px-3 py-2.5 text-sm font-black text-white focus:outline-none focus:border-gold/40 transition-all cursor-pointer"
            >
              {TILE_METHODS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            {/* Compact amount input */}
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold pointer-events-none">₹</span>
              <input type="text" inputMode="decimal" value={split.amount || ''}
                placeholder="0"
                onFocus={e => e.target.select()}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9.]/g, '');
                  updateAmount(i, raw === '' ? 0 : Number(raw));
                }}
                className="w-full bg-zinc-800 border border-white/10 rounded-xl py-2.5 pl-6 pr-2 text-white text-sm font-black text-right focus:outline-none focus:border-gold/50 transition-all"
              />
            </div>
            {/* Delete — always visible */}
            <button onClick={() => removeSplit(i)}
              className="w-8 h-8 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 flex items-center justify-center transition-all shrink-0">
              <X size={14} />
            </button>
          </div>
        ))}

        <button onClick={() => {
            const usedMethods = new Set(splits.map(s => s.method));
            const nextMethod = (TILE_METHODS.find(m => !usedMethods.has(m.id))?.id ?? 'card') as PaymentMethod;
            onSplitsChange([...splits, { method: nextMethod, amount: Math.max(0, Math.round(unaccounted)) }]);
          }}
          className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-white/15 rounded-xl text-sm text-gray-400 hover:text-white hover:border-white/25 transition-all">
          <Plus size={13} /> Add another payment mode
        </button>

        {/* Mark as due / round off — alternative ways to settle a small shortfall */}
        {!isBalanced && unaccounted > 0 && (
          <div className="flex gap-2">
            <button onClick={() => onDueChange(amountDue + Math.round(unaccounted))}
              className="flex-1 text-center text-xs text-amber-400 font-bold py-2 rounded-xl hover:bg-amber-500/10 border border-dashed border-amber-500/25 transition-all">
              Mark ₹{unaccounted.toLocaleString('en-IN')} as Due
            </button>
            <button onClick={() => onRoundOffChange(roundOffAmount + Math.round(unaccounted))}
              className="flex-1 text-center text-xs text-sky-400 font-bold py-2 rounded-xl hover:bg-sky-500/10 border border-dashed border-sky-500/25 transition-all">
              Round Off ₹{unaccounted.toLocaleString('en-IN')}
            </button>
          </div>
        )}
        {/* Over-paid (e.g. no change available) — save the extra as advance credit */}
        {!isBalanced && unaccounted < 0 && (
          <button onClick={() => onNewAdvanceChange(newAdvanceAmount + Math.round(-unaccounted))}
            className="w-full text-center text-xs text-emerald-400 font-bold py-2 rounded-xl hover:bg-emerald-500/10 border border-dashed border-emerald-500/25 transition-all">
            Save ₹{Math.abs(unaccounted).toLocaleString('en-IN')} as Advance
          </button>
        )}
        {amountDue > 0 && (
          <button onClick={() => onDueChange(0)}
            className="w-full text-center text-xs text-gray-400 font-bold py-1.5 hover:text-white transition-all">
            Clear Due ×
          </button>
        )}
      </div>

      {/* ── Promo Coupons — 1 per ₹1000 spent ── */}
      {(() => {
        const maxCoupons = Math.floor(total / 1000);
        if (maxCoupons < 1) return null;
        return (
          <div className="bg-purple-500/8 border border-purple-500/20 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-purple-400">
                🎟️ Promo Coupons
              </p>
              <span className="text-xs text-purple-300 font-bold">{promoCoupons.length} / {maxCoupons}</span>
            </div>
            <p className="text-xs text-gray-500">Add up to {maxCoupons} coupon{maxCoupons > 1 ? 's' : ''} (1 per ₹1,000 spent)</p>
            <div className="space-y-1.5">
              {promoCoupons.map((code, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text" value={code} placeholder={`Coupon ${i + 1}`}
                    onChange={e => {
                      const v = e.target.value.replace(/\s/g, '').toUpperCase();
                      onPromoCouponsChange(promoCoupons.map((c, ci) => ci === i ? v : c));
                    }}
                    className="flex-1 bg-zinc-900 border border-purple-500/25 rounded-lg px-3 py-2 text-sm text-white font-mono tracking-wider focus:outline-none focus:border-purple-400 placeholder:text-gray-600"
                  />
                  <button onClick={() => onPromoCouponsChange(promoCoupons.filter((_, ci) => ci !== i))}
                    className="text-gray-500 hover:text-red-400 p-1"><X size={14} /></button>
                </div>
              ))}
            </div>
            {promoCoupons.length < maxCoupons && (
              <button onClick={() => onPromoCouponsChange([...promoCoupons, ''])}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-purple-500/30 text-purple-400 text-xs font-bold hover:bg-purple-500/8 transition-all">
                <Tag size={12} /> Add Coupon
              </button>
            )}
          </div>
        );
      })()}

      {/* Actions */}
      <div className="space-y-2 mt-auto">
        <button onClick={onCheckout} disabled={saving || !isBalanced}
          className="w-full py-4 bg-gradient-to-r from-[#D4AF37] to-[#F0D060] rounded-2xl text-black font-black text-base disabled:opacity-40 disabled:grayscale transition-all flex items-center justify-center gap-2">
          {saving ? <Loader2 size={16} className="animate-spin"/> : <Receipt size={16}/>}
          Checkout
        </button>
        <button onClick={onBack}
          className="w-full py-3 bg-white/[0.04] border border-white/10 rounded-2xl text-gray-300 font-bold text-sm hover:bg-white/8 transition-all">
          ← Back
        </button>
      </div>
    </div>
  );
}

// Invoice preview + print
function InvoicePreview({ invoice, customer, onClose }: {
  invoice: Invoice;
  customer: Customer;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const discountLine = invoice.discountAmount > 0
      ? `<div class="row"><span>Discount (${invoice.discountPercent}%)</span><span style="color:#c00">-&#8377;${invoice.discountAmount.toLocaleString('en-IN')}</span></div>`
      : '';
    const dueSettledLine = (invoice.dueSettlementAmount ?? 0) > 0
      ? `<div class="row"><span>&#9888; Previous Dues Settled</span><span style="color:#c07000">+&#8377;${(invoice.dueSettlementAmount!).toLocaleString('en-IN')}</span></div>`
      : '';
    const advanceSettledLine = (invoice.advanceSettlementAmount ?? 0) > 0
      ? `<div class="row"><span>Advance Applied</span><span style="color:#0077aa">-&#8377;${(invoice.advanceSettlementAmount!).toLocaleString('en-IN')}</span></div>`
      : '';
    const commissionAgg: Record<string, number> = {};
    invoice.items.forEach(it => {
      if (it.staffSplits && it.staffSplits.length > 1) {
        it.staffSplits.forEach((sp: StaffCommissionSplit) => { if (sp.staffId) commissionAgg[sp.staffName] = (commissionAgg[sp.staffName] ?? 0) + sp.commissionAmount; });
      } else if (it.staffId) {
        commissionAgg[it.staffName] = (commissionAgg[it.staffName] ?? 0) + it.commissionAmount;
      }
    });
    const commissionRows = Object.entries(commissionAgg)
      .map(([name, amt]) => `<div class="row sm"><span>${name}</span><span>&#8377;${(amt as number).toLocaleString('en-IN')}</span></div>`)
      .join('');

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
          ${invoice.billingType === 'vvip' ? '<span class="badge" style="background:#f5d56b;color:#000;font-weight:700;margin-left:4px">&#9813; VVIP</span>' : ''}
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
          <div class="row"><span>${it.serviceName}${(it.quantity ?? 1) > 1 ? ` &times;${it.quantity}` : ''}</span><span class="bold">&#8377;${it.price.toLocaleString('en-IN')}</span></div>
          ${(it.quantity ?? 1) > 1 ? `<div class="staff-hint">&#8377;${it.unitPrice.toLocaleString('en-IN')} &times; ${it.quantity}</div>` : ''}
          ${it.staffSplits && it.staffSplits.length > 1
            ? it.staffSplits.map((sp: StaffCommissionSplit) => `<div class="staff-hint">${sp.staffName} · ${sp.splitPercent}% = &#8377;${sp.commissionAmount.toLocaleString('en-IN')}</div>`).join('')
            : (it.staffName ? `<div class="staff-hint">Staff: ${it.staffName} · ${it.commissionRate}% = &#8377;${it.commissionAmount.toLocaleString('en-IN')}</div>` : '')}
        </div>`).join('')}
      <div class="dash"></div>
      <div class="row"><span>Subtotal</span><span>&#8377;${invoice.subtotal.toLocaleString('en-IN')}</span></div>
      ${discountLine}
      ${dueSettledLine}
      ${advanceSettledLine}
      <div class="row total"><span>TOTAL</span><span>&#8377;${invoice.total.toLocaleString('en-IN')}</span></div>
      ${(() => {
        const ep = invoice.amountPaid ?? (invoice.total - (invoice.amountDue ?? 0));
        const hd = (invoice.amountDue ?? 0) > 0;
        const splits = (invoice.paymentSplits?.length ?? 0) > 0
          ? `<div class="sm bold" style="margin-top:3px">Payment</div>
             ${invoice.paymentSplits.map(s => `<div class="row sm"><span style="text-transform:capitalize${s.isAdvance ? ';color:#c07000;font-weight:700' : ''}">${s.isAdvance ? `Advance (${s.method})` : s.method}</span><span>&#8377;${s.amount.toLocaleString('en-IN')}</span></div>`).join('')}
             ${invoice.paymentSplits.length > 1 ? `<div class="row sm"><span>Collected</span><span class="bold">&#8377;${ep.toLocaleString('en-IN')}</span></div>` : ''}`
          : `<div class="row sm" style="margin-top:3px"><span style="text-transform:capitalize">${invoice.paymentMethod}</span><span class="bold">&#8377;${ep.toLocaleString('en-IN')}</span></div>`;
        const bal = hd
          ? `<div class="row sm" style="color:#c00;font-weight:700"><span>Balance Due (&#8377;${invoice.total.toLocaleString('en-IN')} &minus; &#8377;${ep.toLocaleString('en-IN')})</span><span>&#8377;${(invoice.amountDue ?? 0).toLocaleString('en-IN')}</span></div>`
          : `<div class="row sm" style="color:#007700"><span>&#10003; Fully Paid</span><span>&#8377;${ep.toLocaleString('en-IN')}</span></div>`;
        const roundOff = (invoice.roundOffAmount ?? 0) !== 0
          ? `<div class="row sm"><span>Round Off</span><span>&#8377;${invoice.roundOffAmount!.toLocaleString('en-IN')}</span></div>`
          : '';
        const newAdvance = (invoice.advanceAmount ?? 0) > 0
          ? `<div class="row sm" style="color:#007700"><span>Saved as Advance</span><span>&#8377;${invoice.advanceAmount!.toLocaleString('en-IN')}</span></div>`
          : '';
        return splits + bal + roundOff + newAdvance;
      })()}
      ${invoice.paymentId ? `<div class="row sm"><span>Ref ID</span><span>${invoice.paymentId}</span></div>` : ''}
      ${commissionRows ? `<div class="dash"></div><div class="sm bold">Staff Commission</div>${commissionRows}` : ''}
      ${(invoice.promoCoupons?.length ?? 0) > 0 ? `<div class="dash"></div><div class="sm bold">&#127915; Promo Coupons</div>${invoice.promoCoupons!.map(c => `<div class="row sm"><span>&#9733;</span><span class="bold" style="letter-spacing:2px">${c}</span></div>`).join('')}` : ''}
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
        <h3 className="text-white font-black text-lg">{t('billCreated')} 🎉</h3>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/8 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/10 transition-all">
            <Printer size={15} /> {t('printBill')}
          </button>
          <button onClick={onClose}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-sm font-bold text-emerald-400 hover:bg-emerald-500/30 transition-all">
            {t('done')}
          </button>
        </div>
      </div>

      {/* Invoice card — thermal receipt style */}
      <div ref={printRef} className="bg-white text-black rounded-2xl p-5 font-mono text-xs max-w-[340px] mx-auto shadow-xl border border-gray-200">
        {/* Header */}
        <div className="text-center mb-4">
          <p className="font-black text-xl uppercase tracking-tight">Hair Tech</p>
          <p className="font-bold text-sm">Unisex Salon, Araria</p>
          <p className="text-gray-500 text-xs">+91 87896 03343</p>
          <div className="flex justify-center gap-1 mt-2">
            <span className={`text-[11px] px-2 py-0.5 rounded border ${invoice.source === 'online' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              {invoice.source === 'online' ? 'Online Booking' : 'Walk-in'}
            </span>
            {invoice.billingType === 'vvip' && (
              <span className="text-[11px] px-2 py-0.5 rounded border bg-gold/15 border-gold/40 text-gold font-black flex items-center gap-1">
                <Crown size={9} /> VVIP
              </span>
            )}
          </div>
          <div className="mt-2 text-[11px] text-gray-400 space-y-0.5">
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
            <span className={`text-[11px] px-2 py-0.5 rounded border font-bold ${invoice.source === 'online' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              {invoice.source === 'online' ? 'Online Booking' : 'Walk-in'}
            </span>
          </div>
          {invoice.billingType === 'vvip' && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Tier</span>
              <span className="text-[11px] px-2 py-0.5 rounded border font-black bg-amber-50 border-amber-300 text-amber-700 flex items-center gap-1">
                <Crown size={9} /> VVIP
              </span>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="border-t border-dashed border-gray-300 pt-3 mb-3 space-y-2.5">
          <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">Services</p>
          {invoice.items.map((item, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex justify-between items-start">
                <span className="text-gray-800 flex-1 pr-2 text-xs">{item.serviceName}{(item.quantity ?? 1) > 1 ? ` ×${item.quantity}` : ''}</span>
                <span className="text-black font-bold shrink-0 text-xs">₹{item.price.toLocaleString('en-IN')}</span>
              </div>
              {(item.quantity ?? 1) > 1 && (
                <p className="text-[11px] text-gray-400 pl-1">₹{item.unitPrice.toLocaleString('en-IN')} × {item.quantity}</p>
              )}
              {item.lineDiscount > 0 && (
                <p className="text-[11px] text-red-500 pl-1">Line discount: {item.lineDiscount}%</p>
              )}
              {item.staffSplits && item.staffSplits.length > 1 ? (
                <div className="pl-1 space-y-0.5">
                  {item.staffSplits.map(sp => (
                    <p key={sp.staffId} className="text-[11px] text-gray-400">
                      {sp.staffName} · {sp.splitPercent}% → ₹{sp.commissionAmount.toLocaleString('en-IN')}
                    </p>
                  ))}
                </div>
              ) : item.staffName ? (
                <p className="text-[11px] text-gray-400 pl-1">
                  Staff: {item.staffName} · {item.commissionRate}% (₹{item.commissionAmount.toLocaleString('en-IN')})
                </p>
              ) : null}
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
          {(invoice.dueSettlementAmount ?? 0) > 0 && (
            <div className="flex justify-between text-xs text-amber-600 font-bold">
              <span>⚠ Previous Dues Settled</span>
              <span>+₹{(invoice.dueSettlementAmount!).toLocaleString('en-IN')}</span>
            </div>
          )}
          {(invoice.advanceSettlementAmount ?? 0) > 0 && (
            <div className="flex justify-between text-xs text-sky-600 font-bold">
              <span>Advance Applied</span>
              <span>-₹{(invoice.advanceSettlementAmount!).toLocaleString('en-IN')}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-sm pt-1.5 border-t border-dashed border-gray-300">
            <span>TOTAL</span>
            <span style={{ color: '#B8941F' }}>₹{invoice.total.toLocaleString('en-IN')}</span>
          </div>
          {/* Payment reconciliation */}
          {(() => {
            const effectivePaid = invoice.amountPaid ?? (invoice.total - (invoice.amountDue ?? 0));
            const hasDue = (invoice.amountDue ?? 0) > 0;
            return (
              <div className="pt-2 space-y-1.5">
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-black">Payment</p>
                {(invoice.paymentSplits?.length ?? 0) > 0 ? (
                  <>
                    {invoice.paymentSplits.map((s, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className={`capitalize ${s.isAdvance ? 'text-amber-600 font-bold' : 'text-gray-600'}`}>
                          {s.isAdvance ? `Advance (${s.method})` : s.method}
                        </span>
                        <span className="font-bold text-black">₹{s.amount.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                    {invoice.paymentSplits.length > 1 && (
                      <div className="flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-200 pt-0.5">
                        <span>Collected</span>
                        <span className="font-bold">₹{effectivePaid.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600 capitalize">{invoice.paymentMethod}</span>
                    <span className="font-bold text-black">₹{effectivePaid.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className={`flex justify-between text-xs font-black pt-1 border-t border-dashed border-gray-200 ${hasDue ? 'text-red-600' : 'text-emerald-700'}`}>
                  <span>
                    {hasDue ? 'Balance Due' : '✓ Fully Paid'}
                    {hasDue && (
                      <span className="font-normal text-[11px] text-gray-400 ml-1">
                        (₹{invoice.total.toLocaleString('en-IN')} − ₹{effectivePaid.toLocaleString('en-IN')})
                      </span>
                    )}
                  </span>
                  <span>{hasDue ? `₹${(invoice.amountDue ?? 0).toLocaleString('en-IN')}` : `₹${effectivePaid.toLocaleString('en-IN')}`}</span>
                </div>
                {(invoice.roundOffAmount ?? 0) !== 0 && (
                  <div className="flex justify-between text-xs text-sky-600">
                    <span>Round Off</span>
                    <span className="font-bold">₹{invoice.roundOffAmount!.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {(invoice.advanceAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-xs text-emerald-700">
                    <span>Saved as Advance</span>
                    <span className="font-bold">₹{invoice.advanceAmount!.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {invoice.paymentId && (
                  <div className="flex justify-between text-[11px] text-gray-400">
                    <span>Ref ID</span><span className="font-mono">{invoice.paymentId}</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Commission summary */}
        {invoice.items.some(i => i.commissionAmount > 0) && (() => {
          const commAgg: Record<string, number> = {};
          invoice.items.forEach(it => {
            if (it.staffSplits && it.staffSplits.length > 1) {
              it.staffSplits.forEach(sp => { if (sp.staffId) commAgg[sp.staffName] = (commAgg[sp.staffName] ?? 0) + sp.commissionAmount; });
            } else if (it.staffId) {
              commAgg[it.staffName] = (commAgg[it.staffName] ?? 0) + it.commissionAmount;
            }
          });
          return (
            <div className="border-t border-dashed border-gray-300 pt-2.5 mt-2.5">
              <p className="text-[11px] text-gray-400 font-black uppercase tracking-wider mb-1.5">Staff Commission</p>
              {Object.entries(commAgg).map(([name, amt]) => (
                <div key={name} className="flex justify-between text-xs text-gray-400">
                  <span>{name}</span><span>₹{(amt as number).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {(invoice.promoCoupons?.length ?? 0) > 0 && (
          <div className="border-t border-dashed border-gray-300 pt-2.5 mt-2.5">
            <p className="text-[11px] text-purple-500 font-black uppercase tracking-wider mb-1.5">🎟️ Promo Coupons</p>
            {invoice.promoCoupons!.map((c, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-gray-400">★</span>
                <span className="font-bold font-mono tracking-[3px] text-purple-600">{c}</span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-dashed border-gray-300 mt-4 pt-3 text-center text-[11px] text-gray-400">
          Thank you for visiting Hair Tech Salon!<br/>Follow us @hairtech111
        </div>
      </div>
    </div>
  );
}

// ─── Main BillingModule ───────────────────────────────────────────────────────

export default function BillingModule({ prefill: propPrefill, onClose, onInvoiceCreated }: BillingModuleProps) {
  const [discoveredPrefill, setDiscoveredPrefill] = useState<OnlineBookingPrefill | null>(null);
  const prefill = propPrefill ?? discoveredPrefill;
  const isOnlineFlow = !!prefill;
  const { t } = useLanguage();

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

  const [items, setItems]              = useState<BillItem[]>([]);
  const [discountPercent, setDiscount] = useState(0);
  const [paymentSplits, setSplits]     = useState<PaymentSplit[]>([{ method: 'cash', amount: 0 }]);
  const [amountDue, setAmountDue]      = useState(0);
  // Small shortfall written off as "round off" — not a payment line item, tracked separately
  const [roundOffAmount, setRoundOffAmount] = useState(0);
  const [staff, setStaff]              = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  // Default staff member silently credited for services left unassigned (configured in Tools > Settings)
  const [defaultStaffId, setDefaultStaffId] = useState('');
  const [saving, setSaving]            = useState(false);
  const [saveError, setSaveError]      = useState<string | null>(null);
  const [invoice, setInvoice]          = useState<Invoice | null>(null);
  const [outstandingDue, setOutstandingDue] = useState(0);
  const [settleDues, setSettleDues]    = useState(false);
  // Customer's existing advance credit (e.g. overpaid last visit, no change given) and whether to apply it now
  const [advanceBalance, setAdvanceBalance] = useState(0);
  const [useAdvance, setUseAdvance]    = useState(false);
  // New advance credit being created from an over-payment on this bill
  const [newAdvanceAmount, setNewAdvanceAmount] = useState(0);
  const [promoCoupons, setPromoCoupons] = useState<string[]>([]);
  const [billingType, setBillingType]  = useState<'standard' | 'vvip'>('standard');
  // Date the bill is for — defaults to today, editable for back-dating (e.g. forgot to bill yesterday)
  const [billingDate, setBillingDate]  = useState(() => toDateInputValue(new Date()));
  // Remember last-used staff so new service additions pre-populate it
  const lastStaffRef = useRef<string>('');

  // Walk-in bookings opened from the booking list still use prefill but stay walkin source
  const isWalkInPrefill = prefill?.bookingSource === 'walk_in';
  const alreadyPaidAmount = isOnlineFlow
    ? prefill?.paymentMethod !== 'pay_at_salon'
      ? (prefill?.totalAmount ?? 0)      // fully paid via Razorpay
      : (prefill?.advanceAmount ?? 0)    // walk-in advance (0 if none)
    : 0;
  const isAdvancePay = isOnlineFlow && prefill?.paymentMethod === 'pay_at_salon' && alreadyPaidAmount > 0;
  const advanceMethod = (prefill?.advancePaymentMethod ?? 'cash') as PaymentMethod;

  const STEPS = isOnlineFlow
    ? [t('services'), t('payment'), 'Invoice']
    : [t('customer'), t('services'), t('payment'), 'Invoice'];

  const stepOffset = isOnlineFlow ? 1 : 0; // step index offset

  // Pre-populate services from online / walk-in booking (re-fires when discoveredPrefill is set)
  useEffect(() => {
    if (!prefill) return;

    // Structured items (new walk-in bookings) — preserves quantity per service
    if (prefill.serviceItems && prefill.serviceItems.length > 0) {
      setItems(prefill.serviceItems.map(si => {
        const pv = si.priceValue ?? 0;
        return {
          serviceId:        si.id,
          serviceName:      si.name,
          unitPrice:        pv,
          quantity:         si.qty,
          lineDiscount:     0,
          price:            pv * si.qty,
          staffId:          '',
          staffName:        '',
          commissionRate:   DEFAULT_COMMISSION,
          commissionAmount: 0,
        };
      }));
      return;
    }

    // Fallback: comma-split serviceNames (older bookings / online Razorpay)
    const names = prefill.serviceNames.split(',').map(s => s.trim().replace(/\s*×\d+$/, ''));
    const matched = names.flatMap(name => {
      const svc = servicesData.find(s => s.name === name);
      if (!svc) return [];
      const pv = svc.priceValue ?? 0;
      return [{
        serviceId:        svc.id,
        serviceName:      svc.name,
        unitPrice:        pv,
        quantity:         1,
        lineDiscount:     0,
        price:            pv,
        staffId:          '',
        staffName:        '',
        commissionRate:   DEFAULT_COMMISSION,
        commissionAmount: 0,
      }];
    });
    // Last resort: service name not in catalogue — use booking total as single line
    if (matched.length === 0) {
      const pv = prefill.totalAmount ?? 0;
      setItems([{
        serviceId:        'online-booking',
        serviceName:      prefill.serviceNames,
        unitPrice:        pv,
        quantity:         1,
        lineDiscount:     0,
        price:            pv,
        staffId:          '',
        staffName:        '',
        commissionRate:   DEFAULT_COMMISSION,
        commissionAmount: 0,
      }]);
    } else {
      setItems(matched);
    }
  }, [discoveredPrefill]);

  // Fetch outstanding dues whenever customer is set (shown on service step)
  useEffect(() => {
    if (!customer) { setOutstandingDue(0); setSettleDues(false); return; }
    getDocs(query(
      collection(db, 'invoices'),
      where('customerPhone', '==', customer.phone),
      where('status', '==', 'due')
    )).then(snap => {
      const total = snap.docs.reduce((a, d) => a + (d.data().amountDue ?? 0), 0);
      setOutstandingDue(total);
    }).catch(() => setOutstandingDue(0));
  }, [customer]);

  // Fetch existing advance credit whenever customer is set (shown on service step)
  useEffect(() => {
    if (!customer) { setAdvanceBalance(0); setUseAdvance(false); return; }
    getDoc(doc(db, 'customers', customer.phone))
      .then(snap => setAdvanceBalance(snap.exists() ? (snap.data().advanceBalance ?? 0) : 0))
      .catch(() => setAdvanceBalance(0));
  }, [customer]);

  // Load staff from Firestore
  useEffect(() => {
    getDocs(query(collection(db, 'staff'), where('isActive', '==', true), orderBy('name')))
      .then(snap => {
        setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
      })
      .catch(() => setStaff([]))
      .finally(() => setStaffLoading(false));
  }, []);

  // Load default-staff setting (silently credited for unassigned services)
  useEffect(() => {
    getDoc(doc(db, 'settings', 'salon'))
      .then(snap => setDefaultStaffId(snap.exists() ? (snap.data().defaultStaffId ?? '') : ''))
      .catch(() => setDefaultStaffId(''));
  }, []);

  // Derived totals
  const subtotal = useMemo(
    () => items.reduce((a, i) => a + i.price, 0),
    [items]
  );
  const discountAmount      = Math.round(subtotal * discountPercent / 100);
  const dueSettlementAmount = settleDues ? outstandingDue : 0;
  const preAdvanceTotal     = subtotal - discountAmount + dueSettlementAmount;
  const advanceSettlementAmount = useAdvance ? Math.min(advanceBalance, Math.max(0, preAdvanceTotal)) : 0;
  const total               = preAdvanceTotal - advanceSettlementAmount;

  // Auto-populate the default Cash split's amount once when the payment step is
  // first reached — but only once, so clearing the field for part-payments sticks.
  const cashAutoFilledRef = useRef(false);
  useEffect(() => {
    if (step !== 2) { cashAutoFilledRef.current = false; return; }
    if (cashAutoFilledRef.current) return;
    cashAutoFilledRef.current = true;
    if (paymentSplits.length !== 1 || paymentSplits[0].amount !== 0) return;
    const remainingToCover = Math.max(0, total - alreadyPaidAmount);
    const due = Math.max(0, Math.round(remainingToCover - amountDue));
    if (due > 0) setSplits([{ ...paymentSplits[0], amount: due }]);
  }, [step]);

  // Recompute line price and commission from current item fields
  const recompute = (item: BillItem, overrides: Partial<BillItem> = {}): BillItem => {
    const merged = { ...item, ...overrides };
    const lineTotal = Math.round(merged.unitPrice * merged.quantity * (1 - merged.lineDiscount / 100));
    const totalCommAmt = merged.staffId ? Math.round(lineTotal * merged.commissionRate / 100) : 0;
    // Recalculate split amounts when splits exist
    const splits = merged.staffSplits;
    if (splits && splits.length > 0) {
      const updatedSplits = splits.map(s => ({
        ...s,
        commissionAmount: Math.round(totalCommAmt * s.splitPercent / 100),
      }));
      return { ...merged, price: lineTotal, commissionAmount: totalCommAmt, staffSplits: updatedSplits };
    }
    return { ...merged, price: lineTotal, commissionAmount: totalCommAmt };
  };

  // Add service — pre-populates with last-used staff for convenience
  const addService = useCallback((service: Service) => {
    const staffId = lastStaffRef.current;
    const member  = staffId ? staff.find(s => s.id === staffId) : null;
    const rate    = member?.commissionRate ?? DEFAULT_COMMISSION;
    const lineTotal = service.priceValue;
    setItems(prev => [...prev, {
      serviceId:        service.id,
      serviceName:      service.name,
      unitPrice:        service.priceValue,
      quantity:         1,
      lineDiscount:     0,
      price:            lineTotal,
      staffId:          staffId,
      staffName:        member?.name ?? '',
      commissionRate:   staffId ? rate : DEFAULT_COMMISSION,
      commissionAmount: staffId ? Math.round(lineTotal * rate / 100) : 0,
    }]);
  }, [staff]);

  const removeService = useCallback((idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const removeLastService = useCallback((serviceId: string) => {
    setItems(prev => {
      let lastIdx = -1;
      prev.forEach((item, i) => { if (item.serviceId === serviceId) lastIdx = i; });
      if (lastIdx === -1) return prev;
      return prev.filter((_, i) => i !== lastIdx);
    });
  }, []);

  // Update staff on a single cart item (single-staff mode — clears any splits)
  const updateItemStaff = useCallback((idx: number, staffId: string) => {
    const member = staffId ? staff.find(s => s.id === staffId) : null;
    const rate   = member?.commissionRate ?? DEFAULT_COMMISSION;
    if (staffId) lastStaffRef.current = staffId;
    setItems(prev => prev.map((item, i) => i !== idx ? item : recompute(item, {
      staffId,
      staffName:      member?.name ?? '',
      commissionRate: staffId ? rate : DEFAULT_COMMISSION,
      staffSplits:    undefined,
    })));
  }, [staff]);

  // Add another staff member to a cart item's commission split
  const addStaffToItem = useCallback((idx: number, staffId: string) => {
    const member = staff.find(s => s.id === staffId);
    if (!member) return;
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const existing = item.staffSplits ?? [];
      if (existing.some(s => s.staffId === staffId)) return item; // already added
      // Build splits: if first time splitting, seed from current single staff
      let splits: StaffCommissionSplit[];
      if (existing.length === 0 && item.staffId) {
        splits = [
          { staffId: item.staffId, staffName: item.staffName, splitPercent: 0, commissionAmount: 0 },
          { staffId: member.id, staffName: member.name, splitPercent: 0, commissionAmount: 0 },
        ];
      } else {
        splits = [...existing, { staffId: member.id, staffName: member.name, splitPercent: 0, commissionAmount: 0 }];
      }
      // Equal distribution by default
      const pct = Math.floor(100 / splits.length);
      const remainder = 100 - pct * splits.length;
      splits = splits.map((s, si) => ({ ...s, splitPercent: pct + (si === 0 ? remainder : 0) }));
      const primary = splits[0];
      return recompute(item, {
        staffId: primary.staffId,
        staffName: primary.staffName,
        staffSplits: splits,
      });
    }));
  }, [staff]);

  // Remove a staff member from a cart item's split
  const removeStaffFromItem = useCallback((idx: number, staffId: string) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const splits = (item.staffSplits ?? []).filter(s => s.staffId !== staffId);
      if (splits.length <= 1) {
        // Back to single-staff mode
        const sole = splits[0];
        return recompute(item, {
          staffId: sole?.staffId ?? '',
          staffName: sole?.staffName ?? '',
          staffSplits: undefined,
        });
      }
      // Redistribute equally
      const pct = Math.floor(100 / splits.length);
      const remainder = 100 - pct * splits.length;
      const updated = splits.map((s, si) => ({ ...s, splitPercent: pct + (si === 0 ? remainder : 0) }));
      return recompute(item, { staffId: updated[0].staffId, staffName: updated[0].staffName, staffSplits: updated });
    }));
  }, []);

  // Update split percentages for a cart item (admin manually sets each %)
  const updateSplitPercents = useCallback((idx: number, newSplits: StaffCommissionSplit[]) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      return recompute(item, { staffSplits: newSplits });
    }));
  }, []);

  const updateItemQty = useCallback((idx: number, qty: number) => {
    setItems(prev => prev.map((item, i) => i !== idx ? item : recompute(item, { quantity: Math.max(1, qty) })));
  }, []);

  const updateItemUnitPrice = useCallback((idx: number, price: number) => {
    setItems(prev => prev.map((item, i) => i !== idx ? item : recompute(item, { unitPrice: Math.max(0, price) })));
  }, []);

  const updateItemLineDiscount = useCallback((idx: number, disc: number) => {
    setItems(prev => prev.map((item, i) => i !== idx ? item : recompute(item, { lineDiscount: Math.min(100, Math.max(0, disc)) })));
  }, []);

  // Save invoice to Firestore
  const handleGenerateInvoice = async () => {
    if (!customer) return;
    setSaving(true);
    setSaveError(null);
    try {
      const isRealOnline = isOnlineFlow && !isWalkInPrefill;
      // Razorpay pre-paid amount: add as an 'online' split so it appears in revenue charts and receipts
      const onlineSplit: PaymentSplit[] = (isRealOnline && !isAdvancePay && alreadyPaidAmount > 0)
        ? [{ method: 'online', amount: alreadyPaidAmount }]
        : [];
      // For walk-in advance bookings, prepend the advance as its own labelled split
      const advanceSplit: PaymentSplit[] = isAdvancePay
        ? [{ method: advanceMethod, amount: alreadyPaidAmount, isAdvance: true }]
        : [];
      const validSplits = [...onlineSplit, ...advanceSplit, ...paymentSplits.filter(s => s.amount > 0)];
      const amountPaid  = validSplits.reduce((a, s) => a + s.amount, 0);
      const primaryMethod: PaymentMethod = isRealOnline ? 'online'
        : (validSplits[0]?.method ?? 'cash');

      // Silently credit unassigned services to the configured default staff member —
      // does not touch the on-screen cart (`items`), only what's saved to Firestore.
      const defaultStaff = staff.find(s => s.id === defaultStaffId);
      const itemsWithDefaultStaff = defaultStaff
        ? items.map(item => item.staffId ? item : recompute(item, {
            staffId:         defaultStaff.id,
            staffName:       defaultStaff.name,
            commissionRate:  defaultStaff.commissionRate,
          }))
        : items;

      // Commission is paid on money actually collected, not the billed total —
      // a round-off write-off (or unpaid due) proportionally reduces every item's commission.
      const collectionRatio = total > 0 ? Math.min(1, amountPaid / total) : 1;
      const effectiveItems = collectionRatio < 1
        ? itemsWithDefaultStaff.map(item => ({
            ...item,
            commissionAmount: Math.round(item.commissionAmount * collectionRatio),
            ...(item.staffSplits && {
              staffSplits: item.staffSplits.map(s => ({
                ...s,
                commissionAmount: Math.round(s.commissionAmount * collectionRatio),
              })),
            }),
          }))
        : itemsWithDefaultStaff;

      const validCoupons = promoCoupons.filter(c => c.trim().length > 0);

      // Firestore rejects undefined values — strip them from items
      const cleanItems = effectiveItems.map(item => {
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(item)) { if (v !== undefined) clean[k] = v; }
        return clean as unknown as BillItem;
      });

      const inv: Omit<Invoice, 'id'> = {
        invoiceNumber:  generateInvoiceNumber(),
        customerPhone:  customer.phone,
        customerName:   customer.name,
        ...(prefill?.bookingId && { bookingId: prefill.bookingId }),
        items: cleanItems,
        subtotal,
        discountPercent,
        discountAmount,
        total,
        ...(dueSettlementAmount > 0 && { dueSettlementAmount }),
        ...(advanceSettlementAmount > 0 && { advanceSettlementAmount }),
        ...(newAdvanceAmount > 0 && { advanceAmount: newAdvanceAmount }),
        paymentMethod:  primaryMethod,
        paymentSplits:  validSplits,
        amountPaid,
        amountDue,
        ...(roundOffAmount !== 0 && { roundOffAmount }),
        ...(prefill?.paymentId && { paymentId: prefill.paymentId }),
        status:    amountDue > 0 ? 'due' : 'paid',
        source:    isRealOnline ? 'online' : 'walkin',
        billingType,
        ...(validCoupons.length > 0 && { promoCoupons: validCoupons }),
        createdAt: Timestamp.fromDate(billingDateToTimestamp(billingDate)),
      };

      // Write invoice
      const invoiceRef = await addDoc(collection(db, 'invoices'), inv);

      // If settling previous dues, mark all those invoices as paid
      if (settleDues && dueSettlementAmount > 0) {
        const dueSnap = await getDocs(query(
          collection(db, 'invoices'),
          where('customerPhone', '==', customer.phone),
          where('status', '==', 'due')
        ));
        await Promise.all(dueSnap.docs.map(d =>
          updateDoc(d.ref, { status: 'paid', amountDue: 0 })
        ));
      }

      // Update customer master — stats (visitCount, totalSpend) are derived from invoices at display time,
      // so here we only maintain identity fields: name, phone, source, timestamps.
      const invoiceSource = isRealOnline ? 'online' : 'walkin';
      const custRef  = doc(db, 'customers', customer.phone);
      const custSnap = await getDoc(custRef);
      // Net change to the customer's advance credit balance — spend existing credit
      // applied to this bill, then add any new credit saved from over-payment.
      const advanceDelta = newAdvanceAmount - advanceSettlementAmount;
      if (custSnap.exists()) {
        const existing   = custSnap.data() as Customer & { source?: string };
        const prevSource = existing.source ?? 'walkin';
        const mergedSource = (prevSource === invoiceSource || prevSource === 'both') ? prevSource : 'both';
        await setDoc(custRef, {
          ...existing,
          name:      customer.name || existing.name,
          source:    mergedSource,
          lastVisit: billingDateToTimestamp(billingDate).toISOString(),
          advanceBalance: Math.max(0, (existing.advanceBalance ?? 0) + advanceDelta),
        });
      } else {
        await setDoc(custRef, {
          phone:      customer.phone,
          name:       customer.name,
          source:     invoiceSource,
          firstVisit: billingDateToTimestamp(billingDate).toISOString(),
          lastVisit:  billingDateToTimestamp(billingDate).toISOString(),
          advanceBalance: Math.max(0, advanceDelta),
        });
      }

      // Update staff commission totals — uses staffSplits when present
      const staffCommissions: Record<string, number> = {};
      const staffServiceCounts: Record<string, number> = {};
      for (const item of effectiveItems) {
        if (item.staffSplits && item.staffSplits.length > 1) {
          for (const split of item.staffSplits) {
            if (!split.staffId) continue;
            staffCommissions[split.staffId]   = (staffCommissions[split.staffId] ?? 0) + split.commissionAmount;
            staffServiceCounts[split.staffId] = (staffServiceCounts[split.staffId] ?? 0) + 1;
          }
        } else if (item.staffId) {
          staffCommissions[item.staffId]   = (staffCommissions[item.staffId] ?? 0) + item.commissionAmount;
          staffServiceCounts[item.staffId] = (staffServiceCounts[item.staffId] ?? 0) + 1;
        }
      }

      await Promise.all(Object.entries(staffCommissions).map(async ([staffId, commission]) => {
        const staffRef  = doc(db, 'staff', staffId);
        const staffSnap = await getDoc(staffRef);
        if (staffSnap.exists()) {
          const s = staffSnap.data() as StaffMember & { totalCommission?: number; totalServices?: number };
          await setDoc(staffRef, {
            ...s,
            totalCommission: (s.totalCommission ?? 0) + commission,
            totalServices:   (s.totalServices ?? 0) + (staffServiceCounts[staffId] ?? 0),
          });
        }
      }));

      if (prefill?.bookingId) {
        await updateDoc(doc(db, 'bookings', prefill.bookingId), {
          status: 'completed',
          invoiceId: invoiceRef.id,
        }).catch(() => {});
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
  // Splits + due + round-off + new advance must account for the full remaining balance (within ₹1 tolerance)
  const splitTotal             = paymentSplits.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const unaccounted            = Math.round((balanceDue - splitTotal - amountDue - roundOffAmount + newAdvanceAmount) * 100) / 100;
  const canProceedFromPayment  = (isOnlineFlow && balanceDue === 0) || Math.abs(unaccounted) < 1;

  // ── Render ─────────────────────────────────────────────────────────────────

  const displayStep  = step - stepOffset;
  const isTwoPanel   = (step === 1 || step === 2) && !invoice;

  return (
    <div className="flex-1 flex flex-col bg-[#0d0d0d] overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-white/15 shrink-0 bg-zinc-900/60">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center shrink-0">
              <Receipt size={14} className="text-gold" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-black text-xs sm:text-sm leading-none truncate">
                {isOnlineFlow ? 'Online Booking Bill' : 'Express Billing'}
              </p>
              {customer && <p className="text-gold/70 text-xs mt-0.5 truncate">{customer.name} · {customer.phone}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {!invoice && (
              <div className="hidden sm:flex items-center bg-white/[0.04] border border-white/10 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setBillingType('standard')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                    billingType === 'standard'
                      ? 'bg-white/10 text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Standard
                </button>
                <button
                  onClick={() => setBillingType('vvip')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                    billingType === 'vvip'
                      ? 'bg-gold/20 border border-gold/40 text-gold'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Crown size={12} /> VVIP
                </button>
              </div>
            )}
            <div className="hidden sm:block"><Steps current={displayStep} steps={STEPS} /></div>
            {onClose && (
              <button onClick={onClose}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-white/8 border border-white/12 text-white hover:bg-white/15 transition-all shrink-0">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* ── Billing date row ── */}
        {!invoice && (
          <div className="flex items-center justify-between sm:justify-end gap-2 px-4 sm:px-6 py-2 border-b border-white/10 shrink-0 bg-zinc-900/30">
            {/* Standard/VVIP toggle — mobile only (hidden on sm+ where it's in the header) */}
            <div className="flex sm:hidden items-center bg-white/[0.04] border border-white/10 rounded-lg p-0.5 gap-0.5">
              <button onClick={() => setBillingType('standard')}
                className={`px-2 py-1 rounded-md text-[11px] font-black uppercase transition-all ${billingType === 'standard' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>
                Standard
              </button>
              <button onClick={() => setBillingType('vvip')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-black uppercase transition-all ${billingType === 'vvip' ? 'bg-gold/20 text-gold' : 'text-gray-500'}`}>
                <Crown size={10} /> VVIP
              </button>
            </div>
            <label
              title="Date this bill is for — change to back-date (e.g. forgot to bill yesterday)"
              className="flex items-center gap-1.5 bg-white/[0.04] border border-white/10 rounded-xl px-2.5 py-1.5 cursor-pointer hover:border-gold/40 transition-all"
            >
              <Calendar size={12} className="text-gray-400 shrink-0" />
              <span className="text-gray-400 text-xs font-bold uppercase tracking-wide">Bill Date</span>
              <input
                type="date"
                value={billingDate}
                max={toDateInputValue(new Date())}
                onChange={e => e.target.value && setBillingDate(e.target.value)}
                className="bg-transparent text-white text-[11px] font-bold focus:outline-none cursor-pointer [color-scheme:dark]"
              />
            </label>
          </div>
        )}

        {/* ── Two-panel body (steps 1 + 2) ── */}
        {isTwoPanel && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

            {/* LEFT: Cart */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 md:border-r border-white/10 scrollbar-hide">

              {/* Customer info + dues — visible once customer is selected */}
              {customer && (
                <div className={`mb-4 rounded-2xl border ${outstandingDue > 0 ? 'bg-red-500/8 border-red-500/25' : 'bg-white/[0.04] border-white/10'}`}>
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center text-gold text-xs font-black shrink-0">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-bold leading-none truncate">{customer.name}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{customer.phone}</p>
                      </div>
                    </div>
                    {outstandingDue > 0 ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-red-400 text-xs font-black">Due: ₹{outstandingDue.toLocaleString('en-IN')}</span>
                        <button
                          onClick={() => setSettleDues(s => !s)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all ${
                            settleDues
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                              : 'bg-amber-500/10 border-amber-500/25 text-amber-400 hover:bg-amber-500/20'
                          }`}
                        >
                          {settleDues ? '✓ Settling' : 'Settle Now'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-emerald-400 font-black shrink-0">No dues</span>
                    )}
                  </div>
                  {outstandingDue > 0 && (
                    <p className={`text-xs px-4 pb-3 -mt-1 ${settleDues ? 'text-emerald-400/70' : 'text-red-300/70'}`}>
                      {settleDues
                        ? `₹${outstandingDue.toLocaleString('en-IN')} will be added to this bill and cleared on checkout.`
                        : 'Unpaid balance from a previous visit — settle now or carry forward.'}
                    </p>
                  )}
                </div>
              )}

              {/* Advance credit available — from a previous over-payment */}
              {customer && advanceBalance > 0 && (
                <div className="mb-4 rounded-2xl border bg-sky-500/8 border-sky-500/25">
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-sky-400 text-xs font-black">Advance Available: ₹{advanceBalance.toLocaleString('en-IN')}</span>
                    <button
                      onClick={() => setUseAdvance(s => !s)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all ${
                        useAdvance
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : 'bg-sky-500/10 border-sky-500/25 text-sky-400 hover:bg-sky-500/20'
                      }`}
                    >
                      {useAdvance ? '✓ Applying' : 'Apply to Bill'}
                    </button>
                  </div>
                  <p className={`text-xs px-4 pb-3 -mt-1 ${useAdvance ? 'text-emerald-400/70' : 'text-sky-300/70'}`}>
                    {useAdvance
                      ? `₹${advanceSettlementAmount.toLocaleString('en-IN')} will be deducted from this bill's total.`
                      : 'Credit from a previous over-payment — apply it to reduce this bill.'}
                  </p>
                </div>
              )}

              {staffLoading ? (
                <div className="flex items-center gap-3 py-12 justify-center text-gray-500">
                  <Loader2 size={20} className="animate-spin text-gold" />
                  <span className="text-sm">Loading staff…</span>
                </div>
              ) : (
                <ServiceStep
                  items={items} onAdd={addService} onRemove={removeService} onRemoveLast={removeLastService}
                  onUpdateStaff={updateItemStaff} onAddStaff={addStaffToItem} onRemoveStaff={removeStaffFromItem}
                  onUpdateSplits={updateSplitPercents} onUpdateQty={updateItemQty}
                  onUpdateUnitPrice={updateItemUnitPrice} onUpdateLineDiscount={updateItemLineDiscount}
                  staff={staff}
                />
              )}
              {saveError && (
                <p className="flex items-center gap-2 text-red-400 text-xs font-bold mt-4">
                  <AlertCircle size={12} /> {saveError}
                </p>
              )}
            </div>

            {/* RIGHT: Summary (step 1) or Payment (step 2) */}
            <div className="w-full md:w-80 lg:w-[26rem] xl:w-[30rem] shrink-0 overflow-y-auto bg-zinc-900/50 scrollbar-hide flex flex-col border-t md:border-t-0 md:border-l border-white/8">
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div key="rp1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                    <SummaryPanel
                      subtotal={subtotal} discountPercent={discountPercent}
                      onDiscountChange={setDiscount} total={total}
                      itemCount={items.length}
                      onContinue={() => setStep(2)}
                      dueSettlementAmount={dueSettlementAmount}
                      advanceSettlementAmount={advanceSettlementAmount}
                    />
                  </motion.div>
                )}
                {step === 2 && (
                  <motion.div key="rp2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                    <PaymentTilePanel
                      total={total} alreadyPaidAmount={alreadyPaidAmount}
                      splits={paymentSplits} onSplitsChange={setSplits}
                      amountDue={amountDue} onDueChange={setAmountDue}
                      roundOffAmount={roundOffAmount} onRoundOffChange={setRoundOffAmount}
                      newAdvanceAmount={newAdvanceAmount} onNewAdvanceChange={setNewAdvanceAmount}
                      promoCoupons={promoCoupons} onPromoCouponsChange={setPromoCoupons}
                      onCheckout={handleGenerateInvoice} onBack={() => setStep(1)}
                      saving={saving} isOnline={isOnlineFlow}
                      paidLabel={isAdvancePay ? `Advance via ${advanceMethod.toUpperCase()}` : 'Paid via Razorpay'}
                      dueSettlementAmount={dueSettlementAmount}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* ── Full-width body (steps 0 + 3/4) ── */}
        {!isTwoPanel && (
          <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-6 scrollbar-hide">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div key="s0" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
                  <CustomerStep
                    onSelect={(c) => { setCustomer(c); setStep(1); }}
                    onBookingFound={(pf) => {
                      setDiscoveredPrefill(pf);
                      setCustomer({
                        phone: normalisePhone(pf.customerPhone),
                        name: pf.customerName,
                        visitCount: 0, totalSpend: 0,
                        firstVisit: new Date().toISOString(),
                        lastVisit: new Date().toISOString(),
                      });
                      setStep(1);
                    }}
                  />
                </motion.div>
              )}
              {(step === 3 || step === 4) && invoice && customer && (
                <motion.div key="s3" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
                  <InvoicePreview invoice={invoice} customer={customer} onClose={() => onClose?.()} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
  );
}


