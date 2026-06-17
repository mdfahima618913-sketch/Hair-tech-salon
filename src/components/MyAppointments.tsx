import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  Phone, Search, Calendar, Clock, CheckCircle2, AlertCircle,
  Loader2, ChevronLeft, IndianRupee, Scissors, CalendarCheck,
  CalendarX, FileText, Download, Edit2, X, Sun, CloudSun, Moon,
  ArrowRight, Star, MapPin,
} from 'lucide-react';
import {
  collection, query, where, getDocs, doc, updateDoc, getDoc, serverTimestamp,
  orderBy, limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format, parseISO, isToday, isFuture, startOfDay, addDays, isSameDay } from 'date-fns';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface InvoiceLineItem {
  name: string; price: number; staffName?: string | null;
  commissionRate?: number; commissionAmt?: number;
}

interface Booking {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceNames: string;
  bookingDate: string;
  bookingTime: string;
  startTime?: string;
  endTime?: string;
  totalAmount: number;
  originalAmount?: number;
  discountAmount?: number;
  discountPercent?: number;
  couponCode?: string;
  status: string;
  serviceDurationMins?: number;
  paymentId?: string;
  invoiceId?: string;
  invoiceBreakdown?: InvoiceLineItem[];
  finalAmount?: number;
  paymentMethod?: string;
  originalBookingDate?: string;
  originalBookingTime?: string;
  originalStartTime?: string;
  originalEndTime?: string;
  rescheduleCount?: number;
}

type AppTab = 'upcoming' | 'pending' | 'completed';

// ─── Slot helpers (mirrors BookingSystem) ─────────────────────────────────────

const STAFF_COUNT = 3; const SALON_OPEN_H = 10; const SALON_CLOSE_H = 22;
const SLOT_STEP_MINS = 15; const BUFFER_MINS = 30;

interface SlotOption { label: string; startISO: string; endISO: string; available: number; session: 'morning'|'afternoon'|'evening'; }
interface ExistingBooking { startTime: string; endTime: string; }

