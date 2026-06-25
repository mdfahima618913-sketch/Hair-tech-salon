import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, X, Phone, Calendar, Clock,
  CheckCircle2, AlertCircle, Loader2,
  IndianRupee, CalendarClock, History,
  Edit2, CalendarCheck, Sun, CloudSun, Moon, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { collection, query, where, getDocs, doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { format, parseISO, isToday, isFuture, startOfDay, addDays, isSameDay } from 'date-fns';

// ─── Slot computation (mirrors BookingSystem logic) ───────────────────────────

const STAFF_COUNT    = 3;
const SALON_OPEN_H   = 10;
const SALON_CLOSE_H  = 22;
const SLOT_STEP_MINS = 15;
const BUFFER_MINS    = 30;

interface SlotOption {
  label:     string;
  startISO:  string;
  endISO:    string;
  available: number;
  session:   'morning' | 'afternoon' | 'evening';
}

interface ExistingBooking { startTime: string; endTime: string; }

function fmtT(d: Date) {
  let h = d.getHours(), mi = d.getMinutes();
  const p = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${String(mi).padStart(2,'0')} ${p}`;
}

// Razorpay global type
declare global { interface Window { Razorpay: new (o: any) => any; } }

const RAZORPAY_KEY = (import.meta as any).env?.VITE_RAZORPAY_KEY_ID as string;

function loadRazorpay() {
  return new Promise<boolean>(resolve => {
    if (document.querySelector('script[src*="razorpay"]')) { resolve(true); return; }
    const s    = document.createElement('script');
    s.src      = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload   = () => resolve(true);
    s.onerror  = () => resolve(false);
    document.body.appendChild(s);
  });
}

function computeSlots(date: Date, mins: number, existing: ExistingBooking[]): SlotOption[] {
  if (mins <= 0) return [];
  const now      = new Date();
  const buf      = new Date(now.getTime() + BUFFER_MINS * 60_000);
  const openMs   = new Date(date).setHours(SALON_OPEN_H,  0, 0, 0);
  const latestMs = new Date(date).setHours(SALON_CLOSE_H, 0, 0, 0) - mins * 60_000;
  const out: SlotOption[] = [];
  for (let t = openMs; t <= latestMs; t += SLOT_STEP_MINS * 60_000) {
    const e = t + mins * 60_000;
    if (isSameDay(date, now) && t < buf.getTime()) continue;
    const concurrent = existing.filter(b =>
      new Date(b.startTime).getTime() < e && new Date(b.endTime).getTime() > t
    ).length;
    if (concurrent >= STAFF_COUNT) continue;
    const sd = new Date(t), ed = new Date(e);
    const h  = sd.getHours();
    out.push({
      label:     `${fmtT(sd)} – ${fmtT(ed)}`,
      startISO:  sd.toISOString(),
      endISO:    ed.toISOString(),
      available: STAFF_COUNT - concurrent,
      session:   h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening',
    });
  }
  return out;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface InvoiceLineItem {
  name:           string;
  price:          number;
  staffName?:     string | null;
  commissionRate?: number;
  commissionAmt?: number;
}

interface Booking {
  id:                 string;
  customerName:       string;
  customerPhone:      string;
  serviceNames:       string;
  bookingDate:        string;
  bookingTime:        string;
  startTime?:         string;
  endTime?:           string;
  totalAmount:        number;
  originalAmount?:    number;
  discountAmount?:    number;
  discountPercent?:   number;
  couponCode?:        string;
  status:             string;
  serviceDurationMins?: number;
  paymentId?:         string;
  // Populated when a bill is generated from this booking
  invoiceId?:         string;
  invoiceBreakdown?:  InvoiceLineItem[];
  finalAmount?:       number;
}

type BookingKind = 'upcoming' | 'today' | 'past';

interface Props { isOpen: boolean; onClose: () => void; }

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getDate(b: Booking): Date | null {
  try {
    const raw = b.startTime || b.bookingDate;
    return raw ? parseISO(raw) : null;
  } catch { return null; }
}

function classifyBooking(b: Booking): BookingKind {
  const d = getDate(b);
  if (!d) return 'past';
  if (isToday(d)) return 'today';
  if (isFuture(startOfDay(d))) return 'upcoming';
  return 'past';
}

function fmtDate(b: Booking): string {
  const d = getDate(b);
  return d ? format(d, 'EEE, MMM d yyyy') : '—';
}

const STATUS_STYLE: Record<string, { text: string; cls: string }> = {
  paid:      { text: 'Paid',       cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  confirmed: { text: 'Confirmed',  cls: 'text-blue-400    bg-blue-400/10    border-blue-400/20'    },
  completed: { text: 'Completed',  cls: 'text-purple-400  bg-purple-400/10  border-purple-400/20'  },
  pending:   { text: 'Pending',    cls: 'text-amber-400   bg-amber-400/10   border-amber-400/20'   },
  failed:    { text: 'Failed',     cls: 'text-red-400     bg-red-400/10     border-red-400/20'     },
};

function statusMeta(s: string) {
  return STATUS_STYLE[s] ?? { text: s, cls: 'text-gray-400 bg-gray-400/10 border-gray-400/20' };
}

const KIND_BADGE: Record<BookingKind, { label: string; cls: string } | null> = {
  upcoming: { label: '✈ Upcoming',  cls: 'text-gold bg-gold/10 border-gold/30' },
  today:    { label: '● Today',     cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30 animate-pulse' },
  past:     null,
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AppointmentLookup({ isOpen, onClose }: Props) {
  const [phone,    setPhone]    = useState('');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // ── Retry payment state ─────────────────────────────────────────────────────
  const [payingId,     setPayingId]     = useState<string | null>(null);
  const [payErr2,      setPayErr2]      = useState<string | null>(null);
  const [invoiceId,    setInvoiceId]    = useState<string | null>(null);
  const [invoiceData,  setInvoiceData]  = useState<any | null>(null);
  const [invLoading,   setInvLoading]   = useState(false);

  const retryPayment = useCallback(async (b: Booking) => {
    setPayErr2(null);
    const ok = await loadRazorpay();
    if (!ok) { setPayErr2('Could not load payment portal. Please try again.'); return; }
    setPayingId(b.id);
    try {
      new window.Razorpay({
        key:      RAZORPAY_KEY,
        amount:   (b.totalAmount ?? 0) * 100,
        currency: 'INR',
        name:     'Hair Tech Salon',
        description: b.serviceNames,
        prefill:  { name: b.customerName, contact: b.customerPhone, email: '' },
        theme:    { color: '#D4AF37' },
        notes:    { bookingId: b.id },
        handler:  async (res: any) => {
          await updateDoc(doc(db, 'bookings', b.id), {
            status:    'paid',
            paymentId:  res.razorpay_payment_id,
            updatedAt:  serverTimestamp(),
          });
          setBookings(prev => prev?.map(bk =>
            bk.id === b.id ? { ...bk, status: 'paid', paymentId: res.razorpay_payment_id } : bk
          ) ?? null);
          setPayingId(null);
        },
        modal: { ondismiss: () => setPayingId(null) },
      }).open();
    } catch { setPayingId(null); }
  }, []);

  const viewInvoice = useCallback(async (invId: string) => {
    if (invoiceId === invId) { setInvoiceId(null); setInvoiceData(null); return; }
    setInvoiceId(invId);
    setInvLoading(true);
    try {
      const snap = await getDoc(doc(db, 'invoices', invId));
      if (snap.exists()) setInvoiceData(snap.data());
    } catch { /* silent */ }
    finally { setInvLoading(false); }
  }, [invoiceId]);

  // ── Reschedule state ────────────────────────────────────────────────────────
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [editDate,       setEditDate]       = useState(() => new Date());
  const [editSlots,      setEditSlots]      = useState<SlotOption[]>([]);
  const [editSelSlot,    setEditSelSlot]    = useState<SlotOption | null>(null);
  const [slotsLoading,   setSlotsLoading]   = useState(false);
  const [editSaving,     setEditSaving]     = useState(false);
  const [editSuccess,    setEditSuccess]    = useState<string | null>(null);
  const dateStrip = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i + 1));

  const openEdit = useCallback((b: Booking) => {
    setEditingId(b.id);
    setEditDate(addDays(new Date(), 1));
    setEditSelSlot(null);
    setEditSlots([]);
    setEditSuccess(null);
  }, []);

  const closeEdit = useCallback(() => {
    setEditingId(null);
    setEditSelSlot(null);
    setEditSlots([]);
    setEditSuccess(null);
  }, []);

  const loadSlots = useCallback(async (date: Date, durationMins: number) => {
    setSlotsLoading(true);
    setEditSelSlot(null);
    try {
      const s   = startOfDay(date).toISOString();
      const e   = startOfDay(addDays(date, 1)).toISOString();
      const snap = await getDocs(query(
        collection(db, 'bookings'),
        where('startTime', '>=', s),
        where('startTime', '<', e),
        where('status', 'in', ['paid', 'confirmed', 'pending']),
      ));
      const existing: ExistingBooking[] = snap.docs.flatMap(d => {
        const x = d.data();
        if (x.startTime && x.endTime) return [{ startTime: x.startTime, endTime: x.endTime }];
        return [];
      });
      setEditSlots(computeSlots(date, durationMins || 60, existing));
    } catch { setEditSlots([]); }
    finally { setSlotsLoading(false); }
  }, []);

  const saveReschedule = useCallback(async (booking: Booking) => {
    if (!editSelSlot) return;
    setEditSaving(true);
    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        bookingDate: startOfDay(editDate).toISOString(),
        bookingTime: editSelSlot.label,
        startTime:   editSelSlot.startISO,
        endTime:     editSelSlot.endISO,
      });
      // Update local state
      setBookings(prev => prev?.map(b => b.id === booking.id
        ? { ...b, bookingDate: startOfDay(editDate).toISOString(), bookingTime: editSelSlot.label, startTime: editSelSlot.startISO, endTime: editSelSlot.endISO }
        : b) ?? null
      );
      setEditSuccess(`Rescheduled to ${format(editDate, 'EEE, MMM d')} · ${editSelSlot.label}`);
      setTimeout(() => { closeEdit(); }, 2200);
    } catch {
      setEditSuccess(null);
    } finally {
      setEditSaving(false);
    }
  }, [editSelSlot, editDate, closeEdit]);

  const search = async () => {
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (digits.length < 10) { setError('Enter a valid 10-digit mobile number'); return; }

    setLoading(true); setError(null); setBookings(null);
    try {
      const seen    = new Set<string>();
      const results: Booking[] = [];

      // Parallel queries — 5 formats to cover all common Indian phone variants
      const formats = [digits, `+91${digits}`, `+91 ${digits}`, `91${digits}`, `0${digits}`];
      const snaps = await Promise.all(
        formats.map(fmt => getDocs(query(collection(db, 'bookings'), where('customerPhone', '==', fmt))))
      );
      snaps.forEach(snap => snap.docs.forEach(d => {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          results.push({ id: d.id, ...(d.data() as Omit<Booking, 'id'>) });
        }
      }));

      // Sort: upcoming/today first (ascending), then past most-recent first
      results.sort((a, b) => {
        const ka = classifyBooking(a), kb = classifyBooking(b);
        const order = { today: 0, upcoming: 1, past: 2 };
        if (order[ka] !== order[kb]) return order[ka] - order[kb];
        const da = getDate(a)?.getTime() ?? 0;
        const db_ = getDate(b)?.getTime() ?? 0;
        return ka === 'past' ? db_ - da : da - db_;
      });

      setBookings(results);
    } catch {
      setError('Could not fetch bookings. Please try again.');
    } finally {
      setLoading(false); }
  };

  const reset      = () => { setPhone(''); setBookings(null); setError(null); };
  const handleClose = () => { reset(); onClose(); };

  // Stats
  const upcomingCount = bookings?.filter(b => classifyBooking(b) !== 'past').length ?? 0;
  const pastCount     = bookings?.filter(b => classifyBooking(b) === 'past').length    ?? 0;
  const lastVisit     = bookings?.filter(b => classifyBooking(b) === 'past')?.[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300]"
          />

          <motion.div
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-x-4 bottom-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg z-[301] bg-[#0d0d0d] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8">
              <div>
                <h3 className="text-white font-black text-base">Booking History</h3>
                <p className="text-gray-500 text-xs mt-0.5">Enter mobile number to view your appointments</p>
              </div>
              <button onClick={handleClose} className="p-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Search */}
              <div className="flex gap-2.5">
                <div className="relative flex-1">
                  <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="tel" placeholder="Enter 10-digit mobile number" value={phone}
                    onChange={e => setPhone(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && search()}
                    maxLength={13}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-4 py-3 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-gold/50 transition-all"
                  />
                </div>
                <button onClick={search} disabled={loading}
                  className="px-4 py-3 bg-gold rounded-xl text-black font-black flex items-center gap-1.5 disabled:opacity-50 hover:shadow-[0_4px_16px_-4px_rgba(212,175,55,0.5)] transition-all">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/8 border border-red-400/15 rounded-xl px-3 py-2.5">
                  <AlertCircle size={12} /> {error}
                </div>
              )}

              {/* Results */}
              {bookings !== null && (
                <div className="space-y-3">
                  {bookings.length === 0 ? (
                    <div className="text-center py-8 space-y-2">
                      <Search size={28} className="text-gray-700 mx-auto" />
                      <p className="text-gray-400 text-sm font-bold">No bookings found</p>
                      <p className="text-gray-600 text-xs">No appointments found for this number</p>
                      <button onClick={reset} className="text-gold text-xs font-bold hover:underline">Try another number</button>
                    </div>
                  ) : (
                    <>
                      {/* Summary row */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {upcomingCount > 0 && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gold/8 border border-gold/20">
                            <CalendarClock size={11} className="text-gold" />
                            <span className="text-xs font-black text-gold uppercase tracking-wider">
                              {upcomingCount} upcoming
                            </span>
                          </div>
                        )}
                        {pastCount > 0 && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/8">
                            <History size={11} className="text-gray-400" />
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                              {pastCount} past
                            </span>
                          </div>
                        )}
                        {lastVisit && (
                          <span className="text-xs text-gray-600 ml-auto">
                            Last visit: {fmtDate(lastVisit)}
                          </span>
                        )}
                      </div>

                      {/* Booking cards */}
                      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-0.5 scrollbar-hide">
                        {bookings.map(b => {
                          const kind    = classifyBooking(b);
                          const badge   = KIND_BADGE[kind];
                          const sm      = statusMeta(b.status);
                          const isPaid  = b.status === 'paid' || b.status === 'confirmed' || b.status === 'completed';
                          const hasCoupon = !!b.couponCode && b.discountAmount && b.discountAmount > 0;

                          return (
                            <div key={b.id}
                              className={`rounded-2xl overflow-hidden border transition-all ${
                                kind === 'today'    ? 'border-emerald-400/30 bg-emerald-400/[0.04]' :
                                kind === 'upcoming' ? 'border-gold/25 bg-gold/[0.03]' :
                                                     'border-white/8 bg-white/[0.02]'
                              }`}
                            >
                              {/* Top bar */}
                              <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {badge && (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider border ${badge.cls}`}>
                                      {badge.label}
                                    </span>
                                  )}
                                  <span className="text-white font-bold text-sm">{b.customerName}</span>
                                </div>
                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider border ${sm.cls}`}>
                                  {sm.text}
                                </span>
                              </div>

                              {/* Date + time row */}
                              <div className="flex items-center gap-4 px-4 pb-2">
                                <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                                  <Calendar size={10} className="shrink-0 text-gold/60" />
                                  <span>{fmtDate(b)}</span>
                                </div>
                                {b.bookingTime && (
                                  <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                                    <Clock size={10} className="shrink-0 text-gold/60" />
                                    <span>{b.bookingTime}</span>
                                  </div>
                                )}
                              </div>

                              {/* Services — itemized if invoice exists, else summary */}
                              {b.invoiceBreakdown && b.invoiceBreakdown.length > 0 ? (
                                <div className="px-4 pb-3 space-y-1">
                                  {b.invoiceBreakdown.map((item, i) => (
                                    <div key={i} className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-gray-300 text-[11px] leading-tight truncate">{item.name}</p>
                                        {item.staffName && (
                                          <p className="text-gray-600 text-[11px]">
                                            Staff: {item.staffName}
                                            {item.commissionRate ? ` · ${item.commissionRate}%` : ''}
                                          </p>
                                        )}
                                      </div>
                                      <span className="text-white text-[11px] font-bold shrink-0">
                                        ₹{item.price.toLocaleString('en-IN')}
                                      </span>
                                    </div>
                                  ))}
                                  {(b.discountPercent ?? 0) > 0 && (
                                    <div className="flex justify-between text-xs text-red-400 pt-1 border-t border-white/5">
                                      <span>Discount ({b.discountPercent}%)</span>
                                      <span>-₹{(b.discountAmount ?? 0).toLocaleString('en-IN')}</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="px-4 pb-3">
                                  <p className="text-gray-500 text-[11px] leading-relaxed line-clamp-2">{b.serviceNames}</p>
                                </div>
                              )}

                              {/* Price + payment footer */}
                              <div className={`flex items-center justify-between px-4 py-3 border-t ${
                                kind === 'today'    ? 'border-emerald-400/15 bg-emerald-400/[0.03]' :
                                kind === 'upcoming' ? 'border-gold/15 bg-gold/[0.03]' :
                                                     'border-white/5 bg-white/[0.02]'
                              }`}>
                                {/* Price section */}
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <IndianRupee size={13} className="text-gold" />
                                    <span className="text-gold font-black text-base leading-none">
                                      {(b.finalAmount ?? b.totalAmount ?? 0).toLocaleString('en-IN')}
                                    </span>
                                    {/* Show original if finalAmount differs (discount applied) */}
                                    {b.finalAmount && b.finalAmount !== b.totalAmount && (
                                      <span className="text-gray-600 text-xs line-through">
                                        ₹{(b.totalAmount ?? 0).toLocaleString('en-IN')}
                                      </span>
                                    )}
                                    {hasCoupon && b.originalAmount && !b.finalAmount && (
                                      <span className="text-gray-600 text-xs line-through">
                                        ₹{b.originalAmount.toLocaleString('en-IN')}
                                      </span>
                                    )}
                                  </div>
                                  {hasCoupon && (
                                    <p className="text-emerald-400/80 text-[11px] font-bold mt-0.5">
                                      Coupon {b.couponCode} — saved ₹{b.discountAmount?.toLocaleString('en-IN')}
                                    </p>
                                  )}
                                  {b.invoiceId && (
                                    <p className="text-purple-400/70 text-[11px] font-bold mt-0.5">✓ Invoice generated</p>
                                  )}
                                </div>

                                {/* Payment status */}
                                <div className="flex flex-col items-end gap-0.5">
                                  {isPaid ? (
                                    <span className="flex items-center gap-1 text-emerald-400 text-xs font-black">
                                      <CheckCircle2 size={11} /> Payment Confirmed
                                    </span>
                                  ) : b.status === 'pending' ? (
                                    <span className="flex items-center gap-1 text-amber-400 text-xs font-black">
                                      <Clock size={11} /> Payment Pending
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-red-400 text-xs font-black">
                                      <AlertCircle size={11} /> {sm.text}
                                    </span>
                                  )}
                                  {b.paymentId && (
                                    <span className="text-gray-700 text-[11px] font-mono">ID: {b.paymentId.slice(-8)}</span>
                                  )}
                                </div>
                              </div>

                              {/* ── Pending payment section ── */}
                              {b.status === 'pending' && (
                                <div className="px-4 pb-3 space-y-2">
                                  <div className="p-3 rounded-xl bg-amber-400/8 border border-amber-400/20 space-y-2">
                                    <p className="text-amber-400 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                                      <AlertCircle size={12} /> Payment Incomplete
                                    </p>
                                    <p className="text-gray-400 text-xs leading-relaxed">
                                      Your booking is saved but payment was not completed. Tap below to pay and confirm your slot.
                                    </p>
                                    {payErr2 && b.id === payingId && (
                                      <p className="text-red-400 text-xs">{payErr2}</p>
                                    )}
                                    <div className="flex gap-2 pt-1">
                                      <button
                                        onClick={() => retryPayment(b)}
                                        disabled={payingId === b.id}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gold text-black text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-all"
                                      >
                                        {payingId === b.id
                                          ? <><Loader2 size={11} className="animate-spin" /> Processing…</>
                                          : <><IndianRupee size={11} /> Pay ₹{(b.totalAmount ?? 0).toLocaleString('en-IN')} to Confirm</>}
                                      </button>
                                    </div>
                                    <p className="text-gray-600 text-[11px] text-center">
                                      Your payment is being verified. If the amount has already been deducted, please{' '}
                                      <a href="tel:+918789603343" className="text-gold underline">contact the salon</a>{' '}
                                      for assistance.
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* ── Invoice button for service-completed orders ── */}
                              {b.invoiceId && b.status === 'completed' && (
                                <div className="px-4 pb-3">
                                  <button
                                    onClick={() => viewInvoice(b.invoiceId!)}
                                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gold/30 bg-gold/8 text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/15 transition-all"
                                  >
                                    <CheckCircle2 size={11} /> {invoiceId === b.invoiceId ? 'Hide Invoice' : 'View Invoice'}
                                  </button>

                                  {/* Inline invoice display */}
                                  <AnimatePresence>
                                    {invoiceId === b.invoiceId && (
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden mt-2"
                                      >
                                        {invLoading ? (
                                          <div className="flex items-center justify-center py-6 gap-2 text-gray-500">
                                            <Loader2 size={16} className="animate-spin text-gold" /> Loading…
                                          </div>
                                        ) : invoiceData ? (
                                          <div className="bg-white text-black rounded-2xl p-4 font-mono text-xs">
                                            <div className="text-center mb-3">
                                              <p className="font-black text-base uppercase">Hair Tech</p>
                                              <p className="text-gray-500 text-xs">Unisex Salon, Araria</p>
                                              <p className="text-[11px] text-gray-400 mt-1">
                                                Invoice: <span className="font-black text-black">{invoiceData.invoiceNumber}</span>
                                              </p>
                                            </div>
                                            <div className="border-t border-dashed border-gray-300 pt-2 mb-2 space-y-1">
                                              {invoiceData.items?.map((it: any, i: number) => (
                                                <div key={i} className="flex justify-between text-xs">
                                                  <span className="text-gray-700 truncate flex-1 pr-2">{it.serviceName}</span>
                                                  <span className="font-bold">₹{it.price?.toLocaleString('en-IN')}</span>
                                                </div>
                                              ))}
                                            </div>
                                            <div className="border-t border-dashed border-gray-300 pt-2 space-y-1">
                                              {invoiceData.discountAmount > 0 && (
                                                <div className="flex justify-between text-xs text-red-600">
                                                  <span>Discount ({invoiceData.discountPercent}%)</span>
                                                  <span>-₹{invoiceData.discountAmount?.toLocaleString('en-IN')}</span>
                                                </div>
                                              )}
                                              <div className="flex justify-between font-black text-sm">
                                                <span>Total</span>
                                                <span style={{ color: '#B8941F' }}>₹{invoiceData.total?.toLocaleString('en-IN')}</span>
                                              </div>
                                              <div className="flex justify-between text-xs text-gray-500">
                                                <span>Payment</span>
                                                <span className="uppercase font-bold text-black">{invoiceData.paymentMethod}</span>
                                              </div>
                                            </div>
                                            <div className="text-center text-[11px] text-gray-400 mt-3 pt-2 border-t border-dashed border-gray-300">
                                              Thank you for visiting Hair Tech Salon!
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-gray-600 text-xs text-center py-3">Invoice not available.</p>
                                        )}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              )}

                              {/* ── Reschedule section — upcoming / today only ── */}
                              {kind !== 'past' && (
                                <div className="px-4 pb-3">
                                  {editingId === b.id ? (
                                    /* ── Inline reschedule panel ── */
                                    <div className="mt-2 rounded-2xl border border-gold/20 bg-gold/[0.04] p-3 space-y-3">
                                      <div className="flex items-center justify-between">
                                        <p className="text-xs font-black uppercase tracking-wider text-gold flex items-center gap-1.5">
                                          <CalendarCheck size={12} /> Change Appointment
                                        </p>
                                        <button onClick={closeEdit} className="text-gray-600 hover:text-white transition-colors">
                                          <X size={14} />
                                        </button>
                                      </div>

                                      {editSuccess ? (
                                        <div className="flex items-center gap-2 py-2 text-emerald-400 text-xs font-bold">
                                          <CheckCircle2 size={14} /> {editSuccess}
                                        </div>
                                      ) : (
                                        <>
                                          {/* Date strip */}
                                          <div>
                                            <p className="text-[11px] text-gray-600 uppercase tracking-wider font-bold mb-2">Pick a date</p>
                                            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                                              {dateStrip.map(d => {
                                                const active = isSameDay(d, editDate);
                                                return (
                                                  <button key={d.toString()}
                                                    onClick={() => { setEditDate(d); loadSlots(d, b.serviceDurationMins ?? 60); }}
                                                    className={`shrink-0 w-12 h-14 rounded-xl flex flex-col items-center justify-center transition-all border ${
                                                      active
                                                        ? 'bg-gold border-gold text-black'
                                                        : 'border-white/10 bg-white/[0.04] text-gray-400 hover:border-gold/40'
                                                    }`}
                                                  >
                                                    <span className={`text-[11px] font-bold ${active ? 'text-black/70' : 'text-gray-500'}`}>
                                                      {format(d, 'EEE')}
                                                    </span>
                                                    <span className="text-sm font-black">{format(d, 'd')}</span>
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </div>

                                          {/* Time slots */}
                                          {slotsLoading ? (
                                            <div className="flex items-center justify-center gap-2 py-3 text-gray-500 text-xs">
                                              <Loader2 size={14} className="animate-spin text-gold" /> Checking availability…
                                            </div>
                                          ) : editSlots.length === 0 && isSameDay(editDate, addDays(new Date(), 1)) ? (
                                            <p className="text-gray-600 text-xs text-center py-2">
                                              Select a date above to see available slots
                                            </p>
                                          ) : editSlots.length === 0 ? (
                                            <p className="text-amber-400 text-xs text-center py-2">
                                              No slots available on this date. Try another day.
                                            </p>
                                          ) : (
                                            <div className="space-y-2">
                                              <p className="text-[11px] text-gray-600 uppercase tracking-wider font-bold">Available slots</p>
                                              {(['morning','afternoon','evening'] as const).map(sess => {
                                                const list = editSlots.filter(s => s.session === sess);
                                                if (!list.length) return null;
                                                const SessionIcon = sess === 'morning' ? Sun : sess === 'afternoon' ? CloudSun : Moon;
                                                const iconCls = sess === 'morning' ? 'text-amber-400' : sess === 'afternoon' ? 'text-orange-400' : 'text-indigo-400';
                                                return (
                                                  <div key={sess}>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                      <SessionIcon size={10} className={iconCls} />
                                                      <span className="text-[11px] text-gray-600 font-bold capitalize">{sess}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-1">
                                                      {list.slice(0, 6).map(slot => (
                                                        <button key={slot.startISO}
                                                          onClick={() => setEditSelSlot(slot)}
                                                          className={`py-2 px-2 rounded-lg text-[11px] font-bold text-center transition-all border ${
                                                            editSelSlot?.startISO === slot.startISO
                                                              ? 'bg-gold border-gold text-black'
                                                              : 'border-white/10 bg-white/[0.03] text-gray-400 hover:border-gold/30 hover:text-white'
                                                          }`}
                                                        >
                                                          {slot.label.split('–')[0].trim()}
                                                          {slot.available === 1 && <span className="text-orange-400 block text-[8px]">1 left</span>}
                                                        </button>
                                                      ))}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}

                                          {/* Action buttons */}
                                          <div className="flex gap-2 pt-1">
                                            <button onClick={closeEdit}
                                              className="flex-1 py-2 rounded-xl border border-white/10 text-gray-500 text-xs font-black uppercase tracking-wider hover:bg-white/5 transition-all">
                                              Cancel
                                            </button>
                                            <button
                                              onClick={() => saveReschedule(b)}
                                              disabled={!editSelSlot || editSaving}
                                              className="flex-1 py-2 rounded-xl bg-gold text-black text-xs font-black uppercase tracking-wider disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                                            >
                                              {editSaving ? <Loader2 size={11} className="animate-spin" /> : <CalendarCheck size={11} />}
                                              {editSaving ? 'Saving…' : 'Confirm'}
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  ) : (
                                    /* ── Reschedule trigger button ── */
                                    <button
                                      onClick={() => openEdit(b)}
                                      className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/8 text-gray-500 text-xs font-black uppercase tracking-wider hover:border-gold/30 hover:text-gold transition-all"
                                    >
                                      <Edit2 size={11} /> Reschedule Appointment
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* CTA */}
              {bookings === null && !loading && (
                <p className="text-center text-gray-700 text-[11px] pt-1">
                  Don't have a booking?{' '}
                  <Link to="/booking" onClick={handleClose} className="text-gold font-bold hover:underline">
                    Book now →
                  </Link>
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
