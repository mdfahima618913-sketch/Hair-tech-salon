import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, Calendar, ClipboardList } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { motion as m } from 'motion/react';
const MotionLink = m(Link);
import Logo from './Logo';

const navLinks = [
  { name: 'About',    id: 'about'    },
  { name: 'Services', id: 'services' },
  { name: 'Offers',   id: 'offers'   },
  { name: 'Reviews',  id: 'reviews'  },
  { name: 'FAQ',      id: 'faq'      },
  { name: 'Contact',  id: 'contact'  },
];

export default function Navbar() {
  const [isOpen,   setIsOpen]   = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menu when route changes
  useEffect(() => { setIsOpen(false); }, [location.pathname]);

  /**
   * Handle section navigation:
   * - On landing page (/) → close menu + smooth-scroll after animation ends
   * - On any other route  → navigate to landing page with hash
   */
  const handleSectionNav = useCallback((id: string) => {
    setIsOpen(false);
    if (location.pathname === '/') {
      // Already on landing page — scroll after the menu close animation (~300ms)
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 320);
    } else {
      // Navigate away; browser will handle the hash scroll on landing page load
      window.location.href = '/#' + id;
    }
  }, [location.pathname]);

  return (
    <nav className={`transition-all duration-500 ${
      scrolled
        ? 'bg-black/90 backdrop-blur-2xl border-b border-white/8 py-3'
        : 'bg-transparent py-5'
    }`}>
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <div className="flex items-center justify-between">
          <Logo />

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link, i) => (
              <motion.button
                key={link.name}
                onClick={() => handleSectionNav(link.id)}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400 hover:text-white transition-colors duration-200"
              >
                {link.name}
              </motion.button>
            ))}

            <MotionLink
              to="/my-appointments"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400 hover:text-white transition-colors duration-200"
            >
              <ClipboardList size={12} /> My Bookings
            </MotionLink>

            <MotionLink
              to="/booking"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              transition={{ delay: 0.52 }}
              className="relative flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold text-black font-black text-[11px] uppercase tracking-[0.15em] shadow-[0_4px_20px_-4px_rgba(212,175,55,0.6)] hover:shadow-[0_8px_28px_-4px_rgba(212,175,55,0.75)] transition-all duration-300"
            >
              <Calendar size={13} /> Book Now
            </MotionLink>

            <a
              href="/admin"
              className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-700 hover:text-gray-400 transition-colors duration-200"
            >
              Admin
            </a>
          </div>

          {/* Mobile: icons + hamburger */}
          <div className="md:hidden flex items-center gap-2">
            <Link
              to="/my-appointments"
              className="p-2 text-gray-400 hover:text-white transition-colors"
              aria-label="My bookings"
            >
              <ClipboardList size={20} />
            </Link>
            <button
              onClick={() => setIsOpen(v => !v)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              aria-label="Toggle menu"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu — rendered at z-[60] so it floats above PromoSlider */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden bg-black/98 backdrop-blur-2xl border-t border-white/8 overflow-hidden relative z-[60]"
          >
            <div className="px-5 py-5 flex flex-col gap-1">
              {/* Section links — use button + programmatic scroll */}
              {navLinks.map(link => (
                <button
                  key={link.name}
                  onClick={() => handleSectionNav(link.id)}
                  className="w-full text-left py-3.5 px-4 rounded-xl text-base font-bold uppercase tracking-widest text-gray-300 hover:text-white hover:bg-white/5 active:bg-white/10 transition-all"
                >
                  {link.name}
                </button>
              ))}

              <div className="h-px bg-white/8 my-2" />

              <Link
                to="/my-appointments"
                onClick={() => setIsOpen(false)}
                className="py-3.5 px-4 rounded-xl border border-white/10 text-base font-bold uppercase tracking-widest text-gray-300 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center gap-2"
              >
                <ClipboardList size={15} /> My Bookings
              </Link>

              <Link
                to="/booking"
                onClick={() => setIsOpen(false)}
                className="mt-1 py-4 rounded-xl bg-gold text-black font-black text-base uppercase tracking-widest text-center flex items-center justify-center gap-2 shadow-[0_4px_20px_-4px_rgba(212,175,55,0.5)] active:opacity-80 transition-all"
              >
                <Calendar size={16} /> Book Appointment
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
