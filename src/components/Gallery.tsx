import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Quote, Images } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface GalleryItem {
  id?: string;
  url: string;
  caption: string;
  name?: string;
  order?: number;
}

const DUMMY: GalleryItem[] = [
  {
    url:     'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=900&q=85&auto=format&fit=crop',
    caption: 'My bridal look was absolutely stunning! Every detail was perfect. Best salon in Araria — I felt like royalty on my wedding day!',
    name:    '— Priya Sharma, Araria',
  },
  {
    url:     'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=900&q=85&auto=format&fit=crop',
    caption: 'The balayage came out exactly how I dreamed. My hair has never looked this beautiful — everyone keeps asking where I got it done!',
    name:    '— Sneha Gupta, Forbesganj',
  },
  {
    url:     'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=900&q=85&auto=format&fit=crop',
    caption: 'My skin is literally glowing after the Gold Facial. The team is so professional and the results speak for themselves. Highly recommend!',
    name:    '— Riya Singh, Araria',
  },
];

const INTERVAL_MS = 6000;

export default function Gallery() {
  const [items,    setItems]   = useState<GalleryItem[]>(DUMMY);
  const [current,  setCurrent] = useState(0);
  const [dir,      setDir]     = useState<1 | -1>(1);
  const [paused,   setPaused]  = useState(false);

  useEffect(() => {
    getDocs(query(collection(db, 'gallery_images'), where('active', '==', true)))
      .then(snap => {
        if (snap.empty) return;
        const data: GalleryItem[] = snap.docs.map(d => ({
          id:      d.id,
          url:     d.data().url     ?? '',
          caption: d.data().caption ?? '',
          name:    d.data().name    ?? '',
          order:   d.data().order   ?? 0,
        })).filter(i => i.url);
        data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        if (data.length) setItems(data);
      })
      .catch(() => {});
  }, []);

  // Reset current when items array shrinks (e.g. Firestore replaces 3-item default)
  useEffect(() => {
    setCurrent(c => (items.length > 0 && c >= items.length ? 0 : c));
  }, [items.length]);

  useEffect(() => {
    if (paused || items.length <= 1) return;
    const t = setInterval(() => {
      setDir(1);
      setCurrent(c => (c + 1) % items.length);
    }, INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused, items.length]);

  const go = useCallback((d: 1 | -1) => {
    setDir(d);
    setCurrent(c => (c + d + items.length) % items.length);
  }, [items.length]);

  // Safe access — guards against the brief frame where current is stale
  const item = items[current] ?? items[0];

  if (!item) return null;

  return (
    <section id="gallery" className="py-12 sm:py-20 bg-zinc-950 overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-8">

        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold/8 border border-gold/20 text-gold text-[10px] font-black uppercase tracking-[0.3em] mb-4"
          >
            <Images size={11} /> Our Gallery
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ delay: 0.08 }}
            className="text-3xl sm:text-5xl font-serif font-bold text-white"
          >
            Real Results, <span className="text-gold italic">Real Smiles</span>
          </motion.h2>
          <p className="text-gray-500 text-sm mt-2 font-light">
            See what our clients have to say about their experience
          </p>
        </div>

        {/* Slider */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="relative rounded-3xl overflow-hidden bg-zinc-900 border border-white/8"
          style={{ boxShadow: '0 24px 80px -20px rgba(0,0,0,0.6)' }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Image */}
          <div className="relative w-full" style={{ paddingBottom: '56.25%' /* 16:9 */ }}>
            <AnimatePresence mode="sync" custom={dir}>
              <motion.img
                key={item.url + current}
                src={item.url}
                alt={item.name ?? 'Gallery'}
                custom={dir}
                initial={{ opacity: 0, x: dir * 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -60 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 w-full h-full object-cover"
                onError={e => { (e.target as any).style.opacity = '0'; }}
              />
            </AnimatePresence>

            {/* Prev / Next arrows */}
            {items.length > 1 && (
              <>
                <button
                  onClick={() => go(-1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/40 border border-white/15 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-white hover:border-white/30 transition-all"
                  aria-label="Previous"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => go(1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/40 border border-white/15 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-white hover:border-white/30 transition-all"
                  aria-label="Next"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}
          </div>

          {/* Caption — below the image */}
          {(item.caption || item.name) && (
            <div className="px-5 sm:px-8 py-4 bg-zinc-900 border-t border-white/8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35 }}
                >
                  {item.caption && (
                    <div className="flex items-start gap-3">
                      <Quote size={16} className="text-gold/40 shrink-0 mt-0.5" />
                      <p className="text-gray-300 text-sm font-light leading-relaxed">{item.caption}</p>
                    </div>
                  )}
                  {item.name && (
                    <p className="text-gold/60 text-xs font-bold mt-2 pl-7">— {item.name}</p>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          {/* Dot indicators */}
          {items.length > 1 && (
            <div className="flex items-center justify-center gap-2 py-4 bg-zinc-900/80">
              {items.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setDir(i > current ? 1 : -1); setCurrent(i); }}
                  style={{ transition: 'all 0.3s ease' }}
                  className={`rounded-full ${
                    i === current
                      ? 'w-5 h-1.5 bg-gold'
                      : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'
                  }`}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          )}
        </motion.div>

        {/* Counter */}
        <p className="text-center text-gray-700 text-[10px] uppercase tracking-widest font-bold mt-4">
          {current + 1} / {items.length}
        </p>
      </div>
    </section>
  );
}