function fmtT(d: Date) {
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
    out.push({ label: `${fmtT(sd)} – ${fmtT(ed)}`, startISO: sd.toISOString(), endISO: ed.toISOString(), available: STAFF_COUNT - concurrent, session: h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening' });
  }
  return out;
}

// ─── Razorpay ──────────────────────────────────────────────────────────────────

declare global { interface Window { Razorpay: new (o: any) => any; } }
// Use the same pattern as BookingSystem.tsx — direct env access (no optional chaining)
const RAZORPAY_KEY = 'rzp_live_SmNepW6x97QG64';

function loadRazorpay() {
  return new Promise<boolean>(resolve => {
    if (document.querySelector('script[src*="razorpay"]')) { resolve(true); return; }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getDate(b: Booking) {
  try { const r = b.startTime || b.bookingDate; return r ? parseISO(r) : null; } catch { return null; }
}

function classifyBooking(b: Booking): AppTab {
  if (b.status === 'pending') return 'pending';
  if (b.status === 'completed') return 'completed';
  const d = getDate(b);
  if (!d) return 'completed';
  return (isToday(d) || isFuture(startOfDay(d))) ? 'upcoming' : 'completed';
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  paid:      { label: 'Paid',       cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  confirmed: { label: 'Confirmed',  cls: 'text-blue-400    bg-blue-400/10    border-blue-400/20'    },
  completed: { label: 'Completed',  cls: 'text-purple-400  bg-purple-400/10  border-purple-400/20'  },
  pending:   { label: 'Pending',    cls: 'text-amber-400   bg-amber-400/10   border-amber-400/20'   },
  failed:    { label: 'Failed',     cls: 'text-red-400     bg-red-400/10     border-red-400/20'     },
};

// ─── Invoice viewer (full detail, matches BillingModule's InvoicePreview) ─────

function InvoiceViewer({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, 'invoices', invoiceId))
      .then(s => { if (s.exists() && s.data().billingType !== 'vvip') setData(s.data()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const handlePrint = () => {
    if (!data) return;
    const w = window.open('', '_blank'); if (!w) return;
    const discountLine = (data.discountAmount ?? 0) > 0
      ? `<div class="row"><span>Discount (${data.discountPercent}%)</span><span style="color:#c00">-&#8377;${data.discountAmount.toLocaleString('en-IN')}</span></div>`
      : '';
    const dueSettledLine = (data.dueSettlementAmount ?? 0) > 0
      ? `<div class="row"><span>&#9888; Previous Dues Settled</span><span style="color:#c07000">+&#8377;${data.dueSettlementAmount.toLocaleString('en-IN')}</span></div>`
      : '';
    const advanceSettledLine = (data.advanceSettlementAmount ?? 0) > 0
      ? `<div class="row"><span>Advance Applied</span><span style="color:#0077aa">-&#8377;${data.advanceSettlementAmount.toLocaleString('en-IN')}</span></div>`
      : '';
    const roundOffLine = (data.roundOffAmount ?? 0) !== 0
      ? `<div class="row sm"><span>Round Off</span><span>&#8377;${data.roundOffAmount.toLocaleString('en-IN')}</span></div>`
      : '';
    const newAdvanceLine = (data.advanceAmount ?? 0) > 0
      ? `<div class="row sm" style="color:#007700"><span>Saved as Advance</span><span>&#8377;${data.advanceAmount.toLocaleString('en-IN')}</span></div>`
      : '';
    const items: any[] = data.items ?? [];
    const splits: any[] = data.paymentSplits ?? [];
    const effectivePaid = data.amountPaid ?? (data.total - (data.amountDue ?? 0));
    const hasDue = (data.amountDue ?? 0) > 0;
    const paymentRows = splits.length > 0
      ? splits.map((s: any) => `<div class="row sm"><span style="text-transform:capitalize${s.isAdvance ? ';color:#c07000;font-weight:700' : ''}">${s.isAdvance ? `Advance (${s.method})` : s.method === 'online' ? 'Razorpay' : s.method}</span><span>&#8377;${s.amount.toLocaleString('en-IN')}</span></div>`).join('')
        + (splits.length > 1 ? `<div class="row sm"><span>Collected</span><span class="bold">&#8377;${effectivePaid.toLocaleString('en-IN')}</span></div>` : '')
      : `<div class="row sm"><span style="text-transform:capitalize">${data.paymentMethod === 'online' ? 'Razorpay' : (data.paymentMethod ?? '')}</span><span class="bold">&#8377;${effectivePaid.toLocaleString('en-IN')}</span></div>`;
    const dateStr = data.createdAt?.toDate
      ? data.createdAt.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    w.document.write(`<!DOCTYPE html><html><head>
      <title>Invoice ${data.invoiceNumber}</title><meta charset="utf-8"/>
      <style>
        @page{size:80mm auto;margin:0}*{box-sizing:border-box}
        body{font-family:'Courier New',Courier,monospace;font-size:12px;width:80mm;margin:0 auto;padding:6mm 4mm;color:#000}
        .center{text-align:center}.bold{font-weight:700}.lg{font-size:15px}.xl{font-size:20px;font-weight:900}
        .sm{font-size:10px;color:#555}.dash{border-top:1px dashed #888;margin:5px 0}
        .row{display:flex;justify-content:space-between;padding:2px 0}
        .row.total{font-size:15px;font-weight:900;padding-top:4px}
        .badge{display:inline-block;background:#eee;padding:1px 5px;border-radius:3px;font-size:9px}
        .svc{margin:3px 0}.staff-hint{font-size:9px;color:#888;margin-left:8px}
      </style>
    </head><body>
      <div class="center" style="margin-bottom:8px">
        <div class="xl">Hair Tech</div>
        <div class="bold">Unisex Salon, Araria</div>
        <div class="sm">+91 87896 03343</div>
        <div class="sm" style="margin-top:4px"><span class="badge">${data.source === 'online' ? 'Online Booking' : 'Walk-in'}</span></div>
      </div>
      <div class="dash"></div>
      <div class="sm">Invoice: <span class="bold">${data.invoiceNumber}</span></div>
      <div class="sm">${dateStr}</div>
      <div class="dash"></div>
      <div class="row"><span>Customer</span><span class="bold">${data.customerName}</span></div>
      <div class="row sm"><span>Phone</span><span>${data.customerPhone}</span></div>
      <div class="dash"></div>
      <div class="bold sm" style="margin-bottom:4px">SERVICES</div>
      ${items.map((it: any) => `
        <div class="svc">
          <div class="row"><span>${it.serviceName}${(it.quantity ?? 1) > 1 ? ` &times;${it.quantity}` : ''}</span><span class="bold">&#8377;${it.price?.toLocaleString('en-IN')}</span></div>
          ${(it.quantity ?? 1) > 1 ? `<div class="staff-hint">&#8377;${it.unitPrice?.toLocaleString('en-IN')} &times; ${it.quantity}</div>` : ''}
          ${it.staffName ? `<div class="staff-hint">Staff: ${it.staffName}</div>` : ''}
        </div>`).join('')}
      <div class="dash"></div>
      <div class="row"><span>Subtotal</span><span>&#8377;${data.subtotal?.toLocaleString('en-IN')}</span></div>
      ${discountLine}${dueSettledLine}${advanceSettledLine}
      <div class="row total"><span>TOTAL</span><span>&#8377;${data.total?.toLocaleString('en-IN')}</span></div>
      <div class="sm bold" style="margin-top:4px">Payment</div>
      ${paymentRows}
      <div class="row sm" style="color:${hasDue ? '#c00' : '#007700'};font-weight:700">
        <span>${hasDue ? 'Balance Due' : '&#10003; Fully Paid'}</span>
        <span>&#8377;${hasDue ? (data.amountDue ?? 0).toLocaleString('en-IN') : effectivePaid.toLocaleString('en-IN')}</span>
      </div>
      ${roundOffLine}
      ${newAdvanceLine}
      ${data.paymentId ? `<div class="row sm"><span>Ref ID</span><span>${data.paymentId}</span></div>` : ''}
      ${(data.promoCoupons?.length ?? 0) > 0 ? `<div class="dash"></div><div class="sm bold">&#127915; Your Promo Coupons</div>${data.promoCoupons.map((c: string) => `<div class="row"><span>&#9733;</span><span class="bold" style="letter-spacing:3px;font-size:13px">${c}</span></div>`).join('')}` : ''}
      <div class="dash"></div>
      <div class="center sm" style="margin-top:6px">Thank you for visiting Hair Tech Salon!<br/>Follow us &#64;hairtech111</div>
    </body></html>`);
    w.document.close(); setTimeout(() => w.print(), 400);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-3 rounded-2xl overflow-hidden border border-white/10 bg-white">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <p className="text-xs font-black text-gray-700 uppercase tracking-wider">Invoice</p>
          <div className="flex items-center gap-2">
            {data && (
              <button onClick={handlePrint} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-[10px] font-bold text-gray-500 hover:bg-gray-100 transition-all">
                <Download size={11} /> Print / Download
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-700 transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
            <Loader2 size={16} className="animate-spin" /> Loading invoice…
          </div>
        ) : !data ? (
          <p className="text-center py-6 text-gray-400 text-sm">Invoice not available.</p>
        ) : (() => {
          const items: any[] = data.items ?? [];
          const splits: any[] = data.paymentSplits ?? [];
          const effectivePaid = data.amountPaid ?? (data.total - (data.amountDue ?? 0));
          const hasDue = (data.amountDue ?? 0) > 0;
          const dateStr = data.createdAt?.toDate
            ? data.createdAt.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '';
          return (
            <div className="p-5 font-mono text-xs text-black space-y-0">
              {/* Header */}
              <div className="text-center mb-4">
                <p className="font-black text-xl uppercase tracking-tight">Hair Tech</p>
                <p className="font-bold text-sm">Unisex Salon, Araria</p>
                <p className="text-gray-500 text-[10px]">+91 87896 03343</p>
                <div className="flex justify-center gap-1 mt-2">
                  <span className={`text-[9px] px-2 py-0.5 rounded border ${data.source === 'online' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    {data.source === 'online' ? 'Online Booking' : 'Walk-in'}
                  </span>
                </div>
                <div className="mt-2 text-[9px] text-gray-400 space-y-0.5">
                  <p>Invoice: <span className="font-black text-black">{data.invoiceNumber}</span></p>
                  {dateStr && <p>{dateStr}</p>}
                </div>
              </div>

              {/* Customer */}
              <div className="border-t border-dashed border-gray-300 pt-3 pb-3 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-gray-500">Customer</span><span className="font-bold">{data.customerName}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">Phone</span><span className="text-gray-700">{data.customerPhone}</span></div>
              </div>

              {/* Services */}
              <div className="border-t border-dashed border-gray-300 pt-3 pb-3 space-y-2.5">
                <p className="text-[9px] font-black uppercase tracking-wider text-gray-500 mb-2">Services</p>
                {items.map((it: any, i: number) => (
                  <div key={i} className="space-y-0.5">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-gray-800 flex-1 text-xs">{it.serviceName}{(it.quantity ?? 1) > 1 ? ` ×${it.quantity}` : ''}</span>
                      <span className="font-bold shrink-0 text-xs">₹{it.price?.toLocaleString('en-IN')}</span>
                    </div>
                    {(it.quantity ?? 1) > 1 && (
                      <p className="text-[9px] text-gray-400 pl-1">₹{it.unitPrice?.toLocaleString('en-IN')} × {it.quantity}</p>
                    )}
                    {(it.lineDiscount ?? 0) > 0 && (
                      <p className="text-[9px] text-red-500 pl-1">Line discount: {it.lineDiscount}%</p>
                    )}
                    {it.staffName && (
                      <p className="text-[9px] text-gray-400 pl-1">Staff: {it.staffName}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-dashed border-gray-300 pt-3 space-y-1.5">
                <div className="flex justify-between text-xs text-gray-400"><span>Subtotal</span><span>₹{data.subtotal?.toLocaleString('en-IN')}</span></div>
                {(data.discountAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-xs text-red-600">
                    <span>Discount ({data.discountPercent}%)</span>
                    <span>-₹{data.discountAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {(data.dueSettlementAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-xs text-amber-600 font-bold">
                    <span>⚠ Previous Dues Settled</span>
                    <span>+₹{data.dueSettlementAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {(data.advanceSettlementAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-xs text-sky-600 font-bold">
                    <span>Advance Applied</span>
                    <span>-₹{data.advanceSettlementAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm pt-1.5 border-t border-dashed border-gray-300">
                  <span>TOTAL</span>
                  <span style={{ color: '#B8941F' }}>₹{data.total?.toLocaleString('en-IN')}</span>
                </div>

                {/* Payment splits */}
                <div className="pt-2 space-y-1.5">
                  <p className="text-[9px] text-gray-500 uppercase tracking-wider font-black">Payment</p>
                  {splits.length > 0 ? (
                    <>
                      {splits.map((s: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className={`capitalize ${s.isAdvance ? 'text-amber-600 font-bold' : 'text-gray-600'}`}>
                            {s.isAdvance ? `Advance (${s.method})` : s.method === 'online' ? 'Razorpay' : s.method}
                          </span>
                          <span className="font-bold text-black">₹{s.amount?.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                      {splits.length > 1 && (
                        <div className="flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-200 pt-0.5">
                          <span>Collected</span>
                          <span className="font-bold">₹{effectivePaid.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600 capitalize">
                        {data.paymentMethod === 'online' ? 'Razorpay' : (data.paymentMethod ?? '—')}
                      </span>
                      <span className="font-bold text-black">₹{effectivePaid.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className={`flex justify-between text-xs font-black pt-1 border-t border-dashed border-gray-200 ${hasDue ? 'text-red-600' : 'text-emerald-700'}`}>
                    <span>
                      {hasDue ? 'Balance Due' : '✓ Fully Paid'}
                      {hasDue && (
                        <span className="font-normal text-[9px] text-gray-400 ml-1">
                          (₹{data.total?.toLocaleString('en-IN')} − ₹{effectivePaid.toLocaleString('en-IN')})
                        </span>
                      )}
                    </span>
                    <span>{hasDue ? `₹${(data.amountDue ?? 0).toLocaleString('en-IN')}` : `₹${effectivePaid.toLocaleString('en-IN')}`}</span>
                  </div>
                  {(data.roundOffAmount ?? 0) !== 0 && (
                    <div className="flex justify-between text-xs text-sky-600">
                      <span>Round Off</span>
                      <span className="font-bold">₹{data.roundOffAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {(data.advanceAmount ?? 0) > 0 && (
                    <div className="flex justify-between text-xs text-emerald-700">
                      <span>Saved as Advance</span>
                      <span className="font-bold">₹{data.advanceAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {data.paymentId && (
                    <div className="flex justify-between text-[9px] text-gray-400">
                      <span>Ref ID</span><span className="font-mono">{data.paymentId}</span>
                    </div>
                  )}
                </div>
              </div>

              {(data.promoCoupons?.length ?? 0) > 0 && (
                <div className="border-t border-dashed border-gray-300 pt-3 mt-3">
                  <p className="text-[9px] text-purple-500 font-black uppercase tracking-wider mb-2">🎟️ Your Promo Coupons</p>
                  <div className="space-y-1.5">
                    {data.promoCoupons.map((c: string, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                        <span className="text-purple-400 text-xs">★</span>
                        <span className="font-black font-mono tracking-[4px] text-purple-700 text-sm">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-dashed border-gray-300 mt-4 pt-3 text-center text-[9px] text-gray-400">
                Thank you for visiting Hair Tech Salon!<br />Follow us @hairtech111
              </div>
            </div>
          );
        })()}
      </div>
    </motion.div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function MyAppointments() {
  const [phone,              setPhone]              = useState('');
  const [bookings,           setBookings]           = useState<Booking[] | null>(null);
  const [completedInvoices,  setCompletedInvoices]  = useState<Booking[] | null>(null);
  const [loading,            setLoading]            = useState(false);
  const [error,              setError]              = useState<string | null>(null);
  const [activeTab,          setActiveTab]          = useState<AppTab>('upcoming');

  // Reschedule state
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [editDate,       setEditDate]       = useState(() => new Date());
  const [editSlots,      setEditSlots]      = useState<SlotOption[]>([]);
  const [editSelSlot,    setEditSelSlot]    = useState<SlotOption | null>(null);
  const [slotsLoading,   setSlotsLoading]   = useState(false);
  const [editSaving,     setEditSaving]     = useState(false);
  const [editSuccess,    setEditSuccess]    = useState<string | null>(null);
  const dateStrip = Array.from({ length: 8 }, (_, i) => addDays(new Date(), i));

  // Retry payment state
  const [payingId,  setPayingId]  = useState<string | null>(null);
  const [payError,  setPayError]  = useState<string | null>(null);

  // Invoice state
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);

  // Search
  const search = useCallback(async (ph: string) => {
    const digits = ph.replace(/\D/g, '').slice(-10);
    if (digits.length < 10) return;
    setLoading(true); setError(null); setBookings(null); setCompletedInvoices(null);
    try {
      // Covers: raw 10-digit, E.164 (no space), E.164 (with space), country-code, leading-zero
      const formats = [digits, `+91${digits}`, `+91 ${digits}`, `91${digits}`, `0${digits}`];

      // Bookings (upcoming + pending tabs)
      const seen = new Set<string>(), results: Booking[] = [];
      const snaps = await Promise.all(
        formats.map(fmt => getDocs(query(collection(db, 'bookings'), where('customerPhone', '==', fmt))))
      );
      snaps.forEach(snap => snap.docs.forEach(d => {
        if (!seen.has(d.id)) { seen.add(d.id); results.push({ id: d.id, ...(d.data() as any) }); }
      }));
      results.sort((a, b) => new Date(b.startTime || b.bookingDate || '').getTime() - new Date(a.startTime || a.bookingDate || '').getTime());
      setBookings(results);

      // Invoices (completed tab) — covers both online and walk-in billed orders
      const seenInv = new Set<string>(), invResults: Booking[] = [];
      const invSnaps = await Promise.all(
        formats.map(fmt =>
          getDocs(query(collection(db, 'invoices'), where('customerPhone', '==', fmt), orderBy('createdAt', 'desc'), limit(100)))
        )
      );
      invSnaps.forEach(snap => snap.docs.forEach(d => {
        if (!seenInv.has(d.id)) {
          seenInv.add(d.id);
          const inv = d.data() as any;
          if (inv.billingType === 'vvip') return; // VVIP bills are hidden from customer view
          const createdDate: Date | null = inv.createdAt?.toDate?.() ?? null;
          invResults.push({
            id: d.id,
            customerName:    inv.customerName  ?? '',
            customerPhone:   inv.customerPhone ?? '',
            serviceNames:    (inv.items ?? []).map((it: any) => it.serviceName ?? it.name ?? '').filter(Boolean).join(', '),
            bookingDate:     createdDate?.toISOString() ?? '',
            bookingTime:     createdDate ? format(createdDate, 'h:mm a') : '',
            totalAmount:     inv.total ?? 0,
            finalAmount:     inv.amountPaid ?? inv.total ?? 0,
            status:          'completed',
            invoiceId:       d.id,
            paymentMethod:   inv.paymentMethod ?? (inv.paymentSplits?.[0]?.method === 'online' ? 'Razorpay' : inv.paymentSplits?.[0]?.method ?? ''),
          });
        }
      }));
      setCompletedInvoices(invResults);

      // Default tab
      const hasUpcoming = results.some(b => classifyBooking(b) === 'upcoming');
      const hasPending  = results.some(b => classifyBooking(b) === 'pending');
      setActiveTab(hasPending ? 'pending' : hasUpcoming ? 'upcoming' : invResults.length > 0 ? 'completed' : 'upcoming');
    } catch { setError('Could not fetch your bookings. Please try again.'); }
    finally { setLoading(false); }
  }, []);

  // Debounced search on phone input
  useEffect(() => {
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) return;
    const t = setTimeout(() => search(phone), 400);
    return () => clearTimeout(t);
  }, [phone, search]);

  // Slot loading for reschedule
  const loadSlots = useCallback(async (date: Date, durationMins: number, excludeBookingId?: string) => {
    setSlotsLoading(true); setEditSelSlot(null);
    try {
      const s = startOfDay(date).toISOString(), e = startOfDay(addDays(date, 1)).toISOString();
      const snap = await getDocs(query(collection(db, 'bookings'), where('startTime', '>=', s), where('startTime', '<', e), where('status', 'in', ['paid', 'confirmed', 'pending'])));
      const existing: ExistingBooking[] = snap.docs.flatMap(d => { if (d.id === excludeBookingId) return []; const x = d.data(); return x.startTime && x.endTime ? [{ startTime: x.startTime, endTime: x.endTime }] : []; });
      setEditSlots(computeSlots(date, durationMins || 60, existing));
    } catch { setEditSlots([]); }
    finally { setSlotsLoading(false); }
  }, []);

  const saveReschedule = useCallback(async (booking: Booking) => {
    if (!editSelSlot) return;
    setEditSaving(true);
    try {
      const newDate = startOfDay(editDate).toISOString();
      const updates: Record<string, unknown> = {
        bookingDate: newDate,
        bookingTime: editSelSlot.label,
        startTime:   editSelSlot.startISO,
        endTime:     editSelSlot.endISO,
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
      setBookings(prev => prev?.map(b => b.id === booking.id ? { ...b, bookingDate: newDate, bookingTime: editSelSlot.label, startTime: editSelSlot.startISO, endTime: editSelSlot.endISO } : b) ?? null);
      setEditSuccess(`Rescheduled to ${format(editDate, 'EEE, MMM d')} · ${editSelSlot.label}`);
      setTimeout(() => { setEditingId(null); setEditSuccess(null); }, 2200);
    } catch { /* silent */ } finally { setEditSaving(false); }
  }, [editSelSlot, editDate]);

  // Retry payment — with visible error feedback
  const retryPayment = useCallback(async (b: Booking) => {
    setPayError(null);
    setPayingId(b.id);

    // Ensure Razorpay script is loaded
    const ok = await loadRazorpay();
    if (!ok) {
      setPayingId(null);
      setPayError('Could not load payment portal. Please check your connection and try again.');
      return;
    }

    // Guard: Razorpay key must be present (requires VITE_RAZORPAY_KEY_ID in .env)
    if (!RAZORPAY_KEY) {
      setPayingId(null);
      setPayError('Payment configuration missing. Please contact the salon.');
      return;
    }

    try {
      const rp = new window.Razorpay({
        key:      RAZORPAY_KEY,
        amount:   (b.totalAmount ?? 0) * 100,
        currency: 'INR',
        name:     'Hair Tech Salon',
        description: b.serviceNames || 'Salon Services',
        prefill:  { name: b.customerName, contact: b.customerPhone, email: '' },
        theme:    { color: '#D4AF37' },
        notes:    { bookingId: b.id },
        handler: async (res: any) => {
          try {
            await updateDoc(doc(db, 'bookings', b.id), {
              status:    'paid',
              paymentId: res.razorpay_payment_id,
              updatedAt: serverTimestamp(),
            });
            // Move booking from pending to upcoming/active in the local list
            setBookings(prev =>
              prev?.map(bk =>
                bk.id === b.id
                  ? { ...bk, status: 'paid', paymentId: res.razorpay_payment_id }
                  : bk
              ) ?? null
            );
            setPayingId(null);
            setPayError(null);
          } catch {
            setPayingId(null);
            setPayError(`Payment received (ID: ${res.razorpay_payment_id}) but confirmation failed. Please contact the salon with this ID.`);
          }
        },
        modal: {
          ondismiss: () => {
            setPayingId(null);
            // Don't set an error on dismiss — user intentionally closed
          },
        },
      });

      rp.on('payment.failed', (response: any) => {
        setPayingId(null);
        setPayError(`Payment failed: ${response?.error?.description ?? 'Unknown error'}. Please try again.`);
      });

      rp.open();
    } catch (err: any) {
      setPayingId(null);
      setPayError(err?.message ?? 'Could not open payment portal. Please try again.');
    }
  }, []);

  // Derived
  const grouped = {
    upcoming:  bookings?.filter(b => classifyBooking(b) === 'upcoming') ?? [],
    pending:   bookings?.filter(b => classifyBooking(b) === 'pending')  ?? [],
    completed: completedInvoices ?? [],
  };
  const customerName = bookings?.[0]?.customerName ?? completedInvoices?.[0]?.customerName ?? '';

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="bg-black/90 backdrop-blur-xl border-b border-white/12 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/" className="p-2 rounded-xl hover:bg-white/8 text-gray-500 hover:text-white transition-all">
            <ChevronLeft size={20} />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center">
              <Scissors size={13} className="text-gold" />
            </div>
            <div>
              <p className="text-white font-black text-sm leading-none">My Appointments</p>
              <p className="text-gray-400 text-[10px] mt-0.5">Hair Tech Salon, Araria</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Phone search */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-wider text-gray-500">Your Mobile Number</label>
          <div className="relative">
            <Phone size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="tel" placeholder="Enter your 10-digit number"
              value={phone} onChange={e => setPhone(e.target.value)}
              maxLength={13}
              className="w-full bg-zinc-900 border border-white/10 rounded-2xl py-4 pl-11 pr-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
            />
            {loading && <Loader2 size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-gold animate-spin" />}
          </div>
          {error && <p className="text-red-400 text-xs flex items-center gap-1.5"><AlertCircle size={12}/>{error}</p>}
        </div>

        {/* Results */}
        {bookings !== null && (
          <>
            {/* Welcome back */}
            {customerName && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gold/8 border border-gold/20">
                <div className="w-9 h-9 rounded-full bg-gold/20 flex items-center justify-center text-gold font-black text-sm shrink-0">
                  {customerName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-bold text-sm">Welcome back, {customerName.split(' ')[0]}!</p>
                  <p className="text-gray-500 text-xs">{grouped.upcoming.length + grouped.pending.length + grouped.completed.length} record{(grouped.upcoming.length + grouped.pending.length + grouped.completed.length) !== 1 ? 's' : ''} found</p>
                </div>
              </div>
            )}

            {bookings.length === 0 && grouped.completed.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <CalendarX size={40} className="text-gray-700 mx-auto" />
                <p className="text-gray-400 font-bold">No bookings found</p>
                <p className="text-gray-400 text-sm">No appointments found for this number.</p>
                <Link to="/booking" className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 rounded-xl bg-gold text-black font-black text-xs uppercase tracking-wider">
                  Book Now <ArrowRight size={13}/>
                </Link>
              </div>
            ) : (
              <>
                {/* Tabs */}
                <div className="flex items-center gap-1 bg-zinc-900 border border-white/12 rounded-2xl p-1.5">
                  {([
                    { id: 'upcoming',  label: 'Upcoming',  count: grouped.upcoming.length,  cls: 'bg-gold/15 border border-gold/30 text-gold' },
                    { id: 'pending',   label: 'Pending',   count: grouped.pending.length,   cls: 'bg-amber-500/15 border border-amber-500/30 text-amber-400' },
                    { id: 'completed', label: 'Completed', count: grouped.completed.length, cls: 'bg-purple-500/15 border border-purple-500/30 text-purple-400' },
                  ] as const).map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === tab.id ? tab.cls : 'text-gray-500 hover:text-white'}`}
                    >
                      {tab.label}
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${activeTab === tab.id ? 'bg-white/20' : 'bg-white/8'}`}>{tab.count}</span>
                    </button>
                  ))}
                </div>

                {/* Empty state per tab */}
                {grouped[activeTab].length === 0 && (
                  <div className="text-center py-12 space-y-2">
                    <CalendarX size={32} className="text-gray-700 mx-auto" />
                    <p className="text-gray-500 text-sm">No {activeTab} appointments</p>
                    {activeTab === 'upcoming' && (
                      <Link to="/booking" className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 rounded-xl bg-gold text-black font-black text-xs uppercase tracking-wider">
                        Book an Appointment <ArrowRight size={12}/>
                      </Link>
                    )}
                  </div>
                )}

                {/* Appointment cards */}
                <div className="space-y-4">
                  <AnimatePresence>
                    {grouped[activeTab].map(b => {
                      const sm     = STATUS_META[b.status] ?? STATUS_META.pending;
                      const bDate  = getDate(b);
                      const isEditing = editingId === b.id;

                      return (
                        <motion.div key={b.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className={`rounded-3xl overflow-hidden border ${
                            activeTab === 'upcoming' ? 'border-gold/20 bg-zinc-900' :
                            activeTab === 'pending'  ? 'border-amber-500/20 bg-zinc-900' :
                                                       'border-white/12 bg-zinc-900'
                          }`}
                        >
                          {/* Card top accent */}
                          <div className={`h-0.5 ${activeTab === 'upcoming' ? 'bg-gold/50' : activeTab === 'pending' ? 'bg-amber-500/50' : 'bg-purple-500/50'}`} />

                          <div className="p-5 space-y-4">
                            {/* Date + status row */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                {/* Date box */}
                                {bDate && (
                                  <div className="text-center w-12 shrink-0">
                                    <div className={`text-[10px] font-black uppercase tracking-wider rounded-t-lg px-1 py-0.5 ${activeTab === 'upcoming' ? 'bg-gold/20 text-gold' : activeTab === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-400'}`}>
                                      {format(bDate, 'MMM')}
                                    </div>
                                    <div className="bg-white/8 rounded-b-lg pb-1.5 pt-1">
                                      <p className="text-2xl font-black text-white leading-none">{format(bDate, 'd')}</p>
                                      <p className="text-[9px] text-gray-500 font-bold">{format(bDate, 'EEE')}</p>
                                    </div>
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Clock size={11} className="text-gray-500 shrink-0" />
                                    <span className="text-white font-bold text-sm">{b.bookingTime || '—'}</span>
                                    {isToday(bDate ?? new Date()) && <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-emerald-500/20 text-emerald-400 animate-pulse">Today</span>}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <MapPin size={10} className="text-gray-400 shrink-0" />
                                    <span className="text-gray-500 text-xs">Hair Tech Salon, Araria</span>
                                  </div>
                                </div>
                              </div>
                              <span className={`shrink-0 px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${sm.cls}`}>
                                {sm.label}
                              </span>
                            </div>

                            {/* Services */}
                            <div className="pl-0 space-y-2">
                              <div className="flex items-start gap-2">
                                <Scissors size={12} className="text-gray-500 shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Services</p>
                                  {b.invoiceBreakdown && b.invoiceBreakdown.length > 0 ? (
                                    <div className="space-y-0.5">
                                      {b.invoiceBreakdown.map((it, i) => (
                                        <div key={i} className="flex justify-between text-xs gap-4">
                                          <span className="text-gray-300">{it.name}</span>
                                          <span className="text-white font-bold shrink-0">₹{it.price?.toLocaleString('en-IN')}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-gray-300 text-sm">{b.serviceNames}</p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Payment row */}
                            <div className="flex items-center justify-between pt-3 border-t border-white/10">
                              <div className="flex items-center gap-1.5">
                                <IndianRupee size={14} className="text-gold" />
                                <span className="text-gold font-black text-base">{(b.finalAmount ?? b.totalAmount ?? 0).toLocaleString('en-IN')}</span>
                                {b.paymentMethod && (
                                  <span className="text-gray-400 text-[10px] ml-1 uppercase">{b.paymentMethod}</span>
                                )}
                              </div>
                              {(b.status === 'paid' || b.status === 'confirmed' || b.status === 'completed') && (
                                <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold">
                                  <CheckCircle2 size={11}/> Paid
                                </span>
                              )}
                            </div>

                            {/* Booking ref */}
                            {b.paymentId && (
                              <p className="text-[9px] text-gray-700 font-mono">Ref: {b.paymentId.slice(-12)}</p>
                            )}

                            {/* ── Actions ── */}

                            {/* PENDING: retry payment */}
                            {activeTab === 'pending' && (
                              <div className="space-y-2 pt-2 border-t border-white/10">
                                <button
                                  onClick={() => { setPayError(null); retryPayment(b); }}
                                  disabled={!!payingId}
                                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gold text-black font-black text-sm uppercase tracking-wider disabled:opacity-50 active:opacity-70 transition-all shadow-[0_4px_16px_-4px_rgba(212,175,55,0.5)]"
                                >
                                  {payingId === b.id
                                    ? <><Loader2 size={15} className="animate-spin"/> Opening Payment…</>
                                    : <><IndianRupee size={15}/> Pay ₹{(b.totalAmount ?? 0).toLocaleString('en-IN')} to Confirm</>
                                  }
                                </button>

                                {/* Visible error message */}
                                {payError && payingId === null && (
                                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                                    <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5"/>
                                    <p className="text-red-400 text-[10px] leading-relaxed">{payError}</p>
                                  </div>
                                )}

                                <p className="text-[10px] text-gray-400 text-center">
                                  If payment was already deducted, your booking is being verified.{' '}
                                  <a href="tel:+918789603343" className="text-gold underline">Contact salon</a>
                                </p>
                              </div>
                            )}

                            {/* UPCOMING: reschedule */}
                            {activeTab === 'upcoming' && (
                              <div className="pt-2 border-t border-white/10 space-y-2">
                                <div className="flex gap-2">
                                  {(b.rescheduleCount ?? 0) < 3 ? (
                                    <button
                                      onClick={() => {
                                        if (isEditing) { setEditingId(null); } else {
                                          const today = new Date();
                                          setEditingId(b.id); setEditDate(today);
                                          setEditSelSlot(null); setEditSuccess(null);
                                          loadSlots(today, b.serviceDurationMins ?? 60, b.id);
                                        }
                                      }}
                                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-gold/30 text-xs font-black uppercase tracking-wider transition-all"
                                    >
                                      <Edit2 size={12}/> {isEditing ? 'Cancel' : 'Reschedule'}
                                    </button>
                                  ) : (
                                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-red-500/20 bg-red-500/8 text-red-400 text-[10px] font-bold">
                                      Reschedule limit reached (3/3) — please contact salon
                                    </div>
                                  )}
                                  <a href="tel:+918789603343"
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-xs font-black uppercase tracking-wider transition-all"
                                  >
                                    Contact Salon
                                  </a>
                                </div>

                                {/* Reschedule panel */}
                                <AnimatePresence>
                                  {isEditing && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                      <div className="pt-3 space-y-3">
                                        {editSuccess ? (
                                          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold py-2">
                                            <CheckCircle2 size={14}/>{editSuccess}
                                          </div>
                                        ) : (
                                          <>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-gold flex items-center gap-1.5"><CalendarCheck size={12}/>Pick new date & time</p>
                                            {/* Date strip */}
                                            <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
                                              {dateStrip.map(d => {
                                                const active = isSameDay(d, editDate);
                                                return (
                                                  <button key={d.toString()} onClick={() => { setEditDate(d); loadSlots(d, b.serviceDurationMins ?? 60, b.id); }}
                                                    className={`shrink-0 w-11 h-13 rounded-xl flex flex-col items-center justify-center transition-all border py-2 ${active ? 'bg-gold border-gold text-black' : 'border-white/10 bg-white/[0.04] text-gray-400 hover:border-gold/40'}`}>
                                                    <span className={`text-[9px] font-bold ${active ? 'text-black/70' : 'text-gray-500'}`}>{isToday(d) ? 'Today' : format(d,'EEE')}</span>
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
                                                      <div className="flex items-center gap-1.5 mb-1"><Icon size={10} className="text-gray-500"/><span className="text-[9px] text-gray-500 font-bold capitalize">{sess}</span></div>
                                                      <div className="grid grid-cols-3 gap-1.5">
                                                        {editSlots.filter(s => s.session === sess).slice(0,6).map(slot => (
                                                          <button key={slot.startISO} onClick={() => setEditSelSlot(slot)}
                                                            className={`py-2 text-[10px] font-bold rounded-xl border transition-all ${editSelSlot?.startISO === slot.startISO ? 'bg-gold border-gold text-black' : 'border-white/10 bg-white/[0.03] text-gray-400 hover:border-gold/30 hover:text-white'}`}>
                                                            {slot.label.split('–')[0].trim()}
                                                          </button>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                            <button onClick={() => saveReschedule(b)} disabled={!editSelSlot || editSaving}
                                              className="w-full py-3 rounded-xl bg-gold text-black text-xs font-black uppercase tracking-wider disabled:opacity-40 flex items-center justify-center gap-2">
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
                            )}

                            {/* COMPLETED: invoice (formal) or booking receipt (fallback) */}
                            {activeTab === 'completed' && (
                              <div className="pt-2 border-t border-white/10 space-y-2">
                                {b.invoiceId ? (
                                  /* Full invoice from billing module */
                                  <>
                                    <button
                                      onClick={() => setOpenInvoiceId(openInvoiceId === b.invoiceId ? null : b.invoiceId!)}
                                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gold/25 bg-gold/8 text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/15 transition-all"
                                    >
                                      <FileText size={13}/>
                                      {openInvoiceId === b.invoiceId ? 'Hide Invoice' : 'View Invoice'}
                                    </button>
                                    <AnimatePresence>
                                      {openInvoiceId === b.invoiceId && (
                                        <InvoiceViewer invoiceId={b.invoiceId!} onClose={() => setOpenInvoiceId(null)} />
                                      )}
                                    </AnimatePresence>
                                  </>
                                ) : (
                                  /* Booking receipt when no formal invoice exists */
                                  <>
                                    <button
                                      onClick={() => setOpenInvoiceId(openInvoiceId === b.id ? null : b.id)}
                                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 text-xs font-black uppercase tracking-wider transition-all"
                                    >
                                      <FileText size={13}/>
                                      {openInvoiceId === b.id ? 'Hide Receipt' : 'View Booking Receipt'}
                                    </button>
                                    <AnimatePresence>
                                      {openInvoiceId === b.id && (
                                        <motion.div
                                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                          className="overflow-hidden"
                                        >
                                          <div className="mt-2 rounded-2xl overflow-hidden border border-white/10 bg-white">
                                            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                                              <p className="text-xs font-black text-gray-700 uppercase tracking-wider">Booking Receipt</p>
                                              <button onClick={() => setOpenInvoiceId(null)} className="p-1 text-gray-400 hover:text-gray-700">
                                                <X size={14}/>
                                              </button>
                                            </div>
                                            <div className="p-5 font-mono text-xs text-black space-y-3">
                                              <div className="text-center mb-3">
                                                <p className="font-black text-lg uppercase">Hair Tech</p>
                                                <p className="font-bold text-sm">Unisex Salon, Araria</p>
                                              </div>
                                              <div className="border-t border-dashed border-gray-300 pt-3 space-y-1">
                                                <div className="flex justify-between text-xs"><span className="text-gray-500">Name</span><span className="font-bold">{b.customerName}</span></div>
                                                <div className="flex justify-between text-xs"><span className="text-gray-500">Phone</span><span>{b.customerPhone}</span></div>
                                                {b.bookingDate && <div className="flex justify-between text-xs"><span className="text-gray-500">Date</span><span>{format(parseISO(b.bookingDate),'EEE, MMM d yyyy')}</span></div>}
                                                {b.bookingTime && <div className="flex justify-between text-xs"><span className="text-gray-500">Time</span><span>{b.bookingTime}</span></div>}
                                              </div>
                                              <div className="border-t border-dashed border-gray-300 pt-3">
                                                <p className="text-[9px] text-gray-400 font-black uppercase tracking-wider mb-2">Services</p>
                                                <p className="text-gray-700 text-xs">{b.serviceNames}</p>
                                              </div>
                                              <div className="border-t border-dashed border-gray-300 pt-3 space-y-1">
                                                <div className="flex justify-between font-black text-sm">
                                                  <span>Amount Paid</span>
                                                  <span style={{ color: '#B8941F' }}>₹{(b.finalAmount ?? b.totalAmount ?? 0).toLocaleString('en-IN')}</span>
                                                </div>
                                                {b.paymentId && <p className="text-[9px] text-gray-400 font-mono">Payment ID: {b.paymentId}</p>}
                                              </div>
                                              <div className="border-t border-dashed border-gray-300 mt-3 pt-2 text-center text-[9px] text-gray-400">
                                                Thank you for visiting Hair Tech Salon!
                                              </div>
                                            </div>
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </>
            )}
          </>
        )}

        {/* Empty state before search */}
        {bookings === null && !loading && (
          <div className="text-center py-16 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-gold/8 border border-gold/20 flex items-center justify-center mx-auto">
              <Calendar size={28} className="text-gold/50" />
            </div>
            <div>
              <p className="text-gray-400 font-bold text-base">Track Your Appointments</p>
              <p className="text-gray-400 text-sm mt-1">Enter your mobile number above to view your booking history</p>
            </div>
            <div className="pt-4 border-t border-white/10">
              <p className="text-gray-400 text-xs mb-3">Don't have a booking yet?</p>
              <Link to="/booking" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gold text-black font-black text-sm uppercase tracking-wider shadow-[0_4px_20px_-4px_rgba(212,175,55,0.4)]">
                <Scissors size={14}/> Book an Appointment
              </Link>
            </div>
          </div>
        )}

        {/* Salon info footer */}
        <div className="flex items-center justify-center gap-4 pt-4 pb-8 flex-wrap">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs">
            <Star size={11} className="text-gold fill-gold"/>
            <span>4.9 rating</span>
          </div>
          <div className="w-px h-3 bg-white/10" />
          <div className="flex items-center gap-1.5 text-gray-400 text-xs">
            <MapPin size={11}/>
            <span>Araria, Bihar</span>
          </div>
          <div className="w-px h-3 bg-white/10" />
          <div className="flex items-center gap-1.5 text-gray-400 text-xs">
            <Clock size={11}/>
            <span>10AM – 10PM daily</span>
          </div>
        </div>
      </div>
    </div>
  );
}


