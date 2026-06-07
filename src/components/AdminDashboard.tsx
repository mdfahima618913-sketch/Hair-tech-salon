import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LogIn, LogOut, Eye, EyeOff, AlertCircle, Loader2,
  TrendingUp, Calendar, Users, CreditCard, CheckCircle2,
  Clock, XCircle, Search, ChevronDown, ChevronUp,
  RefreshCw, Filter, Download, Scissors, BarChart2,
  ArrowUpRight, ArrowDownRight, Inbox, Bell, BellOff, X,
  CheckSquare, ListChecks, PhoneOff,
  TrendingDown, BarChart3, CalendarDays, ChevronRight as ChevronRightIcon,
  Receipt, UserCheck, Plus, Trash2, Edit2, Save, Building2,
  Wallet, BarChart, PieChart, Smartphone, Wrench, Percent, Printer, CalendarPlus,
} from 'lucide-react';
import BannerManager  from './BannerManager';
import GalleryManager from './GalleryManager';
import CouponManager  from './CouponManager';
import ServiceManager from './ServiceManager';
import DataIO         from './DataIO';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection, query, orderBy, onSnapshot, getDocs,
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, where, limit,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import BillingModule, { type OnlineBookingPrefill, type StaffMember, type Customer, type Invoice, type BillItem } from './BillingModule';
import WalkInBooking    from './WalkInBooking';
import StaffAnalytics    from './StaffAnalytics';
import CustomerAnalytics from './CustomerAnalytics';

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
  createdAt?: Timestamp;
  startTime?: string;
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

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

function fmtTs(ts?: Timestamp) {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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

// ─── Notification helpers ─────────────────────────────────────────────────────

async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied')  return 'denied';
  return Notification.requestPermission();
}

// Lazily created and reused — creating AudioContext on every notification
// can be blocked by browsers if the context limit is reached.
let _audioCtx: AudioContext | null = null;
let _stopSound: (() => void) | null = null; // allows early cutoff if needed

function getAudioContext(): AudioContext {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext();
  }
  return _audioCtx;
}

/**
 * Vibrant 3-second notification ring built entirely from Web Audio API.
 *
 * Architecture — three simultaneous layers for richness:
 *
 *  Layer 1 — MELODY (sine, 0.4 gain)
 *    A cheerful 6-note arpeggio that repeats across 3 seconds.
 *    Notes: C5 → E5 → G5 → C6 → G5 → E5  (C major arpeggio, up + back)
 *    Each note: 220ms on, 30ms gap → one cycle = ~1.5s, two cycles in 3s.
 *
 *  Layer 2 — HARMONY (triangle, 0.15 gain, one octave below)
 *    Mirrors melody at half frequency, adds warmth without muddiness.
 *
 *  Layer 3 — SHIMMER (sawtooth through BiquadFilter, 0.08 gain)
 *    A high-pitched shimmer at C7 (2093 Hz) with a lowpass at 3 kHz,
 *    giving the "sparkle" texture of a real phone ringtone.
 *
 *  Master envelope:
 *    0–50ms   : fade in  (avoids click artifact)
 *    50–2800ms: sustain at 1.0
 *    2800–3000ms: fade out
 */
function playNotificationSound() {
  if (_stopSound) { _stopSound(); _stopSound = null; }

  try {
    const ctx = getAudioContext();

    const run = () => {
      const now      = ctx.currentTime;
      const DURATION = 3.0;
      const nodes: AudioNode[] = [];

      // ── Master gain ────────────────────────────────────────────────────────
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.001, now);
      master.gain.linearRampToValueAtTime(1.0, now + 0.02); // hard, instant attack
      master.gain.setValueAtTime(1.0, now + DURATION - 0.08);
      master.gain.linearRampToValueAtTime(0.001, now + DURATION);
      master.connect(ctx.destination);
      nodes.push(master);

      // ── Urgent repeating pulse pattern ────────────────────────────────────
      // Pattern: BEEP-BEEP .. BEEP-BEEP .. BEEP-BEEP  (3 pairs in 3 seconds)
      // Each pair: two 200ms beeps with 80ms gap between beeps, 400ms gap between pairs
      //
      // Each "beep" = square wave (harsh, cuts through noise) at 1480 Hz (Eb6)
      // layered with 1109 Hz (Eb5) one octave below for body.
      // Eb6 is specifically chosen — it's the frequency of most alarm buzzers.

      const BEEP_FREQ_HI = 1480;  // Eb6 — alarm-register frequency
      const BEEP_FREQ_LO = 740;   // Eb5 — one octave below for body
      const BEEP_ON      = 0.18;  // each beep lasts 180ms
      const BEEP_GAP     = 0.09;  // gap between the two beeps in a pair
      const PAIR_GAP     = 0.38;  // silence between pairs
      const PAIR_STEP    = BEEP_ON + BEEP_GAP + BEEP_ON + PAIR_GAP; // ~0.85s per pair

      // 3 pairs fit cleanly in 3 seconds (3 × 0.85 = 2.55s + last pair trails off)
      for (let pair = 0; pair < 4; pair++) {
        const pairStart = now + pair * PAIR_STEP;
        if (pairStart >= now + DURATION) break;

        for (let b = 0; b < 2; b++) {
          const bStart = pairStart + b * (BEEP_ON + BEEP_GAP);
          const bEnd   = bStart + BEEP_ON;
          if (bEnd > now + DURATION) break;

          // High frequency — square wave, cutting and bright
          const oscHi  = ctx.createOscillator();
          const gainHi = ctx.createGain();
          oscHi.type = 'square';
          oscHi.frequency.setValueAtTime(BEEP_FREQ_HI, bStart);

          // Slight pitch sweep upward on each beep (alarm warble effect)
          oscHi.frequency.linearRampToValueAtTime(BEEP_FREQ_HI * 1.04, bEnd);

          gainHi.gain.setValueAtTime(0.001, bStart);
          gainHi.gain.linearRampToValueAtTime(0.55, bStart + 0.005); // snap on
          gainHi.gain.setValueAtTime(0.55,          bEnd   - 0.01);
          gainHi.gain.linearRampToValueAtTime(0.001, bEnd);           // snap off

          oscHi.connect(gainHi); gainHi.connect(master);
          oscHi.start(bStart); oscHi.stop(bEnd + 0.01);
          nodes.push(oscHi, gainHi);

          // Low frequency — triangle for warmth under the buzz
          const oscLo  = ctx.createOscillator();
          const gainLo = ctx.createGain();
          oscLo.type = 'triangle';
          oscLo.frequency.setValueAtTime(BEEP_FREQ_LO, bStart);
          oscLo.frequency.linearRampToValueAtTime(BEEP_FREQ_LO * 1.04, bEnd);

          gainLo.gain.setValueAtTime(0.001, bStart);
          gainLo.gain.linearRampToValueAtTime(0.35, bStart + 0.005);
          gainLo.gain.setValueAtTime(0.35,          bEnd   - 0.01);
          gainLo.gain.linearRampToValueAtTime(0.001, bEnd);

          oscLo.connect(gainLo); gainLo.connect(master);
          oscLo.start(bStart); oscLo.stop(bEnd + 0.01);
          nodes.push(oscLo, gainLo);

          // Sub-punch — a very short bass thump at the start of each beep
          // gives physical weight (like a phone vibrating on a desk)
          const subOsc  = ctx.createOscillator();
          const subGain = ctx.createGain();
          subOsc.type = 'sine';
          subOsc.frequency.setValueAtTime(120, bStart);
          subOsc.frequency.exponentialRampToValueAtTime(60, bStart + 0.06);
          subGain.gain.setValueAtTime(0.001, bStart);
          subGain.gain.linearRampToValueAtTime(0.7,  bStart + 0.005);
          subGain.gain.exponentialRampToValueAtTime(0.001, bStart + 0.08);
          subOsc.connect(subGain); subGain.connect(master);
          subOsc.start(bStart); subOsc.stop(bStart + 0.1);
          nodes.push(subOsc, subGain);
        }
      }

      // ── Stop handle ────────────────────────────────────────────────────────
      _stopSound = () => {
        try {
          master.gain.cancelScheduledValues(ctx.currentTime);
          master.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.04);
        } catch {}
      };
      setTimeout(() => { _stopSound = null; }, DURATION * 1000 + 200);
    }; // end run()

    if (ctx.state === 'suspended') {
      ctx.resume().then(run).catch(() => console.warn('[NOTIF SOUND] resume failed'));
    } else {
      run();
    }

  } catch (err) {
    console.warn('[NOTIF SOUND]', err);
  }
}

