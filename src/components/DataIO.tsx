/**
 * DataIO.tsx — Data Import & Export for Hair Tech Salon admin portal.
 *
 * Export: Customers · Invoices · Bookings · Services  (all as CSV, Excel-compatible)
 * Import: Customers · Services · Invoices              (CSV with template + preview + validation)
 */

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download, Upload, FileText, Users, Receipt, Scissors,
  Calendar, CheckCircle2, AlertCircle, Loader2, X, BookOpen,
} from 'lucide-react';
import {
  collection, getDocs, query, orderBy, writeBatch,
  doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function escapeCell(v: any): string {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCSV(headers: string[], rows: any[][]): string {
  return [headers.join(','), ...rows.map(r => r.map(escapeCell).join(','))].join('\n');
}

function downloadCSV(filename: string, content: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Strip BOM and normalize line endings
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const nonEmpty = clean.split('\n').filter(l => l.trim());
  if (nonEmpty.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let i = 0, field = '', inQ = false;
    while (i < line.length) {
      const c = line[i];
      if (inQ) {
        if (c === '"') { if (line[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; }
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { fields.push(field.trim()); field = ''; }
        else field += c;
      }
      i++;
    }
    fields.push(field.trim());
    return fields;
  };

  const rawHeaders = parseRow(nonEmpty[0]);
  // Strip *, collapse multiple spaces, trim — produces clean consistent keys
  const headers = rawHeaders.map(h => h.replace(/\*/g, '').replace(/\s+/g, ' ').trim());
  const rows = nonEmpty.slice(1).map(line => {
    const vals = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (vals[idx] ?? '').trim(); });
    return obj;
  }).filter(r => Object.values(r).some(v => v));

  return { headers, rows };
}

function normalisePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return d;
  if (d.startsWith('91') && d.length === 12) return d.slice(2);
  if (d.startsWith('0') && d.length === 11) return d.slice(1);
  return d;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

// ─── Templates ────────────────────────────────────────────────────────────────

const TEMPLATES: Record<string, { headers: string[]; example: string[][] }> = {
  customers: {
    headers: ['Name *', 'Phone *', 'Email', 'First Visit (YYYY-MM-DD)', 'Source (online/walkin/both)'],
    example: [
      ['Rahul Sharma', '9876543210', 'rahul@gmail.com', '2024-01-15', 'walkin'],
      ['Priya Singh',  '9988776655', '',                '2024-03-22', 'online'],
    ],
  },
  services: {
    headers: ['Name *', 'Category *', 'Price *', 'Duration', 'Active (true/false)'],
    example: [
      ['Hair Cut (Male)', 'Hair Cut',     '299',  '30 min', 'true'],
      ['Gold Facial',     'Basic Beauty', '2499', '60 min', 'true'],
    ],
  },
  invoices: {
    headers: [
      'Date * (YYYY-MM-DD)', 'Customer Name *', 'Customer Phone *',
      'Services * (comma-separated)', 'Total Amount *',
      'Payment Method', 'Staff Name', 'Discount %', 'Source (online/walkin)',
    ],
    example: [
      ['2024-11-15', 'Rahul Sharma', '9876543210', 'Hair Cut, Beard Trim', '650', 'cash',  'Ahmed', '0', 'walkin'],
      ['2024-11-16', 'Priya Singh',  '9988776655', 'Gold Facial',          '2499','gpay',  'Sara',  '10','online'],
    ],
  },
};

// ─── Validation helpers ────────────────────────────────────────────────────────

function validateRows(type: string, rows: Record<string, string>[]): { valid: number; errors: string[] } {
  const errors: string[] = [];
  let valid = 0;

  rows.forEach((row, i) => {
    const n = i + 2; // 1-indexed + header row
    if (type === 'customers') {
      if (!row['Name']) errors.push(`Row ${n}: Name is required.`);
      const phone = normalisePhone(row['Phone'] ?? '');
      if (phone.length !== 10) errors.push(`Row ${n}: Phone "${row['Phone']}" is not a valid 10-digit number.`);
      else valid++;
    } else if (type === 'services') {
      if (!row['Name']) errors.push(`Row ${n}: Name is required.`);
      else if (!row['Category']) errors.push(`Row ${n}: Category is required.`);
      else if (!row['Price'] || isNaN(Number(row['Price'])) || Number(row['Price']) <= 0)
        errors.push(`Row ${n}: Price "${row['Price']}" must be a positive number.`);
      else valid++;
    } else if (type === 'invoices') {
      const dateKey = Object.keys(row).find(k => k.toLowerCase().includes('date')) ?? 'Date';
      const dateVal = row[dateKey] ?? '';
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) errors.push(`Row ${n}: Date "${dateVal}" is not valid (use YYYY-MM-DD).`);
      else if (!row['Customer Name']) errors.push(`Row ${n}: Customer Name is required.`);
      else {
        const phone = normalisePhone(row['Customer Phone'] ?? '');
        if (phone.length !== 10) errors.push(`Row ${n}: Phone "${row['Customer Phone']}" is invalid.`);
        else if (!row['Services (comma-separated)'] && !row['Services']) errors.push(`Row ${n}: Services are required.`);
        else if (!row['Total Amount'] || isNaN(Number(row['Total Amount']))) errors.push(`Row ${n}: Total Amount is invalid.`);
        else valid++;
      }
    }
  });

  return { valid, errors };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportType = 'customers' | 'services' | 'invoices';
type ExportStatus = 'idle' | 'loading' | 'done' | 'error';

// ─── Component ────────────────────────────────────────────────────────────────

export default function DataIO() {
  // Export state
  const [exportStatus, setExportStatus] = useState<Record<string, ExportStatus>>({});
  const [invoiceFrom, setInvoiceFrom] = useState('');
  const [invoiceTo,   setInvoiceTo]   = useState('');
  const [bookingFrom, setBookingFrom] = useState('');
  const [bookingTo,   setBookingTo]   = useState('');

  // Import state
  const [importType,     setImportType]     = useState<ImportType>('customers');
  const [parsedHeaders,  setParsedHeaders]  = useState<string[]>([]);
  const [parsedRows,     setParsedRows]     = useState<Record<string, string>[]>([]);
  const [fileName,       setFileName]       = useState('');
  const [isDragging,     setIsDragging]     = useState(false);
  const [importing,      setImporting]      = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importResult,   setImportResult]   = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [validationErrs, setValidationErrs] = useState<string[]>([]);
  const [validCount,     setValidCount]     = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const setExp = (key: string, s: ExportStatus) =>
    setExportStatus(p => ({ ...p, [key]: s }));

  // ── Exports ─────────────────────────────────────────────────────────────────

  const exportCustomers = async () => {
    setExp('customers', 'loading');
    try {
      // Aggregate from invoices (authoritative source for stats)
      const [custSnap, invSnap] = await Promise.all([
        getDocs(query(collection(db, 'customers'), orderBy('lastVisit', 'desc'))),
        getDocs(query(collection(db, 'invoices'),  orderBy('createdAt', 'desc'))),
      ]);

      const stats: Record<string, { visits: number; spend: number; last: string }> = {};
      invSnap.docs.forEach(d => {
        const inv = d.data();
        const phone = (inv.customerPhone ?? '').replace(/\D/g, '').slice(-10);
        if (!phone) return;
        const ts = inv.createdAt?.toDate?.()?.toISOString?.() ?? '';
        if (!stats[phone]) stats[phone] = { visits: 0, spend: 0, last: '' };
        stats[phone].visits++;
        stats[phone].spend += inv.total ?? 0;
        if (ts > stats[phone].last) stats[phone].last = ts;
      });

      const headers = ['Name', 'Phone', 'Email', 'First Visit', 'Last Visit', 'Total Visits', 'Total Spend (₹)', 'Source'];
      const rows = custSnap.docs.map(d => {
        const c = d.data();
        const s = stats[d.id] ?? { visits: 0, spend: 0, last: c.lastVisit ?? '' };
        return [
          c.name ?? '', d.id, c.email ?? '',
          fmtDate(c.firstVisit ?? ''), fmtDate(s.last || (c.lastVisit ?? '')),
          s.visits, s.spend, c.source ?? 'walkin',
        ];
      });

      downloadCSV(`hairtech-customers-${new Date().toISOString().slice(0, 10)}.csv`, buildCSV(headers, rows));
      setExp('customers', 'done');
      showToast(true, `Exported ${rows.length} customers.`);
    } catch (e: any) {
      setExp('customers', 'error');
      showToast(false, 'Export failed: ' + e.message);
    }
  };

  const exportInvoices = async () => {
    setExp('invoices', 'loading');
    try {
      let q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);

      const headers = [
        'Invoice #', 'Date', 'Customer Name', 'Customer Phone',
        'Services', 'Subtotal (₹)', 'Discount %', 'Discount Amount (₹)',
        'Total (₹)', 'Payment Method', 'Source', 'Staff',
      ];

      const rows = snap.docs
        .filter(d => {
          if (!invoiceFrom && !invoiceTo) return true;
          const ts = d.data().createdAt?.toDate?.()?.toISOString?.() ?? '';
          if (invoiceFrom && ts < invoiceFrom) return false;
          if (invoiceTo   && ts > invoiceTo + 'T23:59:59') return false;
          return true;
        })
        .map(d => {
          const inv = d.data();
          const items = (inv.items ?? []).map((it: any) => it.serviceName).join('; ');
          const staff = (inv.items ?? []).map((it: any) => it.staffName).filter(Boolean)[0] ?? '';
          return [
            inv.invoiceNumber ?? d.id,
            fmtDate(inv.createdAt?.toDate?.()?.toISOString?.() ?? ''),
            inv.customerName ?? '', inv.customerPhone ?? '',
            items,
            inv.subtotal ?? 0, inv.discountPercent ?? 0, inv.discountAmount ?? 0,
            inv.total ?? 0, inv.paymentMethod ?? '', inv.source ?? '', staff,
          ];
        });

      downloadCSV(`hairtech-invoices-${new Date().toISOString().slice(0, 10)}.csv`, buildCSV(headers, rows));
      setExp('invoices', 'done');
      showToast(true, `Exported ${rows.length} invoices.`);
    } catch (e: any) {
      setExp('invoices', 'error');
      showToast(false, 'Export failed: ' + e.message);
    }
  };

  const exportBookings = async () => {
    setExp('bookings', 'loading');
    try {
      const snap = await getDocs(query(collection(db, 'bookings'), orderBy('createdAt', 'desc')));

      const headers = [
        'Booking ID', 'Created Date', 'Appointment Date', 'Time Slot',
        'Customer Name', 'Customer Phone', 'Service(s)',
        'Status', 'Amount (₹)', 'Payment Method', 'Source',
      ];

      const rows = snap.docs
        .filter(d => {
          if (!bookingFrom && !bookingTo) return true;
          const ts = d.data().createdAt?.toDate?.()?.toISOString?.() ?? '';
          if (bookingFrom && ts < bookingFrom) return false;
          if (bookingTo   && ts > bookingTo + 'T23:59:59') return false;
          return true;
        })
        .map(d => {
          const b = d.data();
          return [
            d.id,
            fmtDate(b.createdAt?.toDate?.()?.toISOString?.() ?? ''),
            b.bookingDate ?? b.startTime?.slice(0, 10) ?? '',
            b.bookingTime ?? b.startTime?.slice(11, 16) ?? '',
            b.customerName ?? '', b.customerPhone ?? '',
            b.serviceNames ?? b.serviceName ?? '',
            b.status ?? '', b.totalAmount ?? 0,
            b.paymentMethod ?? '', b.bookingSource ?? 'online',
          ];
        });

      downloadCSV(`hairtech-bookings-${new Date().toISOString().slice(0, 10)}.csv`, buildCSV(headers, rows));
      setExp('bookings', 'done');
      showToast(true, `Exported ${rows.length} bookings.`);
    } catch (e: any) {
      setExp('bookings', 'error');
      showToast(false, 'Export failed: ' + e.message);
    }
  };

  const exportServices = async () => {
    setExp('services', 'loading');
    try {
      const snap = await getDocs(query(collection(db, 'services'), orderBy('category'), orderBy('name')));
      const headers = ['Name', 'Category', 'Price (₹)', 'Duration', 'Active', 'Image URL'];
      const rows = snap.docs.map(d => {
        const s = d.data();
        return [s.name ?? '', s.category ?? '', s.priceValue ?? '', s.time ?? '', s.active ? 'true' : 'false', s.imageUrl ?? ''];
      });
      downloadCSV(`hairtech-services-${new Date().toISOString().slice(0, 10)}.csv`, buildCSV(headers, rows));
      setExp('services', 'done');
      showToast(true, `Exported ${rows.length} services.`);
    } catch (e: any) {
      setExp('services', 'error');
      showToast(false, 'Export failed: ' + e.message);
    }
  };

  // ── Import ───────────────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.name.endsWith('.csv')) { showToast(false, 'Please upload a .csv file.'); return; }
    setFileName(file.name);
    setParsedRows([]); setParsedHeaders([]); setValidationErrs([]); setImportResult(null);

    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setParsedHeaders(headers);
      setParsedRows(rows);
      const { valid, errors } = validateRows(importType, rows);
      setValidCount(valid);
      setValidationErrs(errors);
    };
    reader.readAsText(file, 'UTF-8');
  }, [importType]);

  const handleDrop = useCallback((e: { preventDefault(): void; dataTransfer: DataTransfer }) => {
    e.preventDefault(); setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0] ?? null);
  }, [handleFile]);

  const clearImport = () => {
    setParsedRows([]); setParsedHeaders([]); setFileName('');
    setValidationErrs([]); setImportResult(null); setValidCount(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleImport = async () => {
    if (parsedRows.length === 0 || validCount === 0) return;
    setImporting(true);
    setImportProgress({ done: 0, total: validCount });
    let imported = 0, skipped = 0;
    const errors: string[] = [];

    const BATCH_SIZE = 400;
    let batch = writeBatch(db);
    let batchCount = 0;

    const commitBatch = async () => {
      if (batchCount > 0) { await batch.commit(); batch = writeBatch(db); batchCount = 0; }
    };

    try {
      for (const row of parsedRows) {
        const dateKey = Object.keys(row).find(k => k.toLowerCase().includes('date')) ?? 'Date';

        if (importType === 'customers') {
          const phone = normalisePhone(row['Phone'] ?? '');
          if (phone.length !== 10) { skipped++; continue; }
          const name = row['Name']?.trim();
          if (!name) { skipped++; continue; }
          const source = (row['Source (online/walkin/both)'] || row['Source'] || 'walkin').toLowerCase().trim() as 'online' | 'walkin' | 'both';
          const now = new Date().toISOString();
          batch.set(doc(db, 'customers', phone), {
            name, phone,
            email:      (row['Email'] ?? '').trim(),
            source,
            firstVisit: row['First Visit (YYYY-MM-DD)'] || row['First Visit'] || now,
            lastVisit:  row['Last Visit'] || row['First Visit (YYYY-MM-DD)'] || now,
          }, { merge: true });
          batchCount++; imported++;

        } else if (importType === 'services') {
          const name     = row['Name']?.trim();
          const category = row['Category']?.trim();
          const price    = Number(row['Price'] ?? '0');
          if (!name || !category || price <= 0) { skipped++; continue; }
          const id = `${category.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 14)}-${Date.now().toString(36)}-${imported}`;
          batch.set(doc(db, 'services', id), {
            name, category,
            price:      `₹${price}`,
            priceValue: price,
            time:       (row['Duration'] || row['Time'] || '30 min').trim(),
            active:     (row['Active (true/false)'] ?? 'true').toLowerCase() !== 'false',
            imageUrl:   (row['Image URL'] ?? '').trim(),
            updatedAt:  new Date(),
          }, { merge: true });
          batchCount++; imported++;

        } else if (importType === 'invoices') {
          const dateVal = row[dateKey] ?? '';
          const d = new Date(dateVal);
          if (isNaN(d.getTime())) { skipped++; continue; }
          const custName  = row['Customer Name']?.trim();
          const custPhone = normalisePhone(row['Customer Phone'] ?? '');
          const servicesStr = row['Services (comma-separated)'] || row['Services'] || '';
          const total = Number(row['Total Amount'] ?? '0');
          if (!custName || custPhone.length !== 10 || !servicesStr || total <= 0) { skipped++; continue; }

          const discountPct = Number(row['Discount %'] ?? '0');
          const subtotal    = discountPct > 0 ? Math.round(total / (1 - discountPct / 100)) : total;
          const source      = (row['Source (online/walkin)'] || row['Source'] || 'walkin') as 'online' | 'walkin';
          const payMethod   = (row['Payment Method'] || 'cash').toLowerCase().trim();
          const staffName   = (row['Staff Name'] || '').trim();

          const ref = doc(collection(db, 'invoices'));
          batch.set(ref, {
            invoiceNumber: `IMP-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${imported}`,
            customerName:  custName,
            customerPhone: custPhone,
            items: servicesStr.split(',').map((sn: string, idx: number) => ({
              serviceId:        `imported-${idx}`,
              serviceName:      sn.trim(),
              price:            idx === 0 ? total : 0,
              staffId:          '',
              staffName,
              commissionRate:   0,
              commissionAmount: 0,
            })),
            subtotal,
            discountPercent: discountPct,
            discountAmount: subtotal - total,
            total,
            paymentMethod: payMethod,
            status: 'paid',
            source,
            createdAt: d,
            importedAt: serverTimestamp(),
          });
          batchCount++; imported++;

          // Also upsert the customer record
          batch.set(doc(db, 'customers', custPhone), {
            name: custName, phone: custPhone, source,
            lastVisit: d.toISOString(),
          }, { merge: true });
          batchCount++;
        }

        if (batchCount >= BATCH_SIZE) { await commitBatch(); }
        setImportProgress({ done: imported, total: validCount });
      }

      await commitBatch();
      setImportResult({ imported, skipped, errors });
      showToast(true, `Imported ${imported} records.`);
    } catch (e: any) {
      errors.push(e.message);
      setImportResult({ imported, skipped, errors });
      showToast(false, 'Import partially failed: ' + e.message);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const downloadTemplate = (type: ImportType) => {
    const t = TEMPLATES[type];
    downloadCSV(`template-${type}.csv`, buildCSV(t.headers, t.example));
  };

  // ── UI ───────────────────────────────────────────────────────────────────────

  const expIcon = (s: ExportStatus) =>
    s === 'loading' ? <Loader2 size={14} className="animate-spin" />
    : s === 'done'  ? <CheckCircle2 size={14} className="text-emerald-400" />
    : s === 'error' ? <AlertCircle  size={14} className="text-red-400" />
    :                 <Download size={14} />;

  return (
    <div className="space-y-8">

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-bold ${
              toast.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                       : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
            {toast.ok ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── EXPORT ─────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
            <Download size={13} className="text-emerald-400" />
          </div>
          <div>
            <h3 className="text-white font-black text-sm uppercase tracking-tight">Export Data</h3>
            <p className="text-gray-400 text-xs">Download as CSV — opens in Excel, Google Sheets, or any POS system</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">

          {/* Customers */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Users size={14} className="text-blue-400" />
              </div>
              <div>
                <p className="text-white font-black text-sm">Customers</p>
                <p className="text-gray-400 text-[10px]">Name, phone, visit stats, source</p>
              </div>
            </div>
            <button onClick={exportCustomers} disabled={exportStatus.customers === 'loading'}
              className="w-full flex items-center justify-center gap-2 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 text-xs font-black uppercase tracking-wider hover:bg-blue-500/20 transition-all disabled:opacity-50">
              {expIcon(exportStatus.customers)} Download CSV
            </button>
          </div>

          {/* Invoices */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
                <Receipt size={14} className="text-gold" />
              </div>
              <div>
                <p className="text-white font-black text-sm">Invoices</p>
                <p className="text-gray-400 text-[10px]">Full billing history with items & staff</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="relative">
                <Calendar size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="date" value={invoiceFrom} onChange={e => setInvoiceFrom(e.target.value)}
                  className="w-full bg-white/8 border border-white/12 rounded-lg py-1.5 pl-6 pr-2 text-white text-[10px] focus:outline-none focus:border-gold/40 transition-all" />
              </div>
              <div className="relative">
                <Calendar size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="date" value={invoiceTo} onChange={e => setInvoiceTo(e.target.value)}
                  className="w-full bg-white/8 border border-white/12 rounded-lg py-1.5 pl-6 pr-2 text-white text-[10px] focus:outline-none focus:border-gold/40 transition-all" />
              </div>
            </div>
            <button onClick={exportInvoices} disabled={exportStatus.invoices === 'loading'}
              className="w-full flex items-center justify-center gap-2 py-2 bg-gold/10 border border-gold/20 rounded-xl text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/20 transition-all disabled:opacity-50">
              {expIcon(exportStatus.invoices)} Download CSV
            </button>
          </div>

          {/* Bookings */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Calendar size={14} className="text-purple-400" />
              </div>
              <div>
                <p className="text-white font-black text-sm">Bookings</p>
                <p className="text-gray-400 text-[10px]">Appointment history, status, amounts</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="relative">
                <Calendar size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="date" value={bookingFrom} onChange={e => setBookingFrom(e.target.value)}
                  className="w-full bg-white/8 border border-white/12 rounded-lg py-1.5 pl-6 pr-2 text-white text-[10px] focus:outline-none focus:border-gold/40 transition-all" />
              </div>
              <div className="relative">
                <Calendar size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="date" value={bookingTo} onChange={e => setBookingTo(e.target.value)}
                  className="w-full bg-white/8 border border-white/12 rounded-lg py-1.5 pl-6 pr-2 text-white text-[10px] focus:outline-none focus:border-gold/40 transition-all" />
              </div>
            </div>
            <button onClick={exportBookings} disabled={exportStatus.bookings === 'loading'}
              className="w-full flex items-center justify-center gap-2 py-2 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400 text-xs font-black uppercase tracking-wider hover:bg-purple-500/20 transition-all disabled:opacity-50">
              {expIcon(exportStatus.bookings)} Download CSV
            </button>
          </div>

          {/* Services */}
          <div className="bg-zinc-900 border border-white/12 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                <Scissors size={14} className="text-teal-400" />
              </div>
              <div>
                <p className="text-white font-black text-sm">Services</p>
                <p className="text-gray-400 text-[10px]">Full catalogue with prices & images</p>
              </div>
            </div>
            <button onClick={exportServices} disabled={exportStatus.services === 'loading'}
              className="w-full flex items-center justify-center gap-2 py-2 bg-teal-500/10 border border-teal-500/20 rounded-xl text-teal-400 text-xs font-black uppercase tracking-wider hover:bg-teal-500/20 transition-all disabled:opacity-50 mt-auto">
              {expIcon(exportStatus.services)} Download CSV
            </button>
          </div>
        </div>
      </section>

      {/* ── IMPORT ─────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
            <Upload size={13} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-white font-black text-sm uppercase tracking-tight">Import Data</h3>
            <p className="text-gray-400 text-xs">Migrate from Excel, old POS, or WhatsApp records — upload a CSV</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-white/12 rounded-2xl p-5 space-y-5">

          {/* Type selector + template download */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-1 bg-zinc-800 border border-white/10 rounded-xl p-1">
              {(['customers', 'services', 'invoices'] as ImportType[]).map(t => (
                <button key={t} onClick={() => { setImportType(t); clearImport(); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    importType === t
                      ? 'bg-amber-500/15 border border-amber-500/25 text-amber-400'
                      : 'text-gray-400 hover:text-white'
                  }`}>
                  {t === 'customers' ? <Users size={11}/> : t === 'services' ? <Scissors size={11}/> : <Receipt size={11}/>}
                  {t}
                </button>
              ))}
            </div>
            <button onClick={() => downloadTemplate(importType)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/8 border border-white/12 rounded-xl text-gray-300 text-[10px] font-black uppercase tracking-wider hover:text-white hover:bg-white/12 transition-all">
              <BookOpen size={11}/> Download Template
            </button>
          </div>

          {/* Schema hint */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">Expected columns</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES[importType].headers.map(h => (
                <span key={h} className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                  h.includes('*') ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                                  : 'bg-white/8 border-white/12 text-gray-400'
                }`}>
                  {h}
                </span>
              ))}
            </div>
            <p className="text-[9px] text-gray-500 mt-2">
              <span className="text-amber-400 font-black">*</span> = required &nbsp;·&nbsp; Column names must match exactly (download the template to be safe)
            </p>
          </div>

          {/* Drop zone */}
          {!parsedRows.length && (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all ${
                isDragging
                  ? 'border-amber-500/50 bg-amber-500/5'
                  : 'border-white/15 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Upload size={20} className="text-amber-400" />
              </div>
              <div className="text-center">
                <p className="text-white font-bold text-sm">Drop your CSV here</p>
                <p className="text-gray-400 text-xs mt-0.5">or click to browse</p>
              </div>
              <p className="text-gray-500 text-[10px]">.csv files only · UTF-8 or Excel encoding</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={e => handleFile(e.target.files?.[0] ?? null)} />
            </div>
          )}

          {/* Preview + validation */}
          {parsedRows.length > 0 && (
            <div className="space-y-4">
              {/* File info bar */}
              <div className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-amber-400" />
                  <span className="text-white text-sm font-bold">{fileName}</span>
                  <span className="text-gray-400 text-xs">{parsedRows.length} rows detected</span>
                </div>
                <button onClick={clearImport} className="text-gray-400 hover:text-white transition-colors">
                  <X size={14}/>
                </button>
              </div>

              {/* Preview table */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">
                  Preview — first {Math.min(5, parsedRows.length)} of {parsedRows.length} rows
                </p>
                <div className="overflow-x-auto rounded-xl border border-white/12">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/[0.03] border-b border-white/10">
                        {parsedHeaders.map(h => (
                          <th key={h} className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-white/8 hover:bg-white/[0.02]">
                          {parsedHeaders.map(h => (
                            <td key={h} className="px-3 py-2 text-gray-300 whitespace-nowrap max-w-[180px] truncate">{row[h]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Validation summary */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex-1">
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                  <p className="text-emerald-400 text-sm font-bold">{validCount} valid rows ready to import</p>
                </div>
                {validationErrs.length > 0 && (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex-1">
                    <AlertCircle size={14} className="text-amber-400 shrink-0" />
                    <p className="text-amber-400 text-sm font-bold">{validationErrs.length} row{validationErrs.length > 1 ? 's' : ''} will be skipped</p>
                  </div>
                )}
              </div>

              {/* Error details (collapsible) */}
              {validationErrs.length > 0 && (
                <details className="bg-amber-500/5 border border-amber-500/15 rounded-xl overflow-hidden">
                  <summary className="px-4 py-2.5 text-amber-400 text-xs font-bold cursor-pointer list-none flex items-center gap-2">
                    <AlertCircle size={12}/> View {validationErrs.length} validation issue{validationErrs.length > 1 ? 's' : ''}
                  </summary>
                  <div className="px-4 pb-3 space-y-1">
                    {validationErrs.slice(0, 20).map((e, i) => (
                      <p key={i} className="text-amber-400/80 text-[10px]">· {e}</p>
                    ))}
                    {validationErrs.length > 20 && (
                      <p className="text-gray-500 text-[10px]">…and {validationErrs.length - 20} more</p>
                    )}
                  </div>
                </details>
              )}

              {/* Import button */}
              {!importResult && (
                <button onClick={handleImport} disabled={importing || validCount === 0}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500/15 border border-amber-500/25 rounded-xl text-amber-400 font-black text-sm uppercase tracking-wider hover:bg-amber-500/25 transition-all disabled:opacity-40">
                  {importing ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Importing {importProgress?.done ?? 0} / {importProgress?.total ?? validCount}…
                    </>
                  ) : (
                    <>
                      <Upload size={15}/> Import {validCount} record{validCount !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
              )}

              {/* Result */}
              {importResult && (
                <div className="bg-zinc-800 border border-white/12 rounded-xl p-4 space-y-2">
                  <p className="text-white font-black text-sm flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-400"/> Import complete
                  </p>
                  <div className="flex gap-4 text-xs">
                    <span className="text-emerald-400 font-bold">✓ {importResult.imported} imported</span>
                    {importResult.skipped > 0 && <span className="text-amber-400 font-bold">⚠ {importResult.skipped} skipped</span>}
                    {importResult.errors.length > 0 && <span className="text-red-400 font-bold">✗ {importResult.errors.length} errors</span>}
                  </div>
                  <button onClick={clearImport}
                    className="text-[10px] text-gray-400 hover:text-white font-bold uppercase tracking-wider transition-colors">
                    Import another file →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
