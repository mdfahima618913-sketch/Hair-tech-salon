import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

const DEFAULT_SLIDES: Slide[] = [
  { url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=1400&q=80&auto=format&fit=crop', title: 'Expert Hair Styling', occasion: '', name: '' },
  { url: 'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=1400&q=80&auto=format&fit=crop', title: 'Precision Cuts', occasion: '', name: '' },
  { url: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=1400&q=80&auto=format&fit=crop', title: 'Beard & Grooming', occasion: '', name: '' },
  { url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1400&q=80&auto=format&fit=crop', title: 'Beauty Treatments', occasion: '', name: '' },
  { url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1400&q=80&auto=format&fit=crop', title: 'Bridal Makeup', occasion: '', name: '' },
  { url: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1400&q=80&auto=format&fit=crop', title: 'Relaxing Massage', occasion: '', name: '' },
];

interface Slide { url: string; title: string; occasion?: string; name?: string; }

const OCCASION_STYLE: Record<string, { bg: string; emoji: string }> = {
  'VIP Visit':      { bg: 'bg-gradient-to-r from-[#D4AF37] to-[#F9E29C] text-black', emoji: '⭐' },
  'Birthday':       { bg: 'bg-gradient-to-r from-pink-500 to-rose-400 text-white',    emoji: '🎂' },
  'Customer Story': { bg: 'bg-gradient-to-r from-emerald-500 to-teal-400 text-white', emoji: '💬' },
  'Event':          { bg: 'bg-gradient-to-r from-blue-500 to-indigo-400 text-white',  emoji: '🎉' },
  'Festival':       { bg: 'bg-gradient-to-r from-purple-500 to-violet-400 text-white', emoji: '🪔' },
  'Before & After': { bg: 'bg-gradient-to-r from-cyan-500 to-sky-400 text-black',     emoji: '✨' },
  'Promo':          { bg: 'bg-gradient-to-r from-red-500 to-orange-400 text-white',   emoji: '🔥' },
};

const INTERVAL_MS = 5000;

export default function BannerSlider({ children }: { children?: React.ReactNode }) {
  const [slides,  setSlides]  = useState<Slide[]>(DEFAULT_SLIDES);
  const [current, setCurrent] = useState(0);
  const [dir,     setDir]     = useState<1 | -1>(1);
  const [paused,  setPaused]  = useState(false);

  useEffect(() => {
    getDocs(query(collection(db, 'banner_images'), where('active', '==', true)))
      .then(snap => {
        if (snap.empty) return;
        const data: (Slide & { order?: number })[] = snap.docs.map(d => ({
          url:      (d.data().url      as string) ?? '',
          title:    (d.data().title    as string) ?? '',
          occasion: (d.data().occasion as string) ?? '',
          name:     (d.data().name     as string) ?? '',
          order:    (d.data().order    as number) ?? 0,
        })).filter(s => s.url);
        data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        if (data.length > 0) setSlides(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { setCurrent(c => (slides.length > 0 && c >= slides.length ? 0 : c)); }, [slides.length]);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const t = setInterval(() => { setDir(1); setCurrent(c => (c + 1) % slides.length); }, INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused, slides.length]);

  const go = useCallback((d: 1 | -1) => { setDir(d); setCurrent(c => (c + d + slides.length) % slides.length); }, [slides.length]);

  const slide = slides[current] ?? slides[0];
  if (!slide) return null;
  const occ = slide.occasion ? OCCASION_STYLE[slide.occasion] : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div
        className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-gold/20 shadow-[0_8px_60px_-12px_rgba(212,175,55,0.15)]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Gold accent corners */}
        <span className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-gold/40 rounded-tl-2xl sm:rounded-tl-3xl z-20 pointer-events-none" />
        <span className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-gold/40 rounded-tr-2xl sm:rounded-tr-3xl z-20 pointer-events-none" />
        <span className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-gold/40 rounded-bl-2xl sm:rounded-bl-3xl z-20 pointer-events-none" />
        <span className="absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 border-gold/40 rounded-br-2xl sm:rounded-br-3xl z-20 pointer-events-none" />

        {/* Occasion tag — top center */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <AnimatePresence mode="wait">
            {occ ? (
              <motion.span
                key={slide.occasion! + current}
                initial={{ opacity: 0, y: -10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.9 }}
                transition={{ duration: 0.35 }}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] shadow-lg ${occ.bg}`}
              >
                {occ.emoji} {slide.occasion}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Image — 16:9 aspect */}
        <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
          <AnimatePresence mode="sync" custom={dir}>
            <motion.img
              key={slide.url + current}
              src={slide.url}
              alt={slide.title || 'Hair Tech'}
              custom={dir}
              initial={{ opacity: 0, scale: 1.05, x: dir * 50 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.97, x: dir * -50 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </AnimatePresence>

          {/* Bottom gradient for footer readability */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10" />

          {/* Arrows */}
          {slides.length > 1 && (
            <>
              <button onClick={() => go(-1)}
                className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/40 border border-gold/20 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-gold hover:border-gold/50 hover:bg-black/60 transition-all"
                aria-label="Previous"
              >
                <ChevronLeft size={18} />
              </button>
              <button onClick={() => go(1)}
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/40 border border-gold/20 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-gold hover:border-gold/50 hover:bg-black/60 transition-all"
                aria-label="Next"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}

          {/* Footer overlay — title, name, dots */}
          <div className="absolute inset-x-0 bottom-0 z-20 px-4 sm:px-6 pb-4 sm:pb-5">
            <div className="flex items-end justify-between gap-4">
              {/* Caption */}
              <div className="flex-1 min-w-0">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={current}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.35 }}
                  >
                    {slide.title && (
                      <p className="text-white font-serif text-base sm:text-lg font-bold drop-shadow-lg truncate">{slide.title}</p>
                    )}
                    {slide.name && (
                      <p className="text-gold-light text-xs sm:text-sm font-bold mt-0.5 drop-shadow-lg">— {slide.name}</p>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Dots */}
              {slides.length > 1 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {slides.map((_, i) => (
                    <button key={i} onClick={() => { setDir(i > current ? 1 : -1); setCurrent(i); }}
                      style={{ transition: 'all 0.3s ease' }}
                      className={`rounded-full ${i === current ? 'w-5 h-1.5 bg-gold' : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/60'}`}
                      aria-label={`Slide ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CTA overlay — bottom center, passed as children from Hero */}
        {children}
      </div>
    </div>
  );
}
