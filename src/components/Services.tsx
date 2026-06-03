import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Scissors, Sparkles, User, Heart, Palette, Wand2,
  ChevronDown, Clock, Tag, Plus, Search, X, Coffee,
  ArrowRight,
} from 'lucide-react';
import Fuse from 'fuse.js';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

const INITIAL_SHOW = 8;

const categoryConfig = [
  { id: 'Combos',        icon: Tag,      image: 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?q=80&w=800&auto=format&fit=crop' },
  { id: 'Hair Cut',      icon: Scissors, image: 'https://plus.unsplash.com/premium_photo-1661645788141-8196a45fb483?q=80&w=800&auto=format&fit=crop' },
  { id: 'Hair Styling',  icon: Wand2,    image: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&q=80&w=800' },
  { id: 'Hair Wash',     icon: Sparkles, image: 'https://images.unsplash.com/photo-1717160675643-53a7a2ebaa9f?q=80&w=800&auto=format&fit=crop' },
  { id: 'Hair Treatment',icon: Heart,    image: 'https://images.unsplash.com/photo-1707979577466-2d6109c68a45?q=80&w=800&auto=format&fit=crop' },
  { id: 'Hair Colouring',icon: Palette,  image: 'https://plus.unsplash.com/premium_photo-1728693697217-95df3717cccc?q=80&w=800&auto=format&fit=crop' },
  { id: 'Hair Spa',      icon: Sparkles, image: 'https://plus.unsplash.com/premium_photo-1667516650977-b6fb6e3a5a5f?q=80&w=800&auto=format&fit=crop' },
  { id: 'Basic Beauty',  icon: User,     image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&q=80&w=800' },
  { id: 'Cleanup',       icon: Sparkles, image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&q=80&w=800' },
  { id: 'Detan',         icon: Tag,      image: 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?q=80&w=800&auto=format&fit=crop' },
  { id: 'Add-ons',       icon: Plus,     image: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&q=80&w=800' },
  { id: 'Nail Services', icon: Heart,    image: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?q=80&w=800&auto=format&fit=crop' },
  { id: 'Mani & Pedi',   icon: Sparkles, image: 'https://images.unsplash.com/photo-1519419451778-14599a49ec41?q=80&w=800&auto=format&fit=crop' },
  { id: 'Beard & Shave', icon: Scissors, image: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&q=80&w=800' },
  { id: 'Makeup',        icon: Palette,  image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=800' },
  { id: 'Massages',      icon: Heart,    image: 'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?q=80&w=800&auto=format&fit=crop' },
  { id: 'Scalp & Skin',  icon: User,     image: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=800&auto=format&fit=crop' },
];

function isPremiumService(s: { id: string; name: string }) {
  return /premium/i.test(s.id) || /premium/i.test(s.name);
}

export default function Services() {
  const [openCategory,  setOpenCat]    = useState<string | null>(null);
  const [searchQuery,   setSearch]     = useState('');
  const [showAll,       setShowAll]    = useState(false);
  const [servicesData,  setData]       = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'services'), where('active', '==', true));
    const unsub = onSnapshot(q, snap => {
      const raw  = snap.docs.map(d => ({ ...d.data(), id: d.id })) as any[];
      const deduped = Array.from(new Map(raw.map(s => [s.name, s])).values());
      setData(deduped);
    });
    return unsub;
  }, []);

  const categories = useMemo(() => {
    let filtered = servicesData;
    const q = searchQuery.trim();
    if (q) {
      const fuse = new Fuse(servicesData, {
        keys: [{ name: 'name', weight: 1 }, { name: 'category', weight: 0.5 }],
        threshold: 0.4,
        includeScore: true,
        shouldSort: true,
      });
      filtered = fuse.search(q).map(r => r.item);
    }

    const grouped = filtered.reduce((acc: Record<string, any[]>, s) => {
      (acc[s.category] = acc[s.category] ?? []).push(s);
      return acc;
    }, {});

    return categoryConfig
      .map(cfg => ({
        ...cfg,
        name: cfg.id,
        services: grouped[cfg.id] ?? [],
        hasPremium: (grouped[cfg.id] ?? []).some(isPremiumService),
      }))
      .filter(c => c.services.length > 0);
  }, [servicesData, searchQuery]);

  const visibleCats = searchQuery ? categories : (showAll ? categories : categories.slice(0, INITIAL_SHOW));
  const hiddenCount = categories.length - INITIAL_SHOW;

  return (
    <section id="services" className="py-12 sm:py-20 bg-zinc-950">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">

        {/* ── Section header ── */}
        <div className="text-center mb-12">
          <motion.span
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-gold uppercase tracking-[0.4em] text-[10px] font-black mb-3 block"
          >
            Menu of Beauty
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ delay: 0.08 }}
            className="text-3xl md:text-5xl font-serif font-bold text-white"
          >
            Luxury <span className="italic text-gold">Treatments</span>
          </motion.h2>
          <p className="text-gray-500 mt-3 text-sm max-w-lg mx-auto font-light">
            Browse our full menu. Click any category to see pricing and details.
          </p>

          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="mt-8 max-w-md mx-auto relative group"
          >
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-gold transition-colors pointer-events-none" />
            <input
              type="text"
              placeholder="Search services…"
              value={searchQuery}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-zinc-900/60 border border-white/8 rounded-2xl py-3.5 pl-11 pr-10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-gold/40 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X size={14} />
              </button>
            )}
          </motion.div>
        </div>

        {/* ── Category grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleCats.map((cat, i) => {
            const Icon    = cat.icon;
            const isOpen  = openCategory === cat.id;

            return (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className={`rounded-2xl border overflow-hidden transition-all duration-300 ${
                  isOpen
                    ? 'border-gold/35 bg-zinc-900 sm:col-span-2'
                    : 'border-white/8 bg-zinc-900/50 hover:border-gold/20'
                }`}
              >
                {/* Card header — compact 140px */}
                <button
                  onClick={() => setOpenCat(isOpen ? null : cat.id)}
                  className="w-full text-left"
                >
                  <div className="relative h-[140px] overflow-hidden">
                    <img
                      src={cat.image} alt={cat.name}
                      className={`w-full h-full object-cover transition-transform duration-700 ${isOpen ? 'opacity-25 scale-105' : 'opacity-50 group-hover:scale-105'}`}
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/30 to-transparent" />

                    {/* Badges row */}
                    <div className="absolute top-3 right-3 flex items-center gap-2">
                      {cat.hasPremium && (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-900/70 border border-amber-500/30 backdrop-blur-sm">
                          <Coffee size={9} className="text-amber-400" />
                          <span className="text-[8px] font-black uppercase tracking-wider text-amber-400 hidden sm:inline">Free Drink</span>
                        </span>
                      )}
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 ${isOpen ? 'bg-gold text-black' : 'bg-white/10 text-gold border border-white/10'}`}>
                        <ChevronDown size={14} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                      </span>
                    </div>

                    {/* Category name */}
                    <div className="absolute bottom-3 left-4 flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-gold text-black flex items-center justify-center shrink-0">
                        <Icon size={14} />
                      </div>
                      <div>
                        <p className="text-white font-bold text-sm leading-tight">{cat.name}</p>
                        <p className="text-[9px] text-gold/80 font-bold uppercase tracking-wider">{cat.services.length} services</p>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expandable service list */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-3 space-y-3">
                        {/* Premium note */}
                        {cat.hasPremium && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-900/15 border border-amber-500/15">
                            <Coffee size={11} className="text-amber-400 shrink-0" />
                            <p className="text-[10px] text-amber-300/70 leading-tight">
                              Services marked with <Coffee size={8} className="inline text-amber-400 mx-0.5" /> include a complimentary beverage.
                            </p>
                          </div>
                        )}

                        {/* Service rows */}
                        <div className="space-y-1.5">
                          {cat.services.map((svc: any) => (
                            <div
                              key={svc.id}
                              className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl hover:bg-white/[0.04] transition-colors group/row"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-white text-xs font-medium leading-snug group-hover/row:text-gold transition-colors truncate">
                                    {svc.name}
                                  </p>
                                  {isPremiumService(svc) && (
                                    <Coffee size={9} className="text-amber-400 shrink-0" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="flex items-center gap-1 text-[10px] text-gray-600">
                                    <Clock size={8} />{svc.time}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2.5 shrink-0">
                                <span className="text-gold font-bold text-sm">{svc.price}</span>
                                <Link
                                  to="/booking"
                                  className="px-2.5 py-1 rounded-lg bg-gold/10 border border-gold/20 text-gold text-[9px] font-black uppercase tracking-wider hover:bg-gold hover:text-black transition-all"
                                >
                                  Book
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Category CTA */}
                        <Link
                          to="/booking"
                          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gold text-black text-xs font-black uppercase tracking-wider shadow-[0_4px_12px_-4px_rgba(212,175,55,0.4)] hover:shadow-[0_6px_16px_-4px_rgba(212,175,55,0.55)] hover:-translate-y-0.5 transition-all mt-2"
                        >
                          Book {cat.name} <ArrowRight size={13} />
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* ── Show more / Show less ── */}
        {!searchQuery && hiddenCount > 0 && (
          <motion.div
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="flex flex-col items-center gap-3 mt-10"
          >
            <button
              onClick={() => setShowAll(v => !v)}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl border border-white/10 text-white/70 text-sm font-bold uppercase tracking-wider hover:border-gold/30 hover:text-white transition-all group"
            >
              <ChevronDown size={15} className={`transition-transform duration-300 text-gold ${showAll ? 'rotate-180' : ''}`} />
              {showAll ? 'Show less' : `Show all ${categories.length} categories`}
            </button>
            {!showAll && (
              <p className="text-gray-700 text-[10px] uppercase tracking-wider font-bold">
                +{hiddenCount} more categories
              </p>
            )}
          </motion.div>
        )}

        {/* ── Empty search state ── */}
        {categories.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto text-gray-600">
              <Search size={26} />
            </div>
            <p className="text-white font-bold text-lg">No treatments found</p>
            <p className="text-gray-500 text-sm">
              Nothing matching "<span className="text-gold">{searchQuery}</span>"
            </p>
            <button onClick={() => setSearch('')} className="text-gold text-xs font-bold uppercase tracking-widest hover:underline">
              Clear search
            </button>
          </div>
        )}

        {/* ── Bottom CTA ── */}
        <div className="text-center mt-14">
          <p className="text-gray-600 text-xs uppercase tracking-wider font-bold mb-4">
            Ready to transform your look?
          </p>
          <Link
            to="/booking"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gold text-black font-black text-sm uppercase tracking-[0.15em] shadow-[0_8px_28px_-6px_rgba(212,175,55,0.5)] hover:shadow-[0_10px_36px_-6px_rgba(212,175,55,0.65)] hover:-translate-y-0.5 transition-all duration-300"
          >
            <Scissors size={15} /> Book an Appointment <ArrowRight size={14} />
          </Link>
        </div>

      </div>
    </section>
  );
}
