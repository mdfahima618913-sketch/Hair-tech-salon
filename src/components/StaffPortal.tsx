/**
 * StaffPortal.tsx
 * Mobile-first staff portal. Bilingual via LanguageContext (English default, Hindi toggle).
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CalendarDays, Receipt, TrendingUp, User, LogOut,
  Loader2, Award, Wallet, Sun, Coffee, Moon,
  Sparkles, Scissors, Home, CalendarPlus,
} from 'lucide-react';
import { collection, query, where, orderBy, getDocs, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import BillingModule from './BillingModule';
import WalkInBooking from './WalkInBooking';
import type { StaffMember } from './BillingModule';
import { useLanguage } from '../lib/LanguageContext';
import LanguageToggle from './LanguageToggle';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Booking {
  id: string;
  customerName: string;
  customerPhone?: string;
  serviceNames?: string;
  serviceName?: string;
  bookingTime?: string;
  startTime?: string;
  status: string;
  totalAmount?: number;
}

type Tab = 'home' | 'bill' | 'earnings' | 'profile';

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
    default:          return { label: t('statusCancelled'), color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30',         dot: 'bg-red-400'     };
  }
}

function fmtTime(iso?: string, slot?: string): string {
  if (slot) return slot;
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }); }
  catch { return '—'; }
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({ staffMember, onOpenBill, onOpenAppointment }: {
  staffMember: StaffMember;
  onOpenBill: () => void;
  onOpenAppointment: () => void;
}) {
  const { t } = useLanguage();
  const [bookings,  setBookings]  = useState<Booking[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [todayComm, setTodayComm] = useState(0);
  const [todaySvcs, setTodaySvcs] = useState(0);
  const greeting = timeGreeting(t);

  useEffect(() => {
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const e = new Date(); e.setHours(23, 59, 59, 999);
    const q = query(
      collection(db, 'bookings'),
      where('startTime', '>=', s.toISOString()),
      where('startTime', '<=', e.toISOString()),
      orderBy('startTime', 'asc'),
    );
    const unsub = onSnapshot(q, snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  useEffect(() => {
    const todayS = new Date(); todayS.setHours(0, 0, 0, 0);
    getDocs(query(collection(db, 'invoices'), where('createdAt', '>=', todayS), orderBy('createdAt', 'desc')))
      .then(snap => {
        let comm = 0, svcs = 0;
        snap.docs.forEach(d => {
          (d.data().items ?? []).forEach((item: any) => {
            if (item.staffId === staffMember.id) { comm += item.commissionAmount ?? 0; svcs++; }
          });
        });
        setTodayComm(comm); setTodaySvcs(svcs);
      }).catch(() => {});
  }, [staffMember.id]);

  const activeBookings = useMemo(
    () => bookings.filter(b => b.status !== 'failed' && b.status !== 'cancelled'),
    [bookings],
  );
  const nextIdx = activeBookings.findIndex(b => b.status === 'confirmed' || b.status === 'pending');

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
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-black/35 rounded-2xl p-3 text-center">
              <p className="text-2xl font-black text-white">{activeBookings.length}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{t('appointmentsToday')}</p>
            </div>
            <div className="bg-black/35 rounded-2xl p-3 text-center">
              <p className="text-2xl font-black text-emerald-400">{todaySvcs}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{t('doneToday')}</p>
            </div>
            <div className="bg-black/35 rounded-2xl p-3 text-center">
              <p className="text-2xl font-black text-gold">₹{todayComm.toLocaleString('en-IN')}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{t('commission')}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Two giant action buttons */}
      <div className="px-4 pb-4 grid grid-cols-2 gap-3">
        <motion.button whileTap={{ scale: 0.95 }} onClick={onOpenBill}
          className="flex flex-col items-center justify-center gap-2 rounded-3xl p-5 h-32 bg-gradient-to-br from-[#D4AF37] to-[#F0D060] text-black shadow-[0_8px_32px_-4px_rgba(212,175,55,0.55)]"
        >
          <Receipt size={36} strokeWidth={2.5} />
          <div className="text-center leading-tight">
            <p className="text-xl font-black">{t('makeBill')}</p>
            <p className="text-[11px] font-bold opacity-70">New Bill</p>
          </div>
        </motion.button>

        <motion.button whileTap={{ scale: 0.95 }} onClick={onOpenAppointment}
          className="flex flex-col items-center justify-center gap-2 rounded-3xl p-5 h-32 bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-[0_8px_32px_-4px_rgba(59,130,246,0.5)]"
        >
          <CalendarPlus size={36} strokeWidth={2.5} />
          <div className="text-center leading-tight">
            <p className="text-xl font-black">{t('makeAppointment')}</p>
            <p className="text-[11px] font-bold opacity-70">Walk-in</p>
          </div>
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
        ) : activeBookings.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-14 gap-5 text-center"
          >
            <div className="w-24 h-24 rounded-3xl bg-gold/10 border border-gold/20 flex items-center justify-center">
              <CalendarDays size={44} className="text-gold" />
            </div>
            <div>
              <p className="text-white font-black text-xl">{t('noAppointments')}</p>
            </div>
            <motion.button whileTap={{ scale: 0.95 }} onClick={onOpenBill}
              className="flex items-center gap-2 px-7 py-4 bg-gradient-to-r from-[#D4AF37] to-[#F0D060] rounded-2xl text-black font-black text-base"
            >
              <Receipt size={18} /> {t('createBillNow')}
            </motion.button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {activeBookings.map((b, i) => {
              const st   = statusInfo(b.status, t);
              const time = fmtTime(b.startTime, b.bookingTime);
              const svc  = b.serviceNames || b.serviceName || '—';
              const isNext = i === nextIdx;
              return (
                <motion.div key={b.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`relative rounded-3xl border p-4 ${isNext ? 'bg-gradient-to-br from-gold/12 to-gold/5 border-gold/30' : 'bg-zinc-900 border-white/10'}`}
                >
                  {isNext && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 bg-gold text-black text-[10px] font-black uppercase rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                      {t('nextCustomer')}
                    </div>
                  )}
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-16 text-center pt-1">
                      <p className="text-white font-black text-base leading-none">{time.split(' ')[0]}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{time.split(' ')[1] ?? ''}</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-center gap-1 mt-1.5">
                      <div className={`w-3 h-3 rounded-full ${st.dot}`} />
                      <div className="w-px flex-1 bg-white/10 min-h-[30px]" />
                    </div>
                    <div className="flex-1 min-w-0 pr-16">
                      <p className="text-white font-black text-lg leading-tight">{b.customerName}</p>
                      <p className="text-gray-400 text-sm mt-0.5 truncate">{svc}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border ${st.bg} ${st.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                        {(b.totalAmount ?? 0) > 0 && (
                          <span className="text-[11px] text-gray-400 font-bold">₹{(b.totalAmount ?? 0).toLocaleString('en-IN')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bill Tab ─────────────────────────────────────────────────────────────────

function BillScreen({ onOpenBill }: { onOpenBill: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 pb-28">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 250, damping: 20 }}
        className="w-32 h-32 rounded-[36px] bg-gradient-to-br from-gold/20 to-gold/5 border-2 border-gold/30 flex items-center justify-center"
      >
        <Receipt size={56} className="text-gold" />
      </motion.div>
      <div className="text-center">
        <h2 className="text-white font-black text-3xl">{t('makeBill')}</h2>
        <p className="text-gray-400 text-sm mt-3 leading-relaxed">
          {t('customer')} → {t('services')} → {t('payment')}
        </p>
      </div>
      <motion.button whileTap={{ scale: 0.95 }} onClick={onOpenBill}
        className="flex items-center justify-center gap-3 px-10 py-5 bg-gradient-to-r from-[#D4AF37] to-[#F0D060] rounded-3xl text-black font-black text-xl shadow-[0_8px_40px_-4px_rgba(212,175,55,0.55)] w-full max-w-xs"
      >
        <Receipt size={26} /> {t('newBill')}
      </motion.button>
      <p className="text-gray-600 text-sm text-center">
        {t('staff')} auto-assign hoga ✓
      </p>
    </div>
  );
}

// ─── Earnings Screen ──────────────────────────────────────────────────────────

function EarningsScreen({ staffMember }: { staffMember: StaffMember }) {
  const { t } = useLanguage();
  const [loading,   setLoading]   = useState(true);
  const [todayComm, setTodayComm] = useState(0);
  const [weekComm,  setWeekComm]  = useState(0);
  const [monthComm, setMonthComm] = useState(0);
  const [todaySvcs, setTodaySvcs] = useState<{ name: string; commission: number }[]>([]);

  useEffect(() => {
    const now    = new Date();
    const todayS = new Date(now); todayS.setHours(0, 0, 0, 0);
    const weekS  = new Date(now); weekS.setDate(now.getDate() - 7);
    const monthS = new Date(now); monthS.setDate(1); monthS.setHours(0, 0, 0, 0);

    getDocs(query(collection(db, 'invoices'), where('createdAt', '>=', monthS), orderBy('createdAt', 'desc')))
      .then(snap => {
        let td = 0, wk = 0, mo = 0;
        const svcs: { name: string; commission: number }[] = [];
        snap.docs.forEach(d => {
          const inv  = d.data();
          const date = inv.createdAt?.toDate?.() ?? new Date(0);
          (inv.items ?? []).forEach((item: any) => {
            if (item.staffId !== staffMember.id) return;
            const c = item.commissionAmount ?? 0;
            mo += c;
            if (date >= weekS)  wk += c;
            if (date >= todayS) { td += c; svcs.push({ name: item.serviceName ?? '—', commission: c }); }
          });
        });
        setTodayComm(td); setWeekComm(wk); setMonthComm(mo); setTodaySvcs(svcs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [staffMember.id]);

  const salary = (staffMember as any).salary ?? 0;

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <Loader2 size={40} className="animate-spin text-gold" />
      <p className="text-gray-400 text-base">{t('loading')}</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide pb-28 px-4 pt-5 space-y-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="relative bg-gradient-to-br from-gold/18 to-gold/5 border border-gold/30 rounded-3xl p-7 text-center overflow-hidden"
      >
        <Award size={36} className="text-gold mx-auto mb-3" />
        <p className="text-gray-300 text-base font-bold">{t('todayEarnings')}</p>
        <p className="text-6xl font-black text-gold mt-2">₹{todayComm.toLocaleString('en-IN')}</p>
        <p className="text-gray-400 text-sm mt-3">
          {todaySvcs.length} {t('serviceDone')}
        </p>
      </motion.div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: t('thisWeek'), val: weekComm },
          { label: t('thisMonth'), val: monthComm },
        ].map((row, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
            className="bg-zinc-900 border border-white/12 rounded-3xl p-5"
          >
            <p className="text-gray-400 text-sm font-bold">{row.label}</p>
            <p className="text-3xl font-black text-white mt-2">₹{row.val.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-gray-500 mt-1">{t('commission')}</p>
          </motion.div>
        ))}
      </div>

      {salary > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-emerald-500/10 border border-emerald-500/25 rounded-3xl p-5 flex items-center justify-between"
        >
          <div>
            <p className="text-gray-400 text-sm font-bold">{t('salary')}</p>
            <p className="text-3xl font-black text-emerald-400 mt-1">₹{salary.toLocaleString('en-IN')}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-sm font-bold">{t('totalPayable')}</p>
            <p className="text-2xl font-black text-white mt-1">₹{(salary + monthComm).toLocaleString('en-IN')}</p>
          </div>
        </motion.div>
      )}

      {todaySvcs.length > 0 ? (
        <div>
          <p className="text-white font-black text-lg mb-3">{t('todaySchedule')}</p>
          <div className="space-y-2">
            {todaySvcs.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}
                className="flex items-center justify-between bg-zinc-900 border border-white/10 rounded-2xl px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
                    <Scissors size={16} className="text-gold" />
                  </div>
                  <span className="text-white font-bold text-base">{s.name}</span>
                </div>
                <span className="text-gold font-black text-lg">₹{s.commission.toLocaleString('en-IN')}</span>
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
          <Sparkles size={44} className="text-gray-600" />
          <p className="text-gray-400 text-base">{t('noServiceToday')}</p>
          <p className="text-gray-600 text-sm">{t('startBilling')}</p>
        </div>
      )}
    </div>
  );
}

// ─── Profile Screen ───────────────────────────────────────────────────────────

function ProfileScreen({ staffMember, onSignOut }: { staffMember: StaffMember; onSignOut: () => void }) {
  const { t } = useLanguage();
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

      <div className="space-y-3">
        {[
          { label: t('commissionRate'), value: `${staffMember.commissionRate}%`, icon: <TrendingUp size={20} className="text-gold" /> },
          ...(((staffMember as any).salary ?? 0) > 0 ? [{
            label: t('salary'), value: `₹${((staffMember as any).salary).toLocaleString('en-IN')}`,
            icon: <Wallet size={20} className="text-emerald-400" />,
          }] : []),
        ].map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}
            className="flex items-center justify-between bg-zinc-900 border border-white/12 rounded-2xl px-5 py-5"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/8 flex items-center justify-center shrink-0">{item.icon}</div>
              <p className="text-white font-black text-base">{item.label}</p>
            </div>
            <span className="text-white font-black text-xl">{item.value}</span>
          </motion.div>
        ))}
      </div>

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

// ─── Main Component ───────────────────────────────────────────────────────────

interface StaffPortalProps {
  staffMember: StaffMember;
  onSignOut: () => void;
}

export default function StaffPortal({ staffMember, onSignOut }: StaffPortalProps) {
  const { t } = useLanguage();
  const [tab,         setTab]         = useState<Tab>('home');
  const [billingOpen, setBillingOpen] = useState(false);
  const [walkInOpen,  setWalkInOpen]  = useState(false);

  const firebaseUser = auth.currentUser;

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'home',     icon: <Home       size={24} />, label: t('home')     },
    { id: 'bill',     icon: <Receipt    size={24} />, label: t('bill')     },
    { id: 'earnings', icon: <TrendingUp size={24} />, label: t('earnings') },
    { id: 'profile',  icon: <User       size={24} />, label: t('profile')  },
  ];

  // ── Full-screen billing takeover ─────────────────────────────────────────
  if (billingOpen) {
    return (
      <div className="h-screen bg-[#0d0d0d] text-white flex flex-col overflow-hidden">
        <BillingModule
          onClose={() => setBillingOpen(false)}
          onInvoiceCreated={() => setBillingOpen(false)}
        />
      </div>
    );
  }

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
            <span className="text-white font-black text-sm">Walk-in Appointment</span>
          </button>
          <span className="ml-auto text-gray-500 text-xs">← Back to portal</span>
          <button onClick={() => setWalkInOpen(false)}
            className="w-8 h-8 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all">
            <LogOut size={14} />
          </button>
        </div>
        {/* WalkInBooking fills remaining space; its fixed-inset overlay is removed by rendering inline */}
        <div className="flex-1 overflow-y-auto">
          <WalkInBooking user={firebaseUser} staffMember={staffMember} createdBy="staff"
            onClose={() => setWalkInOpen(false)} onCreated={() => setWalkInOpen(false)} />
        </div>
      </div>
    );
  }

  // ── Normal portal view ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col">
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
              <HomeScreen staffMember={staffMember} onOpenBill={() => setBillingOpen(true)} onOpenAppointment={() => setWalkInOpen(true)} />
            </motion.div>
          )}
          {tab === 'bill' && (
            <motion.div key="bill" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
              <BillScreen onOpenBill={() => setBillingOpen(true)} />
            </motion.div>
          )}
          {tab === 'earnings' && (
            <motion.div key="earnings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
              <EarningsScreen staffMember={staffMember} />
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