// Plays the 3s ring repeatedly until stopRinging() is called.
// Returns a stop function. Safe to call multiple times — stops previous loop first.
let _ringLoopTimer: ReturnType<typeof setTimeout> | null = null;

function startRinging() {
  stopRinging(); // clear any existing loop
  const loop = () => {
    playNotificationSound();
    _ringLoopTimer = setTimeout(loop, 3200); // 3s ring + 200ms gap before repeat
  };
  loop();
}

function stopRinging() {
  if (_ringLoopTimer) { clearTimeout(_ringLoopTimer); _ringLoopTimer = null; }
  if (_stopSound) { _stopSound(); _stopSound = null; }
}

function fireDesktopNotification(booking: Booking) {
  // Play sound regardless of notification permission —
  // audio only requires a prior user gesture (clicking the dashboard counts).
  playNotificationSound();

  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const title = '💇 New Booking — Hair Tech Salon';
  const body  = [
    booking.customerName ?? 'Guest',
    booking.serviceNames ?? '',
    booking.bookingTime  ?? '',
    booking.totalAmount  ? `₹${booking.totalAmount}` : '',
  ].filter(Boolean).join(' · ');
  const n = new Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `booking-${booking.id}`,
    renotify: false,
  });
  setTimeout(() => n.close(), 8000);
}

// ─── In-app new booking banner ─────────────────────────────────────────────────

interface NewBookingBannerProps {
  booking: Booking;
  onDismiss: () => void;
}

