/**
 * WalkInBooking.tsx
 * Admin / Staff create an appointment on behalf of a customer.
 * Steps: Customer → Services → Date & Time → Confirm
 * Booking is written as:  status='confirmed', paymentMethod='pay_at_salon', bookingSource='walk_in'
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, User, Phone, ChevronLeft, Search, Plus, Minus,
  Calendar, Sun, CloudSun, Moon, CheckCircle2,
  Loader2, CalendarCheck, ShoppingBag, AlertCircle,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  collection, addDoc, serverTimestamp, query, where, getDocs, getDoc, doc,
  orderBy, limit,
} from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { db } from '../lib/firebase';
import { servicesData, Service } from '../constants/services';
import { format, addDays, isSameDay, startOfDay } from 'date-fns';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CartItem { service: Service; qty: number; }

interface SlotOption {
  label: string; startISO: string; endISO: string;
  available: number; session: 'morning' | 'afternoon' | 'evening';
}

type Step = 'customer' | 'services' | 'slot' | 'confirm' | 'success';

// ─── Constants ──────────────────────────────────────────────────────────────────

const STAFF_COUNT    = 3;
const SALON_OPEN_H   = 10;
const SALON_CLOSE_H  = 22;
const SLOT_STEP_MINS = 15;
const BUFFER_MINS    = 15; // smaller buffer for staff-created bookings

const CATEGORY_ORDER = [
  'Combos','Hair Cut','Beard & Shave','Hair Styling','Hair Wash',
  'Hair Colouring','Hair Spa','Hair Treatment','Basic Beauty',
  'Cleanup','Detan','Nail Services','Mani & Pedi','Massages','Makeup','Scalp & Skin','Add-ons',
];
const ALL_CATS = Array.from(new Set(servicesData.map(s => s.category)));
const CATEGORIES = [
  ...CATEGORY_ORDER.filter(c => ALL_CATS.includes(c)),
  ...ALL_CATS.filter(c => !CATEGORY_ORDER.includes(c)),
];

// ─── Slot computation ───────────────────────────────────────────────────────────

function fmtT(d: Date) {
  let h = d.getHours(), mi = d.getMinutes();
  const p = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${String(mi).padStart(2,'0')} ${p}`;
}

function parseMins(t: string): number {
  const m = t.match(/(\d+)\s*min/i); if (m) return +m[1];
  const h = t.match(/(\d+)\s*hr/i);  if (h) return +h[1] * 60;
  return 60;
}

async function fetchSlots(date: Date, totalMins: number): Promise<SlotOption[]> {
  if (totalMins <= 0) return [];
  const s = startOfDay(date).toISOString();
  const e = startOfDay(addDays(date, 1)).toISOString();
  const snap = await getDocs(query(
    collection(db, 'bookings'),
    where('startTime', '>=', s), where('startTime', '<', e),
    where('status', 'in', ['paid','confirmed','pending']),
  ));
  const existing = snap.docs.flatMap(d => {
    const x = d.data();
    return x.startTime && x.endTime ? [{ startTime: x.startTime, endTime: x.endTime }] : [];
  });

  const now     = new Date();
  const buf     = new Date(now.getTime() + BUFFER_MINS * 60_000);
  const openMs  = new Date(date).setHours(SALON_OPEN_H,  0, 0, 0);
  const lastMs  = new Date(date).setHours(SALON_CLOSE_H, 0, 0, 0) - totalMins * 60_000;
  const out: SlotOption[] = [];

  for (let t = openMs; t <= lastMs; t += SLOT_STEP_MINS * 60_000) {
    const e_ = t + totalMins * 60_000;
    if (isSameDay(date, now) && t < buf.getTime()) continue;
    const conc = existing.filter(b =>
      new Date(b.startTime).getTime() < e_ && new Date(b.endTime).getTime() > t
    ).length;
    if (conc >= STAFF_COUNT) continue;
    const sd = new Date(t), h = sd.getHours();
    out.push({
      label: `${fmtT(sd)} – ${fmtT(new Date(e_))}`,
      startISO: sd.toISOString(), endISO: new Date(e_).toISOString(),
      available: STAFF_COUNT - conc,
      session: h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening',
    });
  }
  return out;
}

// ─── Step indicator ─────────────────────────────────────────────────────────────

const STEPS: Step[] = ['customer', 'services', 'slot', 'confirm'];
const STEP_LABELS = ['Customer', 'Services', 'Date & Time', 'Confirm'];

function StepBar({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black transition-all ${
              i < idx  ? 'bg-emerald-500 text-white'
              : i === idx ? 'bg-gold text-black scale-110'
              : 'bg-white/8 text-gray-400 border border-white/10'
            }`}>
              {i < idx ? <CheckCircle2 size={12}/> : i + 1}
            </div>
            <span className={`text-[10px] font-black uppercase tracking-wider hidden sm:inline ${i === idx ? 'text-gold' : i < idx ? 'text-emerald-400' : 'text-gray-400'}`}>{label}</span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className={`w-6 sm:w-10 h-px mx-1 ${i < idx ? 'bg-emerald-500/50' : 'bg-white/8'}`}/>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onCreated?: (bookingId: string) => void;
  /** Firebase Auth user — UID is written to createdBy field */
  user?: FirebaseUser;
  /** If the logged-in user is a staff member, pass this to tag the booking */
  staffMember?: { id: string; name: string };
  /** @deprecated pass user.uid via user prop instead */
  createdBy?: 'admin' | 'staff';
  /** @deprecated use staffMember.name instead */
  staffName?: string;
}

