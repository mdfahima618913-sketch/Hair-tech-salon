/**
 * StaffPortal.tsx
 * Mobile-first staff portal. Bilingual via LanguageContext (English default, Hindi toggle).
 * Focused on appointments — booking, follow-up calls, reschedule, assign/reassign.
 * No billing or commission — kept simple for low-literacy staff use.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CalendarDays, User, LogOut, Loader2, Wallet,
  Sun, Coffee, Moon, CloudSun, CalendarPlus, Home, Scissors,
  Phone, RefreshCw, Edit2, X, Check, CalendarCheck, CheckSquare, Clock, MessageSquare, Send,
  Bell, AlertCircle, PhoneOff, Receipt,
} from 'lucide-react';
import { collection, query, where, orderBy, getDocs, getDoc, onSnapshot, doc, updateDoc, limit, arrayUnion, Timestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import WalkInBooking from './WalkInBooking';
import BillingModule, { type StaffMember, type OnlineBookingPrefill } from './BillingModule';
import { useLanguage } from '../lib/LanguageContext';
import LanguageToggle from './LanguageToggle';
import { format, addDays, isSameDay, isToday, startOfDay } from 'date-fns';
import { startRinging, stopRinging, fireDesktopNotification, requestNotificationPermission } from '../lib/notificationSound';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Booking {
  id: string;
  customerName: string;
  customerPhone?: string;
  serviceNames?: string;
  serviceName?: string;
  bookingTime?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  serviceDurationMins?: number;
  status: string;
  totalAmount?: number;
  paymentId?: string;
  paymentMethod?: string;
  advanceAmount?: number;
  advancePaymentMethod?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  lastCalledAt?: string;
  originalBookingDate?: string;
  originalBookingTime?: string;
  originalStartTime?: string;
  originalEndTime?: string;
  rescheduleCount?: number;
  invoiceId?: string;
  staffNotes?: StaffNote[];
  createdAt?: any;
}

const PENDING_NOTIFY_DELAY_MS = 10 * 60 * 1000; // 10 minutes

interface StaffNote { text: string; byName: string; at: string; }

interface StaffOption { id: string; name: string; }

// Returns true if booking has online/advance payment (not pay-at-salon)
function isPaid(b: Booking): boolean {
  if (b.paymentId) return true;
  if ((b.advanceAmount ?? 0) > 0) return true;
  if (b.status === 'paid') return true;
  return false;
}

function isOldBooking(b: Booking): boolean {
  if (!b.startTime) return false;
  return new Date(b.startTime).getTime() < startOfDay(new Date()).getTime();
}

type Tab = 'home' | 'appointments' | 'profile';

// ─── Slot helpers (mirrors AdminDashboard reschedule logic) ──────────────────

const STAFF_COUNT = 3, SALON_OPEN_H = 10, SALON_CLOSE_H = 22;
const SLOT_STEP_MINS = 15, BUFFER_MINS = 30;

interface SlotOption { label: string; startISO: string; endISO: string; session: 'morning' | 'afternoon' | 'evening'; }
interface ExistingBooking { startTime: string; endTime: string; }

function fmtSlotTime(d: Date) {
  let h = d.getHours(), mi = d.getMinutes();
  const p = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${String(mi).padStart(2, '0')} ${p}`;
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
    out.push({ label: `${fmtSlotTime(sd)} – ${fmtSlotTime(ed)}`, startISO: sd.toISOString(), endISO: ed.toISOString(), session: h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening' });
  }
  return out;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeGreeting(t: (k: any) => string): { text: string; icon: React.ReactNode } {
  const h = new Date().getHours();
  if (h < 12) return { text: t('goodMorning'),   icon: <Sun    size={22} className="text-amber-400" /> };
  if (h < 17) return { text: t('goodAfternoon'), icon: <Coffee size={22} className="text-orange-400" /> };
  return       { text: t('goodEvening'),          icon: <Moon   size={22} className="text-blue-400" /> };
}

function statusInfo(status: string, t: (k: any) => string): { label: string; color: string; bg: string; dot: string } {
  switch (status) {
    case 'confirmed': return { label: t('statusConfirmed'), color: 'text-blue-400',    bg: 'bg-blue-500/15 border-blue-500/30',       dot: 'bg-blue-400'    };
    case 'paid':      return { label: t('statusPaid'),      color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' };
    case 'pending':   return { label: t('statusPending'),   color: 'text-amber-400',   bg: 'bg-amber-500/15 border-amber-500/30',     dot: 'bg-amber-400'   };
    case 'completed': return { label: t('statusCompleted'), color: 'text-purple-400',  bg: 'bg-purple-500/15 border-purple-500/30',   dot: 'bg-purple-400'  };
    default:          return { label: t('statusCancelled'), color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30',         dot: 'bg-red-400'     };
  }
}

function fmtTime(iso?: string, slot?: string): string {
  if (slot) return slot;
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }); }
  catch { return '—'; }
}

function fmtCardDate(iso?: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); }
  catch { return '—'; }
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// ─── Staff picker (assign / reassign sheet) ───────────────────────────────────

function StaffPickerSheet({ staffList, currentId, me, onPick, onClose, t }: {
  staffList: StaffOption[];
  currentId?: string;
  me: StaffOption;
  onPick: (id: string, name: string) => void;
  onClose: () => void;
  t: (k: any) => string;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60" onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-900 border-t border-white/10 rounded-t-3xl p-4 pb-8 max-h-[70vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-white font-black text-lg">{t('assignStaff')}</p>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center text-gray-400">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-2">
          <button onClick={() => onPick(me.id, me.name)}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gold/10 border border-gold/30 transition-all"
          >
            <div className="w-11 h-11 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold font-black text-lg shrink-0">
              {me.name.charAt(0).toUpperCase()}
            </div>
            <p className="flex-1 text-left text-white font-black text-base">{me.name} ({t('me')})</p>
            {currentId === me.id && <Check size={20} className="text-gold shrink-0" />}
          </button>
          {staffList.filter(s => s.id !== me.id).map(s => (
            <button key={s.id} onClick={() => onPick(s.id, s.name)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/10 transition-all"
            >
              <div className="w-11 h-11 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white font-black text-lg shrink-0">
                {s.name.charAt(0).toUpperCase()}
              </div>
              <p className="flex-1 text-left text-white font-bold text-base">{s.name}</p>
              {currentId === s.id && <Check size={20} className="text-gold shrink-0" />}
            </button>
          ))}
          {currentId && (
            <button onClick={() => onPick('', '')}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-sm transition-all"
            >
              <X size={16} /> {t('unassign')}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Appointment card ─────────────────────────────────────────────────────────

function AppointmentCard({ booking, staffList, me, t, showDate, highlight, onCreateBill }: {
  booking: Booking;
  staffList: StaffOption[];
  me: StaffOption;
  t: (k: any) => string;
  showDate?: boolean;
  highlight?: boolean;
  onCreateBill?: (booking: Booking) => void;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reschedule state
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [editDate, setEditDate] = useState(() => new Date());
  const [editSlots, setEditSlots] = useState<SlotOption[]>([]);
  const [editSelSlot, setEditSelSlot] = useState<SlotOption | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const dateStrip = Array.from({ length: 8 }, (_, i) => addDays(new Date(), i));

  // Notes
  const [showNotes, setShowNotes] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const notes = booking.staffNotes ?? [];

  const st = statusInfo(booking.status, t);
  const time = fmtTime(booking.startTime, booking.bookingTime);
  const svc = booking.serviceNames || booking.serviceName || '—';
  const isPending = booking.status === 'pending';
  const active = ['paid', 'confirmed'].includes(booking.status);
  const bookingIsPaid = isPaid(booking);
  const bookingIsOld = isOldBooking(booking);

  // Fail with notes
  const [showFailInput, setShowFailInput] = useState(false);
  const [failNote, setFailNote] = useState('');

  const handleCall = async () => {
    if (!booking.customerPhone) return;
    try { await updateDoc(doc(db, 'bookings', booking.id), { lastCalledAt: new Date().toISOString() }); } catch {}
    window.location.href = `tel:${booking.customerPhone}`;
  };

  const handleAssign = async (staffId: string, staffName: string) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        assignedStaffId: staffId || null,
        assignedStaffName: staffName || null,
      });
    } catch {} finally { setBusy(false); setShowAssign(false); }
  };

  const handleDone = async () => {
    setBusy(true);
    try { await updateDoc(doc(db, 'bookings', booking.id), { status: 'completed' }); } catch {} finally { setBusy(false); }
  };

  const handleFail = async () => {
    setBusy(true);
    try {
      const updates: Record<string, unknown> = { status: 'failed' };
      if (failNote.trim()) {
        updates.staffNotes = arrayUnion({ text: `[FAILED] ${failNote.trim()}`, byName: me.name, at: new Date().toISOString() });
      }
      await updateDoc(doc(db, 'bookings', booking.id), updates);
      setShowFailInput(false);
    } catch {} finally { setBusy(false); }
  };

  const handleAddNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    setNoteSaving(true);
    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        staffNotes: arrayUnion({ text, byName: me.name, at: new Date().toISOString() }),
      });
      setNoteText('');
    } catch {} finally { setNoteSaving(false); }
  };

  const loadSlots = async (date: Date, mins: number) => {
    setSlotsLoading(true); setEditSelSlot(null);
    try {
      const s = startOfDay(date).toISOString(), e = startOfDay(addDays(date, 1)).toISOString();
      const snap = await getDocs(query(collection(db, 'bookings'), where('startTime', '>=', s), where('startTime', '<', e), where('status', 'in', ['paid', 'confirmed', 'pending'])));
      const existing: ExistingBooking[] = snap.docs.flatMap(d => {
        if (d.id === booking.id) return [];
        const x = d.data();
        return x.startTime && x.endTime ? [{ startTime: x.startTime, endTime: x.endTime }] : [];
      });
      setEditSlots(computeSlots(date, mins || 60, existing));
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
        rescheduledAt:   new Date().toISOString(),
        rescheduleCount: (booking.rescheduleCount ?? 0) + 1,
      };
      if (!booking.originalBookingDate) {
        updates.originalBookingDate = booking.bookingDate ?? null;
        updates.originalBookingTime = booking.bookingTime ?? null;
        updates.originalStartTime   = booking.startTime ?? null;
        updates.originalEndTime     = booking.endTime ?? null;
      }
      await updateDoc(doc(db, 'bookings', booking.id), updates);
      setEditSuccess(`${t('rescheduled')} ${format(editDate, 'EEE, MMM d')} · ${editSelSlot.label}`);
      setTimeout(() => { setIsRescheduling(false); setEditSuccess(null); }, 2000);
    } catch {} finally { setEditSaving(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`relative rounded-3xl border p-4 ${highlight ? 'bg-gradient-to-br from-gold/12 to-gold/5 border-gold/30' : 'bg-zinc-900 border-white/10'}`}
    >
      {highlight && (
        <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 bg-gold text-black text-[10px] font-black uppercase rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
          {t('nextCustomer')}
        </div>
      )}

      {/* Time + date + status */}
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-16 text-center pt-1">
          <p className="text-white font-black text-base leading-none">{time.split(' ')[0]}</p>
          <p className="text-gray-400 text-xs mt-0.5">{time.split(' ')[1] ?? ''}</p>
          {showDate && <p className="text-gray-500 text-[10px] mt-1.5 font-bold">{fmtCardDate(booking.startTime)}</p>}
        </div>
        <div className="shrink-0 flex flex-col items-center gap-1 mt-1.5">
          <div className={`w-3 h-3 rounded-full ${st.dot}`} />
          <div className="w-px flex-1 bg-white/10 min-h-[20px]" />
        </div>
        <div className="flex-1 min-w-0 pr-14">
          <p className="text-white font-black text-lg leading-tight">{booking.customerName || t('customer')}</p>
          <p className="text-gray-400 text-sm mt-0.5 truncate">{svc}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border ${st.bg} ${st.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
              {st.label}
            </span>
            {bookingIsPaid && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                {t('paid')}
              </span>
            )}
            {bookingIsOld && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-red-500/10 border border-red-500/25 text-red-400">
                {t('old')}
              </span>
            )}
            {booking.totalAmount != null && booking.totalAmount > 0 && (
              <span className="text-gold text-[11px] font-black">₹{booking.totalAmount.toLocaleString('en-IN')}</span>
            )}
            {booking.lastCalledAt && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-white/5 border border-white/10 text-gray-400">
                <Phone size={10} /> {t('called')} {timeAgo(booking.lastCalledAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Assigned-to badge — tap to assign/reassign */}
      <button onClick={() => setShowAssign(true)} disabled={busy}
        className={`w-full mt-3 flex items-center gap-2 px-3 py-2.5 rounded-2xl border text-left transition-all ${
          booking.assignedStaffId ? 'bg-white/[0.04] border-white/10' : 'bg-amber-500/8 border-amber-500/25'
        }`}
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
          booking.assignedStaffId ? 'bg-gold/15 border border-gold/30 text-gold' : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
        }`}>
          {booking.assignedStaffId ? booking.assignedStaffName?.charAt(0).toUpperCase() : <User size={14} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] uppercase tracking-widest font-black text-gray-500">{t('assignedTo')}</p>
          <p className={`text-sm font-black truncate ${booking.assignedStaffId ? 'text-white' : 'text-amber-400'}`}>
            {booking.assignedStaffId ? booking.assignedStaffName : t('unassigned')}
          </p>
        </div>
        <RefreshCw size={15} className="text-gray-500 shrink-0" />
      </button>

      {/* Pending hint — nudges staff to call & check on payment */}
      {isPending && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-2xl bg-amber-500/8 border border-amber-500/20">
          <Clock size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300 text-xs font-bold leading-snug">{t('pendingCallHint')}</p>
        </div>
      )}

      {/* Action buttons — row 1: Call, Reschedule, Bill */}
      <div className="flex items-center gap-2 mt-3">
        <a href={booking.customerPhone ? `tel:${booking.customerPhone}` : undefined} onClick={handleCall}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-400 font-black text-sm"
        >
          <Phone size={16} /> {t('call')}
        </a>
        {active && (booking.rescheduleCount ?? 0) < 3 && (
          <button onClick={() => {
              if (isRescheduling) { setIsRescheduling(false); return; }
              const today = new Date();
              setIsRescheduling(true); setEditDate(today); setEditSelSlot(null); setEditSuccess(null);
              loadSlots(today, booking.serviceDurationMins ?? 60);
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-500/12 border border-blue-500/25 text-blue-300 font-black text-sm"
          >
            <Edit2 size={16} /> {t('reschedule')}
          </button>
        )}
        {(active || (booking.status === 'completed' && !booking.invoiceId)) && onCreateBill && (
          <button onClick={() => onCreateBill(booking)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-[#D4AF37]/20 to-[#F0D060]/20 border border-gold/30 text-gold font-black text-sm"
          >
            <Receipt size={16} /> {t('bill')}
          </button>
        )}
        <button onClick={() => setShowNotes(v => !v)}
          className={`relative flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border font-black text-sm transition-all ${
            isPending && !active ? 'flex-1' : ''
          } ${showNotes ? 'bg-gold/15 border-gold/30 text-gold' : 'bg-white/[0.04] border-white/10 text-gray-300'}`}
        >
          <MessageSquare size={16} />
          {(isPending && !active) && t('notes')}
          {notes.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gold text-black text-[10px] font-black flex items-center justify-center">
              {notes.length}
            </span>
          )}
        </button>
      </div>

      {/* Action buttons — row 2: Mark Complete + Mark Failed */}
      {(active || isPending) && (
        <div className="flex items-center gap-2 mt-2">
          {active && (
            <button onClick={handleDone} disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-purple-500/12 border border-purple-500/25 text-purple-300 font-black text-xs disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />} {t('markDone')}
            </button>
          )}
          <button onClick={() => { if (showFailInput) { handleFail(); } else { setShowFailInput(true); } }} disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-red-500/8 border border-red-500/20 text-red-400 font-black text-xs disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} {t('markFailed')}
          </button>
        </div>
      )}

      {/* Fail note input */}
      <AnimatePresence>
        {showFailInput && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-2 flex items-center gap-2">
              <input type="text" value={failNote} onChange={e => setFailNote(e.target.value)}
                placeholder={t('failNoteHint')}
                className="flex-1 bg-zinc-800 border border-red-500/25 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-red-400"
              />
              <button onClick={handleFail} disabled={busy}
                className="px-4 py-2.5 rounded-xl bg-red-500 text-white text-xs font-black disabled:opacity-50">
                {t('confirm')}
              </button>
              <button onClick={() => { setShowFailInput(false); setFailNote(''); }}
                className="text-gray-500 hover:text-white p-2">
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes panel */}
      <AnimatePresence>
        {showNotes && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="pt-3 mt-3 border-t border-white/10 space-y-2">
              {notes.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-1">{t('noNotes')}</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {notes.map((n, i) => (
                    <div key={i} className="bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2">
                      <p className="text-white text-sm">{n.text}</p>
                      <p className="text-gray-500 text-[10px] mt-1 font-bold">{n.byName} · {timeAgo(n.at)}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input value={noteText} onChange={e => setNoteText(e.target.value)}
                  placeholder={t('writeNote')}
                  className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gold/40"
                />
                <button onClick={handleAddNote} disabled={!noteText.trim() || noteSaving}
                  className="w-11 h-11 shrink-0 rounded-xl bg-gold text-black flex items-center justify-center disabled:opacity-40"
                >
                  {noteSaving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reschedule panel */}
      <AnimatePresence>
        {isRescheduling && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="pt-3 mt-3 border-t border-white/10 space-y-3">
              {editSuccess ? (
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold py-2">
                  <Check size={16} /> {editSuccess}
                </div>
              ) : (
                <>
                  <p className="text-[11px] font-black uppercase tracking-wider text-gold flex items-center gap-1.5">
                    <CalendarCheck size={13} /> {t('pickNewSlot')}
                  </p>
                  {/* Date strip */}
                  <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
                    {dateStrip.map(d => {
                      const ds = isSameDay(d, editDate);
                      return (
                        <button key={d.toString()} onClick={() => { setEditDate(d); loadSlots(d, booking.serviceDurationMins ?? 60); }}
                          className={`shrink-0 w-12 h-14 rounded-xl flex flex-col items-center justify-center transition-all border py-2 ${ds ? 'bg-gold border-gold text-black' : 'border-white/10 bg-white/[0.04] text-gray-400'}`}>
                          <span className={`text-[10px] font-bold ${ds ? 'text-black/70' : 'text-gray-500'}`}>{isToday(d) ? t('today') : format(d, 'EEE')}</span>
                          <span className="text-base font-black">{format(d, 'd')}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Slots */}
                  {slotsLoading ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-gray-500 text-sm">
                      <Loader2 size={15} className="animate-spin text-gold" /> {t('checkingSlots')}
                    </div>
                  ) : editSlots.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-2">{t('noSlotsForDate')}</p>
                  ) : (
                    <div className="space-y-2">
                      {(['morning', 'afternoon', 'evening'] as const).filter(sess => editSlots.some(s => s.session === sess)).map(sess => {
                        const Icon = sess === 'morning' ? Sun : sess === 'afternoon' ? CloudSun : Moon;
                        return (
                          <div key={sess}>
                            <div className="flex items-center gap-1.5 mb-1"><Icon size={11} className="text-gray-500" /><span className="text-[10px] text-gray-500 font-bold capitalize">{t(sess)}</span></div>
                            <div className="grid grid-cols-3 gap-1.5">
                              {editSlots.filter(s => s.session === sess).map(slot => (
                                <button key={slot.startISO} onClick={() => setEditSelSlot(slot)}
                                  className={`py-2.5 text-[11px] font-bold rounded-xl border transition-all ${editSelSlot?.startISO === slot.startISO ? 'bg-gold border-gold text-black' : 'border-white/10 bg-white/[0.03] text-gray-400'}`}>
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
                    className="w-full py-3.5 rounded-2xl bg-gold text-black text-sm font-black disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {editSaving ? <Loader2 size={14} className="animate-spin" /> : <CalendarCheck size={14} />}
                    {t('confirmReschedule')}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assign sheet */}
      <AnimatePresence>
        {showAssign && (
          <StaffPickerSheet
            staffList={staffList}
            currentId={booking.assignedStaffId}
            me={me}
            onPick={handleAssign}
            onClose={() => setShowAssign(false)}
            t={t}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({ staffMember, bookings, loading, staffList, onOpenAppointment, onCreateBill, onExpressBill }: {
  staffMember: StaffMember;
  bookings: Booking[];
  loading: boolean;
  staffList: StaffOption[];
  onOpenAppointment: () => void;
  onCreateBill: (b: Booking) => void;
  onExpressBill: () => void;
}) {
  const { t } = useLanguage();
  const greeting = timeGreeting(t);
  const me: StaffOption = { id: staffMember.id, name: staffMember.name };

  const todayAll = useMemo(
    () => bookings.filter(b => b.startTime && isToday(new Date(b.startTime)) && b.status !== 'failed'),
    [bookings],
  );
  const completedToday = todayAll.filter(b => b.status === 'completed').length;
  // Only confirmed (paid/confirmed) appointments — not pending
  const confirmedToday = useMemo(
    () => todayAll.filter(b => b.status !== 'completed' && b.status !== 'pending'),
    [todayAll],
  );
  const nextIdx = confirmedToday.findIndex(b => ['confirmed', 'paid'].includes(b.status));

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide pb-28">
      {/* Greeting hero */}
      <div className="px-4 pt-5 pb-3">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          className="relative bg-gradient-to-br from-zinc-900 to-zinc-800 border border-white/12 rounded-3xl p-5 overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-gold/8 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {greeting.icon}
                <span className="text-gray-300 text-base font-black">{greeting.text}</span>
              </div>
              <h2 className="text-3xl font-black text-white leading-none mt-1">
                {staffMember.name.split(' ')[0]}!
              </h2>
              {staffMember.role && <p className="text-gray-400 text-sm mt-1">{staffMember.role}</p>}
            </div>
            <div className="w-16 h-16 rounded-2xl bg-gold/15 border-2 border-gold/30 flex items-center justify-center">
              <span className="text-gold font-black text-3xl">{staffMember.name.charAt(0).toUpperCase()}</span>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-black/35 rounded-2xl p-3 text-center">
              <p className="text-2xl font-black text-white">{confirmedToday.length}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{t('appointmentsToday')}</p>
            </div>
            <div className="bg-black/35 rounded-2xl p-3 text-center">
              <p className="text-2xl font-black text-emerald-400">{completedToday}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{t('doneToday')}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Big action buttons */}
      <div className="px-4 pb-4 flex gap-3">
        <motion.button whileTap={{ scale: 0.97 }} onClick={onOpenAppointment}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl p-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-[0_8px_32px_-4px_rgba(59,130,246,0.5)]"
        >
          <CalendarPlus size={24} strokeWidth={2.5} />
          <p className="text-base font-black">{t('makeAppointment')}</p>
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={onExpressBill}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl p-4 bg-gradient-to-r from-[#D4AF37] to-[#F0D060] text-black shadow-[0_8px_32px_-4px_rgba(212,175,55,0.4)]"
        >
          <Receipt size={24} strokeWidth={2.5} />
          <p className="text-base font-black">{t('bill')}</p>
        </motion.button>
      </div>

      {/* Today's schedule */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-white font-black text-lg">{t('todaySchedule')}</p>
            <p className="text-gray-500 text-xs">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 size={36} className="animate-spin text-gold" />
            <p className="text-gray-400 text-base">{t('loading')}</p>
          </div>
        ) : confirmedToday.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-14 gap-5 text-center"
          >
            <div className="w-24 h-24 rounded-3xl bg-gold/10 border border-gold/20 flex items-center justify-center">
              <CalendarDays size={44} className="text-gold" />
            </div>
            <p className="text-white font-black text-xl">{t('noAppointments')}</p>
            <motion.button whileTap={{ scale: 0.95 }} onClick={onOpenAppointment}
              className="flex items-center gap-2 px-7 py-4 bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl text-white font-black text-base"
            >
              <CalendarPlus size={18} /> {t('makeAppointment')}
            </motion.button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {confirmedToday.map((b, i) => (
              <AppointmentCard key={b.id} booking={b} staffList={staffList} me={me} t={t}
                highlight={i === nextIdx} onCreateBill={onCreateBill} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Appointments Screen (3 tabs: Today / Upcoming / Pending) ─────────────────

function AppointmentsScreen({ staffMember, bookings, loading, staffList, onCreateBill }: {
  staffMember: StaffMember;
  bookings: Booking[];
  loading: boolean;
  staffList: StaffOption[];
  onCreateBill: (b: Booking) => void;
}) {
  const { t } = useLanguage();
  const me: StaffOption = { id: staffMember.id, name: staffMember.name };
  const [subTab, setSubTab] = useState<'today' | 'upcoming' | 'pending' | 'completed'>('today');

  // Today: only today's non-failed, non-completed
  const todayList = useMemo(
    () => bookings.filter(b => b.startTime && isToday(new Date(b.startTime)) && b.status !== 'failed' && b.status !== 'completed' && b.status !== 'pending'),
    [bookings],
  );
  // Upcoming: future bookings starting tomorrow, non-failed/completed/pending
  const upcomingList = useMemo(
    () => bookings.filter(b => {
      if (!b.startTime) return false;
      const d = new Date(b.startTime);
      return d.getTime() >= startOfDay(addDays(new Date(), 1)).getTime() && b.status !== 'failed' && b.status !== 'completed' && b.status !== 'pending';
    }),
    [bookings],
  );
  // Pending: all pending bookings (today + old). Old = startTime < today
  const pendingList = useMemo(
    () => bookings.filter(b => b.status === 'pending'),
    [bookings],
  );
  // Completed: only those without an invoice (unbilled)
  const completedList = useMemo(
    () => bookings.filter(b => b.status === 'completed' && !b.invoiceId),
    [bookings],
  );

  const tabs = [
    { id: 'today' as const,     label: t('todayTab'),    count: todayList.length,     color: 'bg-emerald-500', icon: <CalendarCheck size={14} /> },
    { id: 'upcoming' as const,  label: t('upcomingTab'), count: upcomingList.length,   color: 'bg-blue-500',    icon: <CalendarDays size={14} /> },
    { id: 'pending' as const,   label: t('pendingTab'),  count: pendingList.length,    color: 'bg-amber-500',   icon: <Clock size={14} /> },
    { id: 'completed' as const, label: t('statusCompleted') || 'Completed', count: completedList.length, color: 'bg-purple-500', icon: <CheckSquare size={14} /> },
  ];
  const list = subTab === 'today' ? todayList : subTab === 'upcoming' ? upcomingList : subTab === 'pending' ? pendingList : completedList;

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide pb-28 px-4 pt-5">
      <div className="mb-3">
        <p className="text-white font-black text-xl">{t('appointments')}</p>
      </div>

      {/* 3 tabs */}
      <div className="flex items-center gap-1 mb-4 p-1 rounded-2xl bg-white/[0.04] border border-white/10">
        {tabs.map(tb => (
          <button key={tb.id} onClick={() => setSubTab(tb.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-black text-xs transition-all ${
              subTab === tb.id ? `${tb.color} text-black` : 'text-gray-400'
            }`}
          >
            {tb.icon} {tb.label}
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${subTab === tb.id ? 'bg-black/15' : 'bg-white/10'}`}>{tb.count}</span>
          </button>
        ))}
      </div>

      {subTab === 'pending' && pendingList.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2.5 mb-3 rounded-2xl bg-amber-500/8 border border-amber-500/20">
          <Clock size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300 text-xs font-bold leading-snug">{t('pendingCallHint')}</p>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 size={36} className="animate-spin text-gold" />
          <p className="text-gray-400 text-base">{t('loading')}</p>
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-5 text-center">
          <div className="w-24 h-24 rounded-3xl bg-gold/10 border border-gold/20 flex items-center justify-center">
            <CalendarDays size={44} className="text-gold" />
          </div>
          <p className="text-white font-black text-xl">{t('noAppointments')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(b => (
            <AppointmentCard key={b.id} booking={b} staffList={staffList} me={me} t={t} showDate={subTab !== 'today'} onCreateBill={onCreateBill} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Profile Screen ───────────────────────────────────────────────────────────

function ProfileScreen({ staffMember, onSignOut }: { staffMember: StaffMember; onSignOut: () => void }) {
  const { t } = useLanguage();
  const salary = (staffMember as any).salary ?? 0;
  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide pb-28 px-4 pt-5 space-y-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center py-8 gap-4"
      >
        <div className="w-28 h-28 rounded-[32px] bg-gold/15 border-2 border-gold/40 flex items-center justify-center">
          <span className="text-gold font-black text-5xl">{staffMember.name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="text-center">
          <h2 className="text-white font-black text-3xl">{staffMember.name}</h2>
          {staffMember.role && <p className="text-gray-400 text-lg mt-1">{staffMember.role}</p>}
        </div>
      </motion.div>

      {salary > 0 && (
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
          className="flex items-center justify-between bg-zinc-900 border border-white/12 rounded-2xl px-5 py-5"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/8 flex items-center justify-center shrink-0">
              <Wallet size={20} className="text-emerald-400" />
            </div>
            <p className="text-white font-black text-base">{t('salary')}</p>
          </div>
          <span className="text-white font-black text-xl">₹{salary.toLocaleString('en-IN')}</span>
        </motion.div>
      )}

      {/* Language toggle — full variant in profile */}
      <div>
        <p className="text-gray-500 text-xs uppercase tracking-widest font-bold mb-2">Language / भाषा</p>
        <LanguageToggle variant="full" className="w-full justify-center" />
      </div>

      <div className="text-center py-2">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Scissors size={18} className="text-gold" />
          <span className="text-white font-black uppercase tracking-widest text-base">Hair Tech</span>
        </div>
        <p className="text-gray-500 text-sm">{t('salonTag')}</p>
      </div>

      <motion.button whileTap={{ scale: 0.97 }} onClick={onSignOut}
        className="w-full flex items-center justify-center gap-3 py-5 bg-red-500/10 border border-red-500/25 rounded-2xl text-red-400 font-black text-lg hover:bg-red-500/20 transition-all"
      >
        <LogOut size={22} /> {t('signOut')}
      </motion.button>
    </div>
  );
}

// ─── New appointment banner — rings until staff dismisses it ──────────────────

function NewAppointmentBanner({ booking, offset, onDismiss }: { booking: Booking; offset: number; onDismiss: () => void }) {
  const { t } = useLanguage();
  const isPending = booking.status === 'pending';

  useEffect(() => {
    startRinging(isPending ? 'pending' : 'confirmed');
  }, [isPending]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -80, scale: 0.95 }}
      animate={{ opacity: 1, y: offset * 8, scale: 1 }}
      exit={{ opacity: 0, y: -80, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-full max-w-lg px-4"
      style={{ zIndex: 200 - offset }}
    >
      <div className={`relative bg-zinc-900 border ${isPending ? 'border-amber-500/50 shadow-[0_8px_60px_rgba(245,158,11,0.3)]' : 'border-emerald-500/50 shadow-[0_8px_60px_rgba(16,185,129,0.3)]'} rounded-2xl overflow-hidden`}>
        <div className={`absolute top-0 left-0 right-0 h-[2px] ${isPending ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`} />

        <div className="p-4 flex items-start gap-4">
          <div className="relative shrink-0 mt-0.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isPending ? 'bg-amber-500/15 border border-amber-500/30' : 'bg-emerald-500/15 border border-emerald-500/30'}`}>
              {isPending ? <AlertCircle size={20} className="text-amber-400" /> : <Bell size={20} className="text-emerald-400" />}
            </div>
            <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full ${isPending ? 'bg-amber-500' : 'bg-emerald-500'}`}>
              <span className={`absolute inset-0 rounded-full animate-ping opacity-75 ${isPending ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isPending ? 'text-amber-400' : 'text-emerald-400'}`}>
              {isPending ? '⏳ New Pending Booking' : '🔔 New Appointment'}
            </p>
            <p className="text-white font-bold text-sm leading-tight truncate">
              {booking.customerName ?? booking.customerPhone ?? t('customer')}
            </p>
            <p className="text-gray-400 text-xs mt-0.5 truncate">{booking.serviceNames ?? booking.serviceName ?? '—'}</p>
            {booking.bookingTime && (
              <span className="flex items-center gap-1 text-[10px] text-gray-500 font-bold mt-2">
                <Clock size={10} /> {booking.bookingTime}
              </span>
            )}
          </div>
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={onDismiss}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
              isPending ? 'bg-amber-500 hover:bg-amber-400 text-black' : 'bg-emerald-500 hover:bg-emerald-400 text-black'
            }`}
          >
            <PhoneOff size={14} /> {t('confirm')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface StaffPortalProps {
  staffMember: StaffMember;
  onSignOut: () => void;
}

export default function StaffPortal({ staffMember, onSignOut }: StaffPortalProps) {
  const { t } = useLanguage();
  const [tab,        setTab]        = useState<Tab>('home');
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingPrefill, setBillingPrefill] = useState<OnlineBookingPrefill | null>(null);
  const [bookings,   setBookings]   = useState<Booking[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [staffList,  setStaffList]  = useState<StaffOption[]>([]);
  const [newBookingQueue, setNewBookingQueue] = useState<Booking[]>([]);

  const firebaseUser = auth.currentUser;
  const initialIdsRef = useRef<Set<string> | null>(null);
  const pendingIdsRef = useRef(new Set<string>());
  const pendingNotifyTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Live bookings — two listeners merged:
  //   1. Scheduled bookings: startTime >= today (paid/confirmed/completed)
  //   2. Pending bookings: createdAt in last 90 days, status === 'pending'
  // This mirrors the admin dashboard's ability to see pending orders.
  const scheduledRef = useRef<Map<string, Booking>>(new Map());
  const pendingBkRef = useRef<Map<string, Booking>>(new Map());

  const mergeBookings = () => {
    const merged = new Map(scheduledRef.current);
    pendingBkRef.current.forEach((b, id) => {
      if (!merged.has(id)) merged.set(id, b);
    });
    setBookings(Array.from(merged.values()));
  };

  useEffect(() => {
    const s = startOfDay(new Date()).toISOString();

    // Query 1: scheduled bookings (today onward)
    const q1 = query(
      collection(db, 'bookings'),
      where('startTime', '>=', s),
      orderBy('startTime', 'asc'),
      limit(200),
    );

    // Query 2: pending bookings (last 90 days by createdAt)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    cutoff.setHours(0, 0, 0, 0);
    const q2 = query(
      collection(db, 'bookings'),
      where('status', '==', 'pending'),
      where('createdAt', '>=', Timestamp.fromDate(cutoff)),
      orderBy('createdAt', 'desc'),
      limit(100),
    );

    const unsub1 = onSnapshot(q1, snap => {
      scheduledRef.current = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Booking]));
      mergeBookings();
      setLoading(false);

      // ── New appointment detection (with delay for pending) ──────────
      if (initialIdsRef.current === null) {
        initialIdsRef.current = new Set(snap.docs.map(d => d.id));
        snap.docs.forEach(d => { if (d.data().status === 'pending') pendingIdsRef.current.add(d.id); });
        return;
      }

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

      const addedBookings = snap.docChanges()
        .filter(c => c.type === 'added' && !initialIdsRef.current!.has(c.doc.id))
        .map(c => {
          initialIdsRef.current!.add(c.doc.id);
          const b = { id: c.doc.id, ...c.doc.data() } as Booking;
          if (b.status === 'pending') pendingIdsRef.current.add(b.id);
          return b;
        });

      const justPaidBookings = snap.docChanges()
        .filter(c => c.type === 'modified' && pendingIdsRef.current.has(c.doc.id) && (c.doc.data().status === 'paid' || c.doc.data().status === 'confirmed'))
        .map(c => {
          pendingIdsRef.current.delete(c.doc.id);
          const t = pendingNotifyTimersRef.current.get(c.doc.id);
          if (t) { clearTimeout(t); pendingNotifyTimersRef.current.delete(c.doc.id); }
          return { id: c.doc.id, ...c.doc.data() } as Booking;
        });

      const toNotify = [
        ...addedBookings.filter(b => b.status !== 'pending' && b.status !== 'failed'),
        ...justPaidBookings,
      ];
      if (toNotify.length > 0) {
        setNewBookingQueue(prev => [...prev, ...toNotify]);
        toNotify.forEach(b => fireDesktopNotification(b));
      }

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
    }, () => setLoading(false));

    // Listener 2: pending bookings — just merge into state, no notifications
    // (notifications are handled by listener 1 when they appear there)
    const unsub2 = onSnapshot(q2, snap => {
      pendingBkRef.current = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Booking]));
      mergeBookings();
      setLoading(false);
    }, () => {});

    return () => {
      unsub1();
      unsub2();
      pendingNotifyTimersRef.current.forEach(t => clearTimeout(t));
      pendingNotifyTimersRef.current.clear();
    };
  }, []);

  // Stop ringing once the new-appointment queue is cleared
  useEffect(() => {
    if (newBookingQueue.length === 0) stopRinging();
  }, [newBookingQueue.length]);

  // Ask for desktop notification permission on first load (best-effort)
  useEffect(() => { requestNotificationPermission().catch(() => {}); }, []);

  const dismissNewBooking = (id: string) => {
    setNewBookingQueue(prev => {
      const next = prev.filter(b => b.id !== id);
      if (next.length === 0) stopRinging();
      return next;
    });
  };

  const openBillingFromBooking = (b: Booking) => {
    setBillingPrefill({
      bookingId:            b.id,
      customerName:         b.customerName ?? '',
      customerPhone:        b.customerPhone ?? '',
      serviceNames:         b.serviceNames ?? b.serviceName ?? '',
      totalAmount:          b.totalAmount ?? 0,
      paymentId:            b.paymentId,
      bookingTime:          b.bookingTime,
      paymentMethod:        b.paymentMethod,
      advanceAmount:        b.advanceAmount,
      advancePaymentMethod: b.advancePaymentMethod,
    });
    setBillingOpen(true);
  };

  const openExpressBill = () => {
    setBillingPrefill(null);
    setBillingOpen(true);
  };

  // Staff list for assign/reassign
  useEffect(() => {
    getDocs(query(collection(db, 'staff'), where('isActive', '==', true), orderBy('name')))
      .then(snap => setStaffList(snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name as string }))))
      .catch(() => {});
  }, []);

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'home',         icon: <Home          size={24} />, label: t('home')         },
    { id: 'appointments', icon: <CalendarDays  size={24} />, label: t('appointments') },
    { id: 'profile',      icon: <User          size={24} />, label: t('profile')      },
  ];

  // ── Full-screen walk-in booking takeover ──────────────────────────────────
  if (walkInOpen) {
    if (!firebaseUser) {
      return (
        <div className="h-screen bg-[#0d0d0d] text-white flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-white font-black text-xl">Session Expired</p>
          <p className="text-gray-400 text-sm">Please sign out and sign in again.</p>
          <button onClick={() => setWalkInOpen(false)}
            className="px-6 py-3 bg-white/8 border border-white/12 rounded-xl text-gray-300 font-bold">
            Go Back
          </button>
        </div>
      );
    }
    return (
      <div className="h-screen bg-[#0d0d0d] text-white flex flex-col overflow-hidden">
        {/* Compact header with back button */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10 bg-zinc-900/60 shrink-0">
          <button onClick={() => setWalkInOpen(false)}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <CalendarPlus size={16} className="text-teal-400" />
            <span className="text-white font-black text-sm">{t('makeAppointment')}</span>
          </button>
          <span className="ml-auto text-gray-500 text-xs">← {t('back')}</span>
          <button onClick={() => setWalkInOpen(false)}
            className="w-8 h-8 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <WalkInBooking user={firebaseUser} staffMember={staffMember} createdBy="staff"
            onClose={() => setWalkInOpen(false)} onCreated={() => setWalkInOpen(false)} />
        </div>
      </div>
    );
  }

  // ── Full-screen billing takeover ──────────────────────────────────────────
  if (billingOpen) {
    if (!firebaseUser) {
      return (
        <div className="h-screen bg-[#0d0d0d] text-white flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-white font-black text-xl">Session Expired</p>
          <p className="text-gray-400 text-sm">Please sign out and sign in again.</p>
          <button onClick={() => setBillingOpen(false)}
            className="px-6 py-3 bg-white/8 border border-white/12 rounded-xl text-gray-300 font-bold">
            Go Back
          </button>
        </div>
      );
    }
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

  // ── Normal portal view ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col">
      {/* New appointment banners — ring until staff dismisses */}
      <AnimatePresence>
        {newBookingQueue.map((b, i) => (
          <NewAppointmentBanner key={b.id} booking={b} offset={i} onDismiss={() => dismissNewBooking(b.id)} />
        ))}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/95 backdrop-blur-xl border-b border-white/10 shrink-0">
        <div className="px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors size={17} className="text-gold" />
            <span className="text-white font-black uppercase tracking-widest text-sm">Hair Tech</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <span className="px-2.5 py-1 bg-blue-500/15 border border-blue-500/25 rounded-full text-blue-400 text-[10px] font-black uppercase">Staff</span>
            <span className="text-gray-300 text-sm font-black">{staffMember.name.split(' ')[0]}</span>
          </div>
        </div>
      </header>

      {/* Screen content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {tab === 'home' && (
            <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
              <HomeScreen staffMember={staffMember} bookings={bookings} loading={loading} staffList={staffList}
                onOpenAppointment={() => setWalkInOpen(true)} onCreateBill={openBillingFromBooking} onExpressBill={openExpressBill} />
            </motion.div>
          )}
          {tab === 'appointments' && (
            <motion.div key="appointments" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
              <AppointmentsScreen staffMember={staffMember} bookings={bookings} loading={loading} staffList={staffList} onCreateBill={openBillingFromBooking} />
            </motion.div>
          )}
          {tab === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
              <ProfileScreen staffMember={staffMember} onSignOut={onSignOut} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0A0A0A]/96 backdrop-blur-xl border-t border-white/12">
        <div className="flex items-stretch h-[72px] px-2">
          {tabs.map(tab_ => (
            <button key={tab_.id} onClick={() => setTab(tab_.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl m-1.5 transition-all ${
                tab === tab_.id ? 'bg-gold text-black' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab_.icon}
              <span className={`text-[11px] font-black leading-none ${tab === tab_.id ? 'text-black' : ''}`}>{tab_.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
