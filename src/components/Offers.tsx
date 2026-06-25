import { motion } from 'motion/react';
import { Ticket, ArrowRight, CalendarCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

// ─── Data ─────────────────────────────────────────────────────────────────────

const GRAND_PRIZE = {
  img:   'https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=1200&q=85&auto=format&fit=crop',
  label: 'Bangkok / Pattaya Trip',
  sub:   '3 Nights · 4 Days · All Expenses Paid',
  badge: 'Grand Prize · 1 Lucky Winner',
};

const PRIZES = [
  { img: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=600&q=80&auto=format&fit=crop', label: 'Gold Coin 2gm',    sub: '24K Pure Gold',        top: true  },
  { img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600&q=80&auto=format&fit=crop', label: 'Silver Coin 10gm', sub: '3 Winners',            top: false },
  { img: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&q=80&auto=format&fit=crop', label: 'Smartphone',       sub: 'Premium Tech',         top: false },
  { img: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600&q=80&auto=format&fit=crop', label: 'Smart TV 32"',     sub: 'Crystal Display',      top: false },
  { img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80&auto=format&fit=crop',    label: 'Washing Machine',  sub: 'Home Comfort',         top: false },
  { img: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600&q=80&auto=format&fit=crop',    label: 'Smartwatch',       sub: 'Premium Wearable',     top: false },
  { img: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=600&q=80&auto=format&fit=crop', label: 'Salon Voucher',    sub: '₹5,000 · 50% OFF',    top: false },
  { img: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&q=80&auto=format&fit=crop', label: 'Cash Prize',       sub: '₹10,000 · 5 Winners', top: false },
  { img: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=600&q=80&auto=format&fit=crop',    label: 'BT Speaker',       sub: 'Hi-Fi Sound',          top: false },
  { img: 'https://images.unsplash.com/photo-1541643600914-78b084683702?w=600&q=80&auto=format&fit=crop', label: 'Luxury Perfume',   sub: 'Designer Gift Set',    top: false },
  { img: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=80&auto=format&fit=crop',    label: 'Air Fryer',        sub: 'Healthy Cooking',      top: false },
];

const TIERS = [
  { spend: '₹999+',   entries: '1 Entry',   shade: 'border-white/10 bg-white/[0.03]'     },
  { spend: '₹1,999+', entries: '2 Entries', shade: 'border-amber-500/25 bg-amber-900/10' },
  { spend: '₹2,999+', entries: '3 Entries', shade: 'border-gold/35 bg-gold/8'            },
];

const STEPS = [
  { n: '01', title: 'Book Any Service',     desc: 'Any booking above ₹999 qualifies for an entry' },
  { n: '02', title: 'Entry Confirmed',      desc: 'You are automatically entered into the draw'   },
  { n: '03', title: 'Win Amazing Prizes',   desc: 'Monthly draw · winners announced on Instagram' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Offers() {
  return (
    <section
      id="offers"
      className="relative overflow-hidden py-12 sm:py-20"
      style={{ background: '#05040a' }}
    >
      {/* ── Deep layered background glow ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[radial-gradient(ellipse,rgba(212,175,55,0.1)_0%,transparent_65%)]" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[400px] bg-[radial-gradient(ellipse,rgba(212,175,55,0.05)_0%,transparent_65%)]" />
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-[radial-gradient(ellipse,rgba(255,180,0,0.04)_0%,transparent_65%)]" />
        {/* Subtle grid texture */}
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 48px,rgba(212,175,55,1) 48px,rgba(212,175,55,1) 49px),repeating-linear-gradient(90deg,transparent,transparent 48px,rgba(212,175,55,1) 48px,rgba(212,175,55,1) 49px)' }}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-8">

        {/* ── Header ── */}
        <div className="text-center mb-10 sm:mb-14">
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gold/30 bg-gold/8 text-gold text-xs font-black uppercase tracking-[0.3em] mb-5"
          >
            <Ticket size={11} />
            <span>Seasonal Lucky Draw</span>
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            {/* Trophy decoration */}
            <div className="text-5xl sm:text-6xl mb-3 leading-none">🏆</div>
            <h2
              className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tight leading-none mb-3"
              style={{ color: '#D4AF37', textShadow: '0 0 60px rgba(212,175,55,0.35), 0 0 120px rgba(212,175,55,0.15)' }}
            >
              Win Big
            </h2>
            <h3 className="text-xl sm:text-3xl font-serif text-white/80 font-light mb-4">
              The Royal Lucky Draw
            </h3>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-gray-400 text-sm sm:text-base max-w-md mx-auto leading-relaxed"
          >
            Every booking above ₹999 earns you a draw entry. The more you spend, the more chances you get.
          </motion.p>
        </div>

        {/* ── Grand Prize Hero Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-3xl overflow-hidden mb-5 group"
          style={{ border: '1.5px solid rgba(212,175,55,0.45)', boxShadow: '0 0 60px -10px rgba(212,175,55,0.3), inset 0 0 40px -20px rgba(212,175,55,0.1)' }}
        >
          {/* Photo */}
          <div className="relative h-56 sm:h-80">
            <img
              src={GRAND_PRIZE.img}
              alt={GRAND_PRIZE.label}
              className="w-full h-full object-cover transition-transform duration-[1.5s] group-hover:scale-105"
              onError={e => { const t = e.target as HTMLImageElement; t.src = 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1200&q=80&auto=format&fit=crop'; }}
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/20" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

            {/* Animated shimmer on the border */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
              style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(212,175,55,0.08) 50%, transparent 60%)' }}
            />

            {/* Content */}
            <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
              {/* Grand prize badge */}
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-black"
                  style={{ background: 'linear-gradient(90deg, #D4AF37, #F0D060)' }}>
                  ✈️ {GRAND_PRIZE.badge}
                </span>
              </div>
              <h3 className="text-2xl sm:text-4xl font-black text-white leading-tight mb-1.5">
                {GRAND_PRIZE.label}
              </h3>
              <p className="text-gold/80 text-sm sm:text-base font-medium mb-4">{GRAND_PRIZE.sub}</p>
              <Link
                to="/booking"
                className="inline-flex items-center gap-2 self-start px-5 py-2.5 rounded-xl text-black font-black text-xs uppercase tracking-wider transition-all hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(90deg, #D4AF37, #F0D060)', boxShadow: '0 6px 24px -6px rgba(212,175,55,0.6)' }}
              >
                Book Now to Enter <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </motion.div>

        {/* ── Prize Grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-10 sm:mb-14">
          {PRIZES.map((prize, i) => (
            <motion.div
              key={prize.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="relative rounded-2xl overflow-hidden group cursor-default"
              style={{ border: prize.top ? '1px solid rgba(212,175,55,0.4)' : '1px solid rgba(255,255,255,0.07)' }}
            >
              {/* Photo */}
              <div className="relative h-28 sm:h-36">
                <img
                  src={prize.img}
                  alt={prize.label}
                  loading="lazy"
                  className="w-full h-full object-cover opacity-70 transition-all duration-700 group-hover:opacity-85 group-hover:scale-105"
                  onError={e => { (e.target as any).style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                {/* Top prize badge */}
                {prize.top && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-wider text-black"
                    style={{ background: 'linear-gradient(90deg,#D4AF37,#F0D060)' }}>
                    🥇 Top Prize
                  </span>
                )}

                {/* Labels */}
                <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3">
                  <p className="text-white font-bold text-[11px] sm:text-xs leading-tight">{prize.label}</p>
                  <p className="text-gold/70 text-[11px] sm:text-xs font-medium mt-0.5">{prize.sub}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Divider ── */}
        <div className="flex items-center gap-4 mb-10 sm:mb-12">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
          <span className="text-gold/40 text-xs font-black uppercase tracking-widest">How to Enter</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
        </div>

        {/* ── How to Enter ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-10 sm:mb-14">
          {STEPS.map(({ n, title, desc }, i) => (
            <motion.div
              key={n}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="flex sm:flex-col items-start sm:items-center sm:text-center gap-4 sm:gap-3 p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/6"
            >
              {/* Step number */}
              <div
                className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center font-black text-base sm:text-lg"
                style={{ background: 'linear-gradient(135deg,rgba(212,175,55,0.2),rgba(212,175,55,0.05))', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37' }}
              >
                {n}
              </div>
              <div>
                <p className="text-white font-bold text-sm mb-1">{title}</p>
                <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Spend Tiers ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-stretch gap-3"
        >
          {TIERS.map(({ spend, entries, shade }) => (
            <div
              key={spend}
              className={`flex-1 flex items-center justify-between sm:flex-col sm:items-center sm:justify-center gap-1 px-5 py-4 sm:py-5 rounded-2xl border ${shade}`}
            >
              <div className="flex items-baseline gap-1">
                <span className="text-white font-black text-2xl sm:text-3xl font-serif leading-none">{spend}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarCheck size={11} className="text-gold" />
                <span className="text-xs font-black uppercase tracking-widest text-gold">{entries}</span>
              </div>
            </div>
          ))}
        </motion.div>

        {/* ── Footer note ── */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-gray-700 text-xs uppercase tracking-widest font-bold mt-8"
        >
          Draw announced monthly · Winners on{' '}
          <a
            href="https://www.instagram.com/hairtech111/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold hover:underline"
          >
            @hairtech111
          </a>
        </motion.p>

      </div>
    </section>
  );
}