function NewBookingBanner({ booking, onDismiss, onAccept }: NewBookingBannerProps & { onAccept: () => void }) {
  useEffect(() => {
    // Start looping ring — it stops only when admin accepts or all banners clear
    startRinging();
    // No auto-dismiss — ring persists until explicit admin action
    return () => {}; // cleanup handled by parent via stopRinging
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -80, scale: 0.95 }}
      animate={{ opacity: 1, y: 0,   scale: 1    }}
      exit={{    opacity: 0, y: -80, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-full max-w-lg px-4"
    >
      <div className="relative bg-zinc-900 border border-emerald-500/50 rounded-2xl shadow-[0_8px_60px_rgba(16,185,129,0.3)] overflow-hidden">
        {/* Persistent pulsing top border — no progress bar, rings until accepted */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-emerald-500 animate-pulse" />

        <div className="p-4 flex items-start gap-4">
          {/* Pulsing icon */}
          <div className="relative shrink-0 mt-0.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Bell size={20} className="text-emerald-400" />
            </div>
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">
              🔔 New Booking — Action Required
            </p>
            <p className="text-white font-bold text-sm leading-tight truncate">
              {booking.customerName ?? 'Guest'}
            </p>
            <p className="text-gray-400 text-xs mt-0.5 truncate">{booking.serviceNames ?? '—'}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {booking.bookingTime && (
                <span className="flex items-center gap-1 text-[10px] text-gray-500 font-bold">
                  <Clock size={10} /> {booking.bookingTime}
                </span>
              )}
              {booking.totalAmount ? (
                <span className="text-[10px] font-black text-gold">₹{booking.totalAmount.toLocaleString('en-IN')}</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-4 flex gap-3">
          <button
            onClick={onAccept}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-black font-black text-xs uppercase tracking-widest transition-all"
          >
            <CheckSquare size={14} /> Accept Booking
          </button>
          <button
            onClick={onDismiss}
            title="Dismiss banner — ring continues until all bookings are accepted"
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
            <p className="text-gray-400 text-[10px] uppercase tracking-widest font-bold">Admin Console</p>
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
              <label className="absolute -top-2 left-4 px-2 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-gold">Email</label>
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
              <label className="absolute -top-2 left-4 px-2 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-gold">Password</label>
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

        <p className="text-center text-gray-700 text-[10px] mt-6 uppercase tracking-widest font-bold">
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
          <span className={`flex items-center gap-1 text-[10px] font-black ${trend.up ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {trend.value}
          </span>
        )}
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest font-black text-gray-500 mb-1">{label}</p>
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
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${m.color} ${m.bg}`}>
      {m.icon} {m.label}
    </span>
  );
}

// ─── Booking Row ──────────────────────────────────────────────────────────────

function BookingRow({ booking, onStatusChange, onCreateBill, onViewInvoice, onConfirmPayment, onMarkPayAtSalon }: {
  booking: Booking;
  onStatusChange: (id: string, status: BookingStatus) => void;
  onCreateBill?: (booking: Booking) => void;
  onViewInvoice?: (invoiceId: string) => void;
  onConfirmPayment?: (id: string, paymentId: string) => void;
  onMarkPayAtSalon?: (id: string) => void;
}) {
  const [expanded,       setExpanded]       = useState(false);
  const [pendingPayId,   setPendingPayId]   = useState('');
  const [confirmingPay,  setConfirmingPay]  = useState(false);
  const [updating, setUpdating] = useState(false);

  const handleStatus = async (status: BookingStatus) => {
    setUpdating(true);
    await onStatusChange(booking.id, status);
    setUpdating(false);
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
              <p className="text-gray-500 text-[10px] mt-0.5">{booking.customerPhone ?? '—'}</p>
            </div>
          </div>
        </td>
        <td className="py-4 px-5 hidden md:table-cell">
          <p className="text-gray-300 text-sm">{booking.bookingDate ? fmtDate(booking.bookingDate) : '—'}</p>
          <p className="text-gray-400 text-[10px]">{booking.bookingTime ?? '—'}</p>
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
          <StatusBadge status={booking.status ?? 'pending'} />
        </td>
        <td className="py-4 px-5 text-gray-400 group-hover:text-gray-400 transition-colors">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
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
                      <p className="text-[9px] uppercase tracking-widest font-black text-gray-400 mb-1">{label}</p>
                      <p className="text-gray-300 text-xs font-medium break-all">{value}</p>
                    </div>
                  ))}

                  {/* Services full list */}
                  <div className="sm:col-span-2">
                    <p className="text-[9px] uppercase tracking-widest font-black text-gray-400 mb-1">Services</p>
                    <p className="text-gray-300 text-xs">{booking.serviceNames}</p>
                  </div>

                  {/* ── Pending-payment admin actions (only when status === 'pending') ── */}
                  {booking.status === 'pending' && (
                    <div className="sm:col-span-2 lg:col-span-4 space-y-3">
                      <p className="text-[9px] uppercase tracking-widest font-black text-amber-500 flex items-center gap-1.5">
                        <AlertCircle size={11} /> Payment Pending — Admin Actions
                      </p>

                      {/* Add Payment ID */}
                      <div className="p-4 bg-amber-500/8 border border-amber-500/30 rounded-2xl space-y-3">
                        <p className="text-[10px] text-amber-400 font-bold">Option 1 — Confirm with Razorpay Payment ID</p>
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
                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-black text-[10px] font-black uppercase tracking-wider disabled:opacity-40 transition-all shrink-0"
                          >
                            {confirmingPay ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                            Confirm
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400">Enter the Razorpay Payment ID from your dashboard to confirm this booking.</p>
                      </div>

                      {/* Pay at Salon */}
                      <div className="p-4 bg-blue-500/8 border border-blue-500/30 rounded-2xl space-y-2">
                        <p className="text-[10px] text-blue-400 font-bold">Option 2 — Mark as Pay at Salon</p>
                        <p className="text-[9px] text-gray-500">Customer will pay in person. Booking moves to confirmed — collect payment before billing.</p>
                        <button
                          onClick={async e => {
                            e.stopPropagation();
                            await onMarkPayAtSalon?.(booking.id);
                            setExpanded(false);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-500/20 border border-blue-500/30 hover:bg-blue-500/30 rounded-xl text-blue-300 text-[10px] font-black uppercase tracking-wider transition-all"
                        >
                          <CheckSquare size={11} /> Mark — Pay at Salon
                        </button>
                      </div>

                      {/* Delete pending */}
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm('Remove this pending booking?')) handleStatus('failed'); }}
                        className="text-[9px] text-gray-400 hover:text-red-400 transition-colors"
                      >
                        Remove pending booking
                      </button>
                    </div>
                  )}

                  {/* Status + actions (for non-pending bookings) */}
                  {booking.status !== 'pending' && (
                  <div className="sm:col-span-2 lg:col-span-2 flex items-end gap-2 flex-wrap">
                    <p className="text-[9px] uppercase tracking-widest font-black text-gray-400 w-full mb-1">Status</p>

                    {/* Current status badge */}
                    <StatusBadge status={booking.status ?? 'paid'} />

                    {/* Status chips — allow admin overrides */}
                    {(['paid', 'confirmed', 'pending', 'failed'] as BookingStatus[]).map(s => (
                      <button key={s}
                        onClick={e => { e.stopPropagation(); handleStatus(s); }}
                        disabled={updating || booking.status === s}
                        className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-40 ${
                          booking.status === s
                            ? `${STATUS_META[s].color} ${STATUS_META[s].bg}`
                            : 'bg-white/8 border-white/10 text-gray-500 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {updating && booking.status !== s ? <Loader2 size={10} className="animate-spin inline" /> : STATUS_META[s].label}
                      </button>
                    ))}

                    <div className="w-full mt-1 flex flex-wrap gap-2">
                      <p className="text-[9px] uppercase tracking-widest font-black text-gray-400 w-full mb-0.5">Actions</p>

                      {/* Service Completed — shown after bill is generated */}
                      {booking.invoiceId ? (
                        <span className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl border bg-purple-500/10 border-purple-500/20 text-purple-400 text-[10px] font-black uppercase tracking-wider">
                          <CheckSquare size={11} /> Service Completed
                        </span>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); handleStatus('completed'); }}
                          disabled={updating || booking.status === 'completed'}
                          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-40 ${
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
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl border bg-gold/10 border-gold/30 text-gold text-[10px] font-black uppercase tracking-wider hover:bg-gold/20 transition-all"
                        >
                          <Receipt size={11} /> View Invoice
                        </button>
                      ) : (
                        /* Create Bill — only when no invoice yet */
                        !booking.invoiceId && ['paid', 'confirmed', 'completed'].includes(booking.status) && onCreateBill && (
                          <button
                            onClick={e => { e.stopPropagation(); onCreateBill(booking); }}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500/20 transition-all"
                          >
                            <Receipt size={11} /> Create Bill
                          </button>
                        )
                      )}
                    </div>
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
    const disc = invoice.discountAmount > 0
      ? `<div class="row"><span>Discount (${invoice.discountPercent}%)</span><span style="color:#c00">-&#8377;${invoice.discountAmount.toLocaleString('en-IN')}</span></div>`
      : '';
    const commRows = Object.entries(
      invoice.items.reduce((acc: Record<string, number>, it) => {
        if (it.staffId) acc[it.staffName] = (acc[it.staffName] ?? 0) + it.commissionAmount;
        return acc;
      }, {})
    ).map(([name, amt]) =>
      `<div class="row sm"><span>${name}</span><span>&#8377;${(amt as number).toLocaleString('en-IN')}</span></div>`
    ).join('');
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
      </style></head><body>
      <div class="center" style="margin-bottom:8px">
        <div class="xl">Hair Tech</div><div class="bold">Unisex Salon, Araria</div>
        <div class="sm">+91 87896 03343</div>
        <div class="sm" style="margin-top:4px"><span class="badge">${invoice.source === 'online' ? 'Online Booking' : 'Walk-in'}</span></div>
      </div>
      <div class="dash"></div>
      <div class="sm">Invoice: <span class="bold">${invoice.invoiceNumber}</span></div>
      <div class="sm">${new Date().toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
      <div class="dash"></div>
      <div class="row"><span>Customer</span><span class="bold">${invoice.customerName}</span></div>
      <div class="row sm"><span>Phone</span><span>${invoice.customerPhone}</span></div>
      <div class="dash"></div>
      <div class="bold sm" style="margin-bottom:4px">SERVICES</div>
      ${invoice.items.map(it=>`
        <div style="margin:3px 0">
          <div class="row"><span>${it.serviceName}</span><span class="bold">&#8377;${it.price.toLocaleString('en-IN')}</span></div>
          ${it.staffName?`<div class="staff">Staff: ${it.staffName} · ${it.commissionRate}% = &#8377;${it.commissionAmount.toLocaleString('en-IN')}</div>`:''}
        </div>`).join('')}
      <div class="dash"></div>
      <div class="row"><span>Subtotal</span><span>&#8377;${invoice.subtotal.toLocaleString('en-IN')}</span></div>
      ${disc}
      <div class="row total"><span>TOTAL</span><span>&#8377;${invoice.total.toLocaleString('en-IN')}</span></div>
      <div class="row sm" style="margin-top:3px"><span>Payment</span><span class="bold" style="text-transform:uppercase">${invoice.paymentMethod}</span></div>
      ${invoice.paymentId?`<div class="row sm"><span>Razorpay ID</span><span>${invoice.paymentId}</span></div>`:''}
      ${commRows?`<div class="dash"></div><div class="sm bold">Staff Commission</div>${commRows}`:''}
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
            <div className="bg-white text-black rounded-2xl p-5 font-mono text-xs max-w-[320px] mx-auto shadow border border-gray-200">
              <div className="text-center mb-4">
                <p className="font-black text-xl uppercase tracking-tight">Hair Tech</p>
                <p className="font-bold text-sm">Unisex Salon, Araria</p>
                <p className="text-gray-400 text-[10px]">+91 87896 03343</p>
                <span className={`inline-block mt-1.5 text-[9px] px-2 py-0.5 rounded border font-bold ${
                  invoice.source === 'online' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}>{invoice.source === 'online' ? 'Online Booking' : 'Walk-in'}</span>
                <div className="mt-2 text-[9px] text-gray-400 space-y-0.5">
                  <p>Invoice: <span className="font-black text-black">{invoice.invoiceNumber}</span></p>
                </div>
              </div>
              <div className="border-t border-dashed border-gray-300 pt-3 mb-3 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-gray-500">Customer</span><span className="font-bold text-black">{invoice.customerName}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">Phone</span><span className="text-gray-700">{invoice.customerPhone}</span></div>
              </div>
              <div className="border-t border-dashed border-gray-300 pt-3 mb-3 space-y-2">
                <p className="text-[9px] font-black uppercase tracking-wider text-gray-500">Services</p>
                {invoice.items.map((item, i) => (
                  <div key={i} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-800 flex-1 pr-2 truncate">{item.serviceName}</span>
                      <span className="font-bold text-black shrink-0">₹{item.price.toLocaleString('en-IN')}</span>
                    </div>
                    {item.staffName && <p className="text-[9px] text-gray-400 pl-1">Staff: {item.staffName} · {item.commissionRate}% = ₹{item.commissionAmount.toLocaleString('en-IN')}</p>}
                  </div>
                ))}
              </div>
              <div className="border-t border-dashed border-gray-300 pt-3 space-y-1.5">
                <div className="flex justify-between text-xs text-gray-400"><span>Subtotal</span><span>₹{invoice.subtotal.toLocaleString('en-IN')}</span></div>
                {invoice.discountAmount > 0 && <div className="flex justify-between text-xs text-red-600"><span>Discount ({invoice.discountPercent}%)</span><span>-₹{invoice.discountAmount.toLocaleString('en-IN')}</span></div>}
                <div className="flex justify-between font-black text-sm pt-1.5 border-t border-dashed border-gray-300">
                  <span>TOTAL</span><span style={{ color: '#B8941F' }}>₹{invoice.total.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 pt-1"><span>Payment</span><span className="font-bold text-black uppercase">{invoice.paymentMethod}</span></div>
                {invoice.paymentId && <div className="flex justify-between text-[9px] text-gray-400"><span>ID</span><span className="font-mono truncate max-w-[140px]">{invoice.paymentId}</span></div>}
              </div>
              {invoice.items.some(i => i.commissionAmount > 0) && (
                <div className="border-t border-dashed border-gray-300 pt-2.5 mt-2.5">
                  <p className="text-[9px] text-gray-400 font-black uppercase tracking-wider mb-1">Staff Commission</p>
                  {Object.entries(invoice.items.reduce((acc: Record<string,number>, it) => {
                    if (it.staffId) acc[it.staffName] = (acc[it.staffName] ?? 0) + it.commissionAmount;
                    return acc;
                  }, {})).map(([name, amt]) => (
                    <div key={name} className="flex justify-between text-[10px] text-gray-400">
                      <span>{name}</span><span>₹{(amt as number).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t border-dashed border-gray-300 mt-4 pt-3 text-center text-[9px] text-gray-400">
                Thank you for visiting Hair Tech Salon!
              </div>
            </div>
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
  const [activeTab, setActiveTab]         = useState<'active' | 'pending' | 'completed'>('active');

  // ── Module navigation ─────────────────────────────────────────────────────
  type DashView = 'bookings' | 'insights' | 'billing' | 'staff' | 'customers' | 'tools';
  const [view, setView]                   = useState<DashView>('bookings');

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

  // Staff module state
  const [staff, setStaff]                 = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading]   = useState(false);
  const [staffForm, setStaffForm]         = useState<Partial<StaffMember> | null>(null);
  const [staffSaving,   setStaffSaving]   = useState(false);
  const [staffInvoices, setStaffInvoices] = useState<any[]>([]);
  const [staffSubView,  setStaffSubView]  = useState<'list' | 'analytics'>('list');
  const [toolsTab,      setToolsTab]      = useState<'services' | 'banners' | 'gallery' | 'coupons' | 'data'>('services');
  // Staff can't see admin-only tools tabs — fall back to banners
  useEffect(() => {
    if (isStaffMode && (toolsTab === 'services' || toolsTab === 'coupons')) setToolsTab('banners');
  }, [isStaffMode, toolsTab]);

  // Customers module state
  const [customers, setCustomers]               = useState<any[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerSubView,     setCustomerSubView]     = useState<'list' | 'analytics'>('list');
  const [customerSearch,      setCustomerSearch]      = useState('');
  const [customerSourceFilter,setCustomerSourceFilter]= useState<'all'|'online'|'walkin'|'both'>('all');
  const [staffSearch,         setStaffSearch]         = useState('');

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
              return { id: c.doc.id, ...c.doc.data() } as Booking;
            });

          // Notify for: newly-added paid/confirmed bookings + pending→paid transitions
          const toNotify = [
            ...addedBookings.filter(b => b.status !== 'pending'),
            ...justPaidBookings,
          ];

          if (toNotify.length > 0) {
            setNewBookingQueue(prev => [...prev, ...toNotify]);
            toNotify.forEach(b => fireDesktopNotification(b));
          }
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
    return () => unsub();
  }, [user.uid, user.email, refreshKey]);

  const handleStatusChange = async (id: string, status: BookingStatus) => {
    await updateDoc(doc(db, 'bookings', id), { status, updatedAt: serverTimestamp() });
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

  // Per-staff commission stats derived from invoices
  const staffStats = useMemo(() => {
    const map: Record<string, { services: number; commission: number }> = {};
    staffInvoices.forEach(inv => {
      (inv.items ?? []).forEach((item: any) => {
        if (!item.staffId) return;
        if (!map[item.staffId]) map[item.staffId] = { services: 0, commission: 0 };
        map[item.staffId].services++;
        map[item.staffId].commission += item.commissionAmount ?? 0;
      });
    });
    return map;
  }, [staffInvoices]);

  // Load invoices when billing view opens
  useEffect(() => {
    if (view !== 'billing') return;
    setBillingLoading(true);
    getDocs(query(collection(db, 'invoices'), orderBy('createdAt', 'desc'), limit(100)))
      .then(snap => {
        setBillingInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice & { id: string })));
      })
      .catch(console.error)
      .finally(() => setBillingLoading(false));
  }, [view]);

  // Billing tab stats — filtered by selected period or custom date range
  const billingStats = useMemo(() => {
    const now = new Date();
    const start = new Date();
    let endDate: Date | null = null;

    if (billingFrom && billingTo) {
      const f = new Date(billingFrom); f.setHours(0,0,0,0);
      const t = new Date(billingTo);   t.setHours(23,59,59,999);
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

    // Revenue by payment method
    const pmRevenue: Record<string, number> = {};
    periodInvoices.forEach(inv => {
      const pm = inv.paymentMethod ?? 'cash';
      pmRevenue[pm] = (pmRevenue[pm] ?? 0) + (inv.total ?? 0);
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

    return { totalRevenue, count, avgBill, onlineCount, walkinCount, pmRevenue, displayed };
  }, [billingInvoices, billingPeriod, billingFrom, billingTo, billingSearch]);

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
      serviceNames:  booking.serviceNames ?? '',
      totalAmount:   booking.totalAmount ?? 0,
      paymentId:     booking.paymentId,
      bookingTime:   booking.bookingTime,
      paymentMethod: booking.paymentMethod,
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
    try { getAudioContext().resume(); } catch {}
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

  // ── Derived stats — all computed from the selected period ─────────────────
  const stats = useMemo(() => {
    const now   = new Date();
    const start = new Date();
    // Custom date range overrides the period preset
    let end: Date | null = null;
    if (insightsFrom && insightsTo) {
      const fromD = new Date(insightsFrom); fromD.setHours(0,0,0,0);
      const toD   = new Date(insightsTo);   toD.setHours(23,59,59,999);
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
      start.setFullYear(2000); // 'all' — far past
    }

    // Filter bookings that fall within the selected period
    // Uses createdAt (Firestore Timestamp) as the primary filter
    const inPeriod = (b: Booking) => {
      if (!b.createdAt) return period === 'all' && !insightsFrom;
      const d = b.createdAt.toDate();
      return d >= start && (end ? d <= end : true);
    };

    const periodBookings = bookings.filter(inPeriod);

    // Revenue bookings = paid or confirmed within period
    const revenueBookings = periodBookings.filter(
      b => b.status === 'paid' || b.status === 'confirmed' || b.status === 'completed'
    );
    const totalRevenue    = revenueBookings.reduce((a, b) => a + (b.totalAmount ?? 0), 0);
    const invoiceCount    = revenueBookings.length;
    const avgBill         = invoiceCount > 0 ? totalRevenue / invoiceCount : 0;

    // Pending (amount expected but not yet paid)
    const pendingBookings = periodBookings.filter(b => b.status === 'pending');
    const amountDue       = pendingBookings.reduce((a, b) => a + (b.totalAmount ?? 0), 0);

    // Today's bookings (always absolute, regardless of period filter)
    const todayStr        = now.toDateString();
    const todayCount      = bookings.filter(
      b => b.bookingDate && new Date(b.bookingDate).toDateString() === todayStr
    ).length;

    // Unique customers in period (by phone)
    const uniqueCustomers = new Set(periodBookings.map(b => b.customerPhone).filter(Boolean)).size;

    // Completed in period
    const completedCount  = periodBookings.filter(b => b.status === 'completed').length;

    // Previous period for trend comparison
    const prevStart = new Date(start);
    const prevEnd   = new Date(start);
    if (period === 'today') {
      prevStart.setDate(prevStart.getDate() - 1);
    } else if (period === 'week') {
      prevStart.setDate(prevStart.getDate() - 7);
    } else if (period === 'month') {
      prevStart.setMonth(prevStart.getMonth() - 1);
    }

    const prevBookings = period === 'all' ? [] : bookings.filter(b => {
      if (!b.createdAt) return false;
      const d = b.createdAt.toDate();
      return d >= prevStart && d < start;
    });
    const prevRevenue = prevBookings
      .filter(b => b.status === 'paid' || b.status === 'confirmed' || b.status === 'completed')
      .reduce((a, b) => a + (b.totalAmount ?? 0), 0);

    const revenueTrend = prevRevenue === 0
      ? null
      : Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100);

    // Revenue by day (for sparkline — last 7 or 30 days depending on period)
    const chartDays = period === 'today' ? 1 : period === 'week' ? 7 : 30;
    const revenueByDay: { label: string; amount: number; bookings: number }[] = [];
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const dayBookings = bookings.filter(b => {
        if (!b.createdAt) return false;
        const bd = b.createdAt.toDate();
        return bd >= d && bd < next &&
          (b.status === 'paid' || b.status === 'confirmed' || b.status === 'completed');
      });
      revenueByDay.push({
        label:    period === 'today' ? 'Today' : `${d.getDate()}/${d.getMonth() + 1}`,
        amount:   dayBookings.reduce((a, b) => a + (b.totalAmount ?? 0), 0),
        bookings: dayBookings.length,
      });
    }

    // Top services — count frequency
    const serviceCounts: Record<string, { count: number; revenue: number }> = {};
    revenueBookings.forEach(b => {
      (b.serviceNames ?? '').split(',').forEach(s => {
        const name = s.trim();
        if (!name) return;
        if (!serviceCounts[name]) serviceCounts[name] = { count: 0, revenue: 0 };
        serviceCounts[name].count++;
        serviceCounts[name].revenue += (b.totalAmount ?? 0) / ((b.serviceNames ?? '').split(',').length);
      });
    });
    const topServices = Object.entries(serviceCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, { count, revenue }]) => ({ name, count, revenue: Math.round(revenue) }));

    // ── Collection rate — paid+confirmed+completed / all invoiced ─────────────
    const collectedAmount  = revenueBookings
      .filter(b => b.status !== 'pending')
      .reduce((a, b) => a + (b.totalAmount ?? 0), 0);
    const collectionRate   = totalRevenue > 0
      ? Math.round((collectedAmount / totalRevenue) * 100) : 0;

    // ── Status breakdown for donut chart ────────────────────────────────────
    const statusBreakdown: { status: BookingStatus; count: number; color: string }[] = [
      { status: 'confirmed',  count: periodBookings.filter(b => b.status === 'confirmed').length,  color: '#3b82f6' },
      { status: 'paid',       count: periodBookings.filter(b => b.status === 'paid').length,       color: '#10b981' },
      { status: 'completed',  count: periodBookings.filter(b => b.status === 'completed').length,  color: '#a855f7' },
      { status: 'pending',    count: periodBookings.filter(b => b.status === 'pending').length,    color: '#f59e0b' },
      { status: 'failed',     count: periodBookings.filter(b => b.status === 'failed').length,     color: '#ef4444' },
    ].filter(s => s.count > 0);

    // ── Peak hours — count bookings per hour slot ────────────────────────────
    const hourCounts: Record<number, number> = {};
    periodBookings.forEach(b => {
      if (!b.startTime) return;
      const h = new Date(b.startTime).getHours();
      hourCounts[h] = (hourCounts[h] ?? 0) + 1;
    });
    const peakHours = Array.from({ length: 12 }, (_, i) => {
      const h = i + 10; // 10 AM – 9 PM
      return { hour: h, label: h > 12 ? `${h-12}PM` : h === 12 ? '12PM' : `${h}AM`, count: hourCounts[h] ?? 0 };
    });
    const maxHourCount = Math.max(...peakHours.map(h => h.count), 1);

    // ── Customer return rate — phone numbers with 2+ bookings (all time) ────
    const phoneCounts: Record<string, number> = {};
    bookings.forEach(b => {
      const p = b.customerPhone ?? '';
      if (p) phoneCounts[p] = (phoneCounts[p] ?? 0) + 1;
    });
    const returningCustomers = Object.values(phoneCounts).filter(c => c >= 2).length;
    const totalCustomers     = Object.keys(phoneCounts).length;
    const returnRate         = totalCustomers > 0 ? Math.round((returningCustomers / totalCustomers) * 100) : 0;

    // ── Today's schedule — appointments sorted by startTime ─────────────────
    const todayISO = new Date().toISOString().slice(0, 10);
    const todaySchedule = bookings
      .filter(b => {
        const d = b.startTime ? b.startTime.slice(0, 10) : (b.bookingDate ?? '').slice(0, 10);
        return d === todayISO && b.status !== 'failed';
      })
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));

    return {
      // Core metrics
      totalRevenue, invoiceCount, avgBill, amountDue,
      todayCount, uniqueCustomers, completedCount,
      pendingCount: pendingBookings.length,
      totalBookings: periodBookings.length,
      // Collection
      collectedAmount, collectionRate,
      // Trend
      revenueTrend, prevRevenue,
      // Charts
      revenueByDay, topServices, statusBreakdown, peakHours, maxHourCount,
      // Customers
      returningCustomers, totalCustomers, returnRate,
      // Schedule
      todaySchedule,
    };
  }, [bookings, period, insightsFrom, insightsTo]);

  // ── Service drill-down stats ──────────────────────────────────────────────
  const serviceDrillStats = useMemo(() => {
    if (!expandedService) return null;
    const now = new Date();
    const start = new Date();
    if      (serviceDrillPeriod === 'today') { start.setHours(0,0,0,0); }
    else if (serviceDrillPeriod === 'week')  { start.setDate(now.getDate()-7); start.setHours(0,0,0,0); }
    else if (serviceDrillPeriod === 'month') { start.setDate(1); start.setHours(0,0,0,0); }
    else if (serviceDrillPeriod === 'year')  { start.setMonth(0,1); start.setHours(0,0,0,0); }
    else { start.setFullYear(2000); }

    const relevant = bookings.filter(b => {
      const inPeriod = !b.createdAt || b.createdAt.toDate() >= start;
      return inPeriod && (b.serviceNames ?? '').split(',').some(s => s.trim() === expandedService);
    });

    const groups: Record<string, number> = {};
    relevant.forEach(b => {
      const d = b.createdAt?.toDate() ?? new Date();
      const key = serviceDrillPeriod === 'today'
        ? `${d.getHours()}:00`
        : (serviceDrillPeriod === 'year' || serviceDrillPeriod === 'all')
          ? d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'})
          : d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
      groups[key] = (groups[key] ?? 0) + 1;
    });

    return {
      total:     relevant.length,
      revenue:   relevant.reduce((a, b) => a + ((b as any).finalAmount ?? b.totalAmount ?? 0), 0),
      chartData: Object.entries(groups).map(([label, count]) => ({ label, count })),
    };
  }, [expandedService, serviceDrillPeriod, bookings]);

  // ── Split bookings into three tabs ───────────────────────────────────────────
  // pending   = payment not yet completed (status === 'pending')
  // active    = payment done, service not yet completed
  // completed = service done
  const pendingTabBookings = useMemo(() => bookings.filter(b => b.status === 'pending'),   [bookings]);
  const activeBookings     = useMemo(() => bookings.filter(b => b.status !== 'completed' && b.status !== 'pending'), [bookings]);
  const completedBookings  = useMemo(() => bookings.filter(b => b.status === 'completed'), [bookings]);

  // ── Filtered + sorted bookings ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = activeTab === 'completed' ? [...completedBookings]
             : activeTab === 'pending'   ? [...pendingTabBookings]
             :                            [...activeBookings];
    if (statusFilter !== 'all' && activeTab === 'active') list = list.filter(b => b.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        (b.customerName  ?? '').toLowerCase().includes(q) ||
        (b.customerPhone ?? '').includes(q) ||
        (b.customerEmail ?? '').toLowerCase().includes(q) ||
        (b.paymentId     ?? '').toLowerCase().includes(q)
      );
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
  }, [bookings, activeTab, statusFilter, search, sortKey, sortDir, pendingTabBookings, completedBookings, activeBookings]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? (sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />)
      : <ChevronDown size={12} className="opacity-20" />;

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
              <p className="text-gray-400 text-[9px] uppercase tracking-widest">
                {isStaffMode ? 'Staff Portal' : 'Admin'}
              </p>
            </div>
            {isStaffMode ? (
              <span className="ml-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-[9px] text-blue-400 font-black uppercase tracking-widest">
                {staffMember?.name ?? 'Staff'}
              </span>
            ) : (
              <span className="ml-1 px-2 py-0.5 bg-gold/10 border border-gold/20 rounded-full text-[9px] text-gold font-black uppercase tracking-widest">Live</span>
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
              <button key={tab.id} onClick={() => setView(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                  view === tab.id
                    ? 'bg-gold text-black shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/8'
                }`}
              >
                {tab.icon}
                <span className="hidden md:inline">{tab.label}</span>
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
                  <span className="text-[9px] text-gray-400 font-bold hidden lg:block">
                    Showing last 90 days
                  </span>
                )}
                <button
                  onClick={() => { setIsRefreshing(true); setRefreshKey(k => k + 1); }}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/8 border border-white/10 rounded-xl text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/8 transition-all disabled:opacity-40"
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
            <p className="text-gray-400 text-xs">
              {insightsFrom && insightsTo
                ? `Custom range: ${new Date(insightsFrom).toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – ${new Date(insightsTo).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}`
                : 'All metrics computed for the selected period'}
            </p>
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
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
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
                className="bg-transparent text-[10px] text-white focus:outline-none w-24 [color-scheme:dark]"
              />
              <span className="text-gray-400 text-[10px]">–</span>
              <input
                type="date" value={insightsTo} min={insightsFrom}
                onChange={e => setInsightsTo(e.target.value)}
                className="bg-transparent text-[10px] text-white focus:outline-none w-24 [color-scheme:dark]"
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
            <p className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5">Total Revenue</p>
            <p className="text-2xl font-black text-white leading-none mb-1">
              ₹{stats.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[10px] text-gray-500">{stats.invoiceCount} paid bookings</p>
            {stats.revenueTrend !== null && (
              <span className={`absolute top-4 right-4 flex items-center gap-0.5 text-[10px] font-black ${stats.revenueTrend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
            <p className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5">Collected</p>
            <p className="text-2xl font-black text-white leading-none mb-1">
              ₹{(stats.totalRevenue - stats.amountDue).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[10px] text-gray-500">Payments received</p>
          </motion.div>

          {/* Avg Bill */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-amber-500 rounded-t-2xl" />
            <p className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5">Avg Bill</p>
            <p className="text-2xl font-black text-white leading-none mb-1">
              ₹{Math.round(stats.avgBill).toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-gray-500">Per invoice</p>
          </motion.div>

          {/* Amount Due */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-zinc-900 border border-red-500/30 rounded-2xl p-5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-red-500 rounded-t-2xl" />
            <p className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5">Amount Due</p>
            <p className="text-2xl font-black text-white leading-none mb-1">
              ₹{stats.amountDue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[10px] text-gray-500">Pending collection</p>
          </motion.div>
        </div>

        {/* Row 2 — operational metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Appointments',   value: stats.totalBookings.toString(),    sub: `${stats.todayCount} today`,         icon: <Calendar size={16} />,    color: 'text-gold' },
            { label: 'Clients',        value: stats.uniqueCustomers.toString(),  sub: 'Unique by phone',                    icon: <Users size={16} />,       color: 'text-purple-400' },
            { label: 'Pending',        value: stats.pendingCount.toString(),     sub: 'Awaiting payment',                   icon: <Clock size={16} />,       color: 'text-amber-400' },
            { label: 'Completed',      value: stats.completedCount.toString(),   sub: 'Services done',                      icon: <ListChecks size={16} />,  color: 'text-emerald-400' },
            { label: 'Avg / Day',
              value: stats.revenueByDay.length > 0
                ? `₹${Math.round(stats.revenueByDay.reduce((a,b)=>a+b.amount,0) / Math.max(1, stats.revenueByDay.filter(d=>d.amount>0).length)).toLocaleString('en-IN')}`
                : '₹0',
              sub: 'On active days', icon: <BarChart3 size={16} />, color: 'text-blue-400' },
          ].map(({ label, value, sub, icon, color }) => (
            <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-900 border border-white/12 rounded-2xl p-4 flex items-center gap-3"
            >
              <div className={`p-2 bg-white/8 rounded-xl ${color} shrink-0`}>{icon}</div>
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-widest font-black text-gray-500 truncate">{label}</p>
                <p className="text-xl font-black text-white leading-none">{value}</p>
                <p className="text-[9px] text-gray-400 mt-0.5 truncate">{sub}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Row 3 — Revenue trend + Status donut + Collection rate */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

          {/* Revenue bar chart */}
          <div className="lg:col-span-2 bg-zinc-900 border border-white/12 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-black text-gray-500">Revenue Trend</p>
                <p className="text-white font-black text-sm">
                  {period === 'today' ? 'Today' : period === 'week' ? 'Last 7 Days' : period === 'month' ? 'This Month' : 'All Time'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-gold font-black text-lg">₹{stats.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                {stats.revenueTrend !== null && (
                  <p className={`text-[10px] font-bold flex items-center justify-end gap-0.5 ${stats.revenueTrend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
                            <div className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-[9px] text-white font-bold whitespace-nowrap shadow-xl space-y-0.5">
                              <p className="text-gold">₹{d.amount.toLocaleString('en-IN')}</p>
                              <p className="text-gray-400">{d.bookings} booking{d.bookings !== 1 ? 's' : ''}</p>
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
                    <span className="text-[9px] text-gray-700 font-bold">₹0</span>
                    <span className="text-[9px] text-gray-700 font-bold">₹{maxAmt.toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
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
              <p className="text-[10px] uppercase tracking-widest font-black text-gray-500 mb-3">Booking Breakdown</p>
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
                          <span className="text-[10px] text-gray-400 capitalize truncate">{STATUS_META[status].label}</span>
                          <span className="text-[10px] font-black text-white ml-auto">{count}</span>
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
                <p className="text-[10px] uppercase tracking-widest font-black text-gray-500">Collection Rate</p>
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
              <p className="text-[9px] text-gray-400 mt-1.5">
                ₹{stats.collectedAmount.toLocaleString('en-IN')} collected of ₹{stats.totalRevenue.toLocaleString('en-IN')}
              </p>
            </div>

            {/* Return customer rate */}
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase tracking-widest font-black text-gray-500">Returning Customers</p>
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
              <p className="text-[9px] text-gray-400 mt-1.5">
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
              <p className="text-[10px] uppercase tracking-widest font-black text-gray-500">Top Services</p>
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
                        onClick={() => setExpandedService(isOpen ? null : name)}
                        className={`w-full text-left group transition-all rounded-xl px-2 py-2 ${isOpen ? 'bg-gold/8' : 'hover:bg-zinc-800/40'}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[9px] font-black w-3 ${isOpen ? 'text-gold' : 'text-gray-400'}`}>{i + 1}</span>
                            <span className={`text-xs font-medium truncate ${isOpen ? 'text-gold' : 'text-gray-300 group-hover:text-white'}`}>{name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <span className="text-[10px] font-black text-white">{count}×</span>
                            <span className="text-[9px] text-gray-400">₹{revenue.toLocaleString('en-IN')}</span>
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
                              {/* Period tabs */}
                              <div className="flex items-center gap-1 flex-wrap">
                                {(['today','week','month','year','all'] as const).map(p => (
                                  <button key={p}
                                    onClick={e => { e.stopPropagation(); setServiceDrillPeriod(p); }}
                                    className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${
                                      serviceDrillPeriod === p ? 'bg-gold/25 text-gold' : 'text-gray-400 hover:text-white'
                                    }`}>
                                    {p === 'today' ? 'Today' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : p === 'year' ? 'Year' : 'All'}
                                  </button>
                                ))}
                              </div>

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
                                    <p className="text-[10px] text-gray-400 text-center py-2">No bookings in this period</p>
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
            <p className="text-[10px] uppercase tracking-widest font-black text-gray-500 mb-4">Peak Hours</p>
            <div className="space-y-2">
              {stats.peakHours.map(({ label, count }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-400 font-bold w-10 shrink-0">{label}</span>
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
                      <span className="absolute inset-0 flex items-center pl-2 text-[9px] font-black text-white">
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
              <p className="text-[10px] uppercase tracking-widest font-black text-gray-500">Today's Schedule</p>
              <span className="text-[9px] font-black text-gold px-2 py-0.5 bg-gold/10 border border-gold/20 rounded-full">
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
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">{b.serviceNames ?? '—'}</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">{b.bookingTime ?? '—'}</p>
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
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-xl text-black font-black text-[10px] uppercase tracking-widest transition-all shrink-0"
            >
              <CheckSquare size={12} /> Confirm All
            </button>
          </motion.div>
        )}

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 mb-4 bg-zinc-900 border border-white/12 rounded-2xl p-1.5 w-fit flex-wrap">
          {([
            { id: 'active',    label: 'Active',    count: activeBookings.length,      icon: <Clock size={13} />,       activeStyle: 'bg-gold/10 border border-gold/20 text-gold' },
            { id: 'pending',   label: 'Pending',   count: pendingTabBookings.length,  icon: <AlertCircle size={13} />, activeStyle: 'bg-amber-500/20 border border-amber-500/30 text-amber-400' },
            { id: 'completed', label: 'Completed', count: completedBookings.length,   icon: <ListChecks size={13} />,  activeStyle: 'bg-purple-500/20 border border-purple-500/30 text-purple-400' },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id as any); setStatusFilter('all'); setSearch(''); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === tab.id
                  ? tab.activeStyle
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {tab.icon} {tab.label}
              <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${
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
                  className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${
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
                  The dashboard can't read bookings. Most likely the <code className="text-gold bg-gold/10 px-1 py-0.5 rounded text-[10px]">admins/{user.uid}</code> document doesn't exist yet.
                </p>
              </div>
            </div>

            {/* UID copy box */}
            <div className="bg-black/40 border border-white/10 rounded-xl p-4 mb-4">
              <p className="text-[9px] uppercase tracking-widest font-black text-gray-500 mb-2">Your Firebase UID (use this as the Document ID)</p>
              <div className="flex items-center gap-3">
                <code className="text-gold font-mono text-sm flex-1 break-all">{user.uid}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(user.uid)}
                  className="px-3 py-1.5 bg-gold/10 border border-gold/20 rounded-lg text-gold text-[10px] font-black uppercase tracking-wider hover:bg-gold/20 transition-all shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Step-by-step instructions */}
            <div className="space-y-2">
              <p className="text-[9px] uppercase tracking-widest font-black text-gray-500 mb-3">Fix in 3 steps</p>
              {[
                'Go to Firebase Console → Firestore Database → Data tab',
                'Create (or open) the "admins" collection',
                `Add a document with ID = ${user.uid} and fields: { email: "${user.email}", role: "admin" }`,
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
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
                        className={`py-3 px-5 text-left text-[10px] font-black uppercase tracking-widest text-gray-300 select-none
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
                      <BookingRow key={booking.id} booking={booking} onStatusChange={handleStatusChange} onCreateBill={openBillingFromBooking} onViewInvoice={id => setInvoiceModalId(id)} onConfirmPayment={confirmWithPaymentId} onMarkPayAtSalon={markPayAtSalon} />
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>

              <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase tracking-widest">
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
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
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
                  className="bg-transparent text-[10px] text-white focus:outline-none w-24 [color-scheme:dark]"
                />
                <span className="text-gray-400 text-[10px]">–</span>
                <input
                  type="date" value={billingTo} min={billingFrom}
                  onChange={e => setBillingTo(e.target.value)}
                  className="bg-transparent text-[10px] text-white focus:outline-none w-24 [color-scheme:dark]"
                />
                {billingFrom && (
                  <button onClick={() => { setBillingFrom(''); setBillingTo(''); }}
                    className="text-gray-400 hover:text-white transition-colors ml-1">
                    <X size={11} />
                  </button>
                )}
              </div>
              {billingFrom && billingTo && (
                <span className="text-[10px] text-gold font-bold">
                  {new Date(billingFrom).toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – {new Date(billingTo).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                </span>
              )}
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
                <p className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1.5">{label}</p>
                <p className="text-2xl font-black text-white leading-none mb-1">{value}</p>
                <p className="text-[10px] text-gray-400">{sub}</p>
              </div>
            ))}
          </div>

          {/* ── Payment method breakdown ── */}
          {Object.keys(billingStats.pmRevenue).length > 0 && (
            <div className="bg-zinc-900 border border-white/12 rounded-2xl p-5">
              <p className="text-[10px] uppercase tracking-widest font-black text-gray-500 mb-4">Revenue by Payment Method</p>
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
                        <span className="text-[10px] font-black text-gray-400 uppercase w-16 shrink-0">{pm}</span>
                        <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%`, transition: 'width 0.6s ease' }} />
                        </div>
                        <span className="text-xs font-black text-white w-20 text-right shrink-0">₹{(amt as number).toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
                        <span className="text-[10px] text-gray-400 w-8 text-right shrink-0">{pct}%</span>
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
                          <th key={h} className="py-3 px-4 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {billingStats.displayed.map(inv => {
                        const isExpanded = expandedInv === (inv as any).id;
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
                                <p className="text-gold text-[10px] font-black font-mono">{inv.invoiceNumber}</p>
                              </td>
                              <td className="py-3 px-4">
                                <p className="text-white text-xs font-bold">{inv.customerName}</p>
                                <p className="text-gray-400 text-[9px]">{inv.customerPhone}</p>
                              </td>
                              <td className="py-3 px-4 text-gray-400 text-xs">{invDate}</td>
                              <td className="py-3 px-4 hidden lg:table-cell">
                                <p className="text-gray-400 text-[10px] max-w-[160px] truncate">{services}</p>
                              </td>
                              <td className="py-3 px-4">
                                <p className="text-white font-black text-sm">₹{(inv.total ?? 0).toLocaleString('en-IN')}</p>
                                {inv.discountAmount > 0 && (
                                  <p className="text-red-400 text-[9px]">-₹{inv.discountAmount.toLocaleString('en-IN')} disc.</p>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${pmStyle}`}>
                                  {(inv.paymentMethod ?? 'cash').toUpperCase()}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                                  inv.source === 'online'
                                    ? 'text-blue-400 bg-blue-400/10 border-blue-400/20'
                                    : 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                                }`}>
                                  {inv.source === 'online' ? '🌐 Online' : '🏪 Walk-in'}
                                </span>
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
                                  <span className="text-gray-700 group-hover:text-gray-500 transition-colors">
                                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                  </span>
                                </div>
                              </td>
                            </tr>
                            {/* Expanded row — line items */}
                            {isExpanded && (
                              <tr key={`${(inv as any).id}-exp`}>
                                <td colSpan={8} className="p-0">
                                  <div className="px-6 py-4 bg-zinc-800/60 border-b border-white/10 space-y-2">
                                    <p className="text-[9px] uppercase tracking-widest font-black text-gray-400 mb-2">Line Items</p>
                                    {inv.items?.map((it: BillItem, i: number) => (
                                      <div key={i} className="flex items-center justify-between gap-3 text-xs">
                                        <div className="flex-1 min-w-0">
                                          <span className="text-gray-300">{it.serviceName}</span>
                                          {it.staffName && <span className="text-gray-400 ml-2">— {it.staffName} ({it.commissionRate}%)</span>}
                                        </div>
                                        <span className="text-white font-bold shrink-0">₹{it.price.toLocaleString('en-IN')}</span>
                                      </div>
                                    ))}
                                    {inv.discountAmount > 0 && (
                                      <div className="flex justify-between text-xs text-red-400 pt-1 border-t border-white/10">
                                        <span>Discount ({inv.discountPercent}%)</span>
                                        <span>-₹{inv.discountAmount.toLocaleString('en-IN')}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  <span>{billingStats.displayed.length} invoices shown</span>
                  <span>₹{billingStats.totalRevenue.toLocaleString('en-IN',{maximumFractionDigits:0})} total</span>
                </div>
              </>
            )}
          </div>
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                  staffSubView === 'list'
                    ? 'bg-gold/15 border border-gold/25 text-gold'
                    : 'text-gray-500 hover:text-white'
                }`}>
                <Users size={12}/> Staff List
              </button>
              <button onClick={() => setStaffSubView('analytics')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
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
              <p className="text-[10px] uppercase tracking-widest font-black text-gold">My Profile</p>
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
                  <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">My Commission Rate</p>
                </div>
                {(staffMember as any).salary > 0 && (
                  <div className="text-center p-3 bg-white/8 rounded-xl">
                    <p className="text-white font-black text-lg">₹{((staffMember as any).salary ?? 0).toLocaleString('en-IN')}</p>
                    <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">Monthly Salary</p>
                  </div>
                )}
                {(() => {
                  const stat = staffStats[staffMember.id] ?? { services: 0, commission: 0 };
                  const salary = (staffMember as any).salary ?? 0;
                  return (
                    <>
                      <div className="text-center p-3 bg-white/8 rounded-xl">
                        <p className="text-white font-black text-lg">{stat.services}</p>
                        <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">Services Done</p>
                      </div>
                      <div className="text-center p-3 bg-gold/10 border border-gold/20 rounded-xl">
                        <p className="text-gold font-black text-lg">₹{stat.commission.toLocaleString('en-IN')}</p>
                        <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">Commission Earned</p>
                      </div>
                      <div className="text-center p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl col-span-2 sm:col-span-1">
                        <p className="text-emerald-400 font-black text-lg">₹{(salary + stat.commission).toLocaleString('en-IN')}</p>
                        <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">Total Payable</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Admin only: add staff + manage all staff */}
          {!isStaffMode && (<>
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
                <p className="text-[10px] uppercase font-black tracking-widest text-gold">{staffForm.id ? 'Edit Staff' : 'New Staff Member'}</p>
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
                    <label className="text-[10px] font-black uppercase tracking-widest text-gold block mb-1.5">Staff Portal Login Email</label>
                    <input type="email"
                      placeholder="staff@example.com"
                      value={(staffForm as any).email ?? ''}
                      onChange={e => setStaffForm(f => ({ ...f, email: e.target.value.trim() } as any))}
                      className="w-full bg-white/8 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
                    />
                    <p className="text-[9px] text-gray-400 mt-1">Staff logs in at /admin with this email + a password you set in Firebase Console.</p>
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
                  {s.role && <p className="text-gray-500 text-[10px] mt-0.5">{s.role}</p>}
                  {s.phone && <p className="text-gray-400 text-[10px]">{s.phone}</p>}
                  {/* Salary + commission row */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-gold font-black">
                      <Percent size={9} /> {s.commissionRate}% commission
                    </span>
                    {(s as any).salary > 0 && (
                      <span className="text-[10px] text-gray-400 font-bold">
                        ₹{((s as any).salary ?? 0).toLocaleString('en-IN')}/mo salary
                      </span>
                    )}
                    {!s.isActive && (
                      <span className="ml-auto text-[9px] text-gray-400 font-black uppercase">Inactive</span>
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
                          <p className="text-[9px] text-gray-400 uppercase">Services</p>
                        </div>
                        <div className="text-center p-2 bg-white/8 rounded-xl">
                          <p className="text-gold font-black text-sm">₹{stat.commission.toLocaleString('en-IN')}</p>
                          <p className="text-[9px] text-gray-400 uppercase">Commission</p>
                        </div>
                        <div className="text-center p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                          <p className="text-emerald-400 font-black text-sm">₹{totalPayable.toLocaleString('en-IN')}</p>
                          <p className="text-[9px] text-emerald-600 uppercase">Total Pay</p>
                        </div>
                      </div>
                      {(salary > 0 || stat.commission > 0) && (
                        <p className="text-[9px] text-gray-700 text-center">
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                customerSubView === 'list'
                  ? 'bg-gold/15 border border-gold/25 text-gold'
                  : 'text-gray-500 hover:text-white'
              }`}>
              <Users size={12}/> Customers
            </button>
            <button onClick={() => setCustomerSubView('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
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
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase border transition-all ${active ? activeCls : cls}`}>
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
                      <th key={h} className="py-3 px-4 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c: any) => {
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
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${sm.cls}`}>
                            {sm.label}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
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
              <div className="px-5 py-3 border-t border-white/10 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                {filtered.length} of {customers.length} · ₹{customers.reduce((a: number, c: any) => a + (c.totalSpend ?? 0), 0).toLocaleString('en-IN')} combined spend
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
              { id: 'services', label: 'Services',    icon: <Scissors  size={12}/>, adminOnly: true  },
              { id: 'banners',  label: 'Banners',     icon: <Wrench    size={12}/>, adminOnly: false },
              { id: 'gallery',  label: 'Gallery',     icon: <BarChart  size={12}/>, adminOnly: false },
              { id: 'coupons',  label: 'Coupons',     icon: <Percent   size={12}/>, adminOnly: true  },
              { id: 'data',     label: 'Import/Export', icon: <Download  size={12}/>, adminOnly: true  },
            ] as const).filter(t => !t.adminOnly || !isStaffMode).map(t => (
              <button key={t.id} onClick={() => setToolsTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
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
          {toolsTab === 'banners'  && <BannerManager />}
          {toolsTab === 'gallery'  && <GalleryManager />}
          {toolsTab === 'coupons'  && !isStaffMode && <CouponManager />}
          {toolsTab === 'data'     && !isStaffMode && <DataIO />}
        </div>
      )}

      {/* ── Walk-in booking modal ── */}
      <AnimatePresence>
        {walkInOpen && (
          <WalkInBooking
            user={user}
            staffMember={staffMember ?? undefined}
            onClose={() => setWalkInOpen(false)}
            onCreated={(_id) => {
              setWalkInOpen(false);
              // Live onSnapshot listener picks up the new booking automatically.
              setActiveTab('active');
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Billing module modal — rendered over everything ── */}
      <AnimatePresence>
        {billingOpen && (
          <BillingModule
            prefill={billingPrefill}
            onClose={() => { setBillingOpen(false); setBillingPrefill(null); }}
            onInvoiceCreated={(inv) => {
              setBillingOpen(false);
              setBillingPrefill(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Walk-In Booking modal ── */}
      {walkInOpen && <WalkInBooking onClose={() => setWalkInOpen(false)} />}

      {/* ── Invoice view modal ── */}
      {invoiceModalId && (
        <InvoiceModal invoiceId={invoiceModalId} onClose={() => setInvoiceModalId(null)} />
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
        if (role === 'super_admin') {
          setIsAdminUser(true);
          setStaffMember(null);

        } else if (role === 'staff') {
          setIsAdminUser(false);
          // Use the logged-in email to find the matching staff document.
          // No staffId needed in the admins doc — just { role: 'staff' } is enough.
          // The staff document must have email matching u.email.
          if (u.email) {
            const staffQuery = await getDocs(
              query(collection(db, 'staff'),
                where('email', '==', u.email),
                where('isActive', '==', true)
              )
            );
            if (!staffQuery.empty) {
              const sd = staffQuery.docs[0];
              setStaffMember({ id: sd.id, ...(sd.data() as Omit<StaffMember, 'id'>) });
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

  return <Dashboard user={user} staffMember={staffMember ?? undefined} />;
}





