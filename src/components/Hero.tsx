import { motion } from 'motion/react';
import { Calendar, Star, Scissors } from 'lucide-react';
import BannerSlider from './BannerSlider';
import { Link } from 'react-router-dom';

export default function Hero() {
  return (
    <section id="hero" className="bg-black pt-44 sm:pt-40 pb-6 sm:pb-10">
      <BannerSlider>
        {/* CTA buttons — overlaid at bottom center of the banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="absolute bottom-14 sm:bottom-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3"
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
  );
}