export default function WalkInBooking({ onClose, onCreated, user, staffMember, createdBy = 'admin', staffName }: Props) {
  const [step,         setStep]         = useState<Step>('customer');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone,setCustomerPhone]= useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [autoFilled,   setAutoFilled]   = useState(false);
  const [customerList, setCustomerList] = useState<{ phone: string; name: string }[]>([]);
  const [suggestions,  setSuggestions]  = useState<{ phone: string; name: string }[]>([]);
  const [showDrop,     setShowDrop]     = useState(false);
  const [dropPos,      setDropPos]      = useState<{ top: number; left: number; width: number } | null>(null);
  const phoneWrapRef = useRef<HTMLDivElement>(null);
  const [cart,         setCart]         = useState<CartItem[]>([]);
  const [search,       setSearch]       = useState('');
  const [openCat,      setOpenCat]      = useState<string | null>(CATEGORIES[0]);
  const [selDate,      setSelDate]      = useState(() => new Date());
  const [slots,        setSlots]        = useState<SlotOption[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selSlot,      setSelSlot]      = useState<SlotOption | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [saveErr,      setSaveErr]      = useState<string | null>(null);
  const [savedId,      setSavedId]      = useState<string | null>(null);

  const dateStrip = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));

  const totalMins = useMemo(() => cart.reduce((a, i) => a + parseMins(i.service.time) * i.qty, 0), [cart]);
  const totalAmt  = useMemo(() => cart.reduce((a, i) => a + i.service.priceValue * i.qty, 0), [cart]);

  // Phone auto-fill
  useEffect(() => {
    const digits = customerPhone.replace(/\D/g, '').slice(-10);
    if (digits.length < 10) return;
    const t = setTimeout(async () => {
      setPhoneLoading(true);
      try {
        // 1. Check customers collection first — instant O(1) lookup by normalized phone (doc ID)
        const custSnap = await getDoc(doc(db, 'customers', digits));
        if (custSnap.exists()) {
          const name = (custSnap.data().name ?? '').trim();
          if (name && !customerName) { setCustomerName(name); setAutoFilled(true); return; }
        }

        // 2. Fall back to bookings collection (covers customers not yet in customers collection)
        const snaps = await Promise.all(
          [digits, `+91${digits}`, `+91 ${digits}`, `91${digits}`, `0${digits}`].map(
            fmt => getDocs(query(collection(db, 'bookings'), where('customerPhone', '==', fmt)))
          )
        );
        for (const snap of snaps) {
          if (!snap.empty) {
            const name = (snap.docs[0].data().customerName ?? '').trim();
            if (name && !customerName) { setCustomerName(name); setAutoFilled(true); break; }
          }
        }
      } catch { /* silent */ }
      finally { setPhoneLoading(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [customerPhone]);

  // Load customer list once for live suggestions
  useEffect(() => {
    getDocs(query(collection(db, 'customers'), orderBy('lastVisit', 'desc'), limit(500)))
      .then(snap => setCustomerList(snap.docs.map(d => ({ phone: d.id, name: (d.data().name ?? '') }))))
      .catch(() => {});
  }, []);

  // Click-outside closes dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (phoneWrapRef.current && !phoneWrapRef.current.contains(e.target as Node)) setShowDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Calculate fixed viewport position so dropdown escapes overflow-y-auto clipping
  useEffect(() => {
    if (showDrop && phoneWrapRef.current) {
      const r = phoneWrapRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [showDrop, suggestions]);

  // Live suggestions after 3+ chars in phone field
  useEffect(() => {
    const raw    = customerPhone.trim();
    const digits = raw.replace(/\D/g, '');
    if (raw.length < 3) { setSuggestions([]); setShowDrop(false); return; }
    const matches = customerList.filter((c: { phone: string; name: string }) =>
      digits.length >= 3
        ? c.phone.includes(digits)
        : c.name.toLowerCase().includes(raw.toLowerCase())
    ).slice(0, 8);
    setSuggestions(matches);
    setShowDrop(matches.length > 0);
  }, [customerPhone, customerList]);

  // Load slots when date changes (and we're on the slot step)
  useEffect(() => {
    if (step !== 'slot' || totalMins <= 0) return;
    setSlotsLoading(true); setSelSlot(null);
    fetchSlots(selDate, totalMins)
      .then(s => setSlots(s))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selDate, step, totalMins]);

  const qty    = (id: string) => cart.find(i => i.service.id === id)?.qty ?? 0;
  const setQty = useCallback((id: string, delta: number) => {
    setCart(prev => {
      const ex = prev.find(i => i.service.id === id);
      if (!ex) return delta > 0 ? [...prev, { service: servicesData.find(s => s.id === id)!, qty: 1 }] : prev;
      const n = ex.qty + delta;
      return n <= 0 ? prev.filter(i => i.service.id !== id) : prev.map(i => i.service.id === id ? { ...i, qty: n } : i);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return servicesData;
    const q = search.toLowerCase();
    return servicesData.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [search]);

  const grouped = useMemo(() => {
    const g: Record<string, Service[]> = {};
    filtered.forEach(s => { (g[s.category] = g[s.category] ?? []).push(s); });
    return g;
  }, [filtered]);

  const handleConfirm = async () => {
    if (!selSlot) return;
    setSaving(true); setSaveErr(null);
    try {
      // Determine who is creating this booking
      const createdByUid  = user?.uid ?? createdBy;
      const createdByName = staffMember?.name ?? staffName ?? createdBy;

      const docRef = await addDoc(collection(db, 'bookings'), {
        // Customer
        customerName:        customerName.trim(),
        customerPhone:       customerPhone.replace(/\D/g,'').slice(-10),
        customerEmail:       '',

        // Slot
        startTime:           selSlot.startISO,
        endTime:             selSlot.endISO,
        bookingTime:         selSlot.label,
        bookingDate:         startOfDay(selDate).toISOString(),

        // Services
        serviceNames:        cart.map(i => i.service.name).join(', '),
        serviceDurationMins: totalMins,

        // Payment / billing
        totalAmount:         totalAmt,
        originalAmount:      totalAmt,
        status:              'confirmed',
        paymentMethod:       'pay_at_salon',
        paymentId:           '',

        // Walk-in metadata
        bookingSource:       'walk_in',
        bookingType:         'appointment',
        createdBy:           createdByUid,
        createdByName,

        // Timestamps
        createdAt:           serverTimestamp(),
      });
      setSavedId(docRef.id);
      setStep('success');
      onCreated?.(docRef.id);
    } catch (e: any) {
      setSaveErr(e?.message ?? 'Failed to save booking. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canGoNext = step === 'customer' ? customerName.trim().length >= 2 && customerPhone.replace(/\D/g,'').length >= 10
                  : step === 'services' ? cart.length > 0
                  : step === 'slot'     ? !!selSlot
                  : false;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

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
            <div className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
              <CalendarCheck size={15} className="text-teal-400" />
            </div>
            <div>
              <p className="text-white font-black uppercase tracking-tight text-sm leading-none">Walk-In Booking</p>
              <p className="text-gray-400 text-[10px] mt-0.5">Creating on behalf of customer · Pay at Salon</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors">
            <X size={16}/>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-6 scrollbar-hide">
          {step !== 'success' && <StepBar current={step} />}

          <AnimatePresence mode="wait">

            {/* ── CUSTOMER STEP ── */}
            {step === 'customer' && (
              <motion.div key="customer" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="space-y-5">
                <div>
                  <h3 className="text-white font-black text-lg uppercase tracking-tight mb-1">Customer Details</h3>
                  <p className="text-gray-500 text-xs">Enter customer information. Phone auto-fills name from previous visits.</p>
                </div>

                {/* Phone first */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-300 block mb-2">Mobile Number <span className="text-red-400">*</span></label>
                  <div ref={phoneWrapRef} className="relative">
                    <Phone size={15} className="absolute left-3 top-3.5 text-gray-400 z-10"/>
                    <input type="tel" placeholder="Phone number or name…" value={customerPhone}
                      onChange={e => { setCustomerPhone(e.target.value); setAutoFilled(false); }}
                      onFocus={() => suggestions.length > 0 && setShowDrop(true)}
                      className="w-full bg-white/8 border border-white/10 rounded-xl py-3 pl-9 pr-10 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
                    />
                    {phoneLoading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gold animate-spin"/>}

                    {/* Live suggestions — fixed position escapes overflow-y-auto clipping */}
                    <AnimatePresence>
                      {showDrop && dropPos && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
                          className="bg-zinc-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden"
                        >
                          {suggestions.map((c: { phone: string; name: string }) => (
                            <button
                              key={c.phone}
                              onMouseDown={(e: { preventDefault(): void }) => {
                                e.preventDefault();
                                setCustomerPhone(c.phone);
                                setCustomerName(c.name);
                                setAutoFilled(true);
                                setShowDrop(false);
                                setSuggestions([]);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/8 transition-colors text-left border-b border-white/12 last:border-0"
                            >
                              <div className="w-8 h-8 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center text-gold text-xs font-black shrink-0">
                                {(c.name || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-bold truncate">{c.name}</p>
                                <p className="text-gray-400 text-xs">{c.phone}</p>
                              </div>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-300 block mb-2">Full Name <span className="text-red-400">*</span></label>
                  {autoFilled && (
                    <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                      <CheckCircle2 size={13}/> Returning customer — name auto-filled
                      <button onClick={() => { setAutoFilled(false); setCustomerName(''); }} className="ml-auto">
                        <X size={12}/>
                      </button>
                    </div>
                  )}
                  <div className="relative">
                    <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                    <input type="text" placeholder="Customer full name" value={customerName}
                      onChange={e => { setCustomerName(e.target.value); setAutoFilled(false); }}
                      className={`w-full bg-white/8 border rounded-xl py-3 pl-9 pr-4 text-white text-sm focus:outline-none transition-all placeholder:text-gray-500 ${autoFilled ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 focus:border-gold/50'}`}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── SERVICES STEP ── */}
            {step === 'services' && (
              <motion.div key="services" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="space-y-4">
                <div>
                  <h3 className="text-white font-black text-lg uppercase tracking-tight mb-1">Select Services</h3>
                  <p className="text-gray-500 text-xs">Add services for {customerName}.</p>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                  <input type="text" placeholder="Search services…" value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-white/8 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
                  />
                </div>

                {/* Cart summary */}
                {cart.length > 0 && (
                  <div className="bg-white/[0.03] border border-white/12 rounded-xl p-3 space-y-1">
                    <p className="text-[9px] uppercase tracking-wider font-black text-gray-500 mb-2">Selected ({cart.length} services · ₹{totalAmt.toLocaleString('en-IN')})</p>
                    {cart.map(({ service, qty: q }) => (
                      <div key={service.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-300 truncate flex-1">{service.name}{q > 1 ? ` ×${q}` : ''}</span>
                        <span className="text-gold font-black shrink-0 ml-3">₹{(service.priceValue * q).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Catalogue */}
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-hide">
                  {(search ? Object.entries(grouped) : CATEGORIES.filter(c => grouped[c]?.length).map(c => [c, grouped[c]] as [string, Service[]])).map(([cat, svcs]) => (
                    <div key={cat} className="border border-white/12 rounded-xl overflow-hidden">
                      <button onClick={() => setOpenCat(openCat === cat ? null : cat)}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] transition-all">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{cat}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-gray-400">{(svcs as Service[]).length}</span>
                          {openCat === cat ? <ChevronUp size={11} className="text-gray-400"/> : <ChevronDown size={11} className="text-gray-400"/>}
                        </div>
                      </button>
                      <AnimatePresence>
                        {(search || openCat === cat) && (
                          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                            <div className="divide-y divide-white/5">
                              {(svcs as Service[]).map(svc => {
                                const q = qty(svc.id);
                                return (
                                  <div key={svc.id} className={`flex items-center justify-between px-4 py-2 ${q > 0 ? 'bg-gold/5' : 'hover:bg-white/[0.03]'} transition-all`}>
                                    <div className="min-w-0 flex-1">
                                      <p className={`text-xs font-medium truncate ${q > 0 ? 'text-gold' : 'text-gray-300'}`}>{svc.name}</p>
                                      <p className="text-[9px] text-gray-400">{svc.time}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 ml-3">
                                      <span className="text-xs font-black text-white">{svc.price}</span>
                                      {q > 0 ? (
                                        <div className="flex items-center gap-0 border border-gold/40 rounded-lg overflow-hidden">
                                          <button onClick={() => setQty(svc.id, -1)} className="px-2 py-1 text-gold hover:bg-gold/10 transition-colors"><Minus size={9}/></button>
                                          <span className="px-2 text-[10px] font-black text-gold">{q}</span>
                                          <button onClick={() => setQty(svc.id, 1)} className="px-2 py-1 text-gold hover:bg-gold/10 transition-colors"><Plus size={9}/></button>
                                        </div>
                                      ) : (
                                        <button onClick={() => setQty(svc.id, 1)} className="w-7 h-7 rounded-full bg-gold/20 border border-gold/30 text-gold hover:bg-gold/30 flex items-center justify-center transition-all"><Plus size={10}/></button>
                                      )}
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
              </motion.div>
            )}

            {/* ── SLOT STEP ── */}
            {step === 'slot' && (
              <motion.div key="slot" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="space-y-5">
                <div>
                  <h3 className="text-white font-black text-lg uppercase tracking-tight mb-1">Date & Time</h3>
                  <p className="text-gray-500 text-xs">~{totalMins} min session needed</p>
                </div>

                {/* Date strip */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-3">Choose Date</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {dateStrip.map(d => {
                      const active = isSameDay(d, selDate);
                      return (
                        <button key={d.toString()} onClick={() => setSelDate(d)}
                          className={`shrink-0 w-14 h-16 rounded-2xl flex flex-col items-center justify-center transition-all border-2 ${active ? 'bg-gold border-gold text-black' : 'bg-white/[0.03] border-white/12 text-gray-400 hover:border-gold/30'}`}>
                          <span className={`text-[9px] font-bold ${active ? 'text-black/70' : 'text-gray-500'}`}>{format(d,'EEE')}</span>
                          <span className="text-lg font-black">{format(d,'d')}</span>
                          {isSameDay(d, new Date()) && <span className={`text-[8px] font-black ${active ? 'text-black/60' : 'text-gold'}`}>Today</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Slots */}
                {slotsLoading ? (
                  <div className="flex items-center justify-center gap-3 py-10 text-gray-500">
                    <Loader2 size={18} className="animate-spin text-gold"/> Checking availability…
                  </div>
                ) : slots.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <Calendar size={32} className="mx-auto mb-2 text-gray-700"/>
                    <p className="text-sm font-bold">No slots available</p>
                    <p className="text-xs mt-1">Try a different date</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(['morning','afternoon','evening'] as const).map(sess => {
                      const list = slots.filter(s => s.session === sess);
                      if (!list.length) return null;
                      const Icon = sess === 'morning' ? Sun : sess === 'afternoon' ? CloudSun : Moon;
                      const iconCls = sess === 'morning' ? 'text-amber-400' : sess === 'afternoon' ? 'text-orange-400' : 'text-indigo-400';
                      return (
                        <div key={sess}>
                          <div className="flex items-center gap-2 mb-2">
                            <Icon size={13} className={iconCls}/>
                            <span className="text-xs font-bold text-gray-400 capitalize">{sess}</span>
                            <span className="ml-auto text-[10px] text-emerald-500 font-bold">{list.length} available</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {list.map(slot => (
                              <button key={slot.startISO} onClick={() => setSelSlot(slot)}
                                className={`py-3 px-2 rounded-xl border-2 text-[11px] font-bold text-center transition-all ${
                                  selSlot?.startISO === slot.startISO
                                    ? 'bg-gold border-gold text-black'
                                    : slot.available === 1
                                      ? 'border-orange-400/40 bg-orange-500/8 text-orange-300 hover:border-orange-400'
                                      : 'border-white/10 bg-white/[0.03] text-gray-400 hover:border-gold/30 hover:text-white'
                                }`}>
                                <div>{slot.label.split('–')[0].trim()}</div>
                                {slot.available === 1 && <div className="text-[9px] text-orange-400 mt-0.5">1 spot left</div>}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── CONFIRM STEP ── */}
            {step === 'confirm' && (
              <motion.div key="confirm" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="space-y-4">
                <div>
                  <h3 className="text-white font-black text-lg uppercase tracking-tight mb-1">Confirm Walk-In Booking</h3>
                  <p className="text-gray-500 text-xs">Review and confirm the appointment.</p>
                </div>

                {/* Summary card */}
                <div className="bg-white/[0.03] border border-teal-500/20 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 bg-teal-500/8 border-b border-teal-500/10 flex items-center gap-2">
                    <CalendarCheck size={14} className="text-teal-400"/>
                    <p className="text-teal-400 font-black text-sm uppercase tracking-wider">Walk-In · Pay at Salon</p>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Customer</span><span className="text-white font-bold">{customerName}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Phone</span><span className="text-gray-300">{customerPhone}</span></div>
                    <div className="border-t border-white/10 pt-3">
                      <p className="text-[9px] uppercase tracking-wider text-gray-500 mb-2">Services</p>
                      {cart.map(({ service, qty: q }) => (
                        <div key={service.id} className="flex justify-between text-xs mb-1">
                          <span className="text-gray-300">{service.name}{q > 1 ? ` ×${q}` : ''}</span>
                          <span className="text-white font-bold">₹{(service.priceValue * q).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-black text-sm pt-2 border-t border-white/10 mt-2">
                        <span className="text-gray-400">Total Due at Salon</span>
                        <span className="text-gold">₹{totalAmt.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                    <div className="border-t border-white/10 pt-3 space-y-1.5">
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Date</span><span className="text-white">{format(selDate,'EEE, MMM d yyyy')}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Time</span><span className="text-white">{selSlot?.label}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Duration</span><span className="text-white">~{totalMins} min</span></div>
                    </div>
                    <div className="border-t border-white/10 pt-3">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <AlertCircle size={13} className="text-amber-400 shrink-0"/>
                        <p className="text-amber-400 text-[10px] font-bold">Payment will be collected at the salon during billing.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {saveErr && (
                  <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                    <AlertCircle size={13}/>{saveErr}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── SUCCESS ── */}
            {step === 'success' && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8 space-y-4">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5, delay: 0.1 }}
                  className="w-20 h-20 bg-teal-500 rounded-full flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(20,184,166,0.3)]">
                  <CheckCircle2 size={40} className="text-white"/>
                </motion.div>
                <div>
                  <h3 className="text-white font-black text-2xl mb-1">Booking Confirmed!</h3>
                  <p className="text-gray-500 text-sm">{customerName} is booked for {format(selDate,'MMM d')} · {selSlot?.label}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/12 rounded-2xl p-4 text-left space-y-2">
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Services</span><span className="text-gray-300 text-right">{cart.map(i=>i.service.name).join(', ')}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Amount Due</span><span className="text-gold font-black">₹{totalAmt.toLocaleString('en-IN')}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Payment</span><span className="text-amber-400 font-bold">Pay at Salon</span></div>
                  {savedId && <div className="flex justify-between text-xs"><span className="text-gray-500">Ref ID</span><span className="text-gray-400 font-mono text-[10px]">{savedId.slice(-8)}</span></div>}
                </div>
                <button onClick={onClose} className="w-full py-3.5 bg-white/8 border border-white/10 rounded-2xl text-white font-bold text-sm hover:bg-white/10 transition-all">
                  Done
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer nav */}
        {step !== 'success' && (
          <div className="px-7 py-5 border-t border-white/12 shrink-0 flex items-center justify-between gap-4">
            {/* Running total */}
            {cart.length > 0 && step !== 'customer' && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <ShoppingBag size={13} className="text-teal-400"/>
                <span>{cart.reduce((a,i)=>a+i.qty,0)} service{cart.reduce((a,i)=>a+i.qty,0)!==1?'s':''}</span>
                <span className="text-gold font-black">₹{totalAmt.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="flex items-center gap-3 ml-auto">
              {STEPS.indexOf(step) > 0 && (
                <button onClick={() => setStep(STEPS[STEPS.indexOf(step) - 1])}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/8 border border-white/10 rounded-xl text-xs font-bold text-gray-300 hover:bg-white/10 transition-all">
                  <ChevronLeft size={13}/> Back
                </button>
              )}
              {step !== 'confirm' ? (
                <button disabled={!canGoNext}
                  onClick={() => setStep(STEPS[STEPS.indexOf(step) + 1])}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-xl text-black font-black text-xs uppercase tracking-wider disabled:opacity-40 disabled:grayscale transition-all">
                  Continue →
                </button>
              ) : (
                <button onClick={handleConfirm} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-xl text-black font-black text-xs uppercase tracking-wider disabled:opacity-40 transition-all">
                  {saving ? <Loader2 size={13} className="animate-spin"/> : <CalendarCheck size={13}/>}
                  {saving ? 'Saving…' : 'Confirm Booking'}
                </button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}


