import { motion } from 'motion/react';
import { ShieldCheck, Star, Users, Award, Zap } from 'lucide-react';

const pillars = [
  { icon: ShieldCheck, title: 'Sterilized Tools',      desc: 'Medical-grade hygiene protocols after every client' },
  { icon: Award,       title: 'Premium Products',      desc: 'Global luxury brands — no compromises'             },
  { icon: Users,       title: 'Expert Stylists',       desc: 'Trained professionals with years of experience'     },
  { icon: Zap,         title: 'Precision Artistry',    desc: 'Every cut tailored to your unique style'            },
];

export default function About() {
  return (
    <section id="about" className="py-14 sm:py-20 bg-black relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gold/3 rounded-full blur-[160px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-5 sm:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">

          {/* Image */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="rounded-3xl overflow-hidden border border-white/8 shadow-2xl aspect-square">
              <img
                src="https://lh3.googleusercontent.com/d/1EAePBkWfWeEdHBw-ZgclxF-Hbo2zWABP=w1000"
                alt="Hair Tech Salon"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>

            {/* Rating card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="absolute -bottom-4 right-2 sm:-bottom-6 sm:-right-8 bg-zinc-900 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl"
            >
              <div className="flex items-center gap-2 mb-1">
                <Star size={18} className="text-gold fill-gold" />
                <span className="text-2xl font-black text-white">4.9</span>
              </div>
              <p className="text-[9px] uppercase tracking-[0.25em] text-gray-500 font-bold">500+ Reviews</p>
            </motion.div>
          </motion.div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-gold mb-4">
              <span className="w-6 h-px bg-gold" /> Our Legacy
            </span>

            <h2 className="text-4xl sm:text-5xl font-serif font-bold text-white leading-[1.1] mb-6">
              Crafting <span className="text-gold italic">Masterpieces</span><br />Since Inception
            </h2>

            <p className="text-gray-400 text-base leading-relaxed mb-10 max-w-lg">
              Hair Tech Unisex Salon is Araria's premier grooming destination — where artistry meets precision. 
              Every client receives bespoke treatment designed for their unique identity.
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {pillars.map(({ icon: Icon, title, desc }, i) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/6 hover:border-gold/20 hover:bg-white/[0.05] transition-all duration-300"
                >
                  <div className="w-8 h-8 rounded-xl bg-gold/10 flex items-center justify-center text-gold shrink-0 mt-0.5">
                    <Icon size={16} />
                  </div>
                  <div>
                    <p className="text-white font-bold text-xs uppercase tracking-wider mb-0.5">{title}</p>
                    <p className="text-gray-500 text-[11px] leading-relaxed">{desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}