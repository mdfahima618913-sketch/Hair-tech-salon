import { motion } from 'motion/react';
import { Calendar, Star, Scissors } from 'lucide-react';
import BannerSlider from './BannerSlider';
import { Link } from 'react-router-dom';

export default function Hero() {
  return (
    <>
    <section id="hero" className="bg-black pt-52 sm:pt-44 pb-6 sm:pb-16">
      <BannerSlider>
        {/* CTA buttons — overlaid at bottom center of the banner (desktop/tablet only) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="absolute bottom-14 sm:bottom-16 left-1/2 -translate-x-1/2 z-30 hidden sm:flex items-center gap-3"
        >
          <div className="relative group">
            <span className="absolute -inset-1 rounded-2xl bg-gold/30 blur-md animate-pulse pointer-events-none" />
            <Link
              to="/booking"
              className="relative flex items-center gap-2 px-5 sm:px-7 py-3 sm:py-3.5 rounded-xl bg-gold text-black font-black text-[11px] sm:text-xs uppercase tracking-[0.14em] shadow-[0_6px_28px_-4px_rgba(212,175,55,0.6)] hover:shadow-[0_10px_40px_-4px_rgba(212,175,55,0.8)] hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap"
            >
              <Calendar size={15} />
              Book Appointment
            </Link>
          </div>
          <a
            href="#services"
            className="flex items-center gap-2 px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl bg-black/50 border border-gold/30 text-gold font-black text-[11px] sm:text-xs uppercase tracking-[0.14em] backdrop-blur-sm hover:bg-black/70 hover:border-gold/50 transition-all duration-300 whitespace-nowrap"
          >
            <Scissors size={14} />
            View Services
          </a>
        </motion.div>
      </BannerSlider>

      {/* Social proof strip — below the banner */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 flex items-center justify-center gap-3 sm:gap-6"
      >
        <div className="flex items-center gap-1">
          {[1,2,3,4,5].map(i => <Star key={i} size={10} className="text-gold fill-gold" />)}
          <span className="text-white font-bold text-xs ml-1">4.9</span>
        </div>
        <span className="w-px h-3 bg-white/15" />
        <span className="text-gray-600 text-xs font-bold uppercase tracking-widest">500+ Clients</span>
        <span className="w-px h-3 bg-white/15 hidden sm:block" />
        <span className="text-gray-600 text-xs font-bold uppercase tracking-widest hidden sm:block">Open 10AM–10PM</span>
      </motion.div>
    </section>

    {/* Sticky CTA bar — mobile only */}
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.8 }}
      className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-black/95 backdrop-blur-md border-t border-gold/20 px-4 py-3 flex items-center gap-3"
      style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
    >
      <div className="relative flex-1 group">
        <span className="absolute -inset-0.5 rounded-xl bg-gold/25 blur animate-pulse pointer-events-none" />
        <Link
          to="/booking"
          className="relative flex items-center justify-center gap-1.5 w-full px-3 py-3 rounded-xl bg-gold text-black font-black text-[10px] uppercase tracking-[0.12em] shadow-[0_4px_20px_-2px_rgba(212,175,55,0.5)] active:scale-[0.98] transition-all duration-200 whitespace-nowrap"
        >
          <Calendar size={13} />
          Book Appointment
        </Link>
      </div>
      <a
        href="#services"
        className="flex items-center justify-center gap-1.5 flex-1 px-3 py-3 rounded-xl bg-zinc-900 border border-gold/35 text-gold font-black text-[10px] uppercase tracking-[0.12em] active:scale-[0.98] transition-all duration-200 whitespace-nowrap"
      >
        <Scissors size={12} />
        View Services
      </a>
    </motion.div>
    </>
  );
}
