import { useState, useEffect, useMemo, Dispatch, SetStateAction } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Scissors, Plus, Edit2, Trash2, Search, X, Loader2,
  CheckCircle2, AlertCircle, Clock, IndianRupee,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Tag,
  RefreshCw, Link,
} from 'lucide-react';
import {
  collection, getDocs, setDoc, deleteDoc, doc, query, orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getServiceImage } from '../lib/serviceImages';

interface Service {
  id: string;
  name: string;
  price: string;
  priceValue: number;
  time: string;
  category: string;
  active: boolean;
  imageUrl?: string;
  description?: string;
}

interface FormState {
  name: string;
  priceValue: number;
  time: string;
  category: string;
  newCatName: string;
  active: boolean;
  imageUrl: string;
  description: string;
}

const BLANK: FormState = {
  name: '', priceValue: 0, time: '30 min',
  category: '', newCatName: '', active: true, imageUrl: '', description: '',
};

// ── Standalone form component (defined outside ServiceManager to avoid remount) ──
function ServiceForm({
  form, setForm, categories, onSave, onCancel, saving, isNew,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  categories: string[];
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
}) {
  const f = (key: keyof FormState, val: any) => setForm(p => ({ ...p, [key]: val }));
  const addingNewCat = form.newCatName.length > 0;

  return (
    <motion.div
      key="svc-form"
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
      className="bg-zinc-950 border border-gold/20 rounded-2xl p-5 space-y-4"
    >
      <p className="text-[10px] uppercase font-black tracking-widest text-gold">
        {isNew ? 'Add New Service' : 'Edit Service'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Name */}
        <div className="sm:col-span-2">
          <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1.5">
            Service Name *
          </label>
          <input
            type="text" placeholder="e.g. Keratin Treatment"
            value={form.name} onChange={e => f('name', e.target.value)}
            className="w-full bg-white/8 border border-white/12 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1.5">
            Category *
          </label>
          {categories.length > 0 && (
            <select
              value={addingNewCat ? '__new__' : form.category}
              onChange={e => {
                if (e.target.value === '__new__') {
                  f('newCatName', ' '); // trigger new-cat input; user types over the space
                  f('category', '');
                } else {
                  f('category', e.target.value);
                  f('newCatName', '');
                }
              }}
              className="w-full bg-white/8 border border-white/12 rounded-xl py-2.5 px-3 text-white text-sm focus:outline-none focus:border-gold/50 transition-all mb-1.5"
            >
              {categories.map(c => <option key={c} value={c} className="bg-zinc-900">{c}</option>)}
              <option value="__new__" className="bg-zinc-900">＋ New category…</option>
            </select>
          )}
          {(addingNewCat || categories.length === 0) && (
            <input
              autoFocus={categories.length === 0}
              type="text" placeholder="New category name (e.g. Scalp & Skin)"
              value={form.newCatName.trim() === '' && categories.length === 0 ? form.newCatName : form.newCatName}
              onChange={e => f('newCatName', e.target.value)}
              className="w-full bg-white/8 border border-gold/30 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
            />
          )}
        </div>

        {/* Price */}
        <div>
          <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1.5">
            Price (₹) *
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
            <input
              type="number" min={0} placeholder="499"
              value={form.priceValue || ''}
              onChange={e => f('priceValue', Number(e.target.value))}
              className="w-full bg-white/8 border border-white/12 rounded-xl py-2.5 pl-7 pr-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
            />
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1.5">
            Duration
          </label>
          <input
            type="text" placeholder="e.g. 45 min"
            value={form.time} onChange={e => f('time', e.target.value)}
            className="w-full bg-white/8 border border-white/12 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-500"
          />
        </div>

        {/* Image URL */}
        <div className="sm:col-span-2">
          <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider block mb-1.5">
            Image URL
          </label>
          <div className="flex gap-2 items-start">
            <div className="relative flex-1">
              <Link size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="url"
                placeholder={getServiceImage(form.name || 'service', form.category || 'Add-ons')}
                value={form.imageUrl} onChange={e => f('imageUrl', e.target.value)}
                className="w-full bg-white/8 border border-white/12 rounded-xl py-2.5 pl-9 pr-8 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-400/50"
              />
              {form.imageUrl && (
                <button onClick={() => f('imageUrl', '')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
                  <X size={12}/>
                </button>
              )}
            </div>
            {/* Live preview — shows custom URL or auto-resolved fallback */}
            <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/15 shrink-0 bg-zinc-800 relative">
              <img
                src={getServiceImage(form.name || 'service', form.category || 'Add-ons', form.imageUrl)}
                alt="preview"
                className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5">
            {form.imageUrl
              ? 'Custom image set — click × to revert to auto.'
              : 'Auto-resolved from service name & category. Paste a URL to override.'}
          </p>
        </div>

        {/* Active toggle */}
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => f('active', !form.active)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              form.active
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                : 'bg-white/8 border-white/12 text-gray-400'
            }`}
          >
            {form.active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
            {form.active ? 'Visible to customers' : 'Hidden'}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-white/10">
        <button
          onClick={onSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-gold/15 border border-gold/30 rounded-xl text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/25 transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          {isNew ? 'Add Service' : 'Save Changes'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl text-gray-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ServiceManager() {
  const [services,  setServices]  = useState<Service[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [editId,    setEditId]    = useState<string | null>(null); // 'new' | service.id
  const [form,      setForm]      = useState<FormState>({ ...BLANK });
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState<Service | null>(null);
  const [openCats,  setOpenCats]  = useState<Set<string>>(new Set());
  const [toast,     setToast]     = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'services'), orderBy('category'), orderBy('name')));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Service));
      setServices(list);
      setOpenCats(new Set(list.map(s => s.category)));
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const categories = useMemo(() =>
    Array.from(new Set(services.map(s => s.category))).sort(),
    [services]
  );

  const filtered = useMemo(() => {
    let list = services;
    if (catFilter) list = list.filter(s => s.category === catFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
    return list;
  }, [services, catFilter, search]);

  const grouped = useMemo(() => {
    const map: Record<string, Service[]> = {};
    filtered.forEach(s => {
      if (!map[s.category]) map[s.category] = [];
      map[s.category].push(s);
    });
    return map;
  }, [filtered]);

  const startNew = (cat?: string) => {
    setForm({ ...BLANK, category: cat ?? (categories[0] ?? '') });
    setEditId('new');
  };

  const startEdit = (s: Service) => {
    setForm({ name: s.name, priceValue: s.priceValue, time: s.time, category: s.category, newCatName: '', active: s.active, imageUrl: s.imageUrl ?? '', description: s.description ?? '' });
    setEditId(s.id);
  };

  const cancelEdit = () => setEditId(null);

  const handleSave = async () => {
    const name     = form.name.trim();
    const category = (form.newCatName.trim() || form.category.trim());
    if (!name)                { showToast(false, 'Service name is required.'); return; }
    if (!category)            { showToast(false, 'Category is required.'); return; }
    if (form.priceValue <= 0) { showToast(false, 'Price must be greater than 0.'); return; }

    setSaving(true);
    try {
      const isNew = editId === 'new';
      const id = isNew
        ? `${category.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 14)}-${Date.now().toString(36)}`
        : editId!;

      await setDoc(doc(db, 'services', id), {
        name,
        price:       `₹${form.priceValue}`,
        priceValue:  Number(form.priceValue),
        time:        form.time.trim() || '30 min',
        category,
        active:      form.active,
        imageUrl:    form.imageUrl.trim(),
        description: form.description.trim(),
        updatedAt:   new Date(),
      }, { merge: true });

      setEditId(null);
      await load();
      showToast(true, isNew ? `"${name}" added to ${category}.` : `"${name}" updated.`);
    } catch (e: any) {
      showToast(false, 'Failed to save: ' + (e.message ?? 'Unknown error'));
    } finally { setSaving(false); }
  };

  const handleToggle = async (s: Service) => {
    try {
      await setDoc(doc(db, 'services', s.id), { active: !s.active }, { merge: true });
      setServices(p => p.map(x => x.id === s.id ? { ...x, active: !x.active } : x));
    } catch { /* silent */ }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteDoc(doc(db, 'services', deleting.id));
      setServices(p => p.filter(x => x.id !== deleting.id));
      showToast(true, `"${deleting.name}" deleted.`);
    } catch {
      showToast(false, 'Failed to delete.');
    }
    setDeleting(null);
  };

  const toggleCat = (c: string) => setOpenCats(prev => {
    const n = new Set(prev);
    if (n.has(c)) n.delete(c); else n.add(c);
    return n;
  });

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            <Scissors size={18} className="text-gold" /> Service Catalogue
          </h2>
          <p className="text-gray-400 text-sm mt-0.5">
            {services.length} services across {categories.length} categories
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load} title="Refresh"
            className="p-2 rounded-xl bg-white/8 border border-white/12 text-gray-400 hover:text-white transition-all">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => startNew()}
            className="flex items-center gap-2 px-4 py-2 bg-gold/10 border border-gold/30 rounded-xl text-gold text-xs font-black uppercase tracking-wider hover:bg-gold/20 transition-all">
            <Plus size={13} /> Add Service
          </button>
        </div>
      </div>

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

      {/* New-service form (top level) */}
      <AnimatePresence>
        {editId === 'new' && (
          <ServiceForm
            form={form} setForm={setForm} categories={categories}
            onSave={handleSave} onCancel={cancelEdit}
            saving={saving} isNew
          />
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text" placeholder="Search services or categories…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-white/12 rounded-xl py-2.5 pl-9 pr-8 text-white text-sm focus:outline-none focus:border-gold/40 transition-all placeholder:text-gray-500"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
            <X size={12}/>
          </button>
        )}
      </div>

      {/* Category chips — single scrollable row */}
      <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
        <div className="flex items-center gap-1.5 w-max">
          <button
            onClick={() => setCatFilter('')}
            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border whitespace-nowrap transition-all ${
              !catFilter ? 'bg-white/15 border-white/30 text-white' : 'bg-white/8 border-white/15 text-gray-300 hover:text-white'
            }`}
          >
            All ({services.length})
          </button>
          {categories.map(c => (
            <button key={c}
              onClick={() => setCatFilter(c === catFilter ? '' : c)}
              className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border whitespace-nowrap transition-all ${
                catFilter === c ? 'bg-gold/20 border-gold/40 text-gold' : 'bg-white/8 border-white/15 text-gray-300 hover:text-white'
              }`}
            >
              {c} <span className="opacity-60">({services.filter(s => s.category === c).length})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-14 gap-3 text-gray-400">
          <Loader2 size={20} className="animate-spin text-gold" /> Loading services…
        </div>
      )}

      {/* Service list */}
      {!loading && (
        <div className="space-y-3">
          {(Object.entries(grouped) as [string, Service[]][]).map(([cat, svcs]) => (
            <div key={cat} className="bg-zinc-900 border border-white/12 rounded-2xl overflow-hidden">
              {/* Category header */}
              <div className="flex items-center gap-3 px-5 py-3 bg-white/[0.02] border-b border-white/10">
                <button onClick={() => toggleCat(cat)} className="flex items-center gap-2 flex-1 text-left">
                  <Tag size={12} className="text-gold shrink-0" />
                  <span className="text-white font-black text-sm">{cat}</span>
                  <span className="text-gray-400 text-xs ml-1">({svcs.length})</span>
                  {openCats.has(cat)
                    ? <ChevronUp size={12} className="text-gray-400 ml-auto" />
                    : <ChevronDown size={12} className="text-gray-400 ml-auto" />}
                </button>
                <button
                  onClick={() => { startNew(cat); }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-gold/10 border border-gold/25 rounded-lg text-gold text-[9px] font-black uppercase hover:bg-gold/20 transition-all shrink-0"
                >
                  <Plus size={10} /> Add
                </button>
              </div>

              {/* Cards grid */}
              <AnimatePresence initial={false}>
                {openCats.has(cat) && (
                  <motion.div
                    key="rows"
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                      {svcs.map(s => (
                        <div key={s.id} className="contents">
                          <div className={`group relative rounded-2xl overflow-hidden border transition-all cursor-default ${
                            !s.active ? 'opacity-40 border-white/8' : 'border-white/12 hover:border-gold/30'
                          }`}>
                            {/* Image area — custom imageUrl takes priority, then auto-resolved */}
                            <div className="relative aspect-[4/3] bg-gradient-to-br from-zinc-800 to-zinc-950">
                              <img
                                src={getServiceImage(s.name, s.category, s.imageUrl)}
                                alt={s.name}
                                className="absolute inset-0 w-full h-full object-cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                              {/* Gradient overlay always present */}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                              {/* Hidden badge */}
                              {!s.active && (
                                <span className="absolute top-2 left-2 text-[8px] font-black uppercase bg-black/60 text-gray-300 px-1.5 py-0.5 rounded-full border border-white/15">
                                  Hidden
                                </span>
                              )}

                              {/* Hover action bar */}
                              <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0">
                                <button onClick={() => handleToggle(s)}
                                  className={`p-1.5 rounded-lg backdrop-blur-sm border transition-all ${s.active ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-black/50 border-white/20 text-gray-300'}`}
                                  title={s.active ? 'Hide' : 'Show'}>
                                  {s.active ? <ToggleRight size={13}/> : <ToggleLeft size={13}/>}
                                </button>
                                <button onClick={() => editId === s.id ? cancelEdit() : startEdit(s)}
                                  className="p-1.5 rounded-lg bg-black/50 backdrop-blur-sm border border-white/20 text-gray-300 hover:text-white hover:border-gold/40 transition-all"
                                  title="Edit">
                                  <Edit2 size={12}/>
                                </button>
                                <button onClick={() => setDeleting(s)}
                                  className="p-1.5 rounded-lg bg-black/50 backdrop-blur-sm border border-white/20 text-gray-300 hover:text-red-400 hover:border-red-500/30 transition-all"
                                  title="Delete">
                                  <Trash2 size={12}/>
                                </button>
                              </div>

                              {/* Price badge pinned to bottom-left of image */}
                              <div className="absolute bottom-2 left-2">
                                <span className="flex items-center gap-0.5 text-[11px] text-gold font-black bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full border border-gold/25">
                                  <IndianRupee size={9}/>{s.priceValue.toLocaleString('en-IN')}
                                </span>
                              </div>
                            </div>

                            {/* Info strip */}
                            <div className="px-3 py-2.5 bg-zinc-900">
                              <p className="text-white text-xs font-bold leading-snug line-clamp-2">{s.name}</p>
                              <span className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                                <Clock size={9}/>{s.time}
                              </span>
                            </div>
                          </div>

                          {/* Inline edit form — spans full grid width */}
                          <AnimatePresence>
                            {editId === s.id && (
                              <div className="col-span-full">
                                <ServiceForm
                                  form={form} setForm={setForm} categories={categories}
                                  onSave={handleSave} onCancel={cancelEdit}
                                  saving={saving} isNew={false}
                                />
                              </div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}

          {Object.keys(grouped).length === 0 && (
            <div className="text-center py-16">
              <Scissors size={32} className="text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No services match your search.</p>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleting && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[400]"
              onClick={() => setDeleting(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[401] w-full max-w-sm bg-[#0f0f0f] border border-white/15 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                  <Trash2 size={16} className="text-red-400" />
                </div>
                <div>
                  <p className="text-white font-black text-sm">Delete Service?</p>
                  <p className="text-gray-400 text-xs mt-0.5">"{deleting.name}"</p>
                </div>
              </div>
              <p className="text-gray-400 text-xs mb-5">
                This removes it from the catalogue and booking flow. Existing invoices are not affected.
              </p>
              <div className="flex gap-2">
                <button onClick={handleDelete}
                  className="flex-1 py-2.5 bg-red-500/15 border border-red-500/25 rounded-xl text-red-400 font-black text-xs uppercase tracking-wider hover:bg-red-500/25 transition-all">
                  Delete
                </button>
                <button onClick={() => setDeleting(null)}
                  className="flex-1 py-2.5 bg-white/8 border border-white/12 rounded-xl text-gray-300 font-bold text-xs uppercase tracking-wider hover:bg-white/15 transition-all">
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
