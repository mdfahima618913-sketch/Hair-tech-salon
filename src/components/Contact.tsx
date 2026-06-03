import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MapPin, Clock, Instagram, Youtube, Facebook, Phone } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function Contact() {
  const [address, setAddress] = useState('Haji Seraj Market, Bhagat Singh Rd, near Bus Stand, Araria, Bihar 854311');

  useEffect(() => {
    getDoc(doc(db, 'website_config', 'main')).then(snap => {
      if (snap.exists() && snap.data().contactAddress) setAddress(snap.data().contactAddress);
    }).catch(() => {});
  }, []);

  const socials = [
    { icon: Instagram, label: 'Instagram', href: 'https://www.instagram.com/hairtech111/'                          },
    { icon: Facebook,  label: 'Facebook',  href: 'https://www.facebook.com/share/14hj1AS2YUJ/'                     },
    { icon: Youtube,   label: 'YouTube',   href: 'https://youtube.com/@hairtechsalon?si=b2we6WbB03Pl4RH0'         },
  ];

  return (
    <section id="contact" className="py-12 sm:py-20 bg-black">
      <div className="max-w-4xl mx-auto px-5 sm:px-8">

        {/* Header */}
        <div className="text-center mb-14">
          <motion.span initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-gold mb-4">
            <span className="w-5 h-px bg-gold" /> Get In Touch
          </motion.span>
          <motion.h2 initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl font-serif font-bold text-white">
            Visit Our <span className="text-gold italic">Studio</span>
          </motion.h2>
        </div>

        {/* Info cards */}
        <div className="grid sm:grid-cols-3 gap-5 mb-12">
          {[
            {
              icon: MapPin,
              title: 'Location',
              content: address,
              sub: null,
            },
            {
              icon: Clock,
              title: 'Hours',
              content: 'Mon – Sun',
              sub: '10:00 AM – 8:30 PM',
            },
            {
              icon: Phone,
              title: 'Call / WhatsApp',
              content: '+91 87896 03343',
              sub: 'Quick response guaranteed',
            },
          ].map(({ icon: Icon, title, content, sub }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="flex flex-col items-center text-center p-6 rounded-2xl bg-white/[0.02] border border-white/8 hover:border-gold/20 transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-gold/8 border border-gold/15 flex items-center justify-center text-gold mb-4 group-hover:bg-gold/15 transition-all">
                <Icon size={20} />
              </div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600 font-bold mb-2">{title}</p>
              <p className="text-white text-sm font-medium leading-relaxed">{content}</p>
              {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
              {title === 'Hours' && (
                <span className="mt-3 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-wider">
                  Open Now
                </span>
              )}
            </motion.div>
          ))}
        </div>

        {/* Social links */}
        <div className="flex items-center justify-center gap-5">
          {socials.map(({ icon: Icon, label, href }) => (
            <motion.a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ y: -3, scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/8 flex items-center justify-center text-gray-500 hover:text-gold hover:border-gold/30 transition-all duration-300"
              aria-label={label}
            >
              <Icon size={20} />
            </motion.a>
          ))}
        </div>

      </div>
    </section>
  );
}