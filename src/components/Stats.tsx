import { motion, useInView } from 'motion/react';
import { useEffect, useState, useRef } from 'react';
import { Users, Scissors, Award, ShieldCheck } from 'lucide-react';

const stats = [
  { icon: Users,       value: 500,  suffix: '+',  label: 'Happy Customers'      },
  { icon: Scissors,    value: 25,   suffix: '+',  label: 'Expert Stylists'       },
  { icon: Award,       value: 100,  suffix: '%',  label: 'Premium Products'      },
  { icon: ShieldCheck, value: 100,  suffix: '%',  label: 'Hygiene Standards'     },
];

function Counter({ value, suffix }: { value: number; suffix: string }) {
  const [count, setCount] = useState(0);
  const ref  = useRef(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -40px 0px' });

  useEffect(() => {
    if (!inView) return;
    let frame: number;
    const start = performance.now();
    const duration = 1800;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(ease * value));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value]);

  return (
    <span ref={ref} className="text-4xl sm:text-5xl font-serif font-bold text-gold">
      {count}{suffix}
    </span>
  );
}

export default function Stats() {
  return (
    <section className="py-10 sm:py-20 bg-zinc-950/60 border-y border-white/5">
      <div className="max-w-5xl mx-auto px-5 sm:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {stats.map(({ icon: Icon, value, suffix, label }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-gold/8 border border-gold/15 flex items-center justify-center text-gold mx-auto mb-4">
                <Icon size={20} />
              </div>
              <Counter value={value} suffix={suffix} />
              <p className="text-gray-500 text-xs uppercase tracking-[0.2em] font-bold mt-1.5">{label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}