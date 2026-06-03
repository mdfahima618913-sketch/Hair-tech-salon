import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, Calendar, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion as m } from 'motion/react';
const MotionLink = m(Link);
import Logo from './Logo';
import AppointmentLookup from './AppointmentLookup';

const navLinks = [
  { name: 'About',    href: '/#about'    },
  { name: 'Services', href: '/#services' },
  { name: 'Offers',   href: '/#offers'   },
  { name: 'Reviews',  href: '/#reviews'  },
  { name: 'FAQ',      href: '/#faq'      },
  { name: 'Contact',  href: '/#contact'  },
];

export default function Navbar() {
  const [isOpen,      setIsOpen]      = useState(false);
  const [scrolled,    setScrolled]    = useState(false);
  const [lookupOpen,  setLookupOpen]  = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <nav className={`transition-all duration-500 ${
        scrolled
          ? 'bg-black/90 backdrop-blur-2xl border-b border-white/8 py-3'
          : 'bg-transparent py-5'
      }`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between">
            <Logo />

            {/* Desktop */}
            <div className="hidden md:flex items-center gap-6">
              {navLinks.map((link, i) => (
                <motion.a
                  key={link.name}
                  href={link.href}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400 hover:text-white transition-colors duration-200"
                >
                  {link.name}
                </motion.a>
              ))}

              {/* My Booking */}
              <motion.button
                onClick={() => setLookupOpen(true)}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400 hover:text-white transition-colors duration-200"
              >
                <Search size={12} /> My Booking
              </motion.button>

              {/* Book Now — primary CTA */}
              <MotionLink
                to="/booking"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                transition={{ delay: 0.52 }}
                className="relative flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold text-black font-black text-[11px] uppercase tracking-[0.15em] shadow-[0_4px_20px_-4px_rgba(212,175,55,0.6)] hover:shadow-[0_8px_28px_-4px_rgba(212,175,55,0.75)] transition-all duration-300"
              >
                <span className="absolute inset-0 rounded-xl bg-gold/40 animate-ping opacity-0 group-hover:opacity-100 pointer-events-none" />
                <Calendar size={13} /> Book Now
              </MotionLink>

              <a
                href="/admin"
                className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-700 hover:text-gray-400 transition-colors duration-200"
              >
                Admin
              </a>
            </div>

            {/* Mobile: My Booking icon + hamburger */}
            <div className="md:hidden flex items-center gap-2">
              <button
                onClick={() => setLookupOpen(true)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
                aria-label="Track booking"
              >
                <Search size={20} />
              </button>
              <button
                onClick={() => setIsOpen(v => !v)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-black/95 backdrop-blur-2xl border-t border-white/8 overflow-hidden"
            >
              <div className="px-5 py-6 flex flex-col gap-1">
                {navLinks.map(link => (
                  <a
                    key={link.name}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className="py-3 px-4 rounded-xl text-sm font-bold uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                  >
                    {link.name}
                  </a>
                ))}

                <button
                  onClick={() => { setIsOpen(false); setLookupOpen(true); }}
                  className="mt-2 py-3 px-4 rounded-xl border border-white/10 text-sm font-bold uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                >
                  <Search size={14} /> Track My Booking
                </button>

                <Link
                  to="/booking"
                  onClick={() => setIsOpen(false)}
                  className="mt-2 py-4 rounded-xl bg-gold text-black font-black text-sm uppercase tracking-widest text-center flex items-center justify-center gap-2 shadow-[0_4px_20px_-4px_rgba(212,175,55,0.5)]"
                >
                  <Calendar size={15} /> Book Appointment
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <AppointmentLookup isOpen={lookupOpen} onClose={() => setLookupOpen(false)} />
    </>
  );
}
