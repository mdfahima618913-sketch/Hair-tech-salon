import { motion } from 'motion/react';
import { Calendar, ChevronDown, Star } from 'lucide-react';
import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import BannerSlider from './BannerSlider';
import { Link } from 'react-router-dom';

export default function Hero() {
  const [config, setConfig] = useState({
    title:   'The Gold Standard',
    accent:  'of Grooming',
    subline: 'Premium unisex salon experience in Araria. Expert stylists, luxury products, zero compromise.',
  });

  useEffect(() => {
    getDoc(doc(db, 'website_config', 'main')).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.heroHeadline) {
        const words = d.heroHeadline.split(' ');
        const accent = words.splice(-2).join(' ');
        setConfig(c => ({ ...c, title: words.join(' '), accent }));
      }
      if (d.heroSubline) setConfig(c => ({ ...c, subline: d.heroSubline }));
    }).catch(() => {});
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center bg-black overflow-hidden">

      {/* Background slider */}
      <BannerSlider />

      {/* Content */}
      <div className="relative z-10 text-center px-5 max-w-4xl mx-auto pt-36 sm:pt-28">

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gold/30 bg-gold/5 mb-8"
        >
          <Star size={11} className="text-gold fill-gold" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gold">
            Araria's Premium Salon
          </span>
          <Star size={11} className="text-gold fill-gold" />
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="text-4xl sm:text-6xl md:text-8xl font-serif font-bold leading-[1.05] text-white mb-4 sm:mb-6"
        >
          {config.title}
          <br />
          <span className="text-gold italic">{config.accent}</span>
        </motion.h1>

        {/* Subline */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-gray-400 text-base md:text-xl max-w-xl mx-auto mb-8 sm:mb-10 font-light leading-relaxed px-2"
        >
          {config.subline}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          {/* Primary CTA — prominent with glow ring */}
          <div className="relative group">
            {/* Pulsing glow ring */}
            <span className="absolute -inset-1.5 rounded-[18px] bg-gold/30 blur-md animate-pulse pointer-events-none" />
            <Link
              to="/booking"
              className="relative flex items-center gap-2.5 px-9 py-4.5 rounded-2xl bg-gold text-black font-black text-sm uppercase tracking-[0.15em] shadow-[0_8px_32px_-4px_rgba(212,175,55,0.6)] hover:shadow-[0_12px_44px_-4px_rgba(212,175,55,0.8)] hover:-translate-y-0.5 transition-all duration-300"
              style={{ paddingTop: '1.1rem', paddingBottom: '1.1rem' }}
            >
              <Calendar size={17} />
              Book Appointment
              <span className="ml-1 text-base leading-none">→</span>
            </Link>
          </div>
          <a
            href="#services"
            className="flex items-center gap-2 px-8 py-4 rounded-2xl border border-white/15 text-white font-bold text-sm uppercase tracking-[0.15em] hover:bg-white/5 hover:border-white/25 transition-all duration-300"
          >
            View Services
          </a>
        </motion.div>

        {/* Social proof */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mt-8 sm:mt-12"
        >
          <div className="flex items-center gap-1.5">
            {[1,2,3,4,5].map(i => <Star key={i} size={12} className="text-gold fill-gold" />)}
            <span className="text-white font-bold text-sm ml-1">4.9</span>
          </div>
          <div className="hidden sm:block w-px h-4 bg-white/15" />
          <span className="text-gray-500 text-xs sm:text-sm">500+ happy customers</span>
          <div className="hidden sm:block w-px h-4 bg-white/15" />
          <span className="text-gray-500 text-xs sm:text-sm">Open daily 10AM–10PM</span>
        </motion.div>
      </div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
      >
        <motion.div animate={{ y: [0, 5, 0] }} transition={{ duration: 2, repeat: Infinity }}>
          <ChevronDown size={20} className="text-white/20" />
        </motion.div>
      </motion.div>
    </section>
  );
}