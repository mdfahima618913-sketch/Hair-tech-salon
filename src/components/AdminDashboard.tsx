import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  LogIn, LogOut, Eye, EyeOff, AlertCircle, Loader2,
  TrendingUp, Calendar, Users, CreditCard, CheckCircle2,
  Clock, XCircle, Search, ChevronDown, ChevronUp,
  RefreshCw, Filter, Download, Scissors, BarChart2,
  ArrowUpRight, ArrowDownRight, Inbox, Bell, BellOff, X,
  CheckSquare, ListChecks, PhoneOff, MessageSquare, Send, Phone,
  TrendingDown, BarChart3, CalendarDays, ChevronRight as ChevronRightIcon,
  Receipt, UserCheck, Plus, Trash2, Edit2, Save, Building2,
  Wallet, BarChart, PieChart, Smartphone, Wrench, Percent, Printer, CalendarPlus, IndianRupee, Crown,
  CalendarCheck, Sun, CloudSun, Moon, Lock,
} from 'lucide-react';
import { format, addDays, subDays, startOfDay, isSameDay, isToday, isYesterday } from 'date-fns';
import BannerManager  from './BannerManager';
import GalleryManager from './GalleryManager';
import CouponManager  from './CouponManager';
import ServiceManager  from './ServiceManager';
import DataIO          from './DataIO';
import ExpenseManager  from './ExpenseManager';
import TrendingServicesManager from './TrendingServicesManager';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection, query, orderBy, onSnapshot, getDocs,
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, where, limit, arrayUnion,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import {
  requestNotificationPermission, startRinging, stopRinging,
  fireDesktopNotification, warmUpAudio,
} from '../lib/notificationSound';
import BillingModule, { type OnlineBookingPrefill, type StaffMember, type Customer, type Invoice, type BillItem, type PaymentSplit, type PaymentMethod } from './BillingModule';
import WalkInBooking    from './WalkInBooking';
import StaffAnalytics    from './StaffAnalytics';
import CustomerAnalytics from './CustomerAnalytics';
import StaffPortal       from './StaffPortal';

// ─── Types ────────────────────────────────────────────────────────────────────

type BookingStatus = 'paid' | 'confirmed' | 'pending' | 'failed' | 'whatsapp_redirected' | 'completed';

interface Booking {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  bookingDate: string;
  bookingTime: string;
  serviceNames: string;
  totalAmount: number;
  status: BookingStatus;
  paymentId?: string;
  orderId?: string;
  invoiceId?: string;        // set once a bill is generated for this booking
  paymentMethod?: string;
  advanceAmount?: number;
  advancePaymentMethod?: string;
  bookingSource?: string;
  createdAt?: Timestamp;
  startTime?: string;
  endTime?: string;
  serviceDurationMins?: number;
  serviceItems?: Array<{ id: string; name: string; qty: number; priceValue: number }>;
  originalBookingDate?: string;
  originalBookingTime?: string;
  originalStartTime?: string;
  originalEndTime?: string;
  rescheduledAt?: Timestamp;
  rescheduleCount?: number;
  failedNote?: string;
  staffNotes?: Array<{ text: string; byName: string; at: string }>;
}

type SortKey = 'createdAt' | 'totalAmount' | 'customerName' | 'bookingDate';
type SortDir = 'asc' | 'desc';
type Period = 'today' | 'week' | 'month' | 'all';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<BookingStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  paid:                 { label: 'Paid',        color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: <CheckCircle2 size={11} /> },
  confirmed:            { label: 'Confirmed',   color: 'text-blue-400',    bg: 'bg-blue-500/10    border-blue-500/20',    icon: <CheckCircle2 size={11} /> },
  pending:              { label: 'Pending',     color: 'text-amber-400',   bg: 'bg-amber-500/10   border-amber-500/20',   icon: <Clock        size={11} /> },
  failed:               { label: 'Failed',      color: 'text-red-400',     bg: 'bg-red-500/10     border-red-500/20',     icon: <XCircle      size={11} /> },
  whatsapp_redirected:  { label: 'WhatsApp',    color: 'text-green-400',   bg: 'bg-green-500/10   border-green-500/20',   icon: <CheckCircle2 size={11} /> },
  completed:            { label: 'Completed',   color: 'text-purple-400',  bg: 'bg-purple-500/10  border-purple-500/20',  icon: <CheckSquare  size={11} /> },
};

// Grace period before notifying admins about a 'pending' booking — gives the
// customer time to complete the Razorpay flow without triggering a false alarm.
const PENDING_NOTIFY_DELAY_MS = 5 * 60_000; // 5 minutes

const EDIT_PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash',    label: 'Cash' },
  { id: 'upi',     label: 'UPI' },
  { id: 'gpay',    label: 'GPay' },
  { id: 'phonepe', label: 'PhonePe' },
  { id: 'paytm',   label: 'Paytm' },
  { id: 'card',    label: 'Card' },
  { id: 'online',  label: 'Razorpay' },
];

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

function fmtTs(ts?: Timestamp | string) {
  if (!ts) return '—';
  const d = typeof ts === 'string' ? new Date(ts) : ts.toDate();
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Parse YYYY-MM-DD from <input type="date"> as LOCAL midnight (avoids UTC-offset label shift). */
function localDate(s: string, endOfDay = false): Date {
  const [y, m, d] = s.split('-').map(Number);
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
}

function fmtPeriodLabel(period: string, from: string, to: string): string {
  const now = new Date();
  if (from && to) {
    const f = localDate(from).toLocaleDateString('en-IN', { day:'numeric', month:'short' });
    const t = localDate(to).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
    return `${f} – ${t}`;
  }
  switch (period) {
    case 'today':     return `Today · ${now.toLocaleDateString('en-IN', { day:'numeric', month:'short' })}`;
    case 'week':      return 'Last 7 days';
    case 'month':
    case 'thisMonth': return now.toLocaleDateString('en-IN', { month:'long', year:'numeric' });
    case 'lastMonth': return new Date(now.getFullYear(), now.getMonth()-1, 1).toLocaleDateString('en-IN', { month:'long', year:'numeric' });
    case 'year':      return now.getFullYear().toString();
    case 'all':       return 'All time';
    default:          return period;
  }
}

// ─── Reschedule slot helpers (mirrors MyAppointments) ─────────────────────────

const STAFF_COUNT = 3; const SALON_OPEN_H = 10; const SALON_CLOSE_H = 22;
const SLOT_STEP_MINS = 15; const BUFFER_MINS = 30;

interface SlotOption { label: string; startISO: string; endISO: string; available: number; session: 'morning'|'afternoon'|'evening'; }
interface ExistingBooking { startTime: string; endTime: string; }

function fmtSlotTime(d: Date) {
  let h = d.getHours(), mi = d.getMinutes();
  const p = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${String(mi).padStart(2,'0')} ${p}`;
}

function computeSlots(date: Date, mins: number, existing: ExistingBooking[]): SlotOption[] {
  if (mins <= 0) return [];
  const now = new Date(), buf = new Date(now.getTime() + BUFFER_MINS * 60_000);
  const openMs = new Date(date).setHours(SALON_OPEN_H, 0, 0, 0);
  const latestMs = new Date(date).setHours(SALON_CLOSE_H, 0, 0, 0) - mins * 60_000;
  const out: SlotOption[] = [];
  for (let t = openMs; t <= latestMs; t += SLOT_STEP_MINS * 60_000) {
    const e = t + mins * 60_000;
    if (isSameDay(date, now) && t < buf.getTime()) continue;
    const concurrent = existing.filter(b => new Date(b.startTime).getTime() < e && new Date(b.endTime).getTime() > t).length;
    if (concurrent >= STAFF_COUNT) continue;
    const sd = new Date(t), ed = new Date(e), h = sd.getHours();
    out.push({ label: `${fmtSlotTime(sd)} – ${fmtSlotTime(ed)}`, startISO: sd.toISOString(), endISO: ed.toISOString(), available: STAFF_COUNT - concurrent, session: h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening' });
  }
  return out;
}

function exportCSV(bookings: Booking[]) {
  const header = ['Name', 'Phone', 'Email', 'Date', 'Time', 'Services', 'Amount', 'Status', 'Payment ID'];
  const rows = bookings.map(b => [
    b.customerName, b.customerPhone, b.customerEmail,
    fmtDate(b.bookingDate), b.bookingTime, b.serviceNames,
    b.totalAmount ?? 0, b.status ?? '', b.paymentId ?? '',
  ]);
  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `bookings_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ─── PIN prompt (own component — typing doesn't re-render Dashboard) ──────────
// No framer-motion, no backdrop-blur — pure CSS, renders instantly.

function PinPromptModal({ targetView, pin, onSuccess, onCancel }: {
  targetView: string; pin: string; onSuccess: () => void; onCancel: () => void;
}) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError]   = useState(false);
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  useEffect(() => { refs[0].current?.focus(); }, []);

  const handleDigit = (idx: number, val: string) => {
    const d = val.replace(/\D/g, '');
    if (!d) return;
    const next = [...digits];
    next[idx] = d[0];
    setDigits(next);
    setError(false);

    if (idx < 3) { refs[idx + 1].current?.focus(); return; }

    // All 4 filled — verify
    const code = next.join('');
    if (code === pin) { onSuccess(); }
    else { setError(true); setDigits(['', '', '', '']); setTimeout(() => refs[0].current?.focus(), 50); }
  };

  const handleKey = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[idx]) {
        const next = [...digits]; next[idx] = ''; setDigits(next);
      } else if (idx > 0) {
        const next = [...digits]; next[idx - 1] = ''; setDigits(next);
        refs[idx - 1].current?.focus();
      }
    }
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-zinc-900 border border-white/15 rounded-2xl p-6 w-[280px] text-center" onClick={e => e.stopPropagation()}>
        <Lock size={20} className="text-gold mx-auto mb-3" />
        <p className="text-white font-black text-sm mb-1">Enter PIN</p>
        <p className="text-gray-500 text-xs mb-5 capitalize">{targetView}</p>
        <div className="flex justify-center gap-3 mb-4">
          {digits.map((d, i) => (
            <input
              key={i} ref={refs[i]}
              type="tel" inputMode="numeric" maxLength={1}
              value={d ? '●' : ''}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKey(i, e)}
              onFocus={e => e.target.select()}
              className={`w-12 h-14 text-center text-xl font-black rounded-xl bg-zinc-800 border-2 text-white focus:outline-none ${
                error ? 'border-red-500' : d ? 'border-gold/60' : 'border-white/15 focus:border-gold/40'
              }`}
            />
          ))}
        </div>
        {error && <p className="text-red-400 text-xs font-bold mb-3">Wrong PIN</p>}
        <button onClick={onCancel} className="text-gray-500 text-xs hover:text-white">Cancel</button>
      </div>
    </div>
  );
}

// ─── In-app new booking banner ─────────────────────────────────────────────────

interface NewBookingBannerProps {
  booking: Booking;
  onDismiss: () => void;
}

