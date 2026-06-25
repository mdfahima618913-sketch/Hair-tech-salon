import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ImagePlus, Trash2, Eye, EyeOff, Loader2,
  AlertCircle, CheckCircle2, Link, ChevronUp, ChevronDown,
  Image as ImageIcon, Upload,
} from 'lucide-react';
import {
  collection, query, getDocs, addDoc, deleteDoc,
  updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

const MAX_PX  = 1400;
const QUALITY = 0.82;

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

const OCCASION_OPTIONS = ['', 'VIP Visit', 'Birthday', 'Customer Story', 'Event', 'Festival', 'Before & After', 'Promo'] as const;
type Occasion = typeof OCCASION_OPTIONS[number];

interface BannerImage {
  id:       string;
  url:      string;
  title:    string;
  occasion: Occasion;
  order:    number;
  active:   boolean;
}

export default function BannerManager() {
  const [images,   setImages]   = useState<BannerImage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Add-image form state
  const [inputMode,    setInputMode]    = useState<'url' | 'upload'>('upload');
  const [formUrl,      setFormUrl]      = useState('');
  const [formTitle,    setFormTitle]    = useState('');
  const [formName,     setFormName]     = useState('');
  const [formOccasion, setFormOccasion] = useState<Occasion>('');
  const [previewOk,    setPreviewOk]    = useState<boolean | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load ──────────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'banner_images')));
      const data: BannerImage[] = snap.docs.map(d => ({
        id:       d.id,
        url:      (d.data().url      as string) ?? '',
        title:    (d.data().title    as string) ?? '',
        occasion: (d.data().occasion as Occasion) ?? '',
        order:    (d.data().order    as number) ?? 0,
        active:   (d.data().active   as boolean) ?? true,
      }));
      data.sort((a, b) => a.order - b.order);
      setImages(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Add ───────────────────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setSaveMsg({ ok: false, text: 'Please select an image file.' }); setTimeout(() => setSaveMsg(null), 3500); return; }
    setUploading(true); setPreviewOk(null);
    try {
      const base64 = await resizeImage(file);
      setFormUrl(base64);
      setPreviewOk(true);
    } catch {
      setSaveMsg({ ok: false, text: 'Could not read the image. Try a different file.' });
      setPreviewOk(false);
      setTimeout(() => setSaveMsg(null), 3500);
    } finally { setUploading(false); }
  };

  const clearFile = () => {
    setFormUrl('');
    setPreviewOk(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAdd = async () => {
    if (!formUrl.trim() || (inputMode === 'url' && !previewOk)) return;
    setSaving(true);
    try {
      const docRef = await addDoc(collection(db, 'banner_images'), {
        url:       formUrl.trim(),
        title:     formTitle.trim(),
        name:      formName.trim(),
        occasion:  formOccasion,
        order:     images.length,
        active:    true,
        createdAt: serverTimestamp(),
      });
      setImages(prev => [...prev, {
        id: docRef.id, url: formUrl.trim(), title: formTitle.trim(),
        occasion: formOccasion, order: images.length, active: true,
      }]);
      setFormUrl(''); setFormTitle(''); setFormName(''); setFormOccasion(''); setPreviewOk(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowForm(false);
      setSaveMsg({ ok: true, text: 'Image added to banner.' });
    } catch {
      setSaveMsg({ ok: false, text: 'Failed to save. Check Firestore rules.' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3500);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async (img: BannerImage) => {
    if (!confirm(`Remove "${img.title || img.url.slice(0, 40)}" from the banner?`)) return;
    await deleteDoc(doc(db, 'banner_images', img.id));
    setImages(prev => prev.filter(i => i.id !== img.id));
  };

  // ── Toggle active ─────────────────────────────────────────────────────────────
  const handleToggle = async (img: BannerImage) => {
    await updateDoc(doc(db, 'banner_images', img.id), { active: !img.active });
    setImages(prev => prev.map(i => i.id === img.id ? { ...i, active: !i.active } : i));
  };

  // ── Reorder ───────────────────────────────────────────────────────────────────
  const reorder = async (idx: number, dir: 'up' | 'down') => {
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= images.length) return;
    const next = [...images];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    // Re-assign order values
    const updated = next.map((img, i) => ({ ...img, order: i }));
    setImages(updated);
    // Persist both swapped items
    await Promise.all([
      updateDoc(doc(db, 'banner_images', updated[idx].id), { order: updated[idx].order }),
      updateDoc(doc(db, 'banner_images', updated[swap].id), { order: updated[swap].order }),
    ]);
  };

  // ── URL preview validator ─────────────────────────────────────────────────────
  const handleUrlChange = (v: string) => {
    setFormUrl(v);
    setPreviewOk(null); // reset while typing
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            <ImageIcon size={18} className="text-gold" /> Banner Images
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            These photos appear in the hero slider on the homepage. Active images cycle automatically.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setFormUrl(''); setFormTitle(''); setPreviewOk(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-gold/10 border border-gold/30 rounded-xl text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/20 transition-all shrink-0"
        >
          <ImagePlus size={13} /> Add Image
        </button>
      </div>

      {/* Save feedback toast */}
      <AnimatePresence>
        {saveMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-bold ${
              saveMsg.ok
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}
          >
            {saveMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {saveMsg.text}
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
            <p className="text-xs uppercase font-black tracking-widest text-gold">Add New Banner Image</p>

            {/* Mode toggle — Upload vs URL */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10 w-fit">
              <button onClick={() => { setInputMode('upload'); setFormUrl(''); setPreviewOk(null); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  inputMode === 'upload' ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Upload size={12} /> Upload
              </button>
              <button onClick={() => { setInputMode('url'); clearFile(); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  inputMode === 'url' ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Link size={12} /> URL
              </button>
            </div>

            {/* Upload mode */}
            {inputMode === 'upload' && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  className="hidden"
                />
                {uploading ? (
                  <div className="w-full h-40 rounded-xl border border-white/10 bg-zinc-800 flex flex-col items-center justify-center gap-2">
                    <Loader2 size={24} className="animate-spin text-gold" />
                    <span className="text-gray-400 text-xs">Processing image…</span>
                  </div>
                ) : formUrl && inputMode === 'upload' ? (
                  <div className="relative w-full h-48 rounded-xl overflow-hidden border border-gold/20 bg-zinc-800">
                    <img src={formUrl} alt="preview" className="w-full h-full object-cover" />
                    <button onClick={clearFile}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 border border-white/15 text-white/70 hover:text-red-400 transition-all">
                      <Trash2 size={14} />
                    </button>
                    <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm">
                      <CheckCircle2 size={12} className="text-emerald-400" />
                      <span className="text-emerald-400 text-xs font-bold">Image ready</span>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full h-40 rounded-xl border-2 border-dashed border-white/15 hover:border-gold/40 bg-white/[0.02] hover:bg-white/[0.04] flex flex-col items-center justify-center gap-3 text-gray-500 hover:text-gold transition-all"
                  >
                    <Upload size={28} />
                    <span className="text-sm font-bold">Click to select image</span>
                    <span className="text-xs text-gray-600">JPG, PNG, WebP</span>
                  </button>
                )}
              </div>
            )}

            {/* URL mode */}
            {inputMode === 'url' && (
              <>
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-2">
                    Image URL <span className="text-red-400">*</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Link size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <input
                        type="url"
                        placeholder="https://images.unsplash.com/..."
                        value={formUrl}
                        onChange={e => handleUrlChange(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-9 pr-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
                      />
                    </div>
                    <button
                      onClick={() => setPreviewOk(null)}
                      disabled={!formUrl.trim()}
                      className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-gray-400 hover:bg-white/10 transition-all disabled:opacity-40"
                    >
                      Preview
                    </button>
                  </div>
                  <p className="text-xs text-gray-700 mt-1.5 flex items-center gap-1">
                    <AlertCircle size={9} />
                    Paste any public image URL.
                  </p>
                </div>

                {formUrl.trim() && (
                  <div className="relative w-full h-40 rounded-xl overflow-hidden border border-white/10 bg-zinc-800">
                    <img
                      src={formUrl.trim()}
                      alt="preview"
                      className="w-full h-full object-cover"
                      onLoad={() => setPreviewOk(true)}
                      onError={() => setPreviewOk(false)}
                    />
                    {previewOk === false && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-900/90">
                        <AlertCircle size={24} className="text-red-400" />
                        <p className="text-red-400 text-xs font-bold">Cannot load this URL</p>
                        <p className="text-gray-400 text-xs text-center px-4">
                          Make sure the image is publicly accessible.
                        </p>
                      </div>
                    )}
                    {previewOk === null && formUrl.trim() && (
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/60">
                        <Loader2 size={20} className="animate-spin text-gold" />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Title */}
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-2">
                Title / Label <span className="text-gray-700">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Hair Styling, Bridal Makeup…"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
              />
            </div>

            {/* Name / Signature */}
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-2">
                Name / Signature <span className="text-gray-700">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Priya Sharma, VIP Client…"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
              />
            </div>

            {/* Occasion tag */}
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-2">
                Occasion Tag <span className="text-gray-700">(optional)</span>
              </label>
              <select
                value={formOccasion}
                onChange={e => setFormOccasion(e.target.value as Occasion)}
                className="w-full bg-zinc-800 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all"
              >
                <option value="" className="bg-zinc-800 text-white">— No tag —</option>
                {OCCASION_OPTIONS.filter(o => o).map(o => <option key={o} value={o} className="bg-zinc-800 text-white">{o}</option>)}
              </select>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowForm(false); setFormUrl(''); setFormTitle(''); setFormName(''); setFormOccasion(''); setPreviewOk(null); clearFile(); }}
                className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-gray-400 hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving || uploading || !formUrl.trim() || (inputMode === 'url' && previewOk !== true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-gold hover:bg-gold/90 rounded-xl text-black text-xs font-black uppercase tracking-wider disabled:opacity-40 transition-all"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                {uploading ? 'Uploading…' : saving ? 'Saving…' : 'Add to Banner'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
          <Loader2 size={20} className="animate-spin text-gold" /> Loading images…
        </div>
      ) : images.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-white/8 rounded-2xl space-y-3">
          <ImageIcon size={36} className="text-gray-700 mx-auto" />
          <p className="text-gray-400 font-bold">No banner images yet</p>
          <p className="text-gray-400 text-sm">
            The homepage slider will use 5 default images until you add custom ones.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 bg-gold/10 border border-gold/30 rounded-xl text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/20 transition-all"
          >
            <ImagePlus size={13} /> Add First Image
          </button>
        </div>
      ) : (
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-4">
            {images.filter(i => i.active).length} active · {images.length} total
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {images.map((img, idx) => (
              <motion.div
                key={img.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`relative rounded-2xl overflow-hidden border transition-all ${
                  img.active ? 'border-white/10' : 'border-white/5 opacity-50'
                }`}
              >
                {/* Image */}
                <div className="relative h-36 bg-zinc-800">
                  <img
                    src={img.url}
                    alt={img.title || `Slide ${idx + 1}`}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.opacity = '0.1'; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                  {/* Order badge */}
                  <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm border border-white/15 flex items-center justify-center text-[11px] font-black text-white">
                    {idx + 1}
                  </span>

                  {/* Active badge */}
                  <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                    img.active
                      ? 'bg-emerald-500/80 text-black'
                      : 'bg-white/20 text-white/60'
                  }`}>
                    {img.active ? 'Live' : 'Hidden'}
                  </span>

                  {/* Title + occasion overlay */}
                  <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-2">
                    {img.title && <p className="text-white text-xs font-bold truncate">{img.title}</p>}
                    {img.occasion && (
                      <span className="shrink-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/80 text-black">{img.occasion}</span>
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1 p-2 bg-zinc-900">
                  {/* Reorder */}
                  <button
                    onClick={() => reorder(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all"
                    title="Move up"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => reorder(idx, 'down')}
                    disabled={idx === images.length - 1}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all"
                    title="Move down"
                  >
                    <ChevronDown size={14} />
                  </button>

                  <div className="flex-1" />

                  {/* Toggle visibility */}
                  <button
                    onClick={() => handleToggle(img)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                      img.active
                        ? 'text-emerald-400 hover:bg-emerald-500/10'
                        : 'text-gray-500 hover:bg-white/10 hover:text-white'
                    }`}
                    title={img.active ? 'Hide from slider' : 'Show in slider'}
                  >
                    {img.active ? <Eye size={12} /> : <EyeOff size={12} />}
                    <span className="hidden sm:inline ml-1">{img.active ? 'Live' : 'Show'}</span>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(img)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Delete image"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          <p className="text-gray-700 text-xs uppercase tracking-wider font-bold mt-6 text-center">
            Changes go live on the homepage immediately — no rebuild needed.
          </p>
        </div>
      )}
    </div>
  );
}

