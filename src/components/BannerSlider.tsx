import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

const DEFAULT_SLIDES = [
  {
    url:   'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=1400&q=80&auto=format&fit=crop',
    title: 'Expert Hair Styling',
  },
  {
    url:   'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=1400&q=80&auto=format&fit=crop',
    title: 'Precision Cuts',
  },
  {
    url:   'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=1400&q=80&auto=format&fit=crop',
    title: 'Beard & Grooming',
  },
  {
    url:   'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1400&q=80&auto=format&fit=crop',
    title: 'Beauty Treatments',
  },
  {
    url:   'https://images.unsplash.com/photo-1559894244-2ccea83bc218?w=1400&q=80&auto=format&fit=crop',
    title: 'Hair Care',
  },
  {
    url:   'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1400&q=80&auto=format&fit=crop',
    title: 'Blow Dry & Finish',
  },
  {
    url:   'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1400&q=80&auto=format&fit=crop',
    title: 'Bridal Makeup',
  },
  {
    url:   'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1400&q=80&auto=format&fit=crop',
    title: 'Nail Art',
  },
  {
    url:   'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1400&q=80&auto=format&fit=crop',
    title: 'Relaxing Massage',
  },
  {
    url:   'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=1400&q=80&auto=format&fit=crop',
    title: 'Facial & Skin Care',
  },
];

interface Slide { url: string; title: string; }

const INTERVAL_MS = 5000;

export default function BannerSlider() {
  const [slides,   setSlides]   = useState<Slide[]>(DEFAULT_SLIDES);
  const [current,  setCurrent]  = useState(0);
  const [paused,   setPaused]   = useState(false);

  // Fetch custom images from Firestore; silently fall back to defaults on any error
  useEffect(() => {
    getDocs(query(collection(db, 'banner_images'), where('active', '==', true)))
      .then(snap => {
        if (snap.empty) return;
        const data: (Slide & { order?: number })[] = snap.docs.map(d => ({
          url:   (d.data().url   as string) ?? '',
          title: (d.data().title as string) ?? '',
          order: (d.data().order as number) ?? 0,
        })).filter(s => s.url);
        data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        if (data.length > 0) setSlides(data);
      })
      .catch(() => {}); // keep defaults
  }, []);

  // Auto-advance
  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const t = setInterval(() => setCurrent(c => (c + 1) % slides.length), INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused, slides.length]);

  const prev = useCallback(() => setCurrent(c => (c - 1 + slides.length) % slides.length), [slides.length]);
  const next = useCallback(() => setCurrent(c => (c + 1) % slides.length),                  [slides.length]);

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* All slides stacked — CSS transition handles the crossfade */}
      {slides.map((slide, i) => (
        <img
          key={slide.url}
          src={slide.url}
          alt={slide.title}
          loading={i === 0 ? 'eager' : 'lazy'}
          style={{
            position:   'absolute',
            inset:      0,
            width:      '100%',
            height:     '100%',
            objectFit:  'cover',
            opacity:    i === current ? 0.22 : 0,
            transition: 'opacity 1.4s ease-in-out',
          }}
        />
      ))}

      {/* Overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/35 to-black pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_30%,rgba(212,175,55,0.06),transparent)] pointer-events-none" />

      {/* Slide title — subtle caption */}
      {slides[current]?.title && (
        <div
          key={current}
          className="absolute top-1/2 right-6 sm:right-10 -translate-y-1/2 hidden sm:flex"
          style={{ opacity: 0, animation: 'slider-caption-in 0.8s ease forwards 0.3s' }}
        >
          <style>{`
            @keyframes slider-caption-in {
              from { opacity: 0; transform: translateY(6px); }
              to   { opacity: 1; transform: translateY(0);   }
            }
          `}</style>
          <span className="writing-mode-vertical text-[9px] font-black uppercase tracking-[0.35em] text-white/20">
            {slides[current].title}
          </span>
        </div>
      )}

      {/* Prev / next arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/25 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white/40 hover:text-white hover:border-white/30 hover:bg-black/50 transition-all duration-200"
            aria-label="Previous image"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/25 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white/40 hover:text-white hover:border-white/30 hover:bg-black/50 transition-all duration-200"
            aria-label="Next image"
          >
            <ChevronRight size={16} />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                style={{ transition: 'all 0.35s ease' }}
                className={`rounded-full ${
                  i === current
                    ? 'w-5 h-1.5 bg-gold'
                    : 'w-1.5 h-1.5 bg-white/25 hover:bg-white/45'
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