function NewBookingBanner({ booking, onDismiss, onAccept, onReview }: NewBookingBannerProps & { onAccept: () => void; onReview: () => void }) {
  const isPending = booking.status === 'pending';

  useEffect(() => {
    // Start looping ring — it stops only when admin accepts/reviews or all banners clear
    startRinging(isPending ? 'pending' : 'confirmed');
    // No auto-dismiss — ring persists until explicit admin action
    return () => {}; // cleanup handled by parent via stopRinging
  }, [isPending]);

  const accent = isPending ? 'amber' : 'emerald';

  return (
    <motion.div
      initial={{ opacity: 0, y: -80, scale: 0.95 }}
      animate={{ opacity: 1, y: 0,   scale: 1    }}
      exit={{    opacity: 0, y: -80, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-full max-w-lg px-4"
    >
      <div className={`relative bg-zinc-900 border ${isPending ? 'border-amber-500/50 shadow-[0_8px_60px_rgba(245,158,11,0.3)]' : 'border-emerald-500/50 shadow-[0_8px_60px_rgba(16,185,129,0.3)]'} rounded-2xl overflow-hidden`}>
        {/* Persistent pulsing top border — no progress bar, rings until handled */}
        <div className={`absolute top-0 left-0 right-0 h-[2px] ${isPending ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`} />

        <div className="p-4 flex items-start gap-4">
          {/* Pulsing icon */}
          <div className="relative shrink-0 mt-0.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isPending ? 'bg-amber-500/15 border border-amber-500/30' : 'bg-emerald-500/15 border border-emerald-500/30'}`}>
              {isPending ? <AlertCircle size={20} className="text-amber-400" /> : <Bell size={20} className="text-emerald-400" />}
            </div>
            <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full ${isPending ? 'bg-amber-500' : 'bg-emerald-500'}`}>
              <span className={`absolute inset-0 rounded-full animate-ping opacity-75 ${isPending ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <p className={`text-xs font-black uppercase tracking-widest mb-1 ${isPending ? 'text-amber-400' : 'text-emerald-400'}`}>
              {isPending ? '⏳ New Pending Booking — Review Required' : '🔔 New Booking — Action Required'}
            </p>
            <p className="text-white font-bold text-sm leading-tight truncate">
              {booking.customerName ?? 'Guest'}
            </p>
            <p className="text-gray-400 text-xs mt-0.5 truncate">{booking.serviceNames ?? '—'}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {booking.bookingTime && (
                <span className="flex items-center gap-1 text-xs text-gray-500 font-bold">
                  <Clock size={10} /> {booking.bookingTime}
                </span>
              )}
              {booking.totalAmount ? (
                <span className="text-xs font-black text-gold">₹{booking.totalAmount.toLocaleString('en-IN')}</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-4 flex gap-3">
          {isPending ? (
            <button
              onClick={onReview}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-400 rounded-xl text-black font-black text-xs uppercase tracking-widest transition-all"
            >
              <Eye size={14} /> Review Booking
            </button>
          ) : (
            <button
              onClick={onAccept}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-black font-black text-xs uppercase tracking-widest transition-all"
            >
              <CheckSquare size={14} /> Accept Booking
            </button>
          )}
          <button
            onClick={onDismiss}
            title="Dismiss banner — ring continues until all bookings are handled"
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/8 hover:bg-white/10 border border-white/10 rounded-xl text-gray-400 font-black text-xs uppercase tracking-widest transition-all"
          >
            <PhoneOff size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      // Log uid to console so you can create the admins/{uid} Firestore doc.
      // You only need this once — remove the log after setup.
      console.info('[ADMIN LOGIN] Your uid is:', cred.user.uid);
      onLogin();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      setError(
        code === 'auth/invalid-credential'     ? 'Invalid email or password.' :
        code === 'auth/too-many-requests'      ? 'Too many attempts. Try again later.' :
        code === 'auth/network-request-failed' ? 'Network error. Check your connection.' :
        'Login failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gold/5 rounded-full blur-[140px]" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-gold/3 rounded-full blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 40px,rgba(255,255,255,.5) 40px,rgba(255,255,255,.5) 41px),repeating-linear-gradient(90deg,transparent,transparent 40px,rgba(255,255,255,.5) 40px,rgba(255,255,255,.5) 41px)' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        {/* Logo mark */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
            <Scissors size={18} className="text-gold" />
          </div>
          <div>
            <p className="text-white font-black uppercase tracking-[0.2em] text-sm leading-none">Hair Tech</p>
            <p className="text-gray-400 text-xs uppercase tracking-widest font-bold">Admin Console</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-white/15 rounded-[28px] p-8 shadow-2xl">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-1">Sign In</h1>
          <p className="text-gray-500 text-sm mb-8">Restricted to authorised admins only.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type="email"
                placeholder="admin@hairtechsalon.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-white/8 border border-white/10 rounded-2xl py-4 px-5 text-white focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500 text-sm"
              />
              <label className="absolute -top-2 left-4 px-2 bg-zinc-900 text-[11px] font-black uppercase tracking-widest text-gold">Email</label>
            </div>

            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-white/8 border border-white/10 rounded-2xl py-4 pl-5 pr-12 text-white focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500 text-sm"
              />
              <label className="absolute -top-2 left-4 px-2 bg-zinc-900 text-[11px] font-black uppercase tracking-widest text-gold">Password</label>
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-red-400 text-xs font-bold"
                >
                  <AlertCircle size={13} /> {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full h-14 mt-2 bg-gradient-to-r from-[#D4AF37] to-[#F0D060] rounded-2xl text-black font-black uppercase tracking-[0.2em] text-[11px] shadow-[0_8px_30px_-8px_rgba(212,175,55,0.5)] disabled:opacity-40 disabled:grayscale transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <><LogIn size={15} /> Enter Dashboard</>}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-700 text-xs mt-6 uppercase tracking-widest font-bold">
          Only registered admin accounts can access this area
        </p>
      </motion.div>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, trend }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; trend?: { value: string; up: boolean };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900 border border-white/12 rounded-2xl p-6 flex flex-col gap-4"
    >
      <div className="flex items-start justify-between">
        <div className="p-2.5 bg-gold/10 rounded-xl text-gold">{icon}</div>
        {trend && (
          <span className={`flex items-center gap-1 text-xs font-black ${trend.up ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {trend.value}
          </span>
        )}
      </div>
      <div>
        <p className="text-xs uppercase tracking-widest font-black text-gray-500 mb-1">{label}</p>
        <p className="text-2xl font-black text-white leading-none">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BookingStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-black uppercase tracking-wider ${m.color} ${m.bg}`}>
      {m.icon} {m.label}
    </span>
  );
}

// ─── Booking Row ──────────────────────────────────────────────────────────────

function BookingRow({ booking, onStatusChange, onCreateBill, onViewInvoice, onConfirmPayment, onMarkPayAtSalon, onDelete, isSuperAdmin, labels }: {
  booking: Booking;
  onStatusChange: (id: string, status: BookingStatus, failedNote?: string) => void;
  onCreateBill?: (booking: Booking) => void;
  onViewInvoice?: (invoiceId: string) => void;
  onConfirmPayment?: (id: string, paymentId: string) => void;
  onMarkPayAtSalon?: (id: string) => void;
  onDelete?: (id: string) => void;
  isSuperAdmin?: boolean;
  labels?: Array<{ text: string; color: string; bg: string }>;
}) {
  const [expanded,        setExpanded]        = useState(false);
  const [pendingPayId,    setPendingPayId]    = useState('');
  const [confirmingPay,   setConfirmingPay]   = useState(false);
  const [updating,        setUpdating]        = useState(false);
  const [deleteConfirm,   setDeleteConfirm]   = useState(false);
  const [deletingRow,     setDeletingRow]     = useState(false);

  // Reschedule state
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [editDate,       setEditDate]       = useState(() => new Date());
  const [editSlots,      setEditSlots]      = useState<SlotOption[]>([]);
  const [editSelSlot,    setEditSelSlot]    = useState<SlotOption | null>(null);
  const [slotsLoading,   setSlotsLoading]   = useState(false);
  const [editSaving,     setEditSaving]     = useState(false);
  const [editSuccess,    setEditSuccess]    = useState<string | null>(null);
  const dateStrip = Array.from({ length: 8 }, (_, i) => addDays(new Date(), i));

  // Failed with notes
  const [showFailInput, setShowFailInput] = useState(false);
  const [failNote,      setFailNote]      = useState('');

  const handleStatus = async (status: BookingStatus) => {
    setUpdating(true);
    await onStatusChange(booking.id, status);
    setUpdating(false);
  };

  const handleFail = async () => {
    setUpdating(true);
    await onStatusChange(booking.id, 'failed', failNote);
    setShowFailInput(false);
    setFailNote('');
    setUpdating(false);
  };

  const loadSlots = async (date: Date, durationMins: number) => {
    setSlotsLoading(true); setEditSelSlot(null);
    try {
      const s = startOfDay(date).toISOString(), e = startOfDay(addDays(date, 1)).toISOString();
      const snap = await getDocs(query(collection(db, 'bookings'), where('startTime', '>=', s), where('startTime', '<', e), where('status', 'in', ['paid', 'confirmed', 'pending'])));
      const existing: ExistingBooking[] = snap.docs.flatMap(d => { if (d.id === booking.id) return []; const x = d.data(); return x.startTime && x.endTime ? [{ startTime: x.startTime, endTime: x.endTime }] : []; });
      setEditSlots(computeSlots(date, durationMins || 60, existing));
    } catch { setEditSlots([]); }
    finally { setSlotsLoading(false); }
  };

  const saveReschedule = async () => {
    if (!editSelSlot) return;
    setEditSaving(true);
    try {
      const updates: Record<string, unknown> = {
        bookingDate: startOfDay(editDate).toISOString(),
        bookingTime: editSelSlot.label,
        startTime:   editSelSlot.startISO,
        endTime:     editSelSlot.endISO,
        updatedAt:   serverTimestamp(),
        rescheduledAt: serverTimestamp(),
        rescheduleCount: (booking.rescheduleCount ?? 0) + 1,
      };
      if (!booking.originalBookingDate) {
        updates.originalBookingDate = booking.bookingDate ?? null;
        updates.originalBookingTime = booking.bookingTime ?? null;
        updates.originalStartTime   = booking.startTime ?? null;
        updates.originalEndTime     = booking.endTime ?? null;
      }
      await updateDoc(doc(db, 'bookings', booking.id), updates);
      setEditSuccess(`Rescheduled to ${format(editDate, 'EEE, MMM d')} · ${editSelSlot.label}`);
      setTimeout(() => { setIsRescheduling(false); setEditSuccess(null); }, 2200);
    } catch { /* silent */ } finally { setEditSaving(false); }
  };

  return (
    <>
      <tr
        onClick={() => setExpanded(v => !v)}
        className="border-b border-white/10 hover:bg-white/[0.06] transition-colors cursor-pointer group"
      >
        <td className="py-4 px-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center text-gold text-xs font-black shrink-0">
              {(booking.customerName ?? '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-white text-sm font-bold leading-none">{booking.customerName ?? '—'}</p>
              <p className="text-gray-500 text-xs mt-0.5">{booking.customerPhone ?? '—'}</p>
            </div>
          </div>
        </td>
        <td className="py-4 px-5 hidden md:table-cell">
          <p className="text-gray-300 text-sm">{booking.bookingDate ? fmtDate(booking.bookingDate) : '—'}</p>
          <p className="text-gray-400 text-xs">{booking.bookingTime ?? '—'}</p>
          {booking.rescheduledAt && (
            <p className="text-[11px] text-blue-400 font-bold mt-0.5 flex items-center gap-1">
              <Edit2 size={9} />
              <span className="line-through text-gray-600">{booking.originalBookingTime ?? '—'}</span>
              <ChevronRightIcon size={9} />
              <span>{booking.bookingTime ?? '—'}</span>
            </p>
          )}
        </td>
        <td className="py-4 px-5 hidden lg:table-cell">
          <p className="text-gray-400 text-xs max-w-[180px] truncate">{booking.serviceNames ?? '—'}</p>
        </td>
        <td className="py-4 px-5">
          <span className="text-white font-black text-sm">
            ₹{(booking.totalAmount ?? 0).toLocaleString('en-IN')}
          </span>
        </td>
        <td className="py-4 px-5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={booking.status ?? 'pending'} />
            {labels?.map((l, i) => (
              <span key={i} className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-black uppercase tracking-wider ${l.color} ${l.bg}`}>
                {l.text}
              </span>
            ))}
          </div>
        </td>
        <td className="py-4 px-5">
          <div className="flex items-center gap-1.5 justify-end">
            {/* Call customer */}
            {booking.customerPhone && (
              <a
                href={`tel:${booking.customerPhone}`}
                onClick={e => e.stopPropagation()}
                className="p-1.5 rounded-lg text-gray-700 hover:text-emerald-400 hover:bg-emerald-400/10 transition-all opacity-0 group-hover:opacity-100"
                title="Call customer"
              >
                <Phone size={13} />
              </a>
            )}
            {/* Delete — super admin only, inline confirm */}
            {isSuperAdmin && (
              deleteConfirm ? (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={async e => {
                      e.stopPropagation();
                      setDeletingRow(true);
                      try { await onDelete?.(booking.id); } finally { setDeletingRow(false); setDeleteConfirm(false); }
                    }}
                    disabled={deletingRow}
                    className="px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-[11px] font-black hover:bg-red-500/30 transition-all disabled:opacity-50 flex items-center gap-1"
                  >
                    {deletingRow && <Loader2 size={9} className="animate-spin" />} Confirm
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteConfirm(false); }}
                    className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-gray-400 text-[11px] font-black hover:text-white transition-all"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setDeleteConfirm(true); }}
                  className="p-1.5 rounded-lg text-gray-700 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
                  title="Delete booking"
                >
                  <Trash2 size={13} />
                </button>
              )
            )}
            <span className="text-gray-700 group-hover:text-gray-500 transition-colors">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </div>
        </td>
      </tr>

      <AnimatePresence>
        {expanded && (
          <tr>
            <td colSpan={6} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden bg-zinc-800/60 border-b border-white/10"
              >
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Email',       value: booking.customerEmail ?? '—' },
                    { label: 'Payment ID',  value: booking.paymentId     ?? '—' },
                    { label: 'Order ID',    value: booking.orderId       ?? '—' },
                    { label: 'Booked At',   value: fmtTs(booking.createdAt) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[11px] uppercase tracking-widest font-black text-gray-400 mb-1">{label}</p>
                      <p className="text-gray-300 text-xs font-medium break-all">{value}</p>
                    </div>
                  ))}

                  {/* Services full list */}
                  <div className="sm:col-span-2">
                    <p className="text-[11px] uppercase tracking-widest font-black text-gray-400 mb-1">Services</p>
                    <p className="text-gray-300 text-xs">{booking.serviceNames}</p>
                  </div>

                  {/* Reschedule history */}
                  {booking.rescheduledAt && (
                    <div className="sm:col-span-2 lg:col-span-4 p-4 bg-blue-500/8 border border-blue-500/30 rounded-2xl">
                      <p className="text-[11px] uppercase tracking-widest font-black text-blue-400 flex items-center gap-1.5 mb-2">
                        <Edit2 size={11} /> Rescheduled{booking.rescheduleCount && booking.rescheduleCount > 1 ? ` (${booking.rescheduleCount}×)` : ''} — {fmtTs(booking.rescheduledAt)}
                      </p>
                      <div className="flex items-center gap-3 flex-wrap text-xs">
                        <div>
                          <p className="text-[11px] uppercase tracking-widest font-black text-gray-500 mb-0.5">Originally Booked</p>
                          <p className="text-gray-400 line-through">
                            {booking.originalBookingDate ? fmtDate(booking.originalBookingDate) : '—'} · {booking.originalBookingTime ?? '—'}
                          </p>
                        </div>
                        <ChevronRightIcon size={14} className="text-gray-600 shrink-0" />
                        <div>
                          <p className="text-[11px] uppercase tracking-widest font-black text-gray-500 mb-0.5">Now Scheduled</p>
                          <p className="text-emerald-400 font-bold">
                            {booking.bookingDate ? fmtDate(booking.bookingDate) : '—'} · {booking.bookingTime ?? '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Pending-payment admin actions (only when status === 'pending') ── */}
                  {booking.status === 'pending' && (
                    <div className="sm:col-span-2 lg:col-span-4 space-y-3">
                      <p className="text-[11px] uppercase tracking-widest font-black text-amber-500 flex items-center gap-1.5">
                        <AlertCircle size={11} /> Payment Pending — Admin Actions
                      </p>

                      {/* Add Payment ID */}
                      <div className="p-4 bg-amber-500/8 border border-amber-500/30 rounded-2xl space-y-3">
                        <p className="text-xs text-amber-400 font-bold">Option 1 — Confirm with Razorpay Payment ID</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="e.g. pay_XXXXXXXXXXXXXXXXXX"
                            value={pendingPayId}
                            onChange={e => setPendingPayId(e.target.value)}
                            className="flex-1 bg-zinc-900 border border-white/10 rounded-xl py-2 px-3 text-white text-xs focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500 font-mono"
                          />
                          <button
                            onClick={async e => {
                              e.stopPropagation();
                              if (!pendingPayId.trim()) return;
                              setConfirmingPay(true);
                              try {
                                await onConfirmPayment?.(booking.id, pendingPayId);
                                setPendingPayId('');
                                setExpanded(false);
                              } finally { setConfirmingPay(false); }
                            }}
                            disabled={!pendingPayId.trim() || confirmingPay}
                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-black text-xs font-black uppercase tracking-wider disabled:opacity-40 transition-all shrink-0"
                          >
                            {confirmingPay ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                            Confirm
                          </button>
                        </div>
                        <p className="text-[11px] text-gray-400">Enter the Razorpay Payment ID from your dashboard to confirm this booking.</p>
                      </div>

                      {/* Pay at Salon */}
                      <div className="p-4 bg-blue-500/8 border border-blue-500/30 rounded-2xl space-y-2">
                        <p className="text-xs text-blue-400 font-bold">Option 2 — Mark as Pay at Salon</p>
                        <p className="text-[11px] text-gray-500">Customer will pay in person. Booking moves to confirmed — collect payment before billing.</p>
                        <button
                          onClick={async e => {
                            e.stopPropagation();
                            await onMarkPayAtSalon?.(booking.id);
                            setExpanded(false);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-500/20 border border-blue-500/30 hover:bg-blue-500/30 rounded-xl text-blue-300 text-xs font-black uppercase tracking-wider transition-all"
                        >
                          <CheckSquare size={11} /> Mark — Pay at Salon
                        </button>
                      </div>

                      {/* Delete pending */}
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm('Remove this pending booking?')) handleStatus('failed'); }}
                        className="text-[11px] text-gray-400 hover:text-red-400 transition-colors"
                      >
                        Remove pending booking
                      </button>
                    </div>
                  )}

                  {/* Status + actions (for non-pending bookings) */}
                  {booking.status !== 'pending' && (
                  <div className="sm:col-span-2 lg:col-span-2 flex items-end gap-2 flex-wrap">
                    <p className="text-[11px] uppercase tracking-widest font-black text-gray-400 w-full mb-1">Status</p>

                    {/* Current status badge */}
                    <StatusBadge status={booking.status ?? 'paid'} />

                    {/* Status chips — allow admin overrides */}
                    {(['paid', 'confirmed', 'pending', 'failed'] as BookingStatus[]).map(s => (
                      <button key={s}
                        onClick={e => { e.stopPropagation(); handleStatus(s); }}
                        disabled={updating || booking.status === s}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40 ${
                          booking.status === s
                            ? `${STATUS_META[s].color} ${STATUS_META[s].bg}`
                            : 'bg-white/8 border-white/10 text-gray-500 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {updating && booking.status !== s ? <Loader2 size={10} className="animate-spin inline" /> : STATUS_META[s].label}
                      </button>
                    ))}

                    <div className="w-full mt-1 flex flex-wrap gap-2">
                      <p className="text-[11px] uppercase tracking-widest font-black text-gray-400 w-full mb-0.5">Actions</p>

                      {/* Service Completed — shown after bill is generated */}
                      {booking.invoiceId ? (
                        <span className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl border bg-purple-500/10 border-purple-500/20 text-purple-400 text-xs font-black uppercase tracking-wider">
                          <CheckSquare size={11} /> Service Completed
                        </span>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); handleStatus('completed'); }}
                          disabled={updating || booking.status === 'completed'}
                          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40 ${
                            booking.status === 'completed'
                              ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                              : 'bg-purple-500/20 border-purple-500/40 text-purple-300 hover:bg-purple-500/30'
                          }`}
                        >
                          <CheckSquare size={11} />
                          {booking.status === 'completed' ? 'Completed ✓' : 'Mark as Complete'}
                        </button>
                      )}

                      {/* View Invoice — after bill is generated */}
                      {booking.invoiceId && onViewInvoice ? (
                        <button
                          onClick={e => { e.stopPropagation(); onViewInvoice(booking.invoiceId!); }}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl border bg-gold/10 border-gold/30 text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/20 transition-all"
                        >
                          <Receipt size={11} /> View Invoice
                        </button>
                      ) : (
                        /* Create Bill — only when no invoice yet */
                        !booking.invoiceId && ['paid', 'confirmed', 'completed'].includes(booking.status) && onCreateBill && (
                          <button
                            onClick={e => { e.stopPropagation(); onCreateBill(booking); }}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-wider hover:bg-emerald-500/20 transition-all"
                          >
                            <Receipt size={11} /> Create Bill
                          </button>
                        )
                      )}

                      {/* Reschedule — for active (non-completed/failed) bookings */}
                      {['paid', 'confirmed'].includes(booking.status) && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (isRescheduling) { setIsRescheduling(false); } else {
                              const today = new Date();
                              setIsRescheduling(true); setEditDate(today);
                              setEditSelSlot(null); setEditSuccess(null);
                              loadSlots(today, booking.serviceDurationMins ?? 60);
                            }
                          }}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl border bg-blue-500/10 border-blue-500/30 text-blue-300 text-xs font-black uppercase tracking-wider hover:bg-blue-500/20 transition-all"
                        >
                          <Edit2 size={11} /> {isRescheduling ? 'Cancel Reschedule' : 'Reschedule'}
                        </button>
                      )}

                      {/* Mark as Failed — for non-failed/non-completed bookings */}
                      {booking.status !== 'failed' && booking.status !== 'completed' && (
                        <button
                          onClick={e => { e.stopPropagation(); setShowFailInput(v => !v); }}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl border bg-red-500/10 border-red-500/30 text-red-400 text-xs font-black uppercase tracking-wider hover:bg-red-500/20 transition-all"
                        >
                          <XCircle size={11} /> {showFailInput ? 'Cancel' : 'Mark as Failed'}
                        </button>
                      )}
                    </div>

                    {/* Failed note input */}
                    <AnimatePresence>
                      {showFailInput && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden w-full">
                          <div className="pt-3 mt-2 border-t border-red-500/20 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              value={failNote}
                              onChange={e => setFailNote(e.target.value)}
                              placeholder="Reason for failure (optional)…"
                              className="flex-1 bg-white/[0.04] border border-red-500/25 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-red-400"
                            />
                            <button
                              onClick={handleFail}
                              disabled={updating}
                              className="px-4 py-2.5 rounded-xl bg-red-500 text-white text-xs font-black disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {updating ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={10} />} Confirm
                            </button>
                            <button
                              onClick={() => { setShowFailInput(false); setFailNote(''); }}
                              className="text-gray-500 hover:text-white p-2"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Show failed note if exists */}
                    {booking.status === 'failed' && booking.failedNote && (
                      <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/8 border border-red-500/20">
                        <MessageSquare size={12} className="text-red-400 shrink-0 mt-0.5" />
                        <p className="text-red-300 text-xs">{booking.failedNote}</p>
                      </div>
                    )}

                    {/* Reschedule panel */}
                    <AnimatePresence>
                      {isRescheduling && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden w-full">
                          <div className="pt-3 mt-2 border-t border-white/10 space-y-3" onClick={e => e.stopPropagation()}>
                            {editSuccess ? (
                              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold py-2">
                                <CheckCircle2 size={14}/>{editSuccess}
                              </div>
                            ) : (
                              <>
                                <p className="text-xs font-black uppercase tracking-wider text-gold flex items-center gap-1.5"><CalendarCheck size={12}/>Pick new date & time</p>
                                {/* Date strip */}
                                <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
                                  {dateStrip.map(d => {
                                    const active = isSameDay(d, editDate);
                                    return (
                                      <button key={d.toString()} onClick={() => { setEditDate(d); loadSlots(d, booking.serviceDurationMins ?? 60); }}
                                        className={`shrink-0 w-11 h-13 rounded-xl flex flex-col items-center justify-center transition-all border py-2 ${active ? 'bg-gold border-gold text-black' : 'border-white/10 bg-white/[0.04] text-gray-400 hover:border-gold/40'}`}>
                                        <span className={`text-[11px] font-bold ${active ? 'text-black/70' : 'text-gray-500'}`}>{isToday(d) ? 'Today' : format(d,'EEE')}</span>
                                        <span className="text-sm font-black">{format(d,'d')}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                                {/* Slots */}
                                {slotsLoading ? (
                                  <div className="flex items-center justify-center gap-2 py-4 text-gray-500 text-xs">
                                    <Loader2 size={13} className="animate-spin text-gold"/>Checking availability…
                                  </div>
                                ) : editSlots.length === 0 ? (
                                  <p className="text-gray-400 text-xs text-center py-2">No slots available for this date — try another date</p>
                                ) : (
                                  <div className="space-y-2">
                                    {(['morning','afternoon','evening'] as const).filter(sess => editSlots.some(s => s.session === sess)).map(sess => {
                                      const Icon = sess === 'morning' ? Sun : sess === 'afternoon' ? CloudSun : Moon;
                                      return (
                                        <div key={sess}>
                                          <div className="flex items-center gap-1.5 mb-1"><Icon size={10} className="text-gray-500"/><span className="text-[11px] text-gray-500 font-bold capitalize">{sess}</span></div>
                                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                                            {editSlots.filter(s => s.session === sess).map(slot => (
                                              <button key={slot.startISO} onClick={() => setEditSelSlot(slot)}
                                                className={`py-2 text-xs font-bold rounded-xl border transition-all ${editSelSlot?.startISO === slot.startISO ? 'bg-gold border-gold text-black' : 'border-white/10 bg-white/[0.03] text-gray-400 hover:border-gold/30 hover:text-white'}`}>
                                                {slot.label.split('–')[0].trim()}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                <button onClick={saveReschedule} disabled={!editSelSlot || editSaving}
                                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gold text-black text-xs font-black uppercase tracking-wider disabled:opacity-40 flex items-center justify-center gap-2">
                                  {editSaving ? <Loader2 size={12} className="animate-spin"/> : <CalendarCheck size={12}/>}
                                  {editSaving ? 'Saving…' : 'Confirm New Slot'}
                                </button>
                              </>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  )}{/* /non-pending actions */}
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Invoice view modal ───────────────────────────────────────────────────────

function InvoiceModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const [invoice, setInvoice] = React.useState<Invoice | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    getDoc(doc(db, 'invoices', invoiceId))
      .then(snap => { if (snap.exists()) setInvoice({ id: snap.id, ...snap.data() } as Invoice); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const handlePrint = () => {
    if (!invoice) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const inv = invoice as any;
    const invDateStr = inv.createdAt
      ? inv.createdAt.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const disc = invoice.discountAmount > 0
      ? `<div class="row"><span>Discount (${invoice.discountPercent}%)</span><span style="color:#c00">-&#8377;${invoice.discountAmount.toLocaleString('en-IN')}</span></div>`
      : '';
    const dueLine = (inv.dueSettlementAmount ?? 0) > 0
      ? `<div class="row" style="color:#c07000"><span>&#9888; Previous Dues Settled</span><span>+&#8377;${inv.dueSettlementAmount.toLocaleString('en-IN')}</span></div>`
      : '';
    const effectivePaid = inv.amountPaid ?? (invoice.total - (inv.amountDue ?? 0));
    const hasDue = (inv.amountDue ?? 0) > 0;
    const payRows = (invoice.paymentSplits?.length ?? 0) > 0
      ? `<div class="bold sm" style="margin-top:3px">Payment</div>
         ${invoice.paymentSplits.map((s: any) => { const lbl = s.method === 'online' ? 'Razorpay' : s.method; return `<div class="row sm"><span style="text-transform:capitalize${s.isAdvance ? ';color:#c07000;font-weight:700' : ''}">${s.isAdvance ? `Advance (${lbl})` : lbl}</span><span>&#8377;${s.amount.toLocaleString('en-IN')}</span></div>`; }).join('')}
         ${invoice.paymentSplits.length > 1 ? `<div class="row sm"><span>Collected</span><span class="bold">&#8377;${effectivePaid.toLocaleString('en-IN')}</span></div>` : ''}`
      : `<div class="row sm" style="margin-top:3px"><span style="text-transform:capitalize">${invoice.paymentMethod}</span><span class="bold">&#8377;${effectivePaid.toLocaleString('en-IN')}</span></div>`;
    const dueRow = hasDue
      ? `<div class="row sm" style="color:#c00;font-weight:700"><span>Balance Due (&#8377;${invoice.total.toLocaleString('en-IN')} &minus; &#8377;${effectivePaid.toLocaleString('en-IN')})</span><span>&#8377;${inv.amountDue.toLocaleString('en-IN')}</span></div>`
      : `<div class="row sm" style="color:#007700"><span>&#10003; Fully Paid</span><span>&#8377;${effectivePaid.toLocaleString('en-IN')}</span></div>`;
    const roundOffRow = (inv.roundOffAmount ?? 0) !== 0
      ? `<div class="row sm"><span>Round Off</span><span>&#8377;${inv.roundOffAmount.toLocaleString('en-IN')}</span></div>`
      : '';
    const advanceSettledLine = (inv.advanceSettlementAmount ?? 0) > 0
      ? `<div class="row" style="color:#0077aa"><span>Advance Applied</span><span>-&#8377;${inv.advanceSettlementAmount.toLocaleString('en-IN')}</span></div>`
      : '';
    const newAdvanceRow = (inv.advanceAmount ?? 0) > 0
      ? `<div class="row sm" style="color:#007700"><span>Saved as Advance</span><span>&#8377;${inv.advanceAmount.toLocaleString('en-IN')}</span></div>`
      : '';
    const commAgg: Record<string, number> = {};
    invoice.items.forEach((it: any) => {
      if (it.staffSplits && it.staffSplits.length > 1) {
        it.staffSplits.forEach((sp: any) => { if (sp.staffId) commAgg[sp.staffName] = (commAgg[sp.staffName] ?? 0) + sp.commissionAmount; });
      } else if (it.staffId) {
        commAgg[it.staffName] = (commAgg[it.staffName] ?? 0) + it.commissionAmount;
      }
    });
    const commRows = Object.entries(commAgg)
      .map(([name, amt]) => `<div class="row sm"><span>${name}</span><span>&#8377;${(amt as number).toLocaleString('en-IN')}</span></div>`)
      .join('');
    w.document.write(`<!DOCTYPE html><html><head>
      <title>Invoice ${invoice.invoiceNumber}</title><meta charset="utf-8"/>
      <style>
        @page{size:80mm auto;margin:0}*{box-sizing:border-box}
        body{font-family:'Courier New',monospace;font-size:12px;width:80mm;margin:0 auto;padding:6mm 4mm;color:#000}
        .center{text-align:center}.bold{font-weight:700}.xl{font-size:20px;font-weight:900}
        .sm{font-size:10px;color:#555}.dash{border-top:1px dashed #888;margin:5px 0}
        .row{display:flex;justify-content:space-between;padding:2px 0}
        .row.total{font-size:15px;font-weight:900;padding-top:4px}
        .badge{display:inline-block;background:#eee;padding:1px 5px;border-radius:3px;font-size:9px}
        .staff{font-size:9px;color:#888;margin-left:8px}
        .qty-hint{font-size:9px;color:#888;margin-left:8px}
      </style></head><body>
      <div class="center" style="margin-bottom:8px">
        <div class="xl">Hair Tech</div><div class="bold">Unisex Salon, Araria</div>
        <div class="sm">+91 87896 03343</div>
        <div class="sm" style="margin-top:4px"><span class="badge">${invoice.source === 'online' ? 'Online Booking' : 'Walk-in'}</span></div>
      </div>
      <div class="dash"></div>
      <div class="row sm"><span>Invoice</span><span class="bold" style="color:#000">${invoice.invoiceNumber}</span></div>
      <div class="row sm"><span>Date</span><span>${invDateStr}</span></div>
      <div class="dash"></div>
      <div class="row"><span>Customer</span><span class="bold">${invoice.customerName}</span></div>
      <div class="row sm"><span>Phone</span><span>${invoice.customerPhone}</span></div>
      <div class="dash"></div>
      <div class="bold sm" style="margin-bottom:4px">SERVICES</div>
      ${invoice.items.map(it => `
        <div style="margin:3px 0">
          <div class="row"><span>${it.serviceName}${(it.quantity ?? 1) > 1 ? ` ×${it.quantity}` : ''}</span><span class="bold">&#8377;${it.price.toLocaleString('en-IN')}</span></div>
          ${(it.quantity ?? 1) > 1 ? `<div class="qty-hint">&#8377;${it.unitPrice.toLocaleString('en-IN')} × ${it.quantity}</div>` : ''}
          ${(it as any).staffSplits && (it as any).staffSplits.length > 1
            ? (it as any).staffSplits.map((sp: any) => `<div class="staff">${sp.staffName} · ${sp.splitPercent}% = &#8377;${sp.commissionAmount.toLocaleString('en-IN')}</div>`).join('')
            : (it.staffName ? `<div class="staff">Staff: ${it.staffName} · ${it.commissionRate}% = &#8377;${it.commissionAmount.toLocaleString('en-IN')}</div>` : '')}
        </div>`).join('')}
      <div class="dash"></div>
      <div class="row sm"><span>Subtotal</span><span>&#8377;${invoice.subtotal.toLocaleString('en-IN')}</span></div>
      ${disc}
      ${dueLine}
      ${advanceSettledLine}
      <div class="row total"><span>TOTAL</span><span>&#8377;${invoice.total.toLocaleString('en-IN')}</span></div>
      ${payRows}
      ${dueRow}
      ${roundOffRow}
      ${newAdvanceRow}
      ${invoice.paymentId ? `<div class="row sm"><span>Razorpay ID</span><span>${invoice.paymentId}</span></div>` : ''}
      ${commRows ? `<div class="dash"></div><div class="sm bold">Staff Commission</div>${commRows}` : ''}
      ${(invoice as any).promoCoupons?.length ? `<div class="dash"></div><div class="sm bold">&#127915; Promo Coupons</div>${(invoice as any).promoCoupons.map((c: string) => `<div class="row sm"><span>&#9733;</span><span class="bold" style="letter-spacing:2px">${c}</span></div>`).join('')}` : ''}
      <div class="dash"></div>
      <div class="center sm" style="margin-top:6px">Thank you for visiting Hair Tech Salon!<br/>Follow us &#64;hairtech111</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#111] border border-white/15 rounded-[24px] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/12 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center">
              <Receipt size={13} className="text-gold" />
            </div>
            <p className="text-white font-black uppercase tracking-tight text-sm">Invoice</p>
          </div>
          <div className="flex items-center gap-2">
            {invoice && (
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/8 border border-white/10 rounded-xl text-xs font-bold text-gray-300 hover:bg-white/10 transition-all">
                <Printer size={12} /> Print
              </button>
            )}
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/8 border border-white/12 text-white hover:bg-white/15 hover:border-white/20 transition-all">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
              <Loader2 size={24} className="animate-spin text-gold" /> Loading invoice…
            </div>
          ) : !invoice ? (
            <div className="text-center py-16 text-gray-500">Invoice not found.</div>
          ) : (
            /* Thermal receipt */
            (() => {
              const inv = invoice as any;
              const invDate = inv.createdAt
                ? inv.createdAt.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '—';
              return (
              <div className="bg-white text-black rounded-2xl p-5 font-mono text-xs max-w-[320px] mx-auto shadow border border-gray-200">
                {/* Header */}
                <div className="text-center mb-4">
                  <p className="font-black text-xl uppercase tracking-tight">Hair Tech</p>
                  <p className="font-bold text-sm">Unisex Salon, Araria</p>
                  <p className="text-gray-400 text-xs">+91 87896 03343</p>
                  <span className={`inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded border font-bold ${
                    invoice.source === 'online' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                  }`}>{invoice.source === 'online' ? 'Online Booking' : 'Walk-in'}</span>
                </div>

                {/* Invoice meta */}
                <div className="border-t border-dashed border-gray-300 pt-2.5 mb-3 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Invoice</span>
                    <span className="font-black text-black">{invoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Date</span>
                    <span className="text-gray-700">{invDate}</span>
                  </div>
                </div>

                {/* Customer */}
                <div className="border-t border-dashed border-gray-300 pt-2.5 mb-3 space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Customer</span><span className="font-bold text-black">{invoice.customerName}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Phone</span><span className="text-gray-700">{invoice.customerPhone}</span></div>
                </div>

                {/* Services */}
                <div className="border-t border-dashed border-gray-300 pt-2.5 mb-3 space-y-2">
                  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">Services</p>
                  {invoice.items.map((item, i) => (
                    <div key={i} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-800 flex-1 pr-2">{item.serviceName}{(item.quantity ?? 1) > 1 ? ` ×${item.quantity}` : ''}</span>
                        <span className="font-bold text-black shrink-0">₹{item.price.toLocaleString('en-IN')}</span>
                      </div>
                      {(item.quantity ?? 1) > 1 && (
                        <p className="text-[11px] text-gray-400 pl-1">₹{item.unitPrice.toLocaleString('en-IN')} × {item.quantity}</p>
                      )}
                      {item.lineDiscount > 0 && (
                        <p className="text-[11px] text-red-500 pl-1">Line discount: {item.lineDiscount}%</p>
                      )}
                      {(item as any).staffSplits && (item as any).staffSplits.length > 1 ? (
                        <div className="pl-1 space-y-0.5">
                          {(item as any).staffSplits.map((sp: any) => (
                            <p key={sp.staffId} className="text-[11px] text-gray-400">
                              {sp.staffName} · {sp.splitPercent}% → ₹{sp.commissionAmount.toLocaleString('en-IN')}
                            </p>
                          ))}
                        </div>
                      ) : item.staffName ? (
                        <p className="text-[11px] text-gray-400 pl-1">Staff: {item.staffName} · {item.commissionRate}% = ₹{item.commissionAmount.toLocaleString('en-IN')}</p>
                      ) : null}
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="border-t border-dashed border-gray-300 pt-2.5 space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-400"><span>Subtotal</span><span>₹{invoice.subtotal.toLocaleString('en-IN')}</span></div>
                  {invoice.discountAmount > 0 && (
                    <div className="flex justify-between text-xs text-red-600">
                      <span>Discount ({invoice.discountPercent}%)</span>
                      <span>-₹{invoice.discountAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {(inv.dueSettlementAmount ?? 0) > 0 && (
                    <div className="flex justify-between text-xs text-amber-600 font-bold">
                      <span>⚠ Previous Dues Settled</span>
                      <span>+₹{inv.dueSettlementAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {(inv.advanceSettlementAmount ?? 0) > 0 && (
                    <div className="flex justify-between text-xs text-sky-600 font-bold">
                      <span>Advance Applied</span>
                      <span>-₹{inv.advanceSettlementAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-sm pt-1.5 border-t border-dashed border-gray-300">
                    <span>TOTAL</span><span style={{ color: '#B8941F' }}>₹{invoice.total.toLocaleString('en-IN')}</span>
                  </div>

                  {/* Payment reconciliation */}
                  {(() => {
                    const effectivePaid = inv.amountPaid ?? (invoice.total - (inv.amountDue ?? 0));
                    const hasDue = (inv.amountDue ?? 0) > 0;
                    return (
                      <div className="pt-2 space-y-1.5">
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider font-black">Payment</p>
                        {(invoice.paymentSplits?.length ?? 0) > 0 ? (
                          <>
                            {invoice.paymentSplits.map((s: any, i: number) => {
                              const label = s.method === 'online' ? 'Razorpay' : s.method;
                              return (
                              <div key={i} className="flex justify-between text-xs">
                                <span className={`capitalize ${s.isAdvance ? 'text-amber-600 font-bold' : 'text-gray-600'}`}>
                                  {s.isAdvance ? `Advance (${label})` : label}
                                </span>
                                <span className="font-bold text-black">₹{s.amount.toLocaleString('en-IN')}</span>
                              </div>
                              );
                            })}
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
                          <span>{hasDue ? `₹${inv.amountDue.toLocaleString('en-IN')}` : `₹${effectivePaid.toLocaleString('en-IN')}`}</span>
                        </div>
                        {(inv.roundOffAmount ?? 0) !== 0 && (
                          <div className="flex justify-between text-xs text-sky-600">
                            <span>Round Off</span>
                            <span className="font-bold">₹{inv.roundOffAmount.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        {(inv.advanceAmount ?? 0) > 0 && (
                          <div className="flex justify-between text-xs text-emerald-700">
                            <span>Saved as Advance</span>
                            <span className="font-bold">₹{inv.advanceAmount.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        {invoice.paymentId && (
                          <div className="flex justify-between text-[11px] text-gray-400">
                            <span>Razorpay ID</span>
                            <span className="font-mono truncate max-w-[140px]">{invoice.paymentId}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Staff commission */}
                {invoice.items.some(i => i.commissionAmount > 0) && (() => {
                  const ca: Record<string, number> = {};
                  invoice.items.forEach((it: any) => {
                    if (it.staffSplits && it.staffSplits.length > 1) {
                      it.staffSplits.forEach((sp: any) => { if (sp.staffId) ca[sp.staffName] = (ca[sp.staffName] ?? 0) + sp.commissionAmount; });
                    } else if (it.staffId) {
                      ca[it.staffName] = (ca[it.staffName] ?? 0) + it.commissionAmount;
                    }
                  });
                  return (
                    <div className="border-t border-dashed border-gray-300 pt-2.5 mt-2.5">
                      <p className="text-[11px] text-gray-400 font-black uppercase tracking-wider mb-1">Staff Commission</p>
                      {Object.entries(ca).map(([name, amt]) => (
                        <div key={name} className="flex justify-between text-xs text-gray-400">
                          <span>{name}</span><span>₹{(amt as number).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {(inv as any).promoCoupons?.length > 0 && (
                  <div className="border-t border-dashed border-gray-300 pt-2.5 mt-2.5">
                    <p className="text-[11px] text-purple-500 font-black uppercase tracking-wider mb-1.5">🎟️ Promo Coupons</p>
                    {(inv as any).promoCoupons.map((c: string, i: number) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-400">★</span>
                        <span className="font-bold font-mono tracking-[3px] text-purple-600">{c}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-dashed border-gray-300 mt-4 pt-3 text-center text-[11px] text-gray-400">
                  Thank you for visiting Hair Tech Salon!<br />
                  <span className="text-gray-300">@hairtech111</span>
                </div>
              </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ user, staffMember }: { user: FirebaseUser; staffMember?: StaffMember & { id: string } }) {
  const isStaffMode = !!staffMember;
  const [bookings, setBookings]           = useState<Booking[]>([]);
  const [loading, setLoading]             = useState(true);
  const [listenerError, setListenerError] = useState<string | null>(null);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState<BookingStatus | 'all'>('all');
  const [sortKey, setSortKey]             = useState<SortKey>('createdAt');
  const [sortDir, setSortDir]             = useState<SortDir>('desc');
  const [signOutLoading, setSignOutLoading] = useState(false);
  // 'active' = paid/confirmed | 'pending' = payment not done | 'completed' = service done
  const [activeTab, setActiveTab]         = useState<'active' | 'upcoming' | 'pending' | 'completed' | 'failed' | 'rescheduled'>('active');

  // ── Module navigation ─────────────────────────────────────────────────────
  type DashView = 'bookings' | 'insights' | 'billing' | 'staff' | 'customers' | 'tools';
  const [view, setView]                   = useState<DashView>('bookings');

  // PIN-lock for sensitive views — PIN required every time you switch tab
  const [adminPin,       setAdminPin]       = useState('');
  const [pinPromptView,  setPinPromptView]  = useState<DashView | null>(null);
  const [pinSettingsInput, setPinSettingsInput] = useState('');
  const adminPinRef      = useRef('');
  const pinPromptViewRef = useRef<DashView | null>(null);
  adminPinRef.current      = adminPin;
  pinPromptViewRef.current = pinPromptView;

  const handleViewSwitch = useCallback((target: DashView) => {
    if (adminPinRef.current && (target === 'billing' || target === 'insights' || target === 'staff')) {
      setPinPromptView(target);
      return;
    }
    setView(target);
  }, []);

  const handlePinSuccess = useCallback(() => {
    const target = pinPromptViewRef.current;
    if (!target) return;
    flushSync(() => { setPinPromptView(null); setView(target); });
  }, []);

  // Billing module state
  const [billingOpen, setBillingOpen]       = useState(false);
  const [billingPrefill, setBillingPrefill] = useState<OnlineBookingPrefill | null>(null);

  // Walk-in booking
  const [walkInOpen, setWalkInOpen] = useState(false);

  // Invoice view modal
  const [invoiceModalId, setInvoiceModalId] = useState<string | null>(null);

  // Performance — manual refresh trigger + last-refresh tracking
  const [refreshKey,      setRefreshKey]      = useState(0);
  const [isRefreshing,    setIsRefreshing]    = useState(false);
  const [lastRefreshedMs, setLastRefreshedMs] = useState<number>(0);

  // Billing tab — invoice list
  const [billingInvoices, setBillingInvoices]   = useState<(Invoice & { id: string })[]>([]);
  const [billingLoading,  setBillingLoading]     = useState(false);
  const [billingPeriod,   setBillingPeriod]      = useState<Period>('month');
  const [billingSearch,   setBillingSearch]      = useState('');
  const [expandedInv,     setExpandedInv]        = useState<string | null>(null);
  const [billingFrom,     setBillingFrom]        = useState('');
  const [billingTo,       setBillingTo]          = useState('');
  const [deleteConfirmId, setDeleteConfirmId]    = useState<string | null>(null);
  const [deleting,        setDeleting]           = useState(false);
  const [showDuesDrawer,  setShowDuesDrawer]     = useState(false);

  // Billing tab — invoice editing
  const [editingInvId, setEditingInvId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    customerName: string;
    customerPhone: string;
    items: BillItem[];
    discountPercent: number;
    paymentSplits: PaymentSplit[];
    billingType: 'standard' | 'vvip';
    advanceAmount: number;
    dueAmount: number;
    roundOff: number;
    roundOffEnabled: boolean;
    promoCoupons: string[];
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError,  setEditError]  = useState<string | null>(null);

  const handleDeleteInvoice = async (id: string) => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'invoices', id));
      setBillingInvoices(prev => prev.filter(i => (i as any).id !== id));
      setDeleteConfirmId(null);
      if (expandedInv === id) setExpandedInv(null);
    } catch (e: any) {
      console.error('Delete invoice failed:', e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleStartEditInvoice = (inv: Invoice & { id: string }) => {
    setEditForm({
      customerName:    inv.customerName ?? '',
      customerPhone:   inv.customerPhone ?? '',
      items:           (inv.items ?? []).map(it => ({ ...it })),
      discountPercent: inv.discountPercent ?? 0,
      paymentSplits:   (inv.paymentSplits ?? []).map(s => ({ ...s })),
      billingType:     (inv as any).billingType === 'vvip' ? 'vvip' : 'standard',
      advanceAmount:   (inv as any).advanceAmount ?? 0,
      dueAmount:       inv.amountDue ?? 0,
      roundOff:        (inv as any).roundOffAmount ?? 0,
      roundOffEnabled: ((inv as any).roundOffAmount ?? 0) > 0,
      promoCoupons:    (inv as any).promoCoupons ?? [],
    });
    setEditingInvId(inv.id);
    setExpandedInv(inv.id);
    setEditError(null);
  };

  const handleCancelEditInvoice = () => {
    setEditingInvId(null);
    setEditForm(null);
    setEditError(null);
  };


  const updateEditItem = (idx: number, overrides: Partial<BillItem>) => {
    setEditForm(prev => {
      if (!prev) return prev;
      const items = prev.items.map((it, i) => {
        if (i !== idx) return it;
        const merged = { ...it, ...overrides };
        const lineTotal = Math.round(merged.unitPrice * merged.quantity * (1 - merged.lineDiscount / 100));
        const commAmt   = merged.staffId ? Math.round(lineTotal * merged.commissionRate / 100) : 0;
        return { ...merged, price: lineTotal, commissionAmount: commAmt };
      });
      return { ...prev, items };
    });
  };

  const updateEditItemStaff = (idx: number, staffId: string) => {
    const member = staffId ? staff.find(s => s.id === staffId) : null;
    const rate   = member?.commissionRate ?? 5;
    updateEditItem(idx, { staffId, staffName: member?.name ?? '', commissionRate: staffId ? rate : 0 });
  };

  const removeEditItem = (idx: number) => {
    setEditForm(prev => prev ? { ...prev, items: prev.items.filter((_, i) => i !== idx) } : prev);
  };

  const updateEditSplit = (idx: number, overrides: Partial<PaymentSplit>) => {
    setEditForm(prev => prev ? { ...prev, paymentSplits: prev.paymentSplits.map((s, i) => i === idx ? { ...s, ...overrides } : s) } : prev);
  };

  const addEditSplit = () => {
    setEditForm(prev => {
      if (!prev) return prev;
      const subtotal = prev.items.reduce((a, it) => a + it.price, 0);
      const discAmt = Math.round(subtotal * prev.discountPercent / 100);
      const roundOff = prev.roundOffEnabled ? (prev.roundOff ?? 0) : 0;
      const total = Math.max(0, subtotal - discAmt - roundOff);
      const currentSplitTotal = prev.paymentSplits.reduce((a, s) => a + (Number(s.amount) || 0), 0);
      const remaining = Math.max(0, total - currentSplitTotal);
      return { ...prev, paymentSplits: [...prev.paymentSplits, { method: 'cash' as PaymentMethod, amount: remaining }] };
    });
  };

  const removeEditSplit = (idx: number) => {
    setEditForm(prev => prev ? { ...prev, paymentSplits: prev.paymentSplits.filter((_, i) => i !== idx) } : prev);
  };

  const handleSaveEditInvoice = async (inv: Invoice & { id: string }) => {
    if (!editForm) return;
    if (editForm.items.length === 0) {
      setEditError('Invoice must have at least one item');
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const subtotal      = editForm.items.reduce((a, it) => a + it.price, 0);
      const discountAmount = Math.round(subtotal * editForm.discountPercent / 100);
      const dueSettlementAmount = (inv as any).dueSettlementAmount ?? 0;
      const roundOff       = editForm.roundOffEnabled ? (editForm.roundOff ?? 0) : 0;
      const total          = Math.max(0, subtotal - discountAmount + dueSettlementAmount - roundOff);
      const validSplits    = editForm.paymentSplits.filter(s => s.amount > 0);
      const splitTotal     = validSplits.reduce((a, s) => a + (Number(s.amount) || 0), 0);
      const overpayment    = Math.max(0, splitTotal - total);
      const advanceAmount  = overpayment > 0 ? overpayment : Math.max(0, Math.round(editForm.advanceAmount));
      const amountPaid     = Math.min(splitTotal, total);
      const amountDue      = Math.max(0, total - splitTotal);
      const primaryMethod: PaymentMethod = validSplits[0]?.method ?? inv.paymentMethod ?? 'cash';
      const validCoupons   = editForm.promoCoupons.filter(c => c.trim().length > 0);

      const updates: Record<string, unknown> = {
        customerName:    editForm.customerName,
        customerPhone:   editForm.customerPhone,
        items:           editForm.items,
        subtotal,
        discountPercent: editForm.discountPercent,
        discountAmount,
        total,
        paymentMethod:   primaryMethod,
        paymentSplits:   validSplits,
        amountPaid,
        amountDue,
        roundOffAmount:  roundOff,
        status:          amountDue > 0 ? 'due' as const : 'paid' as const,
        billingType:     editForm.billingType,
        advanceAmount,
        ...(validCoupons.length > 0 && { promoCoupons: validCoupons }),
      };
      await updateDoc(doc(db, 'invoices', inv.id), updates);
      setBillingInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, ...updates } : i));

      // Adjust the customer's advance credit balance by the change in "saved as advance" amount.
      const prevAdvanceAmount = (inv as any).advanceAmount ?? 0;
      const advanceDelta = advanceAmount - prevAdvanceAmount;
      if (advanceDelta !== 0 && editForm.customerPhone) {
        const custRef  = doc(db, 'customers', editForm.customerPhone);
        const custSnap = await getDoc(custRef);
        if (custSnap.exists()) {
          const existing = custSnap.data() as { advanceBalance?: number };
          await updateDoc(custRef, {
            advanceBalance: Math.max(0, (existing.advanceBalance ?? 0) + advanceDelta),
          });
        }
      }
      setEditingInvId(null);
      setEditForm(null);
    } catch (e: any) {
      setEditError(e.message ?? 'Failed to save changes');
    } finally {
      setSavingEdit(false);
    }
  };

  // Staff module state
  const [staff, setStaff]                 = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading]   = useState(false);
  const [staffForm, setStaffForm]         = useState<Partial<StaffMember> | null>(null);
  const [staffSaving,   setStaffSaving]   = useState(false);
  const [staffInvoices, setStaffInvoices] = useState<any[]>([]);
  const [staffSubView,  setStaffSubView]  = useState<'list' | 'analytics'>('list');
  const [commPeriod,    setCommPeriod]    = useState<'thisMonth' | 'lastMonth' | 'all'>('thisMonth');
  const [commFrom,      setCommFrom]      = useState('');
  const [commTo,        setCommTo]        = useState('');
  const [toolsTab,      setToolsTab]      = useState<'services' | 'banners' | 'gallery' | 'coupons' | 'data' | 'settings' | 'expenses' | 'trending'>('services');
  // Staff can't see admin-only tools tabs — fall back to banners
  useEffect(() => {
    if (isStaffMode && (toolsTab === 'services' || toolsTab === 'coupons' || toolsTab === 'settings' || toolsTab === 'expenses' || toolsTab === 'data' || toolsTab === 'trending')) setToolsTab('banners');
  }, [isStaffMode, toolsTab]);

  // Salon settings (Tools > Settings tab)
  const [sSettings, setSSettings] = useState({ staffCount: 3, openHour: 10, closeHour: 22, slotStepMins: 15, bufferMins: 30, defaultStaffId: '', expressServiceFee: 499, legacyImageUrl: '' });
  const [sSettingsLoaded,  setSSettingsLoaded]  = useState(false);
  const [sSettingsSaving,  setSSettingsSaving]  = useState(false);
  const [sSettingsError,   setSSettingsError]   = useState<string | null>(null);
  const [sSettingsSaved,   setSSettingsSaved]   = useState(false);

  // Load admin PIN on mount (before settings tab is opened)
  useEffect(() => {
    getDoc(doc(db, 'settings', 'salon')).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setAdminPin(d.adminPin ?? '');
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (toolsTab !== 'settings' || sSettingsLoaded) return;
    getDoc(doc(db, 'settings', 'salon')).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setSSettings({
          staffCount:    d.staffCount    ?? 3,
          openHour:      d.openHour      ?? 10,
          closeHour:     d.closeHour     ?? 22,
          slotStepMins:  d.slotStepMins  ?? 15,
          bufferMins:    d.bufferMins    ?? 30,
          defaultStaffId: d.defaultStaffId ?? '',
          expressServiceFee: d.expressServiceFee ?? 499,
          legacyImageUrl: d.legacyImageUrl ?? '',
        });
        setAdminPin(d.adminPin ?? '');
      }
      setSSettingsLoaded(true);
    }).catch(() => setSSettingsLoaded(true));
  }, [toolsTab, sSettingsLoaded]);

  // Customers module state
  const [customers, setCustomers]               = useState<any[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerSubView,     setCustomerSubView]     = useState<'list' | 'analytics'>('list');
  const [customerSearch,      setCustomerSearch]      = useState('');
  const [customerSourceFilter,setCustomerSourceFilter]= useState<'all'|'online'|'walkin'|'both'>('all');
  const CUSTOMER_PAGE_SIZE = 50;
  const [customerVisibleCount, setCustomerVisibleCount] = useState(CUSTOMER_PAGE_SIZE);
  const customerLoadMoreRef = useRef<HTMLDivElement | null>(null);

  // Reset to first page whenever the search/filter changes
  useEffect(() => {
    setCustomerVisibleCount(CUSTOMER_PAGE_SIZE);
  }, [customerSearch, customerSourceFilter]);

  // Infinite scroll — load 50 more customer rows when the sentinel scrolls into view
  useEffect(() => {
    const el = customerLoadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setCustomerVisibleCount(c => c + CUSTOMER_PAGE_SIZE);
      }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [customerVisibleCount, customers, customerSearch, customerSourceFilter]);
  const [staffSearch,         setStaffSearch]         = useState('');

  // Ticking clock — re-evaluates which 'pending' bookings have crossed
  // PENDING_NOTIFY_DELAY_MS so they "appear" in the Pending tab without
  // requiring a Firestore write.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // ── Notification state ────────────────────────────────────────────────────
  const [newBookingQueue, setNewBookingQueue] = useState<Booking[]>([]);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied'
  );
  // Track IDs seen on the initial snapshot load so we don't fire notifications
  // for existing bookings — only genuinely new ones added after page load.
  const initialIdsRef = useRef<Set<string> | null>(null);
  // Track booking IDs that arrived as 'pending' so we can notify when they
  // transition to 'paid' after Razorpay completes (that's a 'modified' change, not 'added').
  const pendingIdsRef = useRef<Set<string>>(new Set());
  // Timers for delayed "still pending" notifications — keyed by booking id.
  // A pending booking is created the instant a customer reaches the Razorpay
  // screen, before they've actually paid. We wait PENDING_NOTIFY_DELAY_MS to
  // see if it transitions to paid/confirmed on its own; only if it's still
  // pending after the grace period do we ring/notify (genuinely abandoned
  // or failed payment that needs admin review).
  const pendingNotifyTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Live listener — first verify the admin doc exists so we can give a
  // clear setup instruction if it's missing, rather than a cryptic error.
  useEffect(() => {
    let unsub = () => {};

    const init = async () => {
      // Step 1: check admin doc exists for this uid
      try {
        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        if (!adminSnap.exists()) {
          setListenerError(
            `Admin document not found.

Your uid is: ${user.uid}

` +
            `In Firebase Console → Firestore, create a document at:
` +
            `  Collection: admins
` +
            `  Document ID: ${user.uid}
` +
            `  Fields: { email: "${user.email}", role: "admin" }`
          );
          setLoading(false);
          return;
        }
      } catch (adminErr: unknown) {
        // getDoc itself failed — likely a network or project config issue
        const msg = adminErr instanceof Error ? adminErr.message : String(adminErr);
        setListenerError(`Could not verify admin status: ${msg}`);
        setLoading(false);
        return;
      }

      // Step 2: admin doc confirmed — start the live bookings listener
      // Limit to last 90 days + 300 records to reduce Firestore reads.
      // This covers all active bookings and recent history.
      // Admins can click "Refresh" to force a fresh pull; the All-Time analytics
      // note will prompt loading extended history separately when needed.
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
      cutoffDate.setHours(0, 0, 0, 0);
      const q = query(
        collection(db, 'bookings'),
        where('createdAt', '>=', Timestamp.fromDate(cutoffDate)),
        orderBy('createdAt', 'desc'),
        limit(300)
      );
      unsub = onSnapshot(
        q,
        snap => {
          const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
          setBookings(all);
          setListenerError(null);
          setLoading(false);
          setIsRefreshing(false);
          setLastRefreshedMs(performance.now() | 0);

          // ── New booking detection ──────────────────────────────────────────
          // First snapshot: record all existing IDs and seed the pending tracker.
          if (initialIdsRef.current === null) {
            initialIdsRef.current = new Set(snap.docs.map(d => d.id));
            // Seed pending tracker so we can detect transitions later
            snap.docs.forEach(d => {
              if (d.data().status === 'pending') pendingIdsRef.current.add(d.id);
            });
            return;
          }

          // 0. Removed docs — booking deleted (e.g. after bill created)
          //    Clean up timers + remove from notification queue to prevent false alerts
          snap.docChanges().filter(c => c.type === 'removed').forEach(c => {
            const id = c.doc.id;
            pendingIdsRef.current.delete(id);
            const t = pendingNotifyTimersRef.current.get(id);
            if (t) { clearTimeout(t); pendingNotifyTimersRef.current.delete(id); }
            setNewBookingQueue(prev => {
              const next = prev.filter(b => b.id !== id);
              if (next.length === 0) stopRinging();
              return next;
            });
          });

          // 1. Added docs — new bookings created after page load
          const addedBookings = snap.docChanges()
            .filter(c => c.type === 'added' && !initialIdsRef.current!.has(c.doc.id))
            .map(c => {
              initialIdsRef.current!.add(c.doc.id);
              const b = { id: c.doc.id, ...c.doc.data() } as Booking;
              // Track if it arrives as pending — it may pay later
              if (b.status === 'pending') pendingIdsRef.current.add(b.id);
              return b;
            });

          // 2. Modified docs — detect pending → paid transition
          //    (customer completed Razorpay after the pending order was created)
          const justPaidBookings = snap.docChanges()
            .filter(c =>
              c.type === 'modified' &&
              pendingIdsRef.current.has(c.doc.id) &&
              (c.doc.data().status === 'paid' || c.doc.data().status === 'confirmed')
            )
            .map(c => {
              pendingIdsRef.current.delete(c.doc.id); // no longer pending
              // Cancel any scheduled "still pending" notification — payment completed in time
              const t = pendingNotifyTimersRef.current.get(c.doc.id);
              if (t) { clearTimeout(t); pendingNotifyTimersRef.current.delete(c.doc.id); }
              return { id: c.doc.id, ...c.doc.data() } as Booking;
            });

          // Notify immediately for: newly-added non-pending bookings + pending→paid transitions
          const toNotify = [
            ...addedBookings.filter(b => b.status !== 'pending'),
            ...justPaidBookings,
          ];

          if (toNotify.length > 0) {
            setNewBookingQueue(prev => [...prev, ...toNotify]);
            toNotify.forEach(b => fireDesktopNotification(b));
          }

          // Newly-added pending bookings — don't notify yet. The customer may
          // still be completing Razorpay payment. Wait for the grace period;
          // only notify if it's still pending afterwards (abandoned/failed payment).
          addedBookings.filter(b => b.status === 'pending').forEach(b => {
            const timer = setTimeout(async () => {
              pendingNotifyTimersRef.current.delete(b.id);
              try {
                const fresh = await getDoc(doc(db, 'bookings', b.id));
                if (fresh.exists() && fresh.data().status === 'pending') {
                  const freshBooking = { id: b.id, ...fresh.data() } as Booking;
                  setNewBookingQueue(prev => [...prev, freshBooking]);
                  fireDesktopNotification(freshBooking);
                }
              } catch {}
            }, PENDING_NOTIFY_DELAY_MS);
            pendingNotifyTimersRef.current.set(b.id, timer);
          });
        },
        err => {
          console.error('[FIRESTORE LISTEN]', err);
          setListenerError(
            `Firestore listener failed: ${err.message}

` +
            `This usually means your Firestore rules denied the list query.
` +
            `Your uid: ${user.uid} — confirm the admins/${user.uid} document exists and rules are published.`
          );
          setLoading(false);
        }
      );
    };

    init();
    return () => {
      unsub();
      pendingNotifyTimersRef.current.forEach(t => clearTimeout(t));
      pendingNotifyTimersRef.current.clear();
    };
  }, [user.uid, user.email, refreshKey]);

  const handleStatusChange = async (id: string, status: BookingStatus, failedNote?: string) => {
    const updates: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
    if (status === 'failed' && failedNote?.trim()) {
      updates.failedNote = failedNote.trim();
      updates.staffNotes = arrayUnion({ text: `[FAILED] ${failedNote.trim()}`, byName: user.displayName ?? 'Admin', at: new Date().toISOString() });
    }
    await updateDoc(doc(db, 'bookings', id), updates);
  };

  const handleDeleteBooking = async (id: string) => {
    await deleteDoc(doc(db, 'bookings', id));
    setBookings(prev => prev.filter(b => b.id !== id));
  };

  // Accept a booking from the notification banner:
  // 1. Mark it confirmed in Firestore
  // 2. Remove from queue → if queue becomes empty, ring stops
  const acceptBooking = useCallback(async (booking: Booking) => {
    await handleStatusChange(booking.id, 'confirmed');
    setNewBookingQueue(q => {
      const next = q.filter(b => b.id !== booking.id);
      if (next.length === 0) stopRinging(); // nothing left to ring for
      return next;
    });
  }, []);

  // Review a pending booking from the notification banner:
  // jump to the Pending tab so admin can confirm payment / mark pay-at-salon,
  // and remove it from the ring queue → if queue becomes empty, ring stops.
  const reviewPendingBooking = useCallback((booking: Booking) => {
    setView('bookings');
    setActiveTab('pending');
    setNewBookingQueue(q => {
      const next = q.filter(b => b.id !== booking.id);
      if (next.length === 0) stopRinging();
      return next;
    });
  }, []);

  // Stop ringing when queue empties (e.g. admin dismisses all banners)
  useEffect(() => {
    if (newBookingQueue.length === 0) stopRinging();
  }, [newBookingQueue.length]);

  // Confirm all paid-but-unconfirmed bookings in one click
  // (does NOT touch payment-pending orders — those need manual admin review)
  const confirmAllPending = useCallback(async () => {
    const unconfirmed = bookings.filter(b =>
      b.status === 'paid' || b.status === 'whatsapp_redirected'
    );
    await Promise.all(unconfirmed.map(b => handleStatusChange(b.id, 'confirmed')));
  }, [bookings]);

  // Load staff + invoices (for commission calculation)
  useEffect(() => {
    if (view !== 'staff') return;
    setStaffLoading(true);
    Promise.all([
      getDocs(query(collection(db, 'staff'), orderBy('name'))),
      getDocs(query(collection(db, 'invoices'), orderBy('createdAt', 'desc'), limit(500))),
    ]).then(([staffSnap, invSnap]) => {
      setStaff(staffSnap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)));
      setStaffInvoices(invSnap.docs.map(d => d.data()));
    }).catch(console.error)
      .finally(() => setStaffLoading(false));
  }, [view]);

  // Date window for commission stats
  const commDateWindow = useMemo(() => {
    if (commFrom && commTo) {
      const f = localDate(commFrom);
      const t = localDate(commTo, true);
      return { start: f, end: t };
    }
    const now = new Date();
    if (commPeriod === 'thisMonth') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    if (commPeriod === 'lastMonth') {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    return null; // all time
  }, [commPeriod, commFrom, commTo]);

  // Per-staff commission stats derived from invoices (filtered by date window)
  const staffStats = useMemo(() => {
    const map: Record<string, { services: number; commission: number }> = {};
    staffInvoices.forEach(inv => {
      if (commDateWindow) {
        const createdAt = inv.createdAt;
        if (!createdAt) return;
        const d = typeof createdAt.toDate === 'function' ? createdAt.toDate() : new Date(createdAt);
        if (d < commDateWindow.start || d > commDateWindow.end) return;
      }
      (inv.items ?? []).forEach((item: any) => {
        if (!item.staffId) return;
        if (!map[item.staffId]) map[item.staffId] = { services: 0, commission: 0 };
        map[item.staffId].services++;
        map[item.staffId].commission += item.commissionAmount ?? 0;
      });
    });
    return map;
  }, [staffInvoices, commDateWindow]);

  // Load invoices when billing or insights view opens
  useEffect(() => {
    if (view !== 'billing' && view !== 'insights') return;
    setBillingLoading(true);
    getDocs(query(collection(db, 'invoices'), orderBy('createdAt', 'desc'), limit(500)))
      .then(snap => {
        setBillingInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice & { id: string })));
      })
      .catch(console.error)
      .finally(() => setBillingLoading(false));
  }, [view]);

  // Load staff list for the invoice-edit staff dropdown and the default-staff setting
  useEffect(() => {
    if (staff.length > 0) return;
    if (view !== 'billing' && !(view === 'tools' && toolsTab === 'settings')) return;
    getDocs(query(collection(db, 'staff'), orderBy('name')))
      .then(snap => setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember))))
      .catch(console.error);
  }, [view, toolsTab, staff.length]);

  // Billing tab stats — filtered by selected period or custom date range
  const billingStats = useMemo(() => {
    const now = new Date();
    const start = new Date();
    let endDate: Date | null = null;

    if (billingFrom && billingTo) {
      const f = localDate(billingFrom);
      const t = localDate(billingTo, true);
      start.setTime(f.getTime()); endDate = t;
    } else if (billingPeriod === 'today') { start.setHours(0, 0, 0, 0); }
    else if (billingPeriod === 'week')  { start.setDate(now.getDate() - 7); start.setHours(0,0,0,0); }
    else if (billingPeriod === 'month') { start.setDate(1); start.setHours(0,0,0,0); }
    else { start.setFullYear(2000); }

    const periodInvoices = billingInvoices.filter(inv => {
      if (!(inv as any).createdAt) return billingPeriod === 'all' && !billingFrom;
      const d = (inv as any).createdAt.toDate();
      return d >= start && (endDate ? d <= endDate : true);
    });

    const totalRevenue = periodInvoices.reduce((a, i) => a + (i.total ?? 0), 0);
    const count        = periodInvoices.length;
    const avgBill      = count > 0 ? totalRevenue / count : 0;
    const onlineCount  = periodInvoices.filter(i => i.source === 'online').length;
    const walkinCount  = count - onlineCount;
    // Outstanding dues across ALL invoices (not just the selected period)
    const totalDue  = billingInvoices
      .filter(i => (i as any).status === 'due' && ((i as any).amountDue ?? 0) > 0)
      .reduce((a, i) => a + ((i as any).amountDue ?? 0), 0);
    const dueCount  = billingInvoices.filter(i => (i as any).status === 'due').length;

    // Revenue by payment method — distribute across splits for accurate breakdown
    const pmRevenue: Record<string, number> = {};
    periodInvoices.forEach(inv => {
      const splits = (inv as any).paymentSplits as Array<{ method: string; amount: number }> | undefined;
      if (splits?.length) {
        splits.forEach(s => {
          const m = s.method ?? 'cash';
          pmRevenue[m] = (pmRevenue[m] ?? 0) + (s.amount ?? 0);
        });
      } else {
        const pm = inv.paymentMethod ?? 'cash';
        pmRevenue[pm] = (pmRevenue[pm] ?? 0) + ((inv as any).amountPaid ?? inv.total ?? 0);
      }
    });

    // Search filter
    const q = billingSearch.toLowerCase().trim();
    const displayed = q
      ? periodInvoices.filter(inv =>
          inv.invoiceNumber?.toLowerCase().includes(q) ||
          inv.customerName?.toLowerCase().includes(q)  ||
          inv.customerPhone?.includes(q) ||
          inv.items?.some((it: BillItem) => it.serviceName?.toLowerCase().includes(q))
        )
      : periodInvoices;

    // VVIP customer trends
    const vvipInvoices  = periodInvoices.filter(i => (i as any).billingType === 'vvip');
    const vvipRevenue   = vvipInvoices.reduce((a, i) => a + (i.total ?? 0), 0);
    const vvipBillCount = vvipInvoices.length;
    const vvipCustomers = new Set(vvipInvoices.map(i => i.customerPhone).filter(Boolean));
    const vvipCustomerCount = vvipCustomers.size;
    const vvipAvgBill   = vvipBillCount > 0 ? vvipRevenue / vvipBillCount : 0;

    return { totalRevenue, count, avgBill, onlineCount, walkinCount, pmRevenue, displayed, totalDue, dueCount,
      vvipRevenue, vvipBillCount, vvipCustomerCount, vvipAvgBill };
  }, [billingInvoices, billingPeriod, billingFrom, billingTo, billingSearch]);

  // Group all due invoices by customer for the dues drawer
  const dueCustomers = useMemo(() => {
    type DueEntry = { name: string; phone: string; totalDue: number; invoices: (Invoice & { id: string })[] };
    const map = new Map<string, DueEntry>();
    billingInvoices
      .filter(i => (i as any).status === 'due' && ((i as any).amountDue ?? 0) > 0)
      .forEach(inv => {
        const key = (inv.customerPhone ?? '').replace(/\D/g, '').slice(-10) || inv.customerPhone;
        if (!map.has(key)) map.set(key, { name: inv.customerName, phone: inv.customerPhone, totalDue: 0, invoices: [] });
        const e = map.get(key)!;
        e.totalDue += (inv as any).amountDue ?? 0;
        e.invoices.push(inv);
      });
    return Array.from(map.values()).sort((a, b) => b.totalDue - a.totalDue);
  }, [billingInvoices]);

  // Load customers — stats derived purely from invoices (each invoice = one completed visit)
  useEffect(() => {
    if (view !== 'customers') return;
    setCustomersLoading(true);
    Promise.all([
      getDocs(query(collection(db, 'customers'), orderBy('lastVisit', 'desc'))),
      getDocs(query(collection(db, 'invoices'),  orderBy('createdAt', 'desc'), limit(2000))),
    ]).then(([custSnap, invSnap]) => {
      // Aggregate visit count, total spend, and sources from invoices
      type InvAgg = { name: string; count: number; spend: number; firstVisit: string; lastVisit: string; sources: Set<string> };
      const invMap = new Map<string, InvAgg>();
      invSnap.docs.forEach(d => {
        const inv  = d.data();
        const phone = (inv.customerPhone ?? '').replace(/\D/g, '').slice(-10);
        if (!phone || phone.length < 10) return;
        const ts   = inv.createdAt?.toDate?.()?.toISOString() ?? '';
        if (!invMap.has(phone)) invMap.set(phone, { name: inv.customerName ?? '', count: 0, spend: 0, firstVisit: ts, lastVisit: ts, sources: new Set() });
        const e = invMap.get(phone)!;
        e.count++;
        e.spend += inv.total ?? 0;
        if (ts && ts > e.lastVisit)  e.lastVisit  = ts;
        if (ts && ts < e.firstVisit) e.firstVisit = ts;
        if (inv.source) e.sources.add(inv.source);
      });

      // Build customer list from invoice aggregation
      const map = new Map<string, any>();
      invMap.forEach((data, phone) => {
        const src = (data.sources.has('online') && data.sources.has('walkin')) ? 'both'
                  : data.sources.has('online') ? 'online' : 'walkin';
        map.set(phone, {
          phone,
          name:       data.name,
          visitCount: data.count,
          totalSpend: data.spend,
          firstVisit: data.firstVisit,
          lastVisit:  data.lastVisit,
          source:     src,
        });
      });

      // Overlay name from customers master (more authoritative) and include customers with no invoices yet
      custSnap.docs.forEach(d => {
        const data  = d.data();
        const phone = d.id;
        if (map.has(phone)) {
          const ex = map.get(phone);
          map.set(phone, { ...ex, name: data.name || ex.name });
        } else {
          map.set(phone, {
            ...data,
            visitCount: 0,
            totalSpend: 0,
            source:     data.source ?? 'walkin',
          });
        }
      });

      const merged = Array.from(map.values())
        .sort((a, b) => (b.lastVisit ?? '').localeCompare(a.lastVisit ?? ''));
      setCustomers(merged);
      setCustomerVisibleCount(CUSTOMER_PAGE_SIZE);
    }).catch(console.error)
      .finally(() => setCustomersLoading(false));
  }, [view]);

  // Staff CRUD
  const saveStaff = useCallback(async () => {
    if (!staffForm?.name?.trim()) return;
    setStaffSaving(true);
    try {
      const data = {
        name:           staffForm.name.trim(),
        phone:          staffForm.phone ?? '',
        role:           staffForm.role ?? '',
        commissionRate: staffForm.commissionRate ?? 5,
        salary:         (staffForm as any).salary ?? 0,
        email:      (staffForm as any).email?.trim() ?? '',
        isActive:       staffForm.isActive ?? true,
      };
      if (staffForm.id) {
        await setDoc(doc(db, 'staff', staffForm.id), { ...data, id: staffForm.id });
        setStaff(prev => prev.map(s => s.id === staffForm.id ? { ...data, id: staffForm.id! } : s));
      } else {
        const ref = await addDoc(collection(db, 'staff'), data);
        setStaff(prev => [...prev, { ...data, id: ref.id }]);
      }
      setStaffForm(null);
    } catch (e) { console.error(e); }
    finally { setStaffSaving(false); }
  }, [staffForm]);

  // ── Pending booking admin actions ────────────────────────────────────────
  const confirmWithPaymentId = useCallback(async (id: string, paymentId: string) => {
    if (!paymentId.trim()) return;
    await updateDoc(doc(db, 'bookings', id), {
      status:        'confirmed',
      paymentId:     paymentId.trim(),
      paymentMethod: 'razorpay',
      updatedAt:     serverTimestamp(),
    });
  }, []);

  const markPayAtSalon = useCallback(async (id: string) => {
    await updateDoc(doc(db, 'bookings', id), {
      status:        'confirmed',
      paymentMethod: 'pay_at_salon',
      updatedAt:     serverTimestamp(),
    });
  }, []);

  const deleteStaff = useCallback(async (id: string) => {
    if (!confirm('Remove this staff member?')) return;
    await deleteDoc(doc(db, 'staff', id));
    setStaff(prev => prev.filter(s => s.id !== id));
  }, []);

  // Open billing from a booking row
  const openBillingFromBooking = useCallback((booking: Booking) => {
    setBillingPrefill({
      bookingId:     booking.id,
      customerName:  booking.customerName ?? '',
      customerPhone: booking.customerPhone ?? '',
      serviceNames:          booking.serviceNames ?? '',
      serviceItems:          booking.serviceItems,
      totalAmount:           booking.totalAmount ?? 0,
      paymentId:             booking.paymentId,
      bookingTime:           booking.bookingTime,
      paymentMethod:         booking.paymentMethod,
      advanceAmount:         booking.advanceAmount,
      advancePaymentMethod:  booking.advancePaymentMethod,
      bookingSource:         booking.bookingSource,
    });
    setBillingOpen(true);
  }, []);

  const handleSignOut = async () => {
    setSignOutLoading(true);
    await signOut(auth);
  };

  const handleRequestPermission = useCallback(async () => {
    // Warm up AudioContext on this user gesture so it's never suspended
    // when a real notification arrives later.
    warmUpAudio();
    const result = await requestNotificationPermission();
    setNotifPermission(result);
  }, []);

  const dismissBanner = useCallback(() => {
    // Dismiss the banner visually but keep the booking in the ring queue
    // so ringing continues. Ring only stops when acceptBooking() empties the queue.
    // We just shift the display to the next queued booking.
    setNewBookingQueue(q => q.slice(1));
    // Note: stopRinging() is NOT called here — the useEffect above handles
    // stopping only when the entire queue is empty.
  }, []);

  // ── Period selector ───────────────────────────────────────────────────────
  const [period,        setPeriod]       = useState<Period>('month');
  const [insightsFrom,  setInsightsFrom] = useState('');
  const [insightsTo,    setInsightsTo]   = useState('');

  // ── Service drill-down ────────────────────────────────────────────────────
  const [expandedService,    setExpandedService]    = useState<string | null>(null);
  const [serviceDrillPeriod, setServiceDrillPeriod] = useState<'today'|'week'|'month'|'year'|'all'>('month');
  const [serviceDrillFrom,   setServiceDrillFrom]   = useState('');
  const [serviceDrillTo,     setServiceDrillTo]     = useState('');

  // ── Derived stats — invoice-primary, bookings for operational metrics ───────
  const stats = useMemo(() => {
    const now   = new Date();
    const start = new Date();
    let end: Date | null = null;
    if (insightsFrom && insightsTo) {
      const fromD = localDate(insightsFrom);
      const toD   = localDate(insightsTo, true);
      start.setTime(fromD.getTime());
      end = toD;
    } else if (period === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else {
      start.setFullYear(2000);
    }

    // ── Invoice-based financial metrics (primary) ───────────────────────────
    const inPeriodInv = (inv: Invoice) => {
      if (!inv.createdAt) return period === 'all' && !insightsFrom;
      const d = inv.createdAt.toDate();
      return d >= start && (end ? d <= end : true);
    };
    const periodInvoices  = billingInvoices.filter(inPeriodInv);
    const totalRevenue    = periodInvoices.reduce((a, inv) => a + (inv.total ?? 0), 0);
    const invoiceCount    = periodInvoices.length;
    const avgBill         = invoiceCount > 0 ? totalRevenue / invoiceCount : 0;
    const collectedAmount = periodInvoices.reduce((a, inv) => a + (inv.amountPaid ?? inv.total ?? 0), 0);
    const amountDue       = periodInvoices
      .filter(inv => (inv as any).status === 'due')
      .reduce((a, inv) => a + (inv.amountDue ?? 0), 0);
    const discountGiven   = periodInvoices.reduce((a, inv) => a + (inv.discountAmount ?? 0), 0);
    const collectionRate  = totalRevenue > 0 ? Math.round((collectedAmount / totalRevenue) * 100) : 0;

    // ── Online vs Walk-in split ─────────────────────────────────────────────
    const onlineInvoices = periodInvoices.filter(inv => inv.source === 'online');
    const walkinInvoices = periodInvoices.filter(inv => inv.source !== 'online');
    const onlineRevenue  = onlineInvoices.reduce((a, inv) => a + (inv.total ?? 0), 0);
    const walkinRevenue  = walkinInvoices.reduce((a, inv) => a + (inv.total ?? 0), 0);
    const onlineCount    = onlineInvoices.length;
    const walkinCount    = walkinInvoices.length;
    const onlineAvgBill  = onlineCount > 0 ? Math.round(onlineRevenue / onlineCount) : 0;
    const walkinAvgBill  = walkinCount > 0 ? Math.round(walkinRevenue / walkinCount) : 0;
    const onlineCollected = onlineInvoices.reduce((a, inv) => a + (inv.amountPaid ?? inv.total ?? 0), 0);
    const walkinCollected = walkinInvoices.reduce((a, inv) => a + (inv.amountPaid ?? inv.total ?? 0), 0);

    // ── Unique customers from invoices ──────────────────────────────────────
    const uniqueCustomers = new Set(periodInvoices.map(inv => inv.customerPhone).filter(Boolean)).size;

    // ── Top services from invoice line items ────────────────────────────────
    const serviceCounts: Record<string, { count: number; revenue: number }> = {};
    periodInvoices.forEach(inv => {
      inv.items?.forEach((item: BillItem) => {
        const name = item.serviceName?.trim();
        if (!name) return;
        if (!serviceCounts[name]) serviceCounts[name] = { count: 0, revenue: 0 };
        serviceCounts[name].count   += (item.quantity ?? 1);
        serviceCounts[name].revenue += (item.unitPrice ?? 0) * (item.quantity ?? 1) * (1 - ((item.lineDiscount ?? 0) / 100));
      });
    });
    const topServices = Object.entries(serviceCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, { count, revenue }]) => ({ name, count, revenue: Math.round(revenue) }));

    // ── Revenue trend from invoices ─────────────────────────────────────────
    const prevStart = new Date(start);
    if      (period === 'today') { prevStart.setDate(prevStart.getDate() - 1); }
    else if (period === 'week')  { prevStart.setDate(prevStart.getDate() - 7); }
    else if (period === 'month') { prevStart.setMonth(prevStart.getMonth() - 1); }
    const prevInvoices = period === 'all' ? [] : billingInvoices.filter(inv => {
      if (!inv.createdAt) return false;
      const d = inv.createdAt.toDate();
      return d >= prevStart && d < start;
    });
    const prevRevenue  = prevInvoices.reduce((a, inv) => a + (inv.total ?? 0), 0);
    const revenueTrend = (insightsFrom && insightsTo) ? null
      : prevRevenue === 0 ? null
      : Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100);

    // ── Revenue by day from invoices (sparkline) ────────────────────────────
    const chartDays = period === 'today' ? 1 : period === 'week' ? 7 : 30;
    const revenueByDay: { label: string; amount: number; invoices: number }[] = [];
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const dayInv = billingInvoices.filter(inv => {
        if (!inv.createdAt) return false;
        const bd = inv.createdAt.toDate();
        return bd >= d && bd < next;
      });
      revenueByDay.push({
        label:    period === 'today' ? 'Today' : `${d.getDate()}/${d.getMonth() + 1}`,
        amount:   dayInv.reduce((a, inv) => a + (inv.total ?? 0), 0),
        invoices: dayInv.length,
      });
    }

    // ── Return rate — phones with 2+ invoices all time ──────────────────────
    const allPhoneCounts: Record<string, number> = {};
    billingInvoices.forEach(inv => {
      const p = inv.customerPhone ?? ''; if (p) allPhoneCounts[p] = (allPhoneCounts[p] ?? 0) + 1;
    });
    const returningCustomers = Object.values(allPhoneCounts).filter(c => c >= 2).length;
    const totalCustomers     = Object.keys(allPhoneCounts).length;
    const returnRate         = totalCustomers > 0 ? Math.round((returningCustomers / totalCustomers) * 100) : 0;

    // ── Booking-based operational metrics ────────────────────────────────────
    const inPeriod = (b: Booking) => {
      if (!b.createdAt) return period === 'all' && !insightsFrom;
      const d = b.createdAt.toDate();
      return d >= start && (end ? d <= end : true);
    };
    const periodBookings  = bookings.filter(inPeriod);
    const pendingBookings = periodBookings.filter(b => b.status === 'pending');
    const completedCount  = periodBookings.filter(b => b.status === 'completed').length;
    const todayStr        = now.toDateString();
    const todayCount      = bookings.filter(
      b => b.bookingDate && new Date(b.bookingDate).toDateString() === todayStr
    ).length;

    // ── Status breakdown for donut chart ────────────────────────────────────
    const statusBreakdown: { status: BookingStatus; count: number; color: string }[] = [
      { status: 'confirmed', count: periodBookings.filter(b => b.status === 'confirmed').length, color: '#3b82f6' },
      { status: 'paid',      count: periodBookings.filter(b => b.status === 'paid').length,      color: '#10b981' },
      { status: 'completed', count: periodBookings.filter(b => b.status === 'completed').length, color: '#a855f7' },
      { status: 'pending',   count: periodBookings.filter(b => b.status === 'pending').length,   color: '#f59e0b' },
      { status: 'failed',    count: periodBookings.filter(b => b.status === 'failed').length,    color: '#ef4444' },
    ].filter(s => s.count > 0);

    // ── Peak hours from bookings ─────────────────────────────────────────────
    const hourCounts: Record<number, number> = {};
    periodBookings.forEach(b => {
      if (!b.startTime) return;
      const h = new Date(b.startTime).getHours();
      hourCounts[h] = (hourCounts[h] ?? 0) + 1;
    });
    const openH  = sSettings?.openHour  ?? 10;
    const closeH = sSettings?.closeHour ?? 22;
    const peakHours = Array.from({ length: closeH - openH }, (_, i) => {
      const h = i + openH;
      return { hour: h, label: h > 12 ? `${h-12}PM` : h === 12 ? '12PM' : `${h}AM`, count: hourCounts[h] ?? 0 };
    });
    const maxHourCount = Math.max(...peakHours.map(h => h.count), 1);

    // ── Booking status trend (pending vs confirmed vs completed) per day ───────
    type BookingDayBucket = { label: string; pending: number; confirmed: number; completed: number };
    const bookingsByDay: BookingDayBucket[] = [];
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const day = bookings.filter(b => {
        if (!b.createdAt) return false;
        const bd = b.createdAt.toDate(); return bd >= d && bd < next;
      });
      bookingsByDay.push({
        label:     period === 'today' ? 'Today' : `${d.getDate()}/${d.getMonth() + 1}`,
        pending:   day.filter(b => b.status === 'pending').length,
        confirmed: day.filter(b => b.status === 'confirmed' || b.status === 'paid').length,
        completed: day.filter(b => b.status === 'completed').length,
      });
    }

    // ── Booking source trend (walk-in vs online) per day ────────────────────
    type SourceDayBucket = { label: string; walkin: number; online: number };
    const bookingsBySource: SourceDayBucket[] = [];
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const day = bookings.filter(b => {
        if (!b.createdAt) return false;
        const bd = b.createdAt.toDate(); return bd >= d && bd < next && b.status !== 'failed';
      });
      bookingsBySource.push({
        label:  period === 'today' ? 'Today' : `${d.getDate()}/${d.getMonth() + 1}`,
        walkin: day.filter(b => (b as any).bookingSource === 'walk_in').length,
        online: day.filter(b => (b as any).bookingSource !== 'walk_in').length,
      });
    }

    // Totals for the period (for summary pills above charts)
    const totalPending   = bookingsByDay.reduce((a, d) => a + d.pending,   0);
    const totalConfirmed = bookingsByDay.reduce((a, d) => a + d.confirmed, 0);
    const totalCompleted = bookingsByDay.reduce((a, d) => a + d.completed, 0);
    const totalWalkin    = bookingsBySource.reduce((a, d) => a + d.walkin, 0);
    const totalOnlineAppts = bookingsBySource.reduce((a, d) => a + d.online, 0);

    // ── New vs Returning customers in period ─────────────────────────────────
    const periodPhones     = new Set(periodInvoices.map(inv => inv.customerPhone).filter(Boolean));
    const preExistingPhones = new Set(
      billingInvoices
        .filter(inv => inv.createdAt && inv.createdAt.toDate() < start)
        .map(inv => inv.customerPhone).filter(Boolean)
    );
    const newCustomerCount       = [...periodPhones].filter(p => !preExistingPhones.has(p)).length;
    const returningCustomerCount = periodPhones.size - newCustomerCount;

    // ── Staff performance leaderboard from period invoice items ───────────────
    type StaffEntry = { name: string; revenue: number; commission: number; services: number; bills: number };
    const staffMap: Record<string, StaffEntry>    = {};
    const staffBillSets: Record<string, Set<string>> = {};
    periodInvoices.forEach(inv => {
      const invId = (inv as any).id ?? '';
      inv.items?.forEach((item: BillItem) => {
        const name = item.staffName?.trim();
        if (!name) return;
        if (!staffMap[name]) { staffMap[name] = { name, revenue: 0, commission: 0, services: 0, bills: 0 }; staffBillSets[name] = new Set(); }
        staffMap[name].revenue    += (item.unitPrice ?? 0) * (item.quantity ?? 1) * (1 - ((item.lineDiscount ?? 0) / 100));
        staffMap[name].commission += item.commissionAmount ?? 0;
        staffMap[name].services   += item.quantity ?? 1;
        if (invId && !staffBillSets[name].has(invId)) { staffBillSets[name].add(invId); staffMap[name].bills++; }
      });
    });
    const staffLeaderboard = Object.values(staffMap)
      .sort((a, b) => b.revenue - a.revenue)
      .map(s => ({ ...s, revenue: Math.round(s.revenue), commission: Math.round(s.commission) }));

    // ── Day-of-week revenue pattern (Mon–Sun, period invoices) ────────────────
    const DOW_LABELS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const DOW_JS      = [1, 2, 3, 4, 5, 6, 0]; // Mon=1 … Sun=0 in JS
    const dowData = DOW_LABELS.map((day, i) => {
      const dayInv = periodInvoices.filter(inv => inv.createdAt && inv.createdAt.toDate().getDay() === DOW_JS[i]);
      return { day, amount: dayInv.reduce((a, inv) => a + (inv.total ?? 0), 0), count: dayInv.length };
    });

    // ── Revenue forecast for current month ────────────────────────────────────
    let revenueForecast: number | null = null;
    let forecastProgress: number | null = null;
    if (!insightsFrom && !insightsTo && period === 'month' && totalRevenue > 0) {
      const dayOfMonth  = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      revenueForecast   = Math.round((totalRevenue / dayOfMonth) * daysInMonth);
      forecastProgress  = Math.min(100, Math.round((totalRevenue / revenueForecast) * 100));
    }

    // ── Top customers by lifetime spend (all invoices) ────────────────────────
    type CustEntry = { name: string; phone: string; spend: number; visits: number; lastVisit: Date | null };
    const custMap: Record<string, CustEntry> = {};
    billingInvoices.forEach(inv => {
      const phone = inv.customerPhone?.trim(); if (!phone) return;
      if (!custMap[phone]) custMap[phone] = { name: inv.customerName ?? '', phone, spend: 0, visits: 0, lastVisit: null };
      custMap[phone].spend += inv.total ?? 0;
      custMap[phone].visits++;
      const d = inv.createdAt?.toDate();
      if (d && (!custMap[phone].lastVisit || d > custMap[phone].lastVisit!)) custMap[phone].lastVisit = d;
    });
    const topCustomers = Object.values(custMap)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8)
      .map(c => ({ ...c, spend: Math.round(c.spend) }));

    // ── Today's schedule ────────────────────────────────────────────────────
    const todayISO = new Date().toISOString().slice(0, 10);
    const todaySchedule = bookings
      .filter(b => {
        const d = b.startTime ? b.startTime.slice(0,10) : (b.bookingDate ?? '').slice(0,10);
        return d === todayISO && b.status !== 'failed';
      })
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));

    return {
      // Invoice financial
      totalRevenue, invoiceCount, avgBill,
      collectedAmount, amountDue, collectionRate, discountGiven,
      // Channel split
      onlineRevenue, walkinRevenue, onlineCount, walkinCount,
      onlineAvgBill, walkinAvgBill, onlineCollected, walkinCollected,
      // Customers
      uniqueCustomers, returningCustomers, totalCustomers, returnRate,
      newCustomerCount, returningCustomerCount,
      // Trend & charts
      revenueTrend, prevRevenue, revenueByDay, topServices,
      // Booking trends
      bookingsByDay, bookingsBySource,
      totalPending, totalConfirmed, totalCompleted,
      totalWalkin, totalOnlineAppts,
      // New analytics
      staffLeaderboard, dowData, revenueForecast, forecastProgress, topCustomers,
      // Booking operational
      todayCount, totalBookings: periodBookings.length,
      pendingCount: pendingBookings.length, completedCount,
      statusBreakdown, peakHours, maxHourCount,
      todaySchedule,
    };
  }, [bookings, billingInvoices, period, insightsFrom, insightsTo, sSettings]);

  // ── Service drill-down stats (from invoice items) ────────────────────────
  const serviceDrillStats = useMemo(() => {
    if (!expandedService) return null;
    const now = new Date();
    let start = new Date();
    let end: Date | null = null;

    if (serviceDrillFrom && serviceDrillTo) {
      start = localDate(serviceDrillFrom);
      end   = localDate(serviceDrillTo, true);
    } else if (serviceDrillPeriod === 'today') { start.setHours(0,0,0,0); }
    else if (serviceDrillPeriod === 'week')  { start.setDate(now.getDate()-7); start.setHours(0,0,0,0); }
    else if (serviceDrillPeriod === 'month') { start.setDate(1); start.setHours(0,0,0,0); }
    else if (serviceDrillPeriod === 'year')  { start.setMonth(0,1); start.setHours(0,0,0,0); }
    else { start.setFullYear(2000); }

    const relevant = billingInvoices.filter(inv => {
      const d = inv.createdAt?.toDate?.();
      const inPeriod = !d || (d >= start && (end ? d <= end : true));
      return inPeriod && inv.items?.some((it: BillItem) => it.serviceName?.trim() === expandedService);
    });

    const groups: Record<string, number> = {};
    relevant.forEach(inv => {
      const d = inv.createdAt?.toDate() ?? new Date();
      const key = serviceDrillPeriod === 'today'
        ? `${d.getHours()}:00`
        : (serviceDrillPeriod === 'year' || serviceDrillPeriod === 'all')
          ? d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'})
          : d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
      groups[key] = (groups[key] ?? 0) + 1;
    });

    const serviceRevenue = relevant.reduce((a, inv) => {
      const item = inv.items?.find((it: BillItem) => it.serviceName?.trim() === expandedService);
      if (!item) return a;
      return a + (item.unitPrice ?? 0) * (item.quantity ?? 1) * (1 - ((item.lineDiscount ?? 0) / 100));
    }, 0);

    return {
      total:     relevant.length,
      revenue:   Math.round(serviceRevenue),
      chartData: Object.entries(groups).map(([label, count]) => ({ label, count })),
    };
  }, [expandedService, serviceDrillPeriod, serviceDrillFrom, serviceDrillTo, billingInvoices]);

  // ── Split bookings into tabs ─────────────────────────────────────────────────

  const getBookingDate = (b: Booking): Date | null => {
    if (b.startTime) return new Date(b.startTime);
    if (b.bookingDate) return new Date(b.bookingDate);
    return null;
  };

  const isRecentBooking = (b: Booking): boolean => {
    const d = getBookingDate(b);
    if (!d) return false;
    return isToday(d) || isYesterday(d);
  };

  const oneWeekAgo = startOfDay(subDays(new Date(), 7));

  const pendingTabBookings = useMemo(() => {
    const actualPending = bookings.filter(b => {
      if (b.status !== 'pending') return false;
      const createdMs = b.createdAt?.toMillis?.();
      if (!createdMs) return true;
      return nowTick - createdMs >= PENDING_NOTIFY_DELAY_MS;
    });
    const oldActive = bookings.filter(b =>
      b.status !== 'completed' && b.status !== 'pending' && b.status !== 'failed' && !isRecentBooking(b)
    );
    return [...actualPending, ...oldActive];
  }, [bookings, nowTick]);

  const isFutureBooking = (b: Booking): boolean => {
    const d = getBookingDate(b);
    if (!d) return false;
    return d >= startOfDay(addDays(new Date(), 1));
  };

  const activeBookings     = useMemo(() => bookings.filter(b => b.status !== 'completed' && b.status !== 'pending' && b.status !== 'failed' && isRecentBooking(b)), [bookings]);
  const upcomingBookings   = useMemo(() => bookings.filter(b => b.status !== 'completed' && b.status !== 'pending' && b.status !== 'failed' && isFutureBooking(b)), [bookings]);
  const completedBookings  = useMemo(() => bookings.filter(b => b.status === 'completed' && !b.invoiceId), [bookings]);
  const failedBookings     = useMemo(() => bookings.filter(b => b.status === 'failed'), [bookings]);
  const rescheduledBookings = useMemo(() => bookings.filter(b => !!b.rescheduledAt && b.status !== 'completed' && b.status !== 'failed'), [bookings]);

  type LabelInfo = { text: string; color: string; bg: string };
  const getBookingLabels = (b: Booking, tab: string): LabelInfo[] => {
    const labels: LabelInfo[] = [];
    if (b.paymentId) {
      labels.push({ text: 'Paid', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' });
    } else if (b.advanceAmount && b.advanceAmount > 0) {
      labels.push({ text: `Advance ₹${b.advanceAmount.toLocaleString('en-IN')}`, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' });
    } else {
      labels.push({ text: 'Unpaid', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' });
    }
    if (tab === 'pending') {
      const d = getBookingDate(b);
      if (d && d < oneWeekAgo) {
        labels.push({ text: 'Old', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' });
      }
    }
    return labels;
  };

  // ── Filtered + sorted bookings ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list: Booking[];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = bookings.filter(b =>
        (b.customerName  ?? '').toLowerCase().includes(q) ||
        (b.customerPhone ?? '').includes(q) ||
        (b.customerEmail ?? '').toLowerCase().includes(q) ||
        (b.paymentId     ?? '').toLowerCase().includes(q)
      );
    } else {
      list = activeTab === 'completed'   ? [...completedBookings]
               : activeTab === 'pending'     ? [...pendingTabBookings]
               : activeTab === 'upcoming'    ? [...upcomingBookings]
               : activeTab === 'failed'      ? [...failedBookings]
               : activeTab === 'rescheduled' ? [...rescheduledBookings]
               :                              [...activeBookings];
      if (statusFilter !== 'all' && activeTab === 'active') list = list.filter(b => b.status === statusFilter);
    }
    list.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      if (sortKey === 'createdAt') {
        av = a.createdAt?.seconds ?? 0;
        bv = b.createdAt?.seconds ?? 0;
      } else if (sortKey === 'totalAmount') {
        av = a.totalAmount; bv = b.totalAmount;
      } else if (sortKey === 'customerName') {
        av = a.customerName.toLowerCase(); bv = b.customerName.toLowerCase();
      } else if (sortKey === 'bookingDate') {
        av = a.bookingDate; bv = b.bookingDate;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
    return list;
  }, [bookings, activeTab, statusFilter, search, sortKey, sortDir, pendingTabBookings, upcomingBookings, completedBookings, failedBookings, activeBookings, rescheduledBookings]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? (sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />)
      : <ChevronDown size={12} className="opacity-20" />;

  // ── Express Billing full-screen takeover ──────────────────────────────────
  if (billingOpen) {
    return (
      <div className="h-screen bg-[#0d0d0d] text-white flex flex-col overflow-hidden">
        <BillingModule
          prefill={billingPrefill}
          onClose={() => { setBillingOpen(false); setBillingPrefill(null); }}
          onInvoiceCreated={() => { setBillingOpen(false); setBillingPrefill(null); }}
        />
      </div>
    );
  }

  // ── Walk-in Booking full-screen takeover ──────────────────────────────────
  if (walkInOpen) {
    return (
      <div className="h-screen bg-[#0d0d0d] text-white flex flex-col overflow-hidden">
        <WalkInBooking
          user={user}
          staffMember={staffMember ?? undefined}
          onClose={() => setWalkInOpen(false)}
          onCreated={(_id) => { setWalkInOpen(false); setActiveTab('active'); }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Background texture */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gold/3 rounded-full blur-[180px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gold/2 rounded-full blur-[140px]" />
      </div>

      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-xl border-b border-white/15">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center shadow-[0_0_16px_rgba(212,175,55,0.2)]">
              <Scissors size={15} className="text-gold" />
            </div>
            <div className="hidden sm:block">
              <p className="text-white font-black uppercase tracking-[0.15em] text-sm leading-none">Hair Tech</p>
              <p className="text-gray-400 text-[11px] uppercase tracking-widest">
                {isStaffMode ? 'Staff Portal' : 'Admin'}
              </p>
            </div>
            {isStaffMode ? (
              <span className="ml-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-[11px] text-blue-400 font-black uppercase tracking-widest">
                {staffMember?.name ?? 'Staff'}
              </span>
            ) : (
              <span className="ml-1 px-2 py-0.5 bg-gold/10 border border-gold/20 rounded-full text-[11px] text-gold font-black uppercase tracking-widest">Live</span>
            )}
          </div>

          {/* ── Module navigation — filtered by role ── */}
          <nav className="flex items-center gap-0.5 bg-zinc-900 border border-white/15 rounded-xl p-1">
            {(isStaffMode ? [
              { id: 'bookings',   label: 'Bookings',  icon: <CalendarDays size={13} /> },
              { id: 'billing',    label: 'Billing',   icon: <Receipt      size={13} /> },
              { id: 'staff',      label: 'My Profile',icon: <UserCheck    size={13} /> },
              { id: 'tools',      label: 'Tools',     icon: <Wrench       size={13} /> },
            ] : [
              { id: 'bookings',   label: 'Bookings',  icon: <CalendarDays size={13} /> },
              { id: 'insights',   label: 'Insights',  icon: <BarChart2    size={13} /> },
              { id: 'billing',    label: 'Billing',   icon: <Receipt      size={13} /> },
              { id: 'staff',      label: 'Staff',     icon: <UserCheck    size={13} /> },
              { id: 'customers',  label: 'Customers', icon: <Users        size={13} /> },
              { id: 'tools',      label: 'Tools',     icon: <Wrench       size={13} /> },
            ]).map(tab => (
              <button key={tab.id} onClick={() => handleViewSwitch(tab.id as DashView)}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  view === tab.id
                    ? 'bg-gold text-black shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/8'
                }`}
              >
                {tab.icon}
                <span className="hidden md:inline">{tab.label}</span>
                {adminPin && (tab.id === 'billing' || tab.id === 'insights' || tab.id === 'staff') && (
                  <Lock size={8} className="text-current opacity-60" />
                )}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <p className="text-gray-500 text-xs hidden sm:block">{user.email}</p>

            {/* Notification permission toggle */}
            {notifPermission !== 'denied' && (
              <button
                onClick={notifPermission === 'granted' ? undefined : handleRequestPermission}
                title={notifPermission === 'granted' ? 'Desktop notifications enabled' : 'Enable desktop notifications'}
                className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-xs font-bold transition-all ${
                  notifPermission === 'granted'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 cursor-default'
                    : 'bg-white/8 border-white/10 text-gray-400 hover:border-amber-500/30 hover:text-amber-400'
                }`}
              >
                {notifPermission === 'granted'
                  ? <><Bell size={13} /> <span className="hidden sm:inline">Notifs On</span></>
                  : <><BellOff size={13} /> <span className="hidden sm:inline">Enable Notifs</span></>
                }
              </button>
            )}

            <button
              onClick={handleSignOut}
              disabled={signOutLoading}
              className="flex items-center gap-2 px-4 py-2 bg-white/8 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-gray-300 transition-all"
            >
              {signOutLoading ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── New booking banner — floats above everything ── */}
      <AnimatePresence>
        {newBookingQueue.length > 0 && (
          <NewBookingBanner
            key={newBookingQueue[0].id}
            booking={newBookingQueue[0]}
            onDismiss={dismissBanner}
            onAccept={() => acceptBooking(newBookingQueue[0])}
            onReview={() => reviewPendingBooking(newBookingQueue[0])}
          />
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-5 py-8 relative z-10">

        {/* ── Page Title + Express Bill ── */}
        <div className="mb-8 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter text-white leading-none">
              {view === 'bookings'  ? 'Bookings'
              : view === 'insights' ? 'Insights'
              : view === 'billing'  ? 'Billing'
              : view === 'staff'    ? 'Staff'
              : view === 'customers'? 'Customers'
              : 'Tools'}
            </h1>
            <p className="text-gray-400 text-sm mt-1.5 flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-gold inline-block"></span>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {(view === 'bookings' || view === 'insights') && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <CalendarDays size={13} className="text-gold" />
                <span>{stats.todayCount} booking{stats.todayCount !== 1 ? 's' : ''} today</span>
              </div>
            )}
            {/* Walk-In Booking — teal to distinguish from billing */}
            <button
              onClick={() => setWalkInOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-xl text-black font-black text-xs uppercase tracking-wider shadow-[0_4px_20px_-4px_rgba(20,184,166,0.4)] hover:scale-105 transition-all"
            >
              <CalendarPlus size={13} /> Walk-In
            </button>
            <button
              onClick={() => { setBillingPrefill(null); setBillingOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#F0D060] rounded-xl text-black font-black text-xs uppercase tracking-wider shadow-[0_4px_20px_-4px_rgba(212,175,55,0.4)] hover:scale-105 transition-all"
            >
              <Receipt size={13} /> Express Bill
            </button>

            {/* Refresh — only visible on bookings/insights, admin-only */}
            {!isStaffMode && (view === 'bookings' || view === 'insights') && (
              <div className="flex items-center gap-2">
                {lastRefreshedMs > 0 && (
                  <span className="text-[11px] text-gray-400 font-bold hidden lg:block">
                    Showing last 90 days
                  </span>
                )}
                <button
                  onClick={() => { setIsRefreshing(true); setRefreshKey(k => k + 1); }}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/8 border border-white/10 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/8 transition-all disabled:opacity-40"
                  title="Refresh booking data"
                >
                  <RefreshCw size={11} className={isRefreshing ? 'animate-spin text-gold' : ''}/>
                  {isRefreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            INSIGHTS VIEW — analytics, charts, trends
        ════════════════════════════════════════════════════════════════ */}
        {view === 'insights' && (<>

        {/* ── Period Selector + Stats ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
          <div>
            <h2 className="text-white font-black text-lg uppercase tracking-tight">Overview</h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-gold font-bold bg-gold/8 border border-gold/20 rounded-lg px-2.5 py-1 mt-1">
              <Calendar size={10} /> {fmtPeriodLabel(period, insightsFrom, insightsTo)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Preset period pills */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-white/12 rounded-xl p-1">
              {([
                { id: 'today', label: 'Today'       },
                { id: 'week',  label: 'This Week'   },
                { id: 'month', label: 'This Month'  },
                { id: 'all',   label: 'All Time'    },
              ] as const).map(p => (
                <button key={p.id}
                  onClick={() => { setPeriod(p.id); setInsightsFrom(''); setInsightsTo(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                    period === p.id && !insightsFrom
                      ? 'bg-gold/20 border border-gold/30 text-gold'
                      : 'text-gray-500 hover:text-white'
                  }`}
                >{p.label}</button>
              ))}
            </div>
            {/* Custom date range */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/12 rounded-xl px-3 py-1.5">
              <Calendar size={11} className={insightsFrom ? 'text-gold' : 'text-gray-400'} />
              <input
                type="date" value={insightsFrom}
                onChange={e => setInsightsFrom(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none w-24 [color-scheme:dark]"
              />
              <span className="text-gray-400 text-xs">–</span>
              <input
                type="date" value={insightsTo} min={insightsFrom}
                onChange={e => setInsightsTo(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none w-24 [color-scheme:dark]"
              />
              {insightsFrom && (
                <button onClick={() => { setInsightsFrom(''); setInsightsTo(''); }}
                  className="text-gray-400 hover:text-white transition-colors ml-1">
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Row 1 — primary revenue metrics (mirrors TapGro top row) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Total Revenue */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 border border-emerald-500/30 rounded-2xl p-5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-emerald-500 rounded-t-2xl" />
            <p className="text-xs uppercase tracking-widest font-black text-gray-400 mb-1.5">Total Revenue</p>
            <p className="text-2xl font-black text-white leading-none mb-1">
              ₹{stats.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-gray-500">{stats.invoiceCount} invoice{stats.invoiceCount !== 1 ? 's' : ''} billed</p>
            {stats.revenueForecast && (
              <p className="text-xs text-blue-400 mt-1">
                ~₹{stats.revenueForecast.toLocaleString('en-IN')} projected
              </p>
            )}
            {stats.revenueTrend !== null && (
              <span className={`absolute top-4 right-4 flex items-center gap-0.5 text-xs font-black ${stats.revenueTrend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stats.revenueTrend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {Math.abs(stats.revenueTrend)}%
              </span>
            )}
          </motion.div>

          {/* Bill Amount Received */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-zinc-900 border border-blue-500/30 rounded-2xl p-5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-blue-500 rounded-t-2xl" />
            <p className="text-xs uppercase tracking-widest font-black text-gray-400 mb-1.5">Collected</p>
            <p className="text-2xl font-black text-white leading-none mb-1">
              ₹{stats.collectedAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-gray-500">Amount collected from invoices</p>
          </motion.div>

          {/* Avg Bill */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-amber-500 rounded-t-2xl" />
            <p className="text-xs uppercase tracking-widest font-black text-gray-400 mb-1.5">Avg Bill</p>
            <p className="text-2xl font-black text-white leading-none mb-1">
              ₹{Math.round(stats.avgBill).toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-gray-500">Per invoice</p>
          </motion.div>

          {/* Amount Due */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-zinc-900 border border-red-500/30 rounded-2xl p-5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-red-500 rounded-t-2xl" />
            <p className="text-xs uppercase tracking-widest font-black text-gray-400 mb-1.5">Outstanding Dues</p>
            <p className="text-2xl font-black text-white leading-none mb-1">
              ₹{stats.amountDue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-gray-500">Partially paid invoices</p>
          </motion.div>
        </div>

        {/* Row 2 — operational metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Appointments',   value: stats.totalBookings.toString(),    sub: `${stats.todayCount} today`,         icon: <Calendar size={16} />,    color: 'text-gold' },
            { label: 'Clients',        value: stats.uniqueCustomers.toString(),  sub: `${stats.newCustomerCount} new · ${stats.returningCustomerCount} returning`, icon: <Users size={16} />,       color: 'text-purple-400' },
            { label: 'Pending',        value: stats.pendingCount.toString(),     sub: 'Awaiting payment',                   icon: <Clock size={16} />,       color: 'text-amber-400' },
            { label: 'Completed',      value: stats.completedCount.toString(),   sub: 'Services done',                      icon: <ListChecks size={16} />,  color: 'text-emerald-400' },
            { label: 'Avg / Day',
              value: stats.revenueByDay.length > 0
                ? `₹${Math.round(stats.revenueByDay.reduce((a,d)=>a+d.amount,0) / Math.max(1, stats.revenueByDay.filter(d=>d.amount>0).length)).toLocaleString('en-IN')}`
                : '₹0',
              sub: 'On active days', icon: <BarChart3 size={16} />, color: 'text-blue-400' },
          ].map(({ label, value, sub, icon, color }) => (
            <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-900 border border-white/12 rounded-2xl p-4 flex items-center gap-3"
            >
              <div className={`p-2 bg-white/8 rounded-xl ${color} shrink-0`}>{icon}</div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-widest font-black text-gray-500 truncate">{label}</p>
                <p className="text-xl font-black text-white leading-none">{value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Channel Breakdown — Online vs Walk-in */}
        <div className="bg-zinc-900 border border-white/12 rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs uppercase tracking-widest font-black text-gray-500">Channel Breakdown</p>
              <p className="text-white font-black text-sm mt-0.5">
                {stats.invoiceCount} invoice{stats.invoiceCount !== 1 ? 's' : ''} · Online vs Walk-in
              </p>
            </div>
            {stats.totalRevenue > 0 && (
              <div className="flex items-center gap-2 text-xs font-black">
                <span className="flex items-center gap-1 text-blue-400">
                  <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                  {Math.round((stats.onlineRevenue / stats.totalRevenue) * 100)}% Online
                </span>
                <span className="text-gray-600">/</span>
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  {Math.round((stats.walkinRevenue / stats.totalRevenue) * 100)}% Walk-in
                </span>
              </div>
            )}
          </div>

          {/* Side-by-side tiles */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Online */}
            <div className="p-4 bg-blue-500/8 border border-blue-500/20 rounded-2xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <span className="text-xs font-black uppercase tracking-widest text-blue-400">Online</span>
              </div>
              <p className="text-2xl font-black text-white leading-none">
                ₹{stats.onlineRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
              <div className="mt-2 space-y-0.5">
                <p className="text-xs text-gray-400">{stats.onlineCount} invoice{stats.onlineCount !== 1 ? 's' : ''}</p>
                <p className="text-xs text-gray-400">₹{stats.onlineAvgBill.toLocaleString('en-IN')} avg bill</p>
                <p className="text-xs text-emerald-400">₹{stats.onlineCollected.toLocaleString('en-IN', { maximumFractionDigits: 0 })} collected</p>
              </div>
            </div>
            {/* Walk-in */}
            <div className="p-4 bg-amber-500/8 border border-amber-500/20 rounded-2xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-xs font-black uppercase tracking-widest text-amber-400">Walk-in</span>
              </div>
              <p className="text-2xl font-black text-white leading-none">
                ₹{stats.walkinRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
              <div className="mt-2 space-y-0.5">
                <p className="text-xs text-gray-400">{stats.walkinCount} invoice{stats.walkinCount !== 1 ? 's' : ''}</p>
                <p className="text-xs text-gray-400">₹{stats.walkinAvgBill.toLocaleString('en-IN')} avg bill</p>
                <p className="text-xs text-emerald-400">₹{stats.walkinCollected.toLocaleString('en-IN', { maximumFractionDigits: 0 })} collected</p>
              </div>
            </div>
          </div>

          {/* Revenue split bar */}
          {stats.totalRevenue > 0 ? (
            <div className="h-2.5 bg-white/8 rounded-full overflow-hidden flex mb-4">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(stats.onlineRevenue / stats.totalRevenue) * 100}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full bg-blue-500 rounded-l-full"
              />
              <div className="flex-1 h-full bg-amber-500/60 rounded-r-full" />
            </div>
          ) : (
            <div className="h-2.5 bg-white/8 rounded-full mb-4" />
          )}

          {/* Bottom metrics row */}
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
            <div className="text-center">
              <p className="text-lg font-black text-white">{stats.invoiceCount}</p>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">Total Bills</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-gold">₹{Math.round(stats.avgBill).toLocaleString('en-IN')}</p>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">Avg Bill</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-purple-400">
                ₹{stats.discountGiven.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">Discounts Given</p>
            </div>
          </div>
        </div>

        {/* Booking Trends — Pending vs Confirmed  &  Walk-in vs Online */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

          {/* Pending vs Confirmed trend */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-widest font-black text-gray-500">Order Status Trend</p>
                <p className="text-white font-black text-sm mt-0.5">Pending vs Confirmed</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {[
                  { label: 'Pending',   count: stats.totalPending,   color: 'bg-amber-400', text: 'text-amber-400' },
                  { label: 'Confirmed', count: stats.totalConfirmed, color: 'bg-blue-400',  text: 'text-blue-400'  },
                  { label: 'Completed', count: stats.totalCompleted, color: 'bg-purple-400',text: 'text-purple-400'},
                ].map(({ label, count, color, text }) => (
                  <span key={label} className="flex items-center gap-1 text-[11px] font-black">
                    <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
                    <span className={text}>{count}</span>
                    <span className="text-gray-600">{label}</span>
                  </span>
                ))}
              </div>
            </div>
            {(() => {
              const data  = stats.bookingsByDay.slice(-14);
              const max   = Math.max(...data.map(d => d.pending + d.confirmed + d.completed), 1);
              const H     = 96;
              return data.every(d => d.pending + d.confirmed + d.completed === 0) ? (
                <div className="h-24 flex items-center justify-center">
                  <p className="text-gray-600 text-xs">No bookings in this period</p>
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-1" style={{ height: `${H}px` }}>
                    {data.map((d, i) => {
                      const total  = d.pending + d.confirmed + d.completed;
                      const barH   = Math.max(total > 0 ? 4 : 0, (total / max) * H);
                      const pendH  = total > 0 ? (d.pending   / total) * barH : 0;
                      const confH  = total > 0 ? (d.confirmed / total) * barH : 0;
                      const compH  = total > 0 ? (d.completed / total) * barH : 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-stretch justify-end group relative">
                          <div className="w-full rounded-t overflow-hidden flex flex-col-reverse" style={{ height: `${barH}px` }}>
                            <div className="w-full bg-blue-500/70"   style={{ height: `${confH}px` }} />
                            <div className="w-full bg-amber-500/70"  style={{ height: `${pendH}px` }} />
                            <div className="w-full bg-purple-500/70" style={{ height: `${compH}px` }} />
                          </div>
                          {total > 0 && (
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                              <div className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white font-bold whitespace-nowrap shadow-xl space-y-0.5">
                                <p className="text-gray-300">{d.label}</p>
                                {d.pending   > 0 && <p className="text-amber-400">{d.pending} pending</p>}
                                {d.confirmed > 0 && <p className="text-blue-400">{d.confirmed} confirmed</p>}
                                {d.completed > 0 && <p className="text-purple-400">{d.completed} completed</p>}
                              </div>
                              <div className="w-1.5 h-1.5 bg-zinc-800 rotate-45 -mt-0.5 border-r border-b border-white/10" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-1 mt-1.5">
                    {data.map((d, i) => (
                      <div key={i} className="flex-1 text-center">
                        <span className="text-[7px] text-gray-700 font-bold leading-none">
                          {data.length <= 10 ? d.label : (i % 2 === 0 ? d.label : '')}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/10">
              {[
                { color: 'bg-purple-500/70', label: 'Completed' },
                { color: 'bg-blue-500/70',   label: 'Confirmed' },
                { color: 'bg-amber-500/70',  label: 'Pending'   },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1 text-[8px] text-gray-400 font-bold">
                  <span className={`w-2 h-2 rounded-sm ${color}`} /> {label}
                </span>
              ))}
            </div>
          </div>

          {/* Walk-in vs Online appointments trend */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-widest font-black text-gray-500">Appointments by Source</p>
                <p className="text-white font-black text-sm mt-0.5">Walk-in vs Online</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[11px] font-black">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="text-amber-400">{stats.totalWalkin}</span>
                  <span className="text-gray-600">Walk-in</span>
                </span>
                <span className="flex items-center gap-1 text-[11px] font-black">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-blue-400">{stats.totalOnlineAppts}</span>
                  <span className="text-gray-600">Online</span>
                </span>
              </div>
            </div>
            {(() => {
              const data = stats.bookingsBySource.slice(-14);
              const max  = Math.max(...data.map(d => d.walkin + d.online), 1);
              const H    = 96;
              return data.every(d => d.walkin + d.online === 0) ? (
                <div className="h-24 flex items-center justify-center">
                  <p className="text-gray-600 text-xs">No appointments in this period</p>
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-1" style={{ height: `${H}px` }}>
                    {data.map((d, i) => {
                      const total  = d.walkin + d.online;
                      const barH   = Math.max(total > 0 ? 4 : 0, (total / max) * H);
                      const wH     = total > 0 ? (d.walkin / total) * barH : 0;
                      const oH     = total > 0 ? (d.online / total) * barH : 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-stretch justify-end group relative">
                          <div className="w-full rounded-t overflow-hidden flex flex-col-reverse" style={{ height: `${barH}px` }}>
                            <div className="w-full bg-amber-500/70" style={{ height: `${wH}px` }} />
                            <div className="w-full bg-blue-500/70"  style={{ height: `${oH}px` }} />
                          </div>
                          {total > 0 && (
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                              <div className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white font-bold whitespace-nowrap shadow-xl space-y-0.5">
                                <p className="text-gray-300">{d.label}</p>
                                {d.walkin  > 0 && <p className="text-amber-400">{d.walkin} walk-in</p>}
                                {d.online  > 0 && <p className="text-blue-400">{d.online} online</p>}
                              </div>
                              <div className="w-1.5 h-1.5 bg-zinc-800 rotate-45 -mt-0.5 border-r border-b border-white/10" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-1 mt-1.5">
                    {data.map((d, i) => (
                      <div key={i} className="flex-1 text-center">
                        <span className="text-[7px] text-gray-700 font-bold leading-none">
                          {data.length <= 10 ? d.label : (i % 2 === 0 ? d.label : '')}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/10">
              {[
                { color: 'bg-blue-500/70',  label: 'Online'   },
                { color: 'bg-amber-500/70', label: 'Walk-in'  },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1 text-[8px] text-gray-400 font-bold">
                  <span className={`w-2 h-2 rounded-sm ${color}`} /> {label}
                </span>
              ))}
            </div>
          </div>

        </div>

        {/* Day-of-Week Revenue + Revenue Forecast / Customer Retention */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

          {/* Day-of-week revenue pattern */}
          <div className="lg:col-span-2 bg-zinc-900 border border-white/12 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs uppercase tracking-widest font-black text-gray-500">Day-of-Week Pattern</p>
                <p className="text-white font-black text-sm mt-0.5">Revenue by weekday</p>
              </div>
              {(() => {
                const best = stats.dowData.reduce((a, d) => d.amount > a.amount ? d : a, stats.dowData[0]);
                return best?.amount > 0 ? (
                  <span className="text-xs font-black text-gold px-2 py-1 bg-gold/10 border border-gold/20 rounded-full">
                    Best: {best.day}
                  </span>
                ) : null;
              })()}
            </div>
            {stats.dowData.every(d => d.amount === 0) ? (
              <div className="h-32 flex items-center justify-center">
                <p className="text-gray-600 text-xs">No invoice data for this period</p>
              </div>
            ) : (() => {
              const maxAmt = Math.max(...stats.dowData.map(d => d.amount), 1);
              const H = 96;
              return (
                <>
                  <div className="flex items-end gap-2" style={{ height: `${H}px` }}>
                    {stats.dowData.map((d, i) => {
                      const barH  = Math.max(d.amount > 0 ? 4 : 0, (d.amount / maxAmt) * H);
                      const isTop = d.amount === maxAmt && d.amount > 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-stretch justify-end group relative">
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${barH}px` }}
                            transition={{ duration: 0.7, delay: i * 0.06, ease: 'easeOut' }}
                            className={`w-full rounded-t cursor-default ${isTop ? 'bg-gold' : 'bg-gold/35 hover:bg-gold/55'} transition-colors`}
                          />
                          {d.amount > 0 && (
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                              <div className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white font-bold whitespace-nowrap shadow-xl space-y-0.5">
                                <p className="text-gold">₹{d.amount.toLocaleString('en-IN')}</p>
                                <p className="text-gray-400">{d.count} invoice{d.count !== 1 ? 's' : ''}</p>
                              </div>
                              <div className="w-1.5 h-1.5 bg-zinc-800 rotate-45 -mt-0.5 border-r border-b border-white/10" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-2">
                    {stats.dowData.map((d, i) => (
                      <div key={i} className="flex-1 text-center">
                        <span className={`text-[11px] font-black ${d.amount === maxAmt && d.amount > 0 ? 'text-gold' : 'text-gray-600'}`}>{d.day}</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Revenue Forecast (month) OR Customer Retention (other periods) */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl p-6 flex flex-col">
            {stats.revenueForecast ? (
              <>
                <p className="text-xs uppercase tracking-widest font-black text-gray-500 mb-1">Monthly Forecast</p>
                <p className="text-white font-black text-sm mb-4">End-of-month projection</p>
                <p className="text-3xl font-black text-gold leading-none mb-1">
                  ₹{stats.revenueForecast.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  ₹{stats.totalRevenue.toLocaleString('en-IN')} so far · day {new Date().getDate()} of {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()}
                </p>
                <div className="mt-auto space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Progress</span>
                    <span className="font-black text-white">{stats.forecastProgress}%</span>
                  </div>
                  <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${stats.forecastProgress}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className="h-full bg-gold rounded-full"
                    />
                  </div>
                  {stats.prevRevenue > 0 && (
                    <p className={`text-xs font-bold flex items-center gap-1 mt-2 ${stats.revenueForecast >= stats.prevRevenue ? 'text-emerald-400' : 'text-red-400'}`}>
                      {stats.revenueForecast >= stats.prevRevenue ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {Math.abs(Math.round(((stats.revenueForecast - stats.prevRevenue) / stats.prevRevenue) * 100))}% vs last month
                      <span className="text-gray-600 font-normal">(₹{stats.prevRevenue.toLocaleString('en-IN')})</span>
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-widest font-black text-gray-500 mb-1">Customer Retention</p>
                <p className="text-white font-black text-sm mb-5">New vs Returning</p>
                <div className="flex gap-3 mb-4">
                  <div className="flex-1 p-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl text-center">
                    <p className="text-2xl font-black text-emerald-400">{stats.newCustomerCount}</p>
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">New</p>
                  </div>
                  <div className="flex-1 p-3 bg-purple-500/8 border border-purple-500/20 rounded-xl text-center">
                    <p className="text-2xl font-black text-purple-400">{stats.returningCustomerCount}</p>
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">Returning</p>
                  </div>
                </div>
                <div className="mt-auto space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Return rate (all time)</span>
                    <span className="font-black text-purple-400">{stats.returnRate}%</span>
                  </div>
                  <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${stats.returnRate}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className="h-full bg-purple-500 rounded-full"
                    />
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {stats.returningCustomers} of {stats.totalCustomers} customers visited 2+ times
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Row 3 — Revenue trend + Status donut + Collection rate */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

          {/* Revenue bar chart */}
          <div className="lg:col-span-2 bg-zinc-900 border border-white/12 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs uppercase tracking-widest font-black text-gray-500">Revenue Trend</p>
                <p className="text-white font-black text-sm">
                  {period === 'today' ? 'Today' : period === 'week' ? 'Last 7 Days' : period === 'month' ? 'This Month' : 'All Time'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-gold font-black text-lg">₹{stats.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                {stats.revenueTrend !== null && (
                  <p className={`text-xs font-bold flex items-center justify-end gap-0.5 ${stats.revenueTrend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {stats.revenueTrend >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                    {Math.abs(stats.revenueTrend)}% vs prev period
                  </p>
                )}
              </div>
            </div>
            {stats.revenueByDay.length > 1 ? (() => {
              const maxAmt = Math.max(...stats.revenueByDay.map(d => d.amount), 1);
              const show   = stats.revenueByDay.slice(-14);
              return (
                <div>
                  <div className="flex items-end gap-1 h-36">
                    {show.map((d, i) => {
                      const pct = Math.max(4, (d.amount / maxAmt) * 128);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-end gap-0 group relative">
                          {/* Bar */}
                          <div
                            className="w-full rounded-t cursor-default transition-all"
                            style={{
                              height: `${pct}px`,
                              background: d.amount > 0
                                ? `linear-gradient(to top, rgba(212,175,55,0.7), rgba(212,175,55,0.3))`
                                : 'rgba(255,255,255,0.04)',
                            }}
                          />
                          {/* Tooltip */}
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                            <div className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white font-bold whitespace-nowrap shadow-xl space-y-0.5">
                              <p className="text-gold">₹{d.amount.toLocaleString('en-IN')}</p>
                              <p className="text-gray-400">{d.invoices} invoice{d.invoices !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="w-1.5 h-1.5 bg-zinc-800 rotate-45 -mt-0.5 border-r border-b border-white/10" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* X-axis labels */}
                  <div className="flex gap-1 mt-1.5">
                    {show.map((d, i) => (
                      <div key={i} className="flex-1 text-center">
                        <span className="text-[7px] text-gray-700 font-bold leading-none">
                          {show.length <= 10 ? d.label : (i % 2 === 0 ? d.label : '')}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Y-axis reference */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
                    <span className="text-[11px] text-gray-700 font-bold">₹0</span>
                    <span className="text-[11px] text-gray-700 font-bold">₹{maxAmt.toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
                  </div>
                </div>
              );
            })() : (
              <div className="h-36 flex items-center justify-center">
                <p className="text-gray-400 text-xs">Not enough data for this period</p>
              </div>
            )}
          </div>

          {/* Status breakdown donut + collection rate */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl p-6 flex flex-col gap-5">
            {/* Donut chart — pure SVG */}
            <div>
              <p className="text-xs uppercase tracking-widest font-black text-gray-500 mb-3">Booking Breakdown</p>
              {stats.statusBreakdown.length === 0 ? (
                <p className="text-gray-400 text-xs text-center py-4">No data</p>
              ) : (() => {
                const total = stats.statusBreakdown.reduce((a, s) => a + s.count, 0);
                const r = 36; const cx = 56; const cy = 56;
                const circumference = 2 * Math.PI * r;
                let offset = 0;
                return (
                  <div className="flex items-center gap-4">
                    <svg width="112" height="112" className="shrink-0 -rotate-90">
                      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="14" />
                      {stats.statusBreakdown.map(({ count, color }, i) => {
                        const dash = (count / total) * circumference;
                        const el = (
                          <circle key={i} cx={cx} cy={cy} r={r}
                            fill="none" stroke={color} strokeWidth="14"
                            strokeDasharray={`${dash} ${circumference - dash}`}
                            strokeDashoffset={-offset}
                            strokeLinecap="butt"
                          />
                        );
                        offset += dash;
                        return el;
                      })}
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                        fill="white" fontSize="14" fontWeight="900"
                        style={{ transform: 'rotate(90deg)', transformOrigin: `${cx}px ${cy}px` }}>
                        {total}
                      </text>
                      <text x={cx} y={cy + 13} textAnchor="middle"
                        fill="rgba(156,163,175,1)" fontSize="7" fontWeight="700"
                        style={{ transform: 'rotate(90deg)', transformOrigin: `${cx}px ${cy}px` }}>
                        TOTAL
                      </text>
                    </svg>
                    <div className="space-y-1.5 min-w-0">
                      {stats.statusBreakdown.map(({ status, count, color }) => (
                        <div key={status} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-xs text-gray-400 capitalize truncate">{STATUS_META[status].label}</span>
                          <span className="text-xs font-black text-white ml-auto">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Collection rate */}
            <div className="pt-4 border-t border-white/10">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-widest font-black text-gray-500">Collection Rate</p>
                <span className={`text-sm font-black ${stats.collectionRate >= 80 ? 'text-emerald-400' : stats.collectionRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {stats.collectionRate}%
                </span>
              </div>
              <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.collectionRate}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className={`h-full rounded-full ${stats.collectionRate >= 80 ? 'bg-emerald-500' : stats.collectionRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                ₹{stats.collectedAmount.toLocaleString('en-IN')} collected of ₹{stats.totalRevenue.toLocaleString('en-IN')}
              </p>
            </div>

            {/* Return customer rate */}
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs uppercase tracking-widest font-black text-gray-500">Returning Customers</p>
                <span className="text-sm font-black text-purple-400">{stats.returnRate}%</span>
              </div>
              <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.returnRate}%` }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                  className="h-full rounded-full bg-purple-500"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                {stats.returningCustomers} of {stats.totalCustomers} customers visited 2+ times
              </p>
            </div>
          </div>
        </div>

        {/* Row 4 — Top services + Peak hours + Today's schedule */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">

          {/* Top services — interactive drill-down */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs uppercase tracking-widest font-black text-gray-500">Top Services</p>
              <span className="text-[8px] text-gray-700 font-bold uppercase tracking-wider">Tap to drill down</span>
            </div>

            {stats.topServices.length === 0 ? (
              <p className="text-gray-400 text-xs text-center py-8">No data for this period</p>
            ) : (
              <div className="space-y-1">
                {stats.topServices.map(({ name, count, revenue }, i) => {
                  const maxCount = stats.topServices[0].count;
                  const isOpen   = expandedService === name;
                  return (
                    <div key={name}>
                      {/* Service row — clickable */}
                      <button
                        onClick={() => { setExpandedService(isOpen ? null : name); setServiceDrillFrom(''); setServiceDrillTo(''); }}
                        className={`w-full text-left group transition-all rounded-xl px-2 py-2 ${isOpen ? 'bg-gold/8' : 'hover:bg-zinc-800/40'}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[11px] font-black w-3 ${isOpen ? 'text-gold' : 'text-gray-400'}`}>{i + 1}</span>
                            <span className={`text-xs font-medium truncate ${isOpen ? 'text-gold' : 'text-gray-300 group-hover:text-white'}`}>{name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <span className="text-xs font-black text-white">{count}×</span>
                            <span className="text-[11px] text-gray-400">₹{revenue.toLocaleString('en-IN')}</span>
                            <ChevronDown size={11} className={`transition-transform ${isOpen ? 'rotate-180 text-gold' : 'text-gray-700'}`} />
                          </div>
                        </div>
                        <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${isOpen ? 'bg-gold' : 'bg-gold/40'}`}
                            style={{ width: `${(count / maxCount) * 100}%` }} />
                        </div>
                      </button>

                      {/* Drill-down panel */}
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                          >
                            <div className="mx-2 mb-2 p-3 bg-gold/5 border border-gold/15 rounded-xl space-y-3">
                              {/* Period tabs + custom date range */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {(['today','week','month','year','all'] as const).map(p => (
                                  <button key={p}
                                    onClick={e => { e.stopPropagation(); setServiceDrillPeriod(p); setServiceDrillFrom(''); setServiceDrillTo(''); }}
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition-all ${
                                      serviceDrillPeriod === p && !serviceDrillFrom ? 'bg-gold/25 text-gold' : 'text-gray-400 hover:text-white'
                                    }`}>
                                    {p === 'today' ? 'Today' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : p === 'year' ? 'Year' : 'All'}
                                  </button>
                                ))}
                                {/* Custom date range */}
                                <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1 ml-auto" onClick={e => e.stopPropagation()}>
                                  <CalendarDays size={10} className={serviceDrillFrom ? 'text-gold' : 'text-gray-500'} />
                                  <input
                                    type="date" value={serviceDrillFrom}
                                    onChange={e => setServiceDrillFrom(e.target.value)}
                                    className="bg-transparent text-[10px] text-white focus:outline-none w-20 [color-scheme:dark]"
                                  />
                                  <span className="text-gray-600 text-[10px]">–</span>
                                  <input
                                    type="date" value={serviceDrillTo} min={serviceDrillFrom}
                                    onChange={e => setServiceDrillTo(e.target.value)}
                                    className="bg-transparent text-[10px] text-white focus:outline-none w-20 [color-scheme:dark]"
                                  />
                                  {serviceDrillFrom && (
                                    <button onClick={e => { e.stopPropagation(); setServiceDrillFrom(''); setServiceDrillTo(''); }}
                                      className="text-gray-500 hover:text-white transition-colors">
                                      <X size={9} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Period label */}
                              <span className="inline-flex items-center gap-1.5 text-[10px] text-gold font-bold bg-gold/8 border border-gold/20 rounded-md px-2 py-0.5">
                                <Calendar size={9} /> {fmtPeriodLabel(serviceDrillPeriod, serviceDrillFrom, serviceDrillTo)}
                              </span>

                              {/* Stats row */}
                              {serviceDrillStats ? (
                                <>
                                  <div className="grid grid-cols-3 gap-2">
                                    {[
                                      { label: 'Bookings', value: serviceDrillStats.total.toString(), color: 'text-white' },
                                      { label: 'Revenue',  value: `₹${serviceDrillStats.revenue.toLocaleString('en-IN',{maximumFractionDigits:0})}`, color: 'text-gold' },
                                      { label: 'Avg Bill', value: serviceDrillStats.total > 0 ? `₹${Math.round(serviceDrillStats.revenue/serviceDrillStats.total).toLocaleString('en-IN')}` : '—', color: 'text-emerald-400' },
                                    ].map(({ label, value, color }) => (
                                      <div key={label} className="text-center p-1.5 bg-white/8 rounded-lg">
                                        <p className={`text-sm font-black ${color}`}>{value}</p>
                                        <p className="text-[8px] text-gray-400 uppercase tracking-wider">{label}</p>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Mini bar chart */}
                                  {serviceDrillStats.chartData.length > 0 ? (
                                    <div>
                                      <p className="text-[8px] text-gray-700 uppercase tracking-wider mb-1.5 font-bold">Trend</p>
                                      <div className="flex items-end gap-0.5 h-10">
                                        {(() => {
                                          const show = serviceDrillStats.chartData.slice(-16);
                                          const max  = Math.max(...show.map(d => d.count), 1);
                                          return show.map((d, idx) => (
                                            <div key={idx} className="flex-1 relative group/bar">
                                              <div
                                                className="w-full rounded-t-sm bg-gold/50 hover:bg-gold transition-all cursor-default"
                                                style={{ height: `${Math.max(3, (d.count / max) * 36)}px` }}
                                              />
                                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover/bar:block z-10 pointer-events-none">
                                                <div className="bg-zinc-800 border border-white/10 rounded px-1.5 py-0.5 text-[8px] text-white whitespace-nowrap shadow-xl">
                                                  {d.label}: {d.count}
                                                </div>
                                              </div>
                                            </div>
                                          ));
                                        })()}
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-gray-400 text-center py-2">No bookings in this period</p>
                                  )}
                                </>
                              ) : (
                                <div className="flex items-center justify-center py-3">
                                  <Loader2 size={14} className="animate-spin text-gold" />
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Peak hours heatmap */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl p-6">
            <p className="text-xs uppercase tracking-widest font-black text-gray-500 mb-4">Peak Hours</p>
            <div className="space-y-2">
              {stats.peakHours.map(({ label, count }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 font-bold w-10 shrink-0">{label}</span>
                  <div className="flex-1 h-5 bg-white/8 rounded-md overflow-hidden relative">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: count > 0 ? `${(count / stats.maxHourCount) * 100}%` : '0%' }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className={`h-full rounded-md ${
                        count / stats.maxHourCount > 0.7 ? 'bg-red-500/70'
                        : count / stats.maxHourCount > 0.4 ? 'bg-amber-500/70'
                        : count > 0 ? 'bg-emerald-500/50'
                        : ''
                      }`}
                    />
                    {count > 0 && (
                      <span className="absolute inset-0 flex items-center pl-2 text-[11px] font-black text-white">
                        {count} booking{count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10">
              {[
                { color: 'bg-red-500/70', label: 'Busy' },
                { color: 'bg-amber-500/70', label: 'Moderate' },
                { color: 'bg-emerald-500/50', label: 'Light' },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1 text-[8px] text-gray-400 font-bold">
                  <span className={`w-2 h-2 rounded-sm ${color}`} /> {label}
                </span>
              ))}
            </div>
          </div>

          {/* Today's schedule */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs uppercase tracking-widest font-black text-gray-500">Today's Schedule</p>
              <span className="text-[11px] font-black text-gold px-2 py-0.5 bg-gold/10 border border-gold/20 rounded-full">
                {stats.todaySchedule.length} appts
              </span>
            </div>
            {stats.todaySchedule.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <CalendarDays size={24} className="text-gray-700" />
                <p className="text-gray-400 text-xs">No appointments today</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 scrollbar-hide">
                {stats.todaySchedule.map(b => {
                  const isNow = (() => {
                    if (!b.startTime) return false;
                    const start = new Date(b.startTime);
                    const end   = b.endTime ? new Date(b.endTime) : new Date(start.getTime() + 60 * 60000);
                    const now   = new Date();
                    return now >= start && now <= end;
                  })();
                  return (
                    <div key={b.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                        isNow
                          ? 'bg-gold/10 border-gold/30'
                          : b.status === 'completed'
                          ? 'bg-white/[0.05] border-white/10 opacity-50'
                          : 'bg-zinc-800/40 border-white/10'
                      }`}
                    >
                      <div className={`w-1.5 rounded-full shrink-0 mt-1 ${
                        isNow ? 'bg-gold h-full min-h-[2rem]' : 'bg-white/20 h-8'
                      }`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-xs font-bold truncate ${isNow ? 'text-gold' : 'text-white'}`}>
                            {b.customerName ?? 'Guest'}
                            {isNow && <span className="ml-1 text-[8px] text-gold/70 font-black">● NOW</span>}
                          </p>
                          <StatusBadge status={b.status ?? 'pending'} />
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{b.serviceNames ?? '—'}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{b.bookingTime ?? '—'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Staff Leaderboard + Top Customers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">

          {/* Staff Performance Leaderboard */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs uppercase tracking-widest font-black text-gray-500">Staff Performance</p>
                <p className="text-white font-black text-sm mt-0.5">Revenue & commissions</p>
              </div>
              <span className="text-[11px] font-black text-gray-600 uppercase tracking-wider">This period</span>
            </div>
            {stats.staffLeaderboard.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Users size={24} className="text-gray-700" />
                <p className="text-gray-600 text-xs">No staff data for this period</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.staffLeaderboard.map((s, i) => {
                  const maxRev  = stats.staffLeaderboard[0].revenue;
                  const medal   = i === 0 ? 'text-gold' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-gray-700';
                  const barColor = i === 0 ? 'bg-gold' : i === 1 ? 'bg-gray-400/60' : i === 2 ? 'bg-amber-700/60' : 'bg-white/20';
                  return (
                    <div key={s.name} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.03] transition-colors">
                      <span className={`text-sm font-black w-5 text-center shrink-0 ${medal}`}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-white truncate">{s.name}</span>
                          <span className="text-xs font-black text-gold shrink-0 ml-2">₹{s.revenue.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="h-1.5 bg-white/8 rounded-full overflow-hidden mb-1">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${maxRev > 0 ? (s.revenue / maxRev) * 100 : 0}%` }}
                            transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                            className={`h-full rounded-full ${barColor}`}
                          />
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-gray-500">
                          <span>{s.bills} bill{s.bills !== 1 ? 's' : ''}</span>
                          <span>{s.services} service{s.services !== 1 ? 's' : ''}</span>
                          <span className="text-emerald-500">₹{s.commission.toLocaleString('en-IN')} commission</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Customers by Lifetime Spend */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs uppercase tracking-widest font-black text-gray-500">Top Customers</p>
                <p className="text-white font-black text-sm mt-0.5">By lifetime spend</p>
              </div>
              <span className="text-[11px] font-black text-gray-600 uppercase tracking-wider">All time</span>
            </div>
            {stats.topCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Users size={24} className="text-gray-700" />
                <p className="text-gray-600 text-xs">No customer data yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {stats.topCustomers.map((c, i) => {
                  const maxSpend   = stats.topCustomers[0].spend;
                  const lastSeen   = (() => {
                    if (!c.lastVisit) return '—';
                    const days = Math.floor((Date.now() - c.lastVisit.getTime()) / 86400000);
                    if (days === 0) return 'Today';
                    if (days === 1) return 'Yesterday';
                    if (days < 7)  return `${days}d ago`;
                    if (days < 30) return `${Math.floor(days / 7)}w ago`;
                    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
                    return `${Math.floor(days / 365)}y ago`;
                  })();
                  return (
                    <div key={c.phone} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.03] transition-colors">
                      <span className="text-xs font-black text-gray-600 w-5 text-center shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-bold text-white truncate">{c.name || c.phone}</span>
                          <span className="text-xs font-black text-gold shrink-0 ml-2">₹{c.spend.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="h-1 bg-white/8 rounded-full overflow-hidden mb-1">
                          <div
                            className="h-full rounded-full bg-gold/50"
                            style={{ width: `${maxSpend > 0 ? (c.spend / maxSpend) * 100 : 0}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-gray-500">
                          <span>{c.visits} visit{c.visits !== 1 ? 's' : ''}</span>
                          <span>Last: {lastSeen}</span>
                          <span>₹{Math.round(c.spend / c.visits).toLocaleString('en-IN')} avg</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        </>)}

        {/* ════════════════════════════════════════════════════════════════
            BOOKINGS VIEW — table only
        ════════════════════════════════════════════════════════════════ */}
        {view === 'bookings' && (<>

        {/* Quick actions bar */}
        {stats.pendingCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-center gap-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl"
          >
            <div className="flex items-center gap-2 flex-1">
              <Clock size={15} className="text-amber-400 shrink-0" />
              <p className="text-amber-300 text-xs font-bold">
                {stats.pendingCount} pending booking{stats.pendingCount !== 1 ? 's' : ''} awaiting confirmation
                <span className="text-amber-500 ml-1">· ₹{stats.amountDue.toLocaleString('en-IN')} due</span>
              </p>
            </div>
            <button
              onClick={confirmAllPending}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-xl text-black font-black text-xs uppercase tracking-widest transition-all shrink-0"
            >
              <CheckSquare size={12} /> Confirm All
            </button>
          </motion.div>
        )}

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 mb-4 bg-zinc-900 border border-white/12 rounded-2xl p-1.5 w-fit flex-wrap">
          {([
            { id: 'active',      label: 'Active',      count: activeBookings.length,      icon: <Clock size={13} />,         activeStyle: 'bg-gold/10 border border-gold/20 text-gold' },
            { id: 'upcoming',    label: 'Upcoming',    count: upcomingBookings.length,    icon: <CalendarDays size={13} />,  activeStyle: 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-400' },
            { id: 'pending',     label: 'Pending',     count: pendingTabBookings.length,  icon: <AlertCircle size={13} />,   activeStyle: 'bg-amber-500/20 border border-amber-500/30 text-amber-400' },
            { id: 'completed',   label: 'Completed',   count: completedBookings.length,   icon: <ListChecks size={13} />,    activeStyle: 'bg-purple-500/20 border border-purple-500/30 text-purple-400' },
            { id: 'failed',      label: 'Failed',      count: failedBookings.length,      icon: <XCircle size={13} />,       activeStyle: 'bg-red-500/20 border border-red-500/30 text-red-400' },
            { id: 'rescheduled', label: 'Rescheduled', count: rescheduledBookings.length, icon: <Edit2 size={13} />,         activeStyle: 'bg-blue-500/20 border border-blue-500/30 text-blue-400' },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id as any); setStatusFilter('all'); setSearch(''); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === tab.id
                  ? tab.activeStyle
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {tab.icon} {tab.label}
              <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-black ${
                activeTab === tab.id ? 'bg-white/10' : 'bg-white/8'
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* ── Filters & Search ── */}
        <div className="bg-zinc-900 border border-white/12 rounded-2xl p-4 mb-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, phone, email, payment ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/8 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gold/40 transition-all"
            />
          </div>

          {/* Status Filter — only shown on Active tab */}
          {activeTab === 'active' && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={13} className="text-gray-400 shrink-0" />
              {(['all', 'paid', 'confirmed', 'pending', 'failed'] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all ${
                    statusFilter === s
                      ? s === 'all' ? 'bg-gold/10 border-gold/30 text-gold' : `${STATUS_META[s].color} ${STATUS_META[s].bg}`
                      : 'bg-white/8 border-white/10 text-gray-500 hover:text-white hover:border-white/20'
                  }`}
                >
                  {s === 'all' ? 'All' : STATUS_META[s].label}
                </button>
              ))}
            </div>
          )}

          {/* Export */}
          <button onClick={() => exportCSV(filtered)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/8 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-gray-300 transition-all shrink-0"
          >
            <Download size={13} /> Export CSV
          </button>
        </div>

        {/* ── Listener Error: missing admin doc or rules issue ── */}
        {listenerError && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-black text-sm uppercase tracking-wider mb-1">Setup Required</p>
                <p className="text-gray-300 text-xs leading-relaxed">
                  The dashboard can't read bookings. Most likely the <code className="text-gold bg-gold/10 px-1 py-0.5 rounded text-xs">admins/{user.uid}</code> document doesn't exist yet.
                </p>
              </div>
            </div>

            {/* UID copy box */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4 mb-4">
              <p className="text-[11px] uppercase tracking-widest font-black text-gray-500 mb-2">Your Firebase UID (use this as the Document ID)</p>
              <div className="flex items-center gap-3">
                <code className="text-gold font-mono text-sm flex-1 break-all">{user.uid}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(user.uid)}
                  className="px-3 py-1.5 bg-gold/10 border border-gold/20 rounded-lg text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/20 transition-all shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Step-by-step instructions */}
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-widest font-black text-gray-500 mb-3">Fix in 3 steps</p>
              {[
                'Go to Firebase Console → Firestore Database → Data tab',
                'Create (or open) the "admins" collection',
                `Add a document with ID = ${user.uid} and fields: { email: "${user.email}", role: "admin" }`,
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-gray-400 text-xs">{step}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => window.location.reload()}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-white/8 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-gray-300 transition-all"
            >
              <RefreshCw size={13} /> Retry after creating the document
            </button>
          </div>
        )}

        {/* ── Bookings Table ── */}
        <div className="bg-zinc-900 border border-white/12 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 size={32} className="animate-spin text-gold" />
              <p className="text-gray-500 text-sm uppercase tracking-widest font-bold">Loading bookings…</p>
            </div>
          ) : listenerError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle size={36} className="text-red-500/50" />
              <p className="text-gray-500 text-sm">Bookings unavailable — see setup instructions above.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Inbox size={36} className="text-gray-700" />
              <p className="text-gray-500 text-sm">No bookings found</p>
              {(search || statusFilter !== 'all') && (
                <button onClick={() => { setSearch(''); setStatusFilter('all'); }} className="text-gold text-xs font-bold uppercase underline">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/12 bg-white/[0.05]">
                    {[
                      { label: 'Customer',  key: 'customerName'  as SortKey, always: true },
                      { label: 'Date',      key: 'bookingDate'   as SortKey, hidden: 'md' },
                      { label: 'Services',  key: null,                        hidden: 'lg' },
                      { label: 'Amount',    key: 'totalAmount'   as SortKey, always: true },
                      { label: 'Status',    key: null,                        always: true },
                      { label: '',          key: null,                        always: true },
                    ].map(({ label, key, hidden, always }, i) => (
                      <th
                        key={i}
                        onClick={() => key && toggleSort(key)}
                        className={`py-3 px-5 text-left text-xs font-black uppercase tracking-widest text-gray-300 select-none
                          ${key ? 'cursor-pointer hover:text-gray-400 transition-colors' : ''}
                          ${hidden === 'md' ? 'hidden md:table-cell' : ''}
                          ${hidden === 'lg' ? 'hidden lg:table-cell' : ''}
                        `}
                      >
                        <span className="flex items-center gap-1.5">
                          {label} {key && <SortIcon k={key} />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {filtered.map(booking => (
                      <BookingRow key={booking.id} booking={booking} onStatusChange={handleStatusChange} onCreateBill={openBillingFromBooking} onViewInvoice={id => setInvoiceModalId(id)} onConfirmPayment={confirmWithPaymentId} onMarkPayAtSalon={markPayAtSalon} onDelete={handleDeleteBooking} isSuperAdmin={!isStaffMode} labels={getBookingLabels(booking, activeTab)} />
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>

              <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-400 font-bold uppercase tracking-widest">
                <span>Showing {filtered.length} of {bookings.length} bookings</span>
                <span>₹{filtered.reduce((a, b) => a + (b.totalAmount ?? 0), 0).toLocaleString('en-IN')} filtered total</span>
              </div>
            </div>
          )}
        </div>

      {/* /Bookings view */}
      </>)}

      {/* ════════════════════════════════════════════════════════════════
          BILLING VIEW
      ════════════════════════════════════════════════════════════════ */}
      {view === 'billing' && (
        <div className="space-y-5">

          {/* ── Top bar: period + search + new bill ── */}
          <div className="flex flex-col gap-3">
            {/* Period + date range row */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-zinc-900 border border-white/12 rounded-xl p-1">
                {(['today','week','month','all'] as const).map(p => (
                  <button key={p}
                    onClick={() => { setBillingPeriod(p); setBillingFrom(''); setBillingTo(''); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                      billingPeriod === p && !billingFrom ? 'bg-gold/20 border border-gold/30 text-gold' : 'text-gray-500 hover:text-white'
                    }`}>
                    {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
                  </button>
                ))}
              </div>
              {/* Custom date range */}
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/12 rounded-xl px-3 py-1.5">
                <Calendar size={11} className={billingFrom ? 'text-gold' : 'text-gray-400'} />
                <input
                  type="date" value={billingFrom}
                  onChange={e => setBillingFrom(e.target.value)}
                  className="bg-transparent text-xs text-white focus:outline-none w-24 [color-scheme:dark]"
                />
                <span className="text-gray-400 text-xs">–</span>
                <input
                  type="date" value={billingTo} min={billingFrom}
                  onChange={e => setBillingTo(e.target.value)}
                  className="bg-transparent text-xs text-white focus:outline-none w-24 [color-scheme:dark]"
                />
                {billingFrom && (
                  <button onClick={() => { setBillingFrom(''); setBillingTo(''); }}
                    className="text-gray-400 hover:text-white transition-colors ml-1">
                    <X size={11} />
                  </button>
                )}
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-gold font-bold bg-gold/8 border border-gold/20 rounded-lg px-2.5 py-1">
                <Calendar size={10} /> {fmtPeriodLabel(billingPeriod, billingFrom, billingTo)}
              </span>
            </div>
          <div className="flex sm:flex-row sm:items-center gap-3 justify-between flex-wrap">
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 sm:flex-none">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text" placeholder="Search invoice / customer…"
                  value={billingSearch} onChange={e => setBillingSearch(e.target.value)}
                  className="w-full sm:w-56 bg-zinc-900 border border-white/10 rounded-xl py-2 pl-8 pr-3 text-white text-xs focus:outline-none focus:border-gold/40 transition-all placeholder:text-gray-500"
                />
              </div>
              {/* Refresh */}
              <button onClick={() => {
                setBillingLoading(true);
                getDocs(query(collection(db,'invoices'), orderBy('createdAt','desc')))
                  .then(snap => setBillingInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice & { id: string }))))
                  .catch(console.error)
                  .finally(() => setBillingLoading(false));
              }} className="p-2 rounded-xl bg-white/8 border border-white/10 text-gray-500 hover:text-white transition-all">
                <RefreshCw size={14} />
              </button>
              {/* New bill */}
              <button
                onClick={() => { setBillingPrefill(null); setBillingOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#F0D060] rounded-xl text-black font-black text-xs uppercase tracking-wider hover:scale-105 transition-all shadow-[0_4px_16px_-4px_rgba(212,175,55,0.4)]"
              >
                <Receipt size={13} /> New Bill
              </button>
            </div>
          </div>
          </div>{/* /flex-col top bar */}

          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Revenue',   value: `₹${billingStats.totalRevenue.toLocaleString('en-IN',{maximumFractionDigits:0})}`, sub: `${billingStats.count} invoices`,           color: 'border-emerald-500/20', bar: 'bg-emerald-500/60' },
              { label: 'Average Bill',    value: `₹${Math.round(billingStats.avgBill).toLocaleString('en-IN')}`,                    sub: 'Per invoice',                             color: 'border-amber-500/20',   bar: 'bg-amber-500/60'   },
              { label: 'Online Bookings', value: billingStats.onlineCount.toString(),                                                sub: `${billingStats.walkinCount} walk-in`,     color: 'border-blue-500/20',    bar: 'bg-blue-500/60'    },
              { label: 'Walk-in Bills',   value: billingStats.walkinCount.toString(),                                                sub: `${billingStats.onlineCount} online`,      color: 'border-purple-500/20',  bar: 'bg-purple-500/60'  },
            ].map(({ label, value, sub, color, bar }) => (
              <div key={label} className={`bg-zinc-900 border ${color} rounded-2xl p-5 relative overflow-hidden`}>
                <div className={`absolute top-0 left-0 right-0 h-[2px] ${bar} rounded-t-2xl`} />
                <p className="text-xs uppercase tracking-widest font-black text-gray-400 mb-1.5">{label}</p>
                <p className="text-2xl font-black text-white leading-none mb-1">{value}</p>
                <p className="text-xs text-gray-400">{sub}</p>
              </div>
            ))}
          </div>

          {/* ── VVIP customer trends ── */}
          <div className="bg-gradient-to-br from-gold/10 to-zinc-900 border border-gold/25 rounded-2xl p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gold/60 rounded-t-2xl" />
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center shrink-0">
                <Crown size={14} className="text-gold" />
              </div>
              <p className="text-xs uppercase tracking-widest font-black text-gold/80">VVIP Customer Trends</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Spend',     value: `₹${billingStats.vvipRevenue.toLocaleString('en-IN',{maximumFractionDigits:0})}`, sub: `${billingStats.vvipBillCount} bill${billingStats.vvipBillCount !== 1 ? 's' : ''}` },
                { label: 'Total Visits',    value: billingStats.vvipBillCount.toString(),                                            sub: 'VVIP bills in period' },
                { label: 'VVIP Customers',  value: billingStats.vvipCustomerCount.toString(),                                        sub: 'Unique customers' },
                { label: 'Average Bill',    value: `₹${Math.round(billingStats.vvipAvgBill).toLocaleString('en-IN')}`,                sub: 'Per VVIP bill' },
              ].map(({ label, value, sub }) => (
                <div key={label}>
                  <p className="text-xs uppercase tracking-widest font-black text-gray-400 mb-1.5">{label}</p>
                  <p className="text-2xl font-black text-white leading-none mb-1">{value}</p>
                  <p className="text-xs text-gray-400">{sub}</p>
                </div>
              ))}
            </div>
            {billingStats.vvipBillCount === 0 && (
              <p className="text-[11px] text-gray-500 mt-3">No VVIP bills in this period.</p>
            )}
          </div>

          {/* ── Outstanding dues card — always visible ── */}
          {billingStats.totalDue > 0 ? (
            <button
              onClick={() => setShowDuesDrawer(true)}
              className="w-full text-left bg-red-500/8 border border-red-500/25 rounded-2xl p-5 hover:bg-red-500/12 transition-all group"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center shrink-0">
                    <AlertCircle size={18} className="text-red-400" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest font-black text-red-400/70 mb-0.5">Outstanding Dues</p>
                    <p className="text-2xl font-black text-red-400 leading-none">
                      ₹{billingStats.totalDue.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {dueCustomers.length} customer{dueCustomers.length !== 1 ? 's' : ''} · {billingStats.dueCount} invoice{billingStats.dueCount !== 1 ? 's' : ''} with unpaid balance
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-black text-red-400/60 uppercase tracking-wider group-hover:text-red-400 transition-colors shrink-0">
                  View Details <ChevronRightIcon size={13} />
                </div>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-4 bg-emerald-500/8 border border-emerald-500/20 rounded-2xl p-5">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <CheckCircle2 size={18} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest font-black text-emerald-400/70 mb-0.5">Outstanding Dues</p>
                <p className="text-2xl font-black text-emerald-400 leading-none">₹0</p>
                <p className="text-[11px] text-gray-400 mt-1">All bills are fully settled — no pending dues</p>
              </div>
            </div>
          )}

          {/* ── Payment method breakdown ── */}
          {Object.keys(billingStats.pmRevenue).length > 0 && (
            <div className="bg-zinc-900 border border-white/12 rounded-2xl p-5">
              <p className="text-xs uppercase tracking-widest font-black text-gray-500 mb-4">Revenue by Payment Method</p>
              <div className="space-y-2.5">
                {Object.entries(billingStats.pmRevenue)
                  .sort((a,b) => b[1] - a[1])
                  .map(([pm, amt]) => {
                    const pct = billingStats.totalRevenue > 0 ? Math.round((amt / billingStats.totalRevenue) * 100) : 0;
                    const PM_COLORS: Record<string,string> = {
                      cash:'bg-emerald-500', upi:'bg-blue-500', gpay:'bg-blue-400',
                      phonepe:'bg-purple-500', paytm:'bg-sky-500', card:'bg-violet-500', online:'bg-gold',
                    };
                    const bar = PM_COLORS[pm] ?? 'bg-gray-500';
                    return (
                      <div key={pm} className="flex items-center gap-3">
                        <span className="text-xs font-black text-gray-400 uppercase w-16 shrink-0">{pm === 'online' ? 'Razorpay' : pm}</span>
                        <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%`, transition: 'width 0.6s ease' }} />
                        </div>
                        <span className="text-xs font-black text-white w-20 text-right shrink-0">₹{(amt as number).toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
                        <span className="text-xs text-gray-400 w-8 text-right shrink-0">{pct}%</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── Invoice list ── */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl overflow-hidden">
            {billingLoading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
                <Loader2 size={22} className="animate-spin text-gold" /> Loading invoices…
              </div>
            ) : billingStats.displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Receipt size={36} className="text-gray-700" />
                <p className="text-gray-500 text-sm">No invoices found{billingSearch ? ` for "${billingSearch}"` : ' for this period'}</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/12 bg-white/[0.05]">
                        {['Invoice #', 'Customer', 'Date', 'Services', 'Amount', 'Payment', 'Source', ''].map(h => (
                          <th key={h} className="py-3 px-4 text-left text-xs font-black uppercase tracking-widest text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {billingStats.displayed.map(inv => {
                        const isExpanded = expandedInv === (inv as any).id;
                        const isDue      = (inv as any).status === 'due' && ((inv as any).amountDue ?? 0) > 0;
                        const PM_STYLE: Record<string,string> = {
                          cash:'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
                          upi:'text-blue-400 bg-blue-400/10 border-blue-400/20',
                          gpay:'text-blue-400 bg-blue-400/10 border-blue-400/20',
                          phonepe:'text-purple-400 bg-purple-400/10 border-purple-400/20',
                          paytm:'text-sky-400 bg-sky-400/10 border-sky-400/20',
                          card:'text-violet-400 bg-violet-400/10 border-violet-400/20',
                          online:'text-gold bg-gold/10 border-gold/20',
                        };
                        const pmStyle = PM_STYLE[inv.paymentMethod ?? 'cash'] ?? PM_STYLE.cash;
                        const invDate = (inv as any).createdAt
                          ? (inv as any).createdAt.toDate().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})
                          : '—';
                        const services = inv.items?.map((it: BillItem) => it.serviceName).join(', ') ?? '—';
                        return (
                          <>
                            <tr key={(inv as any).id}
                              onClick={() => setExpandedInv(isExpanded ? null : (inv as any).id)}
                              className="border-b border-white/10 hover:bg-white/[0.06] transition-colors cursor-pointer group"
                            >
                              <td className="py-3 px-4">
                                <p className="text-gold text-xs font-black font-mono">{inv.invoiceNumber}</p>
                                {isDue && (
                                  <span className="inline-block mt-0.5 text-[11px] font-black px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/25 text-red-400 uppercase tracking-wide">
                                    Due ₹{((inv as any).amountDue ?? 0).toLocaleString('en-IN')}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <p className="text-white text-xs font-bold">{inv.customerName}</p>
                                <p className="text-gray-400 text-[11px]">{inv.customerPhone}</p>
                              </td>
                              <td className="py-3 px-4 text-gray-400 text-xs">{invDate}</td>
                              <td className="py-3 px-4 hidden lg:table-cell">
                                <p className="text-gray-400 text-xs max-w-[160px] truncate">{services}</p>
                              </td>
                              <td className="py-3 px-4">
                                <p className="text-white font-black text-sm">₹{(inv.total ?? 0).toLocaleString('en-IN')}</p>
                                {inv.discountAmount > 0 && (
                                  <p className="text-red-400 text-[11px]">-₹{inv.discountAmount.toLocaleString('en-IN')} disc.</p>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black uppercase border ${pmStyle}`}>
                                  {(inv.paymentMethod ?? 'cash').toUpperCase()}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black uppercase border ${
                                    inv.source === 'online'
                                      ? 'text-blue-400 bg-blue-400/10 border-blue-400/20'
                                      : 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                                  }`}>
                                    {inv.source === 'online' ? '🌐 Online' : '🏪 Walk-in'}
                                  </span>
                                  {(inv as any).billingType === 'vvip' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black uppercase border text-gold bg-gold/10 border-gold/30">
                                      <Crown size={9} /> VVIP
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={e => { e.stopPropagation(); setInvoiceModalId((inv as any).id); }}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-gold/10 transition-all"
                                    title="View invoice"
                                  >
                                    <Eye size={13} />
                                  </button>
                                  {/* Edit — super admin only */}
                                  {!isStaffMode && (
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        if (editingInvId === (inv as any).id) {
                                          handleCancelEditInvoice();
                                        } else {
                                          handleStartEditInvoice(inv as Invoice & { id: string });
                                        }
                                      }}
                                      className={`p-1.5 rounded-lg transition-all ${
                                        editingInvId === (inv as any).id
                                          ? 'text-gold bg-gold/10'
                                          : 'text-gray-400 hover:text-gold hover:bg-gold/10'
                                      }`}
                                      title="Edit invoice"
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                  )}
                                  {/* Delete — super admin only */}
                                  {!isStaffMode && (
                                    deleteConfirmId === (inv as any).id ? (
                                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                        <button
                                          onClick={() => handleDeleteInvoice((inv as any).id)}
                                          disabled={deleting}
                                          className="px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-[11px] font-black hover:bg-red-500/30 transition-all disabled:opacity-50 flex items-center gap-1"
                                        >
                                          {deleting ? <Loader2 size={10} className="animate-spin" /> : null}
                                          Confirm
                                        </button>
                                        <button
                                          onClick={() => setDeleteConfirmId(null)}
                                          className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-gray-400 text-[11px] font-black hover:text-white transition-all"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={e => { e.stopPropagation(); setDeleteConfirmId((inv as any).id); }}
                                        className="p-1.5 rounded-lg text-gray-700 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                        title="Delete invoice"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )
                                  )}
                                  <span className="text-gray-700 group-hover:text-gray-500 transition-colors">
                                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                  </span>
                                </div>
                              </td>
                            </tr>
                            {/* Expanded row — line items / edit form */}
                            {isExpanded && (
                              <tr key={`${(inv as any).id}-exp`}>
                                <td colSpan={8} className="p-0">
                                  {editingInvId === (inv as any).id && editForm ? (
                                    <div className="px-6 py-4 bg-zinc-800/60 border-b border-white/10 space-y-3" onClick={e => e.stopPropagation()}>
                                      <p className="text-[11px] uppercase tracking-widest font-black text-gold mb-1">Edit Invoice</p>

                                      {/* Customer info */}
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <label className="text-[11px] uppercase tracking-widest font-black text-gray-500">Customer Name</label>
                                          <input value={editForm.customerName}
                                            onChange={e => setEditForm(prev => prev ? { ...prev, customerName: e.target.value } : prev)}
                                            className="w-full mt-1 bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold/50" />
                                        </div>
                                        <div>
                                          <label className="text-[11px] uppercase tracking-widest font-black text-gray-500">Phone</label>
                                          <input value={editForm.customerPhone}
                                            onChange={e => setEditForm(prev => prev ? { ...prev, customerPhone: e.target.value } : prev)}
                                            className="w-full mt-1 bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold/50" />
                                        </div>
                                      </div>

                                      {/* Billing tier */}
                                      <div>
                                        <label className="text-[11px] uppercase tracking-widest font-black text-gray-500">Billing Type</label>
                                        <div className="flex items-center bg-zinc-900 border border-white/10 rounded-xl p-1 gap-1 mt-1 w-fit">
                                          <button onClick={() => setEditForm(prev => prev ? { ...prev, billingType: 'standard' } : prev)}
                                            className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                                              editForm.billingType === 'standard' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                                            }`}
                                          >
                                            Standard
                                          </button>
                                          <button onClick={() => setEditForm(prev => prev ? { ...prev, billingType: 'vvip' } : prev)}
                                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                                              editForm.billingType === 'vvip' ? 'bg-gold/20 border border-gold/40 text-gold' : 'text-gray-500 hover:text-gray-300'
                                            }`}
                                          >
                                            <Crown size={11} /> VVIP
                                          </button>
                                        </div>
                                      </div>

                                      {/* Line items */}
                                      <div className="space-y-2">
                                        <p className="text-[11px] uppercase tracking-widest font-black text-gray-500">Line Items</p>
                                        {editForm.items.map((it, i) => (
                                          <div key={i} className="flex flex-wrap items-center gap-2 bg-zinc-900 border border-white/10 rounded-lg p-2">
                                            <span className="text-xs text-gray-200 font-bold flex-1 min-w-[120px]">{it.serviceName}</span>
                                            <div className="flex items-center gap-1">
                                              <span className="text-[11px] text-gray-500">Price</span>
                                              <input type="text" inputMode="numeric" value={it.unitPrice}
                                                onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); updateEditItem(i, { unitPrice: Number(v) || 0 }); }}
                                                className="w-20 bg-zinc-800 border border-white/10 rounded px-1.5 py-1 text-xs text-white text-right focus:outline-none focus:border-gold/50" />
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <span className="text-[11px] text-gray-500">Qty</span>
                                              <input type="text" inputMode="numeric" value={it.quantity}
                                                onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); updateEditItem(i, { quantity: Math.max(1, Number(v) || 1) }); }}
                                                className="w-14 bg-zinc-800 border border-white/10 rounded px-1.5 py-1 text-xs text-white text-right focus:outline-none focus:border-gold/50" />
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <span className="text-[11px] text-gray-500">Disc %</span>
                                              <input type="text" inputMode="numeric" value={it.lineDiscount}
                                                onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); updateEditItem(i, { lineDiscount: Math.min(100, Number(v) || 0) }); }}
                                                className="w-14 bg-zinc-800 border border-white/10 rounded px-1.5 py-1 text-xs text-white text-right focus:outline-none focus:border-gold/50" />
                                            </div>
                                            <select value={it.staffId} onChange={e => updateEditItemStaff(i, e.target.value)}
                                              className="bg-zinc-800 border border-white/10 rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-gold/50">
                                              <option value="" className="bg-zinc-800 text-white">No staff</option>
                                              {staff.map(s => <option key={s.id} value={s.id} className="bg-zinc-800 text-white">{s.name}</option>)}
                                            </select>
                                            <span className="text-xs font-black text-gold w-16 text-right">₹{it.price.toLocaleString('en-IN')}</span>
                                            <button onClick={() => removeEditItem(i)} className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-400/10" title="Remove item">
                                              <Trash2 size={12} />
                                            </button>
                                          </div>
                                        ))}
                                      </div>

                                      {/* Overall discount */}
                                      <div className="flex items-center gap-2">
                                        <label className="text-[11px] uppercase tracking-widest font-black text-gray-500">Overall Discount %</label>
                                        <input type="text" inputMode="numeric" value={editForm.discountPercent}
                                          onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setEditForm(prev => prev ? { ...prev, discountPercent: Math.min(100, Number(v) || 0) } : prev); }}
                                          className="w-16 bg-zinc-900 border border-white/10 rounded px-1.5 py-1 text-xs text-white text-right focus:outline-none focus:border-gold/50" />
                                      </div>

                                      {/* Payment splits */}
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                          <p className="text-[11px] uppercase tracking-widest font-black text-gray-500">Payment Splits</p>
                                          <button onClick={addEditSplit} className="text-[11px] font-black text-gold hover:underline">+ Add Split</button>
                                        </div>
                                        {editForm.paymentSplits.map((s, i) => (
                                          <div key={i} className="flex items-center gap-2">
                                            <select value={s.method} onChange={e => updateEditSplit(i, { method: e.target.value as PaymentMethod })}
                                              className="bg-zinc-900 border border-white/10 rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-gold/50">
                                              {EDIT_PAYMENT_METHODS.map(m => <option key={m.id} value={m.id} className="bg-zinc-800 text-white">{m.label}</option>)}
                                            </select>
                                            <input type="text" inputMode="numeric" value={s.amount}
                                              onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); updateEditSplit(i, { amount: Number(v) || 0 }); }}
                                              className="w-24 bg-zinc-900 border border-white/10 rounded px-1.5 py-1 text-xs text-white text-right focus:outline-none focus:border-gold/50" />
                                            {s.isAdvance && <span className="text-[11px] text-amber-400 font-bold">Advance</span>}
                                            <button onClick={() => removeEditSplit(i)} className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-400/10" title="Remove split">
                                              <Trash2 size={12} />
                                            </button>
                                          </div>
                                        ))}
                                        {editForm.paymentSplits.length === 0 && (
                                          <p className="text-xs text-gray-500">No payment splits — click "+ Add Split" to record payment.</p>
                                        )}
                                        {editForm.paymentSplits.length >= 1 && (
                                          <div className="flex justify-between text-xs text-gray-400 border-t border-dashed border-white/10 pt-1">
                                            <span>Total Collected</span>
                                            <span className="font-bold text-white">₹{editForm.paymentSplits.reduce((a, s) => a + (Number(s.amount) || 0), 0).toLocaleString('en-IN')}</span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Round-off checkbox */}
                                      {(() => {
                                        const subtotal = editForm.items.reduce((a, it) => a + it.price, 0);
                                        const discAmt = Math.round(subtotal * editForm.discountPercent / 100);
                                        const dueSettle = (inv as any).dueSettlementAmount ?? 0;
                                        const splitTotal = editForm.paymentSplits.reduce((a, s) => a + (Number(s.amount) || 0), 0);
                                        const rawTotal = subtotal - discAmt + dueSettle;
                                        const remainder = rawTotal - splitTotal;
                                        const showRoundOff = remainder > 0 && remainder <= 50;
                                        return showRoundOff ? (
                                          <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={editForm.roundOffEnabled}
                                              onChange={e => {
                                                const checked = e.target.checked;
                                                setEditForm(prev => prev ? { ...prev, roundOffEnabled: checked, roundOff: checked ? remainder : 0 } : prev);
                                              }}
                                              className="w-4 h-4 rounded border-white/20 bg-zinc-900 accent-cyan-500" />
                                            <span className="text-xs text-cyan-400 font-bold">Round off ₹{remainder.toLocaleString('en-IN')}</span>
                                          </label>
                                        ) : null;
                                      })()}

                                      {/* Computed totals — auto-calculated due & advance */}
                                      {(() => {
                                        const subtotal = editForm.items.reduce((a, it) => a + it.price, 0);
                                        const discountAmount = Math.round(subtotal * editForm.discountPercent / 100);
                                        const dueSettlementAmount = (inv as any).dueSettlementAmount ?? 0;
                                        const roundOff = editForm.roundOffEnabled ? (editForm.roundOff ?? 0) : 0;
                                        const total = Math.max(0, subtotal - discountAmount + dueSettlementAmount - roundOff);
                                        const splitTotal = editForm.paymentSplits.reduce((a, s) => a + (Number(s.amount) || 0), 0);
                                        const amountDue = Math.max(0, total - splitTotal);
                                        const overpayment = Math.max(0, splitTotal - total);
                                        const amountPaid = Math.min(splitTotal, total);
                                        return (
                                          <div className="pt-2 border-t border-white/10 space-y-1 text-xs">
                                            <div className="flex justify-between text-gray-400"><span>Subtotal</span><span>₹{subtotal.toLocaleString('en-IN')}</span></div>
                                            {discountAmount > 0 && (
                                              <div className="flex justify-between text-red-400"><span>Discount ({editForm.discountPercent}%)</span><span>-₹{discountAmount.toLocaleString('en-IN')}</span></div>
                                            )}
                                            {dueSettlementAmount > 0 && (
                                              <div className="flex justify-between text-amber-400 font-bold"><span>Previous Dues Settled</span><span>+₹{dueSettlementAmount.toLocaleString('en-IN')}</span></div>
                                            )}
                                            {roundOff > 0 && (
                                              <div className="flex justify-between text-cyan-400"><span>Round Off</span><span>-₹{roundOff.toLocaleString('en-IN')}</span></div>
                                            )}
                                            <div className="flex justify-between text-white font-black pt-1 border-t border-white/10"><span>Total</span><span className="text-gold">₹{total.toLocaleString('en-IN')}</span></div>
                                            <div className="flex justify-between text-emerald-400"><span>Collected</span><span>₹{amountPaid.toLocaleString('en-IN')}</span></div>
                                            {amountDue > 0 && (
                                              <div className="flex justify-between text-red-400 font-bold animate-pulse"><span>Due</span><span>₹{amountDue.toLocaleString('en-IN')}</span></div>
                                            )}
                                            {overpayment > 0 && (
                                              <div className="flex justify-between text-purple-400 font-bold"><span>Saved as Advance</span><span>₹{overpayment.toLocaleString('en-IN')}</span></div>
                                            )}
                                            {amountDue === 0 && overpayment === 0 && (
                                              <div className="flex justify-between text-emerald-400 font-bold"><span>Status</span><span>Fully Paid ✓</span></div>
                                            )}
                                          </div>
                                        );
                                      })()}

                                      {/* Promo Coupons — 1 per ₹999 spent */}
                                      {(() => {
                                        const subtotal = editForm.items.reduce((a, it) => a + it.price, 0);
                                        const maxCoupons = Math.floor(subtotal / 999);
                                        if (maxCoupons < 1) return null;
                                        return (
                                          <div className="bg-purple-500/8 border border-purple-500/20 rounded-xl p-3 space-y-2">
                                            <div className="flex items-center justify-between">
                                              <p className="text-[11px] font-black uppercase tracking-widest text-purple-400">🎟️ Promo Coupons</p>
                                              <span className="text-xs text-purple-300 font-bold">{editForm.promoCoupons.length} / {maxCoupons}</span>
                                            </div>
                                            <p className="text-xs text-gray-500">1 coupon per ₹999 spent — up to {maxCoupons}</p>
                                            <div className="space-y-1.5">
                                              {editForm.promoCoupons.map((code, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                  <input type="text" value={code} placeholder={`Coupon ${i + 1}`}
                                                    onChange={e => {
                                                      const v = e.target.value.replace(/\s/g, '').toUpperCase();
                                                      setEditForm(prev => prev ? { ...prev, promoCoupons: prev.promoCoupons.map((c, ci) => ci === i ? v : c) } : prev);
                                                    }}
                                                    className="flex-1 bg-zinc-900 border border-purple-500/25 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono tracking-wider focus:outline-none focus:border-purple-400 placeholder:text-gray-600" />
                                                  <button onClick={() => setEditForm(prev => prev ? { ...prev, promoCoupons: prev.promoCoupons.filter((_, ci) => ci !== i) } : prev)}
                                                    className="text-gray-500 hover:text-red-400 p-1"><X size={12} /></button>
                                                </div>
                                              ))}
                                            </div>
                                            {editForm.promoCoupons.length < maxCoupons && (
                                              <button onClick={() => setEditForm(prev => prev ? { ...prev, promoCoupons: [...prev.promoCoupons, ''] } : prev)}
                                                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-purple-500/30 text-purple-400 text-xs font-bold hover:bg-purple-500/8">
                                                + Add Coupon
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })()}

                                      {editError && <p className="text-xs text-red-400 font-bold">{editError}</p>}

                                      {/* Save / Cancel */}
                                      <div className="flex items-center gap-2 pt-1">
                                        <button onClick={() => handleSaveEditInvoice(inv as Invoice & { id: string })} disabled={savingEdit}
                                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold text-black text-xs font-black hover:bg-gold/90 transition-all disabled:opacity-50">
                                          {savingEdit ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save Changes
                                        </button>
                                        <button onClick={handleCancelEditInvoice}
                                          className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-gray-400 text-xs font-black hover:text-white transition-all">
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="px-6 py-4 bg-zinc-800/60 border-b border-white/10 space-y-2">
                                      <p className="text-[11px] uppercase tracking-widest font-black text-gray-400 mb-2">Line Items</p>
                                      {inv.items?.map((it: BillItem, i: number) => (
                                        <div key={i} className="space-y-0.5">
                                          <div className="flex items-center justify-between gap-3 text-xs">
                                            <div className="flex-1 min-w-0">
                                              <span className="text-gray-300">{it.serviceName}{(it.quantity ?? 1) > 1 ? ` ×${it.quantity}` : ''}</span>
                                              {it.staffName && <span className="text-gray-400 ml-2">— {it.staffName} ({it.commissionRate}%)</span>}
                                            </div>
                                            <span className="text-white font-bold shrink-0">₹{it.price.toLocaleString('en-IN')}</span>
                                          </div>
                                          {(it.quantity ?? 1) > 1 && (
                                            <p className="text-[11px] text-gray-500 pl-1">₹{it.unitPrice.toLocaleString('en-IN')} × {it.quantity}</p>
                                          )}
                                        </div>
                                      ))}
                                      {(inv.paymentSplits?.length ?? 0) > 0 && (
                                        <div className="pt-2 border-t border-white/10 space-y-1">
                                          <p className="text-[11px] uppercase tracking-widest font-black text-gray-400">Payment Breakup</p>
                                          {inv.paymentSplits!.map((s: any, i: number) => {
                                            const label = s.method === 'online' ? 'Razorpay' : s.method;
                                            return (
                                              <div key={i} className="flex justify-between text-xs">
                                                <span className={`capitalize ${s.isAdvance ? 'text-amber-400 font-bold' : 'text-gray-400'}`}>
                                                  {s.isAdvance ? `Advance (${label})` : label}
                                                </span>
                                                <span className="font-bold text-white">₹{s.amount.toLocaleString('en-IN')}</span>
                                              </div>
                                            );
                                          })}
                                          {inv.paymentSplits!.length > 1 && (
                                            <div className="flex justify-between text-xs text-gray-500 border-t border-dashed border-white/10 pt-0.5">
                                              <span>Collected</span>
                                              <span className="font-bold">₹{inv.paymentSplits!.reduce((a, s) => a + (Number(s.amount) || 0), 0).toLocaleString('en-IN')}</span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      <div className="pt-2 border-t border-white/10 space-y-1">
                                        {inv.discountAmount > 0 && (
                                          <div className="flex justify-between text-xs text-red-400">
                                            <span>Discount ({inv.discountPercent}%)</span>
                                            <span>-₹{inv.discountAmount.toLocaleString('en-IN')}</span>
                                          </div>
                                        )}
                                        {(inv as any).dueSettlementAmount > 0 && (
                                          <div className="flex justify-between text-xs text-amber-400 font-bold">
                                            <span>⚠ Previous Dues Settled</span>
                                            <span>+₹{(inv as any).dueSettlementAmount.toLocaleString('en-IN')}</span>
                                          </div>
                                        )}
                                        {(inv as any).advanceSettlementAmount > 0 && (
                                          <div className="flex justify-between text-xs text-sky-400 font-bold">
                                            <span>Advance Applied</span>
                                            <span>-₹{(inv as any).advanceSettlementAmount.toLocaleString('en-IN')}</span>
                                          </div>
                                        )}
                                        <div className="flex justify-between text-xs text-white font-black pt-1 border-t border-white/10">
                                          <span>Total</span>
                                          <span className="text-gold">₹{(inv.total ?? 0).toLocaleString('en-IN')}</span>
                                        </div>
                                        {((inv as any).roundOffAmount ?? 0) !== 0 && (
                                          <div className="flex justify-between text-xs text-sky-400">
                                            <span>Round Off</span>
                                            <span>₹{(inv as any).roundOffAmount.toLocaleString('en-IN')}</span>
                                          </div>
                                        )}
                                        {((inv as any).advanceAmount ?? 0) > 0 && (
                                          <div className="flex justify-between text-xs text-emerald-400">
                                            <span>Saved as Advance</span>
                                            <span>₹{(inv as any).advanceAmount.toLocaleString('en-IN')}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-400 font-bold uppercase tracking-widest">
                  <span>{billingStats.displayed.length} invoices shown</span>
                  <span>₹{billingStats.totalRevenue.toLocaleString('en-IN',{maximumFractionDigits:0})} total</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Dues Drawer ── */}
      {showDuesDrawer && (
        <div className="fixed inset-0 z-[300] flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDuesDrawer(false)} />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative z-10 w-full max-w-lg bg-zinc-950 border-l border-white/10 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 bg-zinc-950 border-b border-white/10 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest font-black text-red-400/70">Outstanding Dues</p>
                <p className="text-white font-black text-xl leading-none mt-0.5">
                  ₹{billingStats.totalDue.toLocaleString('en-IN')}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  {dueCustomers.length} customer{dueCustomers.length !== 1 ? 's' : ''} · {billingStats.dueCount} invoice{billingStats.dueCount !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => setShowDuesDrawer(false)}
                className="p-2 rounded-xl bg-white/8 border border-white/10 text-gray-400 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Customer list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {dueCustomers.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-12">No outstanding dues</p>
              ) : dueCustomers.map(customer => (
                <div key={customer.phone} className="bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden">
                  {/* Customer header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-white/[0.03] border-b border-white/8">
                    <div>
                      <p className="text-white font-bold text-sm">{customer.name}</p>
                      <p className="text-gray-400 text-[11px]">{customer.phone}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-red-400 font-black text-base">₹{customer.totalDue.toLocaleString('en-IN')}</p>
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider">Total due</p>
                    </div>
                  </div>
                  {/* Due invoices */}
                  <div className="divide-y divide-white/6">
                    {customer.invoices.map(inv => {
                      const invDate = (inv as any).createdAt
                        ? (inv as any).createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—';
                      const services = inv.items?.map((it: BillItem) => it.serviceName).join(', ') ?? '—';
                      const amountDue = (inv as any).amountDue ?? 0;
                      const amountPaid = inv.amountPaid ?? (inv.total - amountDue);
                      return (
                        <div key={(inv as any).id} className="px-4 py-3 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-gold text-xs font-black font-mono">{inv.invoiceNumber}</span>
                              <span className="text-[11px] text-gray-500">{invDate}</span>
                            </div>
                            <p className="text-gray-300 text-[11px] truncate mb-1.5">{services}</p>
                            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                              <span className="text-gray-400 text-xs">Total ₹{inv.total.toLocaleString('en-IN')}</span>
                              <span className="text-gray-600 text-xs">·</span>
                              <span className="text-emerald-400 text-xs">Paid ₹{amountPaid.toLocaleString('en-IN')}</span>
                              <span className="text-gray-600 text-xs">·</span>
                              <span className="text-red-400 text-xs font-bold">Due ₹{amountDue.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => { setInvoiceModalId((inv as any).id); }}
                            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-gold/10 border border-gold/20 text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/20 transition-colors"
                          >
                            View
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          STAFF VIEW
      ════════════════════════════════════════════════════════════════ */}
      {view === 'staff' && (
        <div className="space-y-4">

          {/* Sub-view toggle — admin only (staff mode shows profile directly) */}
          {!isStaffMode && (
            <div className="flex items-center gap-1 bg-zinc-800 border border-white/12 rounded-xl p-1 w-fit">
              <button onClick={() => setStaffSubView('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  staffSubView === 'list'
                    ? 'bg-gold/15 border border-gold/25 text-gold'
                    : 'text-gray-500 hover:text-white'
                }`}>
                <Users size={12}/> Staff List
              </button>
              <button onClick={() => setStaffSubView('analytics')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  staffSubView === 'analytics'
                    ? 'bg-purple-500/15 border border-purple-500/25 text-purple-400'
                    : 'text-gray-500 hover:text-white'
                }`}>
                <BarChart3 size={12}/> Analytics
              </button>
            </div>
          )}

          {/* Analytics view */}
          {!isStaffMode && staffSubView === 'analytics' && (
            <StaffAnalytics staffInvoices={staffInvoices} staff={staff} />
          )}

          {/* Staff list — shown when list view is selected OR in staff mode */}
          {(isStaffMode || staffSubView === 'list') && (
          <>{/* Staff mode: show own profile only */}
          {isStaffMode && staffMember && (
            <div className="bg-zinc-900 border border-white/12 rounded-2xl p-6 space-y-4">
              <p className="text-xs uppercase tracking-widest font-black text-gold">My Profile</p>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-gold font-black text-xl">
                  {staffMember.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-black text-lg">{staffMember.name}</p>
                  {staffMember.role && <p className="text-gray-400 text-sm">{staffMember.role}</p>}
                  {staffMember.phone && <p className="text-gray-500 text-xs mt-0.5">{staffMember.phone}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10">
                <div className="text-center p-3 bg-white/8 rounded-xl">
                  <p className="text-gold font-black text-xl">{staffMember.commissionRate}%</p>
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">My Commission Rate</p>
                </div>
                {(staffMember as any).salary > 0 && (
                  <div className="text-center p-3 bg-white/8 rounded-xl">
                    <p className="text-white font-black text-lg">₹{((staffMember as any).salary ?? 0).toLocaleString('en-IN')}</p>
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">Monthly Salary</p>
                  </div>
                )}
                {(() => {
                  const stat = staffStats[staffMember.id] ?? { services: 0, commission: 0 };
                  const salary = (staffMember as any).salary ?? 0;
                  return (
                    <>
                      <div className="text-center p-3 bg-white/8 rounded-xl">
                        <p className="text-white font-black text-lg">{stat.services}</p>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">Services Done</p>
                      </div>
                      <div className="text-center p-3 bg-gold/10 border border-gold/20 rounded-xl">
                        <p className="text-gold font-black text-lg">₹{stat.commission.toLocaleString('en-IN')}</p>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">Commission Earned</p>
                      </div>
                      <div className="text-center p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl col-span-2 sm:col-span-1">
                        <p className="text-emerald-400 font-black text-lg">₹{(salary + stat.commission).toLocaleString('en-IN')}</p>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">Total Payable</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Admin only: add staff + manage all staff */}
          {!isStaffMode && (<>

          {/* Commission date range filter */}
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase font-black tracking-widest text-gold flex items-center gap-2">
                <IndianRupee size={12} /> Commission Period
              </p>
              {(commFrom || commTo) && (
                <button
                  onClick={() => { setCommFrom(''); setCommTo(''); setCommPeriod('thisMonth'); }}
                  className="text-[11px] text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  <X size={10} /> Clear custom
                </button>
              )}
            </div>
            {/* Quick-select chips */}
            <div className="flex items-center gap-2 flex-wrap">
              {([
                { id: 'thisMonth', label: 'This Month' },
                { id: 'lastMonth', label: 'Last Month' },
                { id: 'all',       label: 'All Time'   },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => { setCommPeriod(opt.id); setCommFrom(''); setCommTo(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                    commPeriod === opt.id && !commFrom && !commTo
                      ? 'bg-gold/15 border border-gold/30 text-gold'
                      : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Custom date range */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Custom:</span>
              <input
                type="date"
                value={commFrom}
                onChange={e => setCommFrom(e.target.value)}
                className="bg-white/8 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none focus:border-gold/50 transition-all"
              />
              <span className="text-gray-500 text-xs">to</span>
              <input
                type="date"
                value={commTo}
                onChange={e => setCommTo(e.target.value)}
                className="bg-white/8 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none focus:border-gold/50 transition-all"
              />
            </div>
            {/* Period label */}
            <span className="inline-flex items-center gap-1.5 text-xs text-gold font-bold bg-gold/8 border border-gold/20 rounded-lg px-2.5 py-1">
              <Calendar size={10} /> {fmtPeriodLabel(commPeriod, commFrom, commTo)}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, role or phone…"
                value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-xl py-2 pl-9 pr-8 text-white text-xs focus:outline-none focus:border-gold/40 transition-all placeholder:text-gray-500"
              />
              {staffSearch && (
                <button onClick={() => setStaffSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
                  <X size={12} />
                </button>
              )}
            </div>
            {/* Count + add button */}
            <div className="flex items-center justify-between sm:justify-end gap-3 flex-1">
            <p className="text-gray-400 text-sm">{staff.length} staff member{staff.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => setStaffForm({ name: '', phone: '', role: '', commissionRate: 5, salary: 0, isActive: true } as any)}
              className="flex items-center gap-2 px-4 py-2 bg-gold/10 border border-gold/30 rounded-xl text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/20 transition-all"
            >
              <Plus size={13} /> Add Staff
            </button>
            </div>{/* /count+button */}
          </div>{/* /search+header row */}

          {/* Add / Edit form */}
          <AnimatePresence>
            {staffForm !== null && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="bg-zinc-900 border border-gold/30 rounded-2xl p-6 space-y-4"
              >
                <p className="text-xs uppercase font-black tracking-widest text-gold">{staffForm.id ? 'Edit Staff' : 'New Staff Member'}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: 'name',  placeholder: 'Full name *',   type: 'text'   },
                    { key: 'phone', placeholder: 'Phone number',  type: 'tel'    },
                    { key: 'role',  placeholder: 'Role (e.g. Stylist)', type: 'text' },
                  ].map(({ key, placeholder, type }) => (
                    <input key={key} type={type} placeholder={placeholder}
                      value={(staffForm as any)[key] ?? ''}
                      onChange={e => setStaffForm(f => ({ ...f, [key]: e.target.value }))}
                      className="bg-white/8 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
                    />
                  ))}
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-400 shrink-0">Commission %</label>
                    <input type="number" min={0} max={100}
                      value={staffForm.commissionRate ?? 5}
                      onChange={e => setStaffForm(f => ({ ...f, commissionRate: Number(e.target.value) }))}
                      className="flex-1 bg-white/8 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-gold/50 transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-400 shrink-0">Salary (₹/mo)</label>
                    <input type="number" min={0}
                      value={(staffForm as any).salary ?? 0}
                      onChange={e => setStaffForm(f => ({ ...f, salary: Number(e.target.value) } as any))}
                      className="flex-1 bg-white/8 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-gold/50 transition-all"
                      placeholder="e.g. 15000"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-black uppercase tracking-widest text-gold block mb-1.5">Staff Portal Login Email</label>
                    <input type="email"
                      placeholder="staff@example.com"
                      value={(staffForm as any).email ?? ''}
                      onChange={e => setStaffForm(f => ({ ...f, email: e.target.value.trim() } as any))}
                      className="w-full bg-white/8 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Staff logs in at /admin with this email + a password you set in Firebase Console.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={staffForm.isActive ?? true}
                      onChange={e => setStaffForm(f => ({ ...f, isActive: e.target.checked }))}
                      className="accent-gold"
                    />
                    <span className="text-xs text-gray-400">Active</span>
                  </label>
                  <div className="ml-auto flex gap-2">
                    <button onClick={() => setStaffForm(null)}
                      className="px-4 py-2 bg-white/8 border border-white/10 rounded-xl text-xs font-bold text-gray-400 hover:bg-white/10 transition-all">
                      Cancel
                    </button>
                    <button onClick={saveStaff} disabled={staffSaving || !staffForm.name?.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-black text-xs font-black uppercase tracking-wider disabled:opacity-40 transition-all">
                      {staffSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      Save
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Staff list */}
          {staffLoading ? (
            <div className="flex items-center justify-center py-12 gap-3 text-gray-500">
              <Loader2 size={20} className="animate-spin text-gold" /> Loading staff…
            </div>
          ) : staff.length === 0 ? (
            <div className="text-center py-16">
              <UserCheck size={36} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No staff added yet.</p>
            </div>
          ) : (() => {
            const sq = staffSearch.toLowerCase().trim();
            const filteredStaff = sq
              ? staff.filter(s =>
                  s.name.toLowerCase().includes(sq) ||
                  (s.role ?? '').toLowerCase().includes(sq) ||
                  (s.phone ?? '').includes(sq)
                )
              : staff;
            return filteredStaff.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">No staff match "{staffSearch}"</p>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStaff.map(s => (
                <div key={s.id} className={`bg-zinc-900 border rounded-2xl p-5 transition-all ${s.isActive ? 'border-white/12' : 'border-white/4 opacity-60'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-gold font-black text-sm">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setStaffForm(s)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => deleteStaff(s.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p className="text-white font-bold text-sm">{s.name}</p>
                  {s.role && <p className="text-gray-500 text-xs mt-0.5">{s.role}</p>}
                  {s.phone && <p className="text-gray-400 text-xs">{s.phone}</p>}
                  {/* Salary + commission row */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-gold font-black">
                      <Percent size={9} /> {s.commissionRate}% commission
                    </span>
                    {(s as any).salary > 0 && (
                      <span className="text-xs text-gray-400 font-bold">
                        ₹{((s as any).salary ?? 0).toLocaleString('en-IN')}/mo salary
                      </span>
                    )}
                    {!s.isActive && (
                      <span className="ml-auto text-[11px] text-gray-400 font-black uppercase">Inactive</span>
                    )}
                  </div>
                  {/* Commission breakdown from invoices */}
                  {(() => {
                    const stat = staffStats[s.id] ?? { services: 0, commission: 0 };
                    const salary = (s as any).salary ?? 0;
                    const totalPayable = salary + stat.commission;
                    return (
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-2 bg-white/8 rounded-xl">
                          <p className="text-white font-black text-sm">{stat.services}</p>
                          <p className="text-[11px] text-gray-400 uppercase">Services</p>
                        </div>
                        <div className="text-center p-2 bg-white/8 rounded-xl">
                          <p className="text-gold font-black text-sm">₹{stat.commission.toLocaleString('en-IN')}</p>
                          <p className="text-[11px] text-gray-400 uppercase">Commission</p>
                        </div>
                        <div className="text-center p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                          <p className="text-emerald-400 font-black text-sm">₹{totalPayable.toLocaleString('en-IN')}</p>
                          <p className="text-[11px] text-emerald-600 uppercase">Total Pay</p>
                        </div>
                      </div>
                      {(salary > 0 || stat.commission > 0) && (
                        <p className="text-[11px] text-gray-700 text-center">
                          ₹{salary.toLocaleString('en-IN')} salary + ₹{stat.commission.toLocaleString('en-IN')} commission = ₹{totalPayable.toLocaleString('en-IN')}
                        </p>
                      )}
                    </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          );})()}
          </>)}{/* /!isStaffMode admin section */}
          </>)}{/* /(isStaffMode || list) wrapper */}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          CUSTOMERS VIEW
      ════════════════════════════════════════════════════════════════ */}
      {view === 'customers' && (
        <div className="space-y-4">

          {/* Sub-view toggle */}
          <div className="flex items-center gap-1 bg-zinc-800 border border-white/12 rounded-xl p-1 w-fit">
            <button onClick={() => setCustomerSubView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                customerSubView === 'list'
                  ? 'bg-gold/15 border border-gold/25 text-gold'
                  : 'text-gray-500 hover:text-white'
              }`}>
              <Users size={12}/> Customers
            </button>
            <button onClick={() => setCustomerSubView('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                customerSubView === 'analytics'
                  ? 'bg-blue-500/15 border border-blue-500/25 text-blue-400'
                  : 'text-gray-500 hover:text-white'
              }`}>
              <BarChart2 size={12}/> Analytics
            </button>
          </div>

          {/* Analytics view */}
          {customerSubView === 'analytics' && <CustomerAnalytics customers={customers} />}

          {/* Customer list */}
          {customerSubView === 'list' && (<>
          {/* Search + source filter chips */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            {/* Search box */}
            <div className="relative flex-1 max-w-xs">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or phone…"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-xl py-2 pl-9 pr-8 text-white text-xs focus:outline-none focus:border-gold/40 transition-all placeholder:text-gray-500"
              />
              {customerSearch && (
                <button onClick={() => setCustomerSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Source filter chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { src: 'all',    label: 'All',       cls: 'bg-white/8 border-white/15 text-gray-300',                     activeCls: 'bg-white/15 border-white/30 text-white'           },
                { src: 'online', label: '🌐 Online',  cls: 'bg-blue-500/10 border-blue-500/25 text-blue-300',                activeCls: 'bg-blue-500/20 border-blue-500/40 text-blue-300'  },
                { src: 'walkin', label: '🏪 Walk-in', cls: 'bg-purple-500/10 border-purple-500/25 text-purple-300',          activeCls: 'bg-purple-500/20 border-purple-500/40 text-purple-300' },
                { src: 'both',   label: '⭐ Both',    cls: 'bg-gold/10 border-gold/25 text-gold/90',                         activeCls: 'bg-gold/20 border-gold/40 text-gold'              },
              ] as const).map(({ src, label, cls, activeCls }) => {
                const count = src === 'all' ? customers.length : customers.filter((c: any) => c.source === src).length;
                if (src !== 'all' && count === 0) return null;
                const active = customerSourceFilter === src;
                return (
                  <button key={src} onClick={() => setCustomerSourceFilter(src)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase border transition-all ${active ? activeCls : cls}`}>
                    {label}
                    <span className={`${active ? 'opacity-80' : 'opacity-50'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {customersLoading ? (
            <div className="flex items-center justify-center py-12 gap-3 text-gray-500">
              <Loader2 size={20} className="animate-spin text-gold" /> Loading customers…
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-16">
              <Users size={36} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No customers yet. Customers appear here from online bookings and manual billing.</p>
            </div>
          ) : (() => {
            // Apply search + source filter
            const q = customerSearch.toLowerCase().trim();
            const filtered = customers.filter((c: any) => {
              const matchSearch = !q || (c.name ?? '').toLowerCase().includes(q) || (c.phone ?? '').includes(q);
              const matchSource = customerSourceFilter === 'all' || c.source === customerSourceFilter;
              return matchSearch && matchSource;
            });
            const visible = filtered.slice(0, customerVisibleCount);
            return (
            <div className="bg-zinc-900 border border-white/12 rounded-2xl overflow-hidden">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">
                  No customers match "{customerSearch || customerSourceFilter}"
                </div>
              ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/12 bg-white/[0.05]">
                    {['Customer', 'Phone', 'Visits', 'Total Spend', 'Last Visit', 'Source', 'Status'].map(h => (
                      <th key={h} className="py-3 px-4 text-left text-xs font-black uppercase tracking-widest text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c: any) => {
                    const isReturning = (c.visitCount ?? 0) >= 2;
                    const srcMeta: Record<string, { label: string; cls: string }> = {
                      online: { label: '🌐 Online',  cls: 'bg-blue-500/10 border-blue-500/20 text-blue-400'       },
                      walkin: { label: '🏪 Walk-in', cls: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
                      both:   { label: '⭐ Both',    cls: 'bg-gold/10 border-gold/20 text-gold'                   },
                    };
                    const sm = srcMeta[c.source] ?? srcMeta.online;
                    return (
                      <tr key={c.phone} className="border-b border-white/10 hover:bg-white/[0.06] transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center text-gold text-xs font-black shrink-0">
                              {(c.name ?? '?').charAt(0).toUpperCase()}
                            </div>
                            <p className="text-white text-sm font-bold">{c.name}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-sm">{c.phone}</td>
                        <td className="py-3 px-4 text-white font-black text-sm">{c.visitCount ?? 0}</td>
                        <td className="py-3 px-4 text-gold font-black text-sm">₹{(c.totalSpend ?? 0).toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-gray-500 text-xs">
                          {c.lastVisit ? new Date(c.lastVisit).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black uppercase border ${sm.cls}`}>
                            {sm.label}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black uppercase border ${
                            isReturning
                              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                              : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                          }`}>
                            {isReturning ? '★ Returning' : 'New'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
              {/* Infinite-scroll sentinel — loads +50 more rows when scrolled into view */}
              {visible.length < filtered.length && (
                <div ref={customerLoadMoreRef} className="flex items-center justify-center py-4">
                  <Loader2 size={16} className="animate-spin text-gold" />
                </div>
              )}
              <div className="px-5 py-3 border-t border-white/10 text-xs text-gray-400 font-bold uppercase tracking-widest">
                Showing {visible.length} of {filtered.length} · ₹{customers.reduce((a: number, c: any) => a + (c.totalSpend ?? 0), 0).toLocaleString('en-IN')} combined spend
              </div>
            </div>
          );})()}
          </>)}{/* /list sub-view */}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TOOLS VIEW
      ════════════════════════════════════════════════════════════════ */}
      {view === 'tools' && (
        <div className="space-y-5">
          {/* Sub-tab bar */}
          <div className="flex items-center gap-1 flex-wrap bg-zinc-800 border border-white/10 rounded-2xl p-1.5">
            {([
              { id: 'services', label: 'Services',      icon: <Scissors    size={12}/>, adminOnly: true  },
              { id: 'trending', label: 'Trending',      icon: <TrendingUp  size={12}/>, adminOnly: true  },
              { id: 'expenses', label: 'Expenses',      icon: <IndianRupee size={12}/>, adminOnly: true  },
              { id: 'banners',  label: 'Banners',       icon: <Wrench      size={12}/>, adminOnly: false },
              { id: 'gallery',  label: 'Gallery',       icon: <BarChart    size={12}/>, adminOnly: false },
              { id: 'coupons',  label: 'Coupons',       icon: <Percent     size={12}/>, adminOnly: true  },
              { id: 'data',     label: 'Import/Export', icon: <Download    size={12}/>, adminOnly: true  },
              { id: 'settings', label: 'Settings',      icon: <Building2   size={12}/>, adminOnly: true  },
            ] as const).filter(t => !t.adminOnly || !isStaffMode).map(t => (
              <button key={t.id} onClick={() => setToolsTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  toolsTab === t.id
                    ? 'bg-gold/15 border border-gold/25 text-gold'
                    : 'text-gray-400 hover:text-white hover:bg-white/8'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {toolsTab === 'services' && !isStaffMode && <ServiceManager />}
          {toolsTab === 'trending' && !isStaffMode && <TrendingServicesManager />}
          {toolsTab === 'expenses' && !isStaffMode && <ExpenseManager />}
          {toolsTab === 'banners'  && <BannerManager />}
          {toolsTab === 'gallery'  && <GalleryManager />}
          {toolsTab === 'coupons'  && !isStaffMode && <CouponManager />}
          {toolsTab === 'data'     && !isStaffMode && <DataIO />}

          {toolsTab === 'settings' && !isStaffMode && (
            <div className="space-y-6 max-w-xl">
              <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
                <p className="text-xs uppercase tracking-widest font-black text-gray-400 mb-1">Salon Configuration</p>
                <p className="text-xs text-gray-500 mb-6">Controls booking slots, capacity, and voice assistant hours. Changes take effect immediately for new bookings.</p>

                {!sSettingsLoaded ? (
                  <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
                    <Loader2 size={16} className="animate-spin" /> Loading…
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Staff count */}
                    <div>
                      <label className="block text-xs font-bold text-gray-300 mb-1">Staff / Simultaneous Appointments</label>
                      <p className="text-xs text-gray-500 mb-2">How many appointments can run at the same time</p>
                      <input type="number" min={1} max={20}
                        value={sSettings.staffCount}
                        onChange={e => setSSettings(p => ({ ...p, staffCount: Math.max(1, +e.target.value) }))}
                        className="w-32 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/40"
                      />
                    </div>

                    {/* Opening & closing hours */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-300 mb-1">Opening Hour</label>
                        <p className="text-xs text-gray-500 mb-2">24-hour format (e.g. 10 = 10:00 AM)</p>
                        <input type="number" min={0} max={23}
                          value={sSettings.openHour}
                          onChange={e => setSSettings(p => ({ ...p, openHour: Math.min(23, Math.max(0, +e.target.value)) }))}
                          className="w-32 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/40"
                        />
                        <p className="text-xs text-gold mt-1">{sSettings.openHour === 0 ? '12:00 AM' : sSettings.openHour < 12 ? `${sSettings.openHour}:00 AM` : sSettings.openHour === 12 ? '12:00 PM' : `${sSettings.openHour - 12}:00 PM`}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-300 mb-1">Closing Hour</label>
                        <p className="text-xs text-gray-500 mb-2">24-hour format (e.g. 22 = 10:00 PM)</p>
                        <input type="number" min={0} max={23}
                          value={sSettings.closeHour}
                          onChange={e => setSSettings(p => ({ ...p, closeHour: Math.min(23, Math.max(0, +e.target.value)) }))}
                          className="w-32 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/40"
                        />
                        <p className="text-xs text-gold mt-1">{sSettings.closeHour === 0 ? '12:00 AM' : sSettings.closeHour < 12 ? `${sSettings.closeHour}:00 AM` : sSettings.closeHour === 12 ? '12:00 PM' : `${sSettings.closeHour - 12}:00 PM`}</p>
                      </div>
                    </div>

                    {/* Slot step */}
                    <div>
                      <label className="block text-xs font-bold text-gray-300 mb-1">Slot Interval (minutes)</label>
                      <p className="text-xs text-gray-500 mb-2">How frequently new time slots are generated (e.g. every 15 min)</p>
                      <select value={sSettings.slotStepMins}
                        onChange={e => setSSettings(p => ({ ...p, slotStepMins: +e.target.value }))}
                        className="w-40 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/40">
                        {[5, 10, 15, 20, 30, 60].map(v => <option key={v} value={v} className="bg-zinc-800 text-white">{v} minutes</option>)}
                      </select>
                    </div>

                    {/* Buffer */}
                    <div>
                      <label className="block text-xs font-bold text-gray-300 mb-1">Advance Buffer (minutes)</label>
                      <p className="text-xs text-gray-500 mb-2">Minimum time ahead required before the first available slot</p>
                      <select value={sSettings.bufferMins}
                        onChange={e => setSSettings(p => ({ ...p, bufferMins: +e.target.value }))}
                        className="w-40 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/40">
                        {[0, 15, 30, 45, 60, 90, 120].map(v => <option key={v} value={v} className="bg-zinc-800 text-white">{v === 0 ? 'None' : `${v} minutes`}</option>)}
                      </select>
                    </div>

                    {/* Express service fee */}
                    <div>
                      <label className="block text-xs font-bold text-gray-300 mb-1">Express Service Fee (₹)</label>
                      <p className="text-xs text-gray-500 mb-2">Extra charge for priority/express bookings (customers skip the queue)</p>
                      <input type="number" min={0}
                        value={sSettings.expressServiceFee}
                        onChange={e => setSSettings(p => ({ ...p, expressServiceFee: Math.max(0, +e.target.value) }))}
                        className="w-32 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/40"
                      />
                    </div>

                    {/* Default staff for unassigned services */}
                    <div>
                      <label className="block text-xs font-bold text-gray-300 mb-1">Default Staff (for unassigned services)</label>
                      <p className="text-xs text-gray-500 mb-2">
                        If a service is billed without a staff member selected, it's silently credited to this
                        staff member's commission &amp; service count. The Billing screen is unaffected — no staff
                        appears selected there, but invoices and staff totals reflect this default.
                      </p>
                      <select value={sSettings.defaultStaffId}
                        onChange={e => setSSettings(p => ({ ...p, defaultStaffId: e.target.value }))}
                        className="w-full max-w-xs bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/40">
                        <option value="" className="bg-zinc-800 text-white">— None —</option>
                        {staff.map(s => (
                          <option key={s.id} value={s.id} className="bg-zinc-800 text-white">{s.name}{s.role ? ` · ${s.role}` : ''} · {s.commissionRate}% comm</option>
                        ))}
                      </select>
                    </div>

                    {/* ── Security PIN ── */}
                    <div className="pt-4 border-t border-white/8">
                      <label className="block text-xs font-bold text-gray-300 mb-1 flex items-center gap-1.5">
                        <Lock size={12} className="text-gold" /> Security PIN
                      </label>
                      <p className="text-xs text-gray-500 mb-2">
                        Set a 4-digit PIN to lock Billing, Insights &amp; Staff sections.
                        Anyone will need this PIN to access them. Leave empty to disable.
                      </p>
                      <div className="flex items-center gap-3">
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder={adminPin ? '●●●● (set — type to change)' : 'Enter 4-digit PIN'}
                          value={pinSettingsInput}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                            setPinSettingsInput(v);
                            if (v.length === 4) setAdminPin(v);
                          }}
                          className="w-56 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm tracking-[0.3em] text-center font-mono focus:outline-none focus:border-gold/40 placeholder:tracking-normal placeholder:text-gray-600 placeholder:text-xs"
                        />
                        {adminPin && (
                          <button
                            onClick={() => { setAdminPin(''); setPinSettingsInput(''); }}
                            className="text-red-400 text-xs font-bold hover:text-red-300 transition-colors"
                          >
                            Remove PIN
                          </button>
                        )}
                      </div>
                      {pinSettingsInput.length > 0 && pinSettingsInput.length < 4 && (
                        <p className="text-orange-400 text-xs mt-1">PIN must be exactly 4 digits</p>
                      )}
                    </div>

                    {/* ── Legacy Section Image ── */}
                    <div className="pt-4 border-t border-white/8">
                      <label className="block text-xs font-bold text-gray-300 mb-1">Legacy Section Image URL</label>
                      <p className="text-xs text-gray-500 mb-2">
                        Image shown in the "Our Legacy" section on the landing page. Paste a public image URL.
                        Leave empty to use the default image.
                      </p>
                      <input type="url"
                        value={sSettings.legacyImageUrl}
                        onChange={e => setSSettings(p => ({ ...p, legacyImageUrl: e.target.value }))}
                        placeholder="https://example.com/image.jpg"
                        className="w-full max-w-md bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/40 placeholder:text-gray-600"
                      />
                      {sSettings.legacyImageUrl && (
                        <div className="mt-2 flex items-center gap-3">
                          <div className="w-20 h-20 rounded-xl border border-white/10 overflow-hidden bg-zinc-800">
                            <img src={sSettings.legacyImageUrl} alt="Preview" className="w-full h-full object-cover"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          </div>
                          <button onClick={() => setSSettings(p => ({ ...p, legacyImageUrl: '' }))}
                            className="text-red-400 text-xs font-bold hover:text-red-300">Remove</button>
                        </div>
                      )}
                    </div>

                    {sSettingsError && (
                      <p className="text-red-400 text-xs flex items-center gap-1.5"><AlertCircle size={12}/>{sSettingsError}</p>
                    )}
                    {sSettingsSaved && (
                      <p className="text-emerald-400 text-xs flex items-center gap-1.5"><CheckCircle2 size={12}/>Settings saved successfully</p>
                    )}

                    <button
                      disabled={sSettingsSaving}
                      onClick={async () => {
                        setSSettingsSaving(true); setSSettingsError(null); setSSettingsSaved(false);
                        try {
                          await setDoc(doc(db, 'settings', 'salon'), { ...sSettings, adminPin }, { merge: true });
                          setSSettingsSaved(true);
                          setTimeout(() => setSSettingsSaved(false), 3000);
                        } catch (e: any) {
                          setSSettingsError(e.message ?? 'Failed to save');
                        } finally {
                          setSSettingsSaving(false);
                        }
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gold to-[#F0D060] rounded-xl text-black font-black text-xs uppercase tracking-wider disabled:opacity-50 transition-all hover:scale-105"
                    >
                      {sSettingsSaving ? <><Loader2 size={13} className="animate-spin"/>Saving…</> : <><Save size={13}/>Save Settings</>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Invoice view modal ── */}
      {invoiceModalId && (
        <InvoiceModal invoiceId={invoiceModalId} onClose={() => setInvoiceModalId(null)} />
      )}

      {/* ── PIN prompt modal ── */}
      {pinPromptView && (
        <PinPromptModal
          key={pinPromptView}
          targetView={pinPromptView}
          pin={adminPin}
          onSuccess={handlePinSuccess}
          onCancel={() => setPinPromptView(null)}
        />
      )}

      </main>
    </div>
  );
}

// ─── Root: Auth Gate ──────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [user,         setUser]         = useState<FirebaseUser | null>(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [staffMember,  setStaffMember]  = useState<(StaffMember & { id: string }) | null>(null);
  const [isAdminUser,  setIsAdminUser]  = useState(false);
  const [roleChecked,  setRoleChecked]  = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      console.log(u, "u")
      setUser(u);
      if (!u) {
        setIsAdminUser(false);
        setStaffMember(null);
        setRoleChecked(true);
        setAuthLoading(false);
        return;
      }

      try {
        // Single source of truth: admins/{uid} with a 'role' field
        // role: 'super_admin' → full admin access (default for existing docs without role)
        // role: 'staff'       → staff portal access
        const adminSnap = await getDoc(doc(db, 'admins', u.uid));
        console.log(adminSnap.data(), "test")

        if (!adminSnap.exists()) {
          // User not found in admins collection → no access
          setIsAdminUser(false);
          setStaffMember(null);
          setRoleChecked(true);
          setAuthLoading(false);
          return;
        }

        const adminData = adminSnap.data();
        // Default to 'super_admin' for existing docs that don't have a role field yet
        const role: string = adminData?.role ?? 'super_admin';
        console.log(role, "role")
        if (role === 'super_admin') {
          setIsAdminUser(true);
          setStaffMember(null);

        } else if (role === 'staff') {
          setIsAdminUser(false);
          // Use the logged-in email to find the matching staff document.
          // The staff document must have email matching u.email and isActive: true.
          if (u.email) {
            console.log(u.email, "u email")
            const staffQuery = await getDocs(
              query(collection(db, 'staff'),
                where('email', '==', u.email),
                where('isActive', '==', true)
              )
            );
            console.log(staffQuery, "staffQuery")
            if (!staffQuery.empty) {
              const sd = staffQuery.docs[0];
              setStaffMember({ id: sd.id, ...(sd.data() as Omit<StaffMember, 'id'>) });
              console.log(staffMember, "sd", sd)
            } else {
              setStaffMember(null);
            }
          } else {
            setStaffMember(null);
          }

        } else {
          // Unknown role → deny
          setIsAdminUser(false);
          setStaffMember(null);
        }

      } catch {
        setIsAdminUser(false);
        setStaffMember(null);
      }

      setRoleChecked(true);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  if (authLoading || !roleChecked) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
            <Scissors size={18} className="text-gold" />
          </div>
          <Loader2 size={24} className="animate-spin text-gold" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={() => {}} />;
  }
  console.log(isAdminUser, staffMember)

  if (!isAdminUser && !staffMember) {
    // Signed in but not recognised as admin or staff
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <AlertCircle size={24} className="text-red-400" />
          </div>
          <p className="text-white font-black text-lg">Access Denied</p>
          <p className="text-gray-500 text-sm">Your account is not authorised for this portal. Please contact the salon administrator.</p>
          <button
            onClick={() => signOut(auth)}
            className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-white/8 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/10 transition-all"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Staff member → dedicated staff portal
  if (!isAdminUser && staffMember) {
    return <StaffPortal staffMember={staffMember} onSignOut={() => signOut(auth)} />;
  }

  // Admin → full dashboard
  return <Dashboard user={user} staffMember={undefined} />;
}





