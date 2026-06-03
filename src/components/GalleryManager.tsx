import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ImagePlus, Trash2, Eye, EyeOff, Loader2,
  AlertCircle, CheckCircle2, Link, ChevronUp, ChevronDown,
  Upload, Images,
} from 'lucide-react';
import {
  collection, getDocs, addDoc, deleteDoc,
  updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

interface GalleryImage {
  id:      string;
  url:     string;
  caption: string;
  name:    string;
  order:   number;
  active:  boolean;
}

const MAX_PX   = 1000; // resize to max 1000px wide
const QUALITY  = 0.78; // JPEG compression

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > MAX_PX) { h = Math.round(h * MAX_PX / w); w = MAX_PX; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', QUALITY));
      };
      img.onerror = reject;
      img.src = ev.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function GalleryManager() {
  const [items,    setItems]    = useState<GalleryImage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formUrl,     setFormUrl]     = useState('');
  const [formCaption, setFormCaption] = useState('');
  const [formName,    setFormName]    = useState('');
  const [previewOk,   setPreviewOk]   = useState<boolean | null>(null);
  const [uploadMode,  setUploadMode]  = useState<'url' | 'file'>('file');
  const [uploading,   setUploading]   = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState<{ ok: boolean; text: string } | null>(null);

  const showToast = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'gallery_images'));
      const data: GalleryImage[] = snap.docs.map(d => ({
        id:      d.id,
        url:     d.data().url     ?? '',
        caption: d.data().caption ?? '',
        name:    d.data().name    ?? '',
        order:   d.data().order   ?? 0,
        active:  d.data().active  ?? true,
      }));
      data.sort((a, b) => a.order - b.order);
      setItems(data);
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // ── File upload ───────────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { showToast(false, 'Please select an image file.'); return; }
    setUploading(true); setPreviewOk(null);
    try {
      const base64 = await resizeImage(file);
      setFormUrl(base64);
      setPreviewOk(true);
    } catch {
      showToast(false, 'Could not read the image. Try a different file.');
      setPreviewOk(false);
    } finally { setUploading(false); }
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formUrl.trim() || !formCaption.trim()) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'gallery_images'), {
        url:       formUrl.trim(),
        caption:   formCaption.trim(),
        name:      formName.trim(),
        order:     items.length,
        active:    true,
        createdAt: serverTimestamp(),
      });
      setItems(prev => [...prev, {
        id: ref.id, url: formUrl.trim(), caption: formCaption.trim(),
        name: formName.trim(), order: items.length, active: true,
      }]);
      setFormUrl(''); setFormCaption(''); setFormName(''); setPreviewOk(null);
      setShowForm(false);
      showToast(true, 'Gallery image added.');
    } catch {
      showToast(false, 'Failed to save. Check Firestore rules.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (img: GalleryImage) => {
    if (!confirm('Remove this gallery image?')) return;
    await deleteDoc(doc(db, 'gallery_images', img.id));
    setItems(prev => prev.filter(i => i.id !== img.id));
  };

  const handleToggle = async (img: GalleryImage) => {
    await updateDoc(doc(db, 'gallery_images', img.id), { active: !img.active });
    setItems(prev => prev.map(i => i.id === img.id ? { ...i, active: !i.active } : i));
  };

  const reorder = async (idx: number, d: 'up' | 'down') => {
    const swap = d === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= items.length) return;
    const next = [...items];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    const updated = next.map((it, i) => ({ ...it, order: i }));
    setItems(updated);
    await Promise.all([
      updateDoc(doc(db, 'gallery_images', updated[idx].id),  { order: updated[idx].order  }),
      updateDoc(doc(db, 'gallery_images', updated[swap].id), { order: updated[swap].order }),
    ]);
  };

  const resetForm = () => { setShowForm(false); setFormUrl(''); setFormCaption(''); setFormName(''); setPreviewOk(null); };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            <Images size={18} className="text-gold" /> Gallery Images
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Photos shown in the homepage gallery slider with captions.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); if (showForm) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-gold/10 border border-gold/30 rounded-xl text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/20 transition-all shrink-0"
        >
          <ImagePlus size={13} /> Add Image
        </button>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-bold ${
              toast.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                       : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}
          >
            {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-zinc-900 border border-gold/20 rounded-2xl p-6 space-y-4"
          >
            <p className="text-[10px] uppercase font-black tracking-widest text-gold">Add Gallery Image</p>

            {/* Upload mode toggle */}
            <div className="flex gap-2">
              {(['file', 'url'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => { setUploadMode(mode); setFormUrl(''); setPreviewOk(null); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    uploadMode === mode
                      ? 'bg-gold/20 border border-gold/40 text-gold'
                      : 'bg-white/5 border border-white/10 text-gray-500 hover:text-white'
                  }`}
                >
                  {mode === 'file' ? <><Upload size={11} /> Upload Photo</> : <><Link size={11} /> Image URL</>}
                </button>
              ))}
            </div>

            {/* File upload */}
            {uploadMode === 'file' && (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex flex-col items-center justify-center gap-3 py-8 rounded-xl border-2 border-dashed border-white/15 hover:border-gold/40 hover:bg-gold/4 transition-all text-center group"
                >
                  {uploading
                    ? <Loader2 size={28} className="animate-spin text-gold" />
                    : <Upload size={28} className="text-gray-600 group-hover:text-gold transition-colors" />}
                  <div>
                    <p className="text-sm font-bold text-white/60 group-hover:text-white transition-colors">
                      {uploading ? 'Processing image…' : 'Tap to upload from phone or computer'}
                    </p>
                    <p className="text-[10px] text-gray-700 mt-1">JPG, PNG, WEBP · Any size · Auto-compressed</p>
                  </div>
                </button>
              </div>
            )}

            {/* URL input */}
            {uploadMode === 'url' && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-2">
                  Image URL
                </label>
                <div className="relative">
                  <Link size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
                  <input
                    type="url"
                    placeholder="https://..."
                    value={formUrl}
                    onChange={e => { setFormUrl(e.target.value); setPreviewOk(null); }}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-9 pr-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-700"
                  />
                </div>
              </div>
            )}

            {/* Preview */}
            {formUrl && (
              <div className="relative w-full h-40 rounded-xl overflow-hidden border border-white/10 bg-zinc-800">
                <img
                  src={formUrl}
                  alt="preview"
                  className="w-full h-full object-cover"
                  onLoad={() => setPreviewOk(true)}
                  onError={() => setPreviewOk(false)}
                />
                {previewOk === false && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-900/95">
                    <AlertCircle size={22} className="text-red-400" />
                    <p className="text-red-400 text-xs font-bold">Cannot load this image</p>
                  </div>
                )}
                {previewOk === null && (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/60">
                    <Loader2 size={20} className="animate-spin text-gold" />
                  </div>
                )}
              </div>
            )}

            {/* Caption */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-2">
                Caption / Quote <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="e.g. My bridal look was absolutely stunning! Best salon in Araria!"
                value={formCaption}
                onChange={e => setFormCaption(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all resize-none placeholder:text-gray-700"
              />
            </div>

            {/* Attribution */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-2">
                Name / Attribution <span className="text-gray-700">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. — Priya Sharma, Araria"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-700"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={resetForm}
                className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-gray-400 hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formUrl || !formCaption.trim() || previewOk === false}
                className="flex items-center gap-2 px-5 py-2.5 bg-gold hover:bg-gold/90 rounded-xl text-black text-xs font-black uppercase tracking-wider disabled:opacity-40 transition-all"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                {saving ? 'Saving…' : 'Add to Gallery'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gallery grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
          <Loader2 size={20} className="animate-spin text-gold" /> Loading gallery…
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-14 bg-zinc-900 border border-white/8 rounded-2xl space-y-3">
          <Images size={36} className="text-gray-700 mx-auto" />
          <p className="text-gray-400 font-bold">No gallery images yet</p>
          <p className="text-gray-600 text-sm">3 default photos are shown on the homepage until you add your own.</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 bg-gold/10 border border-gold/30 rounded-xl text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/20 transition-all"
          >
            <ImagePlus size={13} /> Add First Image
          </button>
        </div>
      ) : (
        <div>
          <p className="text-gray-600 text-[10px] uppercase tracking-wider font-bold mb-3">
            {items.filter(i => i.active).length} active · {items.length} total
          </p>
          <div className="space-y-3">
            {items.map((img, idx) => (
              <motion.div
                key={img.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`flex gap-3 bg-zinc-900 border rounded-2xl overflow-hidden transition-all ${
                  img.active ? 'border-white/8' : 'border-white/4 opacity-60'
                }`}
              >
                {/* Thumbnail */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 bg-zinc-800">
                  <img
                    src={img.url}
                    alt={img.caption}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as any).style.opacity = '0.1'; }}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 py-3 pr-2">
                  <p className="text-white text-xs font-medium leading-snug line-clamp-2 mb-1">
                    {img.caption}
                  </p>
                  {img.name && (
                    <p className="text-gold/60 text-[10px]">{img.name}</p>
                  )}
                  <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                    img.active ? 'bg-emerald-500/80 text-black' : 'bg-white/10 text-white/50'
                  }`}>
                    {img.active ? 'Live' : 'Hidden'}
                  </span>
                </div>

                {/* Controls */}
                <div className="flex flex-col items-center justify-between py-2 pr-2 gap-1">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => reorder(idx, 'up')} disabled={idx === 0}
                      className="p-1 rounded text-gray-600 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all">
                      <ChevronUp size={13} />
                    </button>
                    <button onClick={() => reorder(idx, 'down')} disabled={idx === items.length - 1}
                      className="p-1 rounded text-gray-600 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all">
                      <ChevronDown size={13} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => handleToggle(img)}
                      className={`p-1.5 rounded-lg transition-all ${img.active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-gray-600 hover:text-white hover:bg-white/10'}`}
                      title={img.active ? 'Hide' : 'Show'}>
                      {img.active ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button onClick={() => handleDelete(img)}
                      className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          <p className="text-gray-700 text-[10px] uppercase tracking-wider font-bold mt-5 text-center">
            Changes appear on the homepage immediately.
          </p>
        </div>
      )}
    </div>
  );
}
