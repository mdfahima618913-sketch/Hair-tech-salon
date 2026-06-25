import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Award, Star } from "lucide-react";

export default function FounderStory({ imageSrc = "/images/founder.jpeg" }: { imageSrc?: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || !("IntersectionObserver" in window)) { setInView(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); io.disconnect(); } },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="py-14 sm:py-20 bg-black relative overflow-hidden">
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-gold/3 rounded-full blur-[180px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-5 sm:px-8 relative z-10">

        {/* Header */}
        <div className="text-center mb-10 sm:mb-14">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-gold mb-4"
          >
            <span className="w-6 h-px bg-gold" /> The Story <span className="w-6 h-px bg-gold" />
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.08 }}
            className="text-3xl sm:text-5xl font-serif font-bold text-white"
          >
            Meet the <span className="text-gold italic">Founder</span>
          </motion.h2>
        </div>

        {/* Card */}
        <div
          ref={cardRef}
          className="grid lg:grid-cols-2 gap-0 rounded-2xl sm:rounded-3xl overflow-hidden border border-gold/20 bg-zinc-950 shadow-[0_8px_60px_-12px_rgba(212,175,55,0.12)]"
        >
          {/* Portrait */}
          <div className="relative bg-zinc-900 min-h-[360px] lg:min-h-0 overflow-hidden group">
            <img
              src={imageSrc}
              alt="Faizul Islam, Founder of Hair Tech"
              className="w-full h-full object-cover object-top transition-transform duration-[1.2s] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.03]"
            />
            {/* Gold corner brackets */}
            <span className="absolute top-5 left-5 w-8 h-8 border-t-2 border-l-2 border-gold/50 pointer-events-none" />
            <span className="absolute bottom-5 right-5 w-8 h-8 border-b-2 border-r-2 border-gold/50 pointer-events-none" />

            {/* Tag */}
            <span className="absolute left-5 bottom-5 z-10 text-xs font-black uppercase tracking-[0.25em] text-gold bg-black/60 backdrop-blur-sm px-3 py-1.5 border border-gold/30 rounded-sm">
              Founder · Hair Tech
            </span>
          </div>

          {/* Content */}
          <div className="p-6 sm:p-10 flex flex-col justify-center">

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 }}
              className="text-xs font-black uppercase tracking-[0.3em] text-gold flex items-center gap-2 mb-5"
            >
              <Star size={11} className="text-gold fill-gold" /> The Hair Tech Story
              <span className="flex-1 h-px bg-gradient-to-r from-gold/40 to-transparent" />
            </motion.p>

            <motion.blockquote
              initial={{ opacity: 0, y: 14 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 }}
              className="relative font-serif text-xl sm:text-2xl text-white/90 leading-snug mb-6 pl-8"
            >
              <span className="absolute left-0 top-[-6px] text-5xl text-gold/30 font-serif leading-none select-none">"</span>
              Hair Tech sirf ek salon nahi hai — yeh ek <em className="text-gold italic">sapne</em>, ek{" "}
              <em className="text-gold italic">junoon</em>, aur saalon ki lagataar mehnat ki kahani hai.
            </motion.blockquote>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.3 }}
              className="space-y-4 text-gray-400 text-sm leading-relaxed mb-6"
            >
              <p>
                Jab maine is safar ki shuruaat ki thi, tab mere paas sirf ek vision
                tha — apne shehar mein aisi professional salon services lana jo bade
                shehron ke standards ko bhi takkar de sakein. Har challenge ne mujhe
                mazboot banaya, har mushkil ne kuch naya sikhaya, aur har client ne
                mujhe behtar banne ki prerna di.
              </p>
              <p>
                Professional excellence ki talaash mein mujhe industry ke kuch
                behtareen experts se seekhne ka mauka mila. Mujhe <strong className="text-white font-semibold">Jawed Habib</strong> se
                certification prapt hua — meri journey ka ek gauravshali milestone.
                Saath hi, <strong className="text-white font-semibold">Naseem Salmani</strong> ke saath kaam karne ke anubhav aur unke
                creative approach ne meri professional understanding ko aur gehrai di.
              </p>
            </motion.div>

            {/* Credentials */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.4 }}
              className="flex flex-wrap gap-2.5 mb-8"
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gold/30 bg-gold/5 text-gold text-xs font-bold hover:bg-gold/10 transition-colors">
                <Award size={13} /> Jawed Habib Certified
              </span>
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gold/30 bg-gold/5 text-gold text-xs font-bold hover:bg-gold/10 transition-colors">
                <Award size={13} /> Trained under Naseem Salmani
              </span>
            </motion.div>

            {/* Signature */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.5 }}
              className="pt-6 border-t border-white/8"
            >
              <div className="flex gap-10 flex-wrap">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.25em] text-gold mb-1">Founder</p>
                  <p className="font-serif text-white text-lg">Faizul Islam</p>
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.25em] text-gold mb-1">Co-Founder</p>
                  <p className="font-serif text-white text-lg">Naziya Islam</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
