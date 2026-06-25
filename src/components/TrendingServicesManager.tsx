import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, Search, X, Plus, ArrowUp, ArrowDown,
  Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { collection, getDocs, doc, getDoc, setDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getServiceImage } from '../lib/serviceImages';
import { servicesData } from '../constants/services';

interface Service {
  id: string;
  name: string;
  price: string;
  priceValue: number;
  time: string;
  category: string;
  imageUrl?: string;
}

const MAX_PINNED = 10;

export default function TrendingServicesManager() {
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [pinnedIds,   setPinnedIds]   = useState<string[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'services'), orderBy('category'), orderBy('name'))),
      getDoc(doc(db, 'settings', 'trending_services')),
    ]).then(([svcSnap, cfgSnap]) => {
      const fsServices = svcSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Service & { active?: boolean }))
        .filter(s => s.active !== false && typeof s.priceValue === 'number' && !isNaN(s.priceValue));
      const fsNames = new Set(fsServices.map(s => s.name.toLowerCase()));
      const staticOnly = servicesData.filter(s => !fsNames.has(s.name.toLowerCase()));
      setAllServices([...fsServices, ...staticOnly]);
      if (cfgSnap.exists()) {
        setPinnedIds((cfgSnap.data().serviceIds ?? []).slice(0, MAX_PINNED));
      }
    }).catch(() => setError('Failed to load services'))
      .finally(() => setLoading(false));
  }, []);

  const serviceById = useMemo(() => {
    const map = new Map<string, Service>();
    allServices.forEach(s => map.set(s.id, s));
    return map;
  }, [allServices]);

  const pinnedServices = useMemo(
    () => pinnedIds.map(id => serviceById.get(id)).filter((s): s is Service => !!s),
    [pinnedIds, serviceById]
  );

  const availableServices = useMemo(() => {
    const pinnedSet = new Set(pinnedIds);
    const list = allServices.filter(s => !pinnedSet.has(s.id));
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [allServices, pinnedIds, search]);

  const addPin = (id: string) => {
    if (pinnedIds.length >= MAX_PINNED) return;
    setPinnedIds(prev => [...prev, id]);
    setSaved(false);
  };

  const removePin = (id: string) => {
    setPinnedIds(prev => prev.filter(x => x !== id));
    setSaved(false);
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setPinnedIds(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    setSaved(false);
  };

  const moveDown = (idx: number) => {
    setPinnedIds(prev => {
      if (idx === prev.length - 1) return prev;
      const next = [...prev];
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await setDoc(doc(db, 'settings', 'trending_services'), {
        serviceIds: pinnedIds,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
        <Loader2 size={22} className="animate-spin text-gold" /> Loading services…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-zinc-900 border border-white/12 rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center shrink-0">
            <TrendingUp size={15} className="text-gold" />
          </div>
          <p className="text-white font-black text-sm">Trending Services</p>
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Pin up to {MAX_PINNED} services to always appear first in Express Billing's service list, in the order
          you set below. Any remaining services fill in after, automatically ranked by how often they're picked
          (cached daily). Leave this empty to use the automatic ranking only.
        </p>
      </div>

      {/* Pinned list */}
      <div className="bg-zinc-900 border border-white/12 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-widest font-black text-gray-400">
            Pinned ({pinnedServices.length}/{MAX_PINNED})
          </p>
          <button
            onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold text-black text-xs font-black uppercase tracking-wider hover:bg-gold/90 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
            Save
          </button>
        </div>

        {saved && (
          <p className="text-emerald-400 text-[11px] font-bold mb-2 flex items-center gap-1.5">
            <CheckCircle2 size={11} /> Trending services saved
          </p>
        )}
        {error && (
          <p className="text-red-400 text-[11px] font-bold mb-2 flex items-center gap-1.5">
            <AlertCircle size={11} /> {error}
          </p>
        )}

        {pinnedServices.length === 0 ? (
          <p className="text-gray-500 text-xs py-4 text-center">No services pinned — auto-ranking is in effect.</p>
        ) : (
          <div className="space-y-2">
            {pinnedServices.map((service, i) => {
              const imgSrc = getServiceImage(service.name, service.category, (service as any).imageUrl);
              return (
                <div key={service.id} className="flex items-center gap-3 bg-zinc-800 border border-white/10 rounded-xl p-2">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-gold/15 border border-gold/30 text-gold text-xs font-black flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-zinc-950">
                    <img src={imgSrc} alt={service.name} className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-bold truncate">{service.name}</p>
                    <p className="text-xs text-gray-500">{service.category} · {service.price}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => moveUp(i)} disabled={i === 0}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/8 disabled:opacity-30 transition-all">
                      <ArrowUp size={12} />
                    </button>
                    <button onClick={() => moveDown(i)} disabled={i === pinnedServices.length - 1}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/8 disabled:opacity-30 transition-all">
                      <ArrowDown size={12} />
                    </button>
                    <button onClick={() => removePin(service.id)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Available services */}
      <div className="bg-zinc-900 border border-white/12 rounded-2xl p-5">
        <p className="text-xs uppercase tracking-widest font-black text-gray-400 mb-3">Add a service</p>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input type="text" placeholder="Search services…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/[0.06] border border-white/10 rounded-xl py-2.5 pl-9 pr-9 text-white text-sm focus:outline-none focus:border-gold/40 placeholder:text-gray-600"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X size={13} />
            </button>
          )}
        </div>

        {pinnedIds.length >= MAX_PINNED && (
          <p className="text-amber-400 text-[11px] font-bold mb-2 flex items-center gap-1.5">
            <AlertCircle size={11} /> Maximum {MAX_PINNED} pinned — remove one to add another.
          </p>
        )}

        <div className="max-h-[40vh] overflow-y-auto scrollbar-hide space-y-2">
          {availableServices.length === 0 ? (
            <p className="text-gray-500 text-xs py-4 text-center">No services found</p>
          ) : (
            availableServices.map(service => {
              const imgSrc = getServiceImage(service.name, service.category, (service as any).imageUrl);
              return (
                <div key={service.id} className="flex items-center gap-3 bg-zinc-800 border border-white/10 rounded-xl p-2">
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-zinc-950">
                    <img src={imgSrc} alt={service.name} className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-bold truncate">{service.name}</p>
                    <p className="text-xs text-gray-500">{service.category} · {service.price}</p>
                  </div>
                  <button onClick={() => addPin(service.id)} disabled={pinnedIds.length >= MAX_PINNED}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gold/15 border border-gold/30 text-gold text-xs font-black hover:bg-gold/25 transition-all disabled:opacity-30">
                    <Plus size={11} /> Pin
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
