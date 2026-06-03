const PRIZES = [
  { img: 'https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=300&q=80&auto=format&fit=crop', label: 'Bangkok Trip',     sub: '3N · 4D',             highlight: true  },
  { img: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=300&q=80&auto=format&fit=crop', label: 'Gold Coin 2gm',   sub: '24K Pure Gold',       highlight: true  },
  { img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=300&q=80&auto=format&fit=crop', label: 'Silver Coin',     sub: '10gm · 3 Winners',    highlight: false },
  { img: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=300&q=80&auto=format&fit=crop', label: 'Smartphone',      sub: 'Premium Tech',        highlight: false },
  { img: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=300&q=80&auto=format&fit=crop', label: 'Smart TV 32"',    sub: 'Crystal Display',     highlight: false },
  { img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&q=80&auto=format&fit=crop',    label: 'Washing Machine', sub: 'Home Comfort',        highlight: false },
  { img: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=300&q=80&auto=format&fit=crop', label: 'Salon Voucher',   sub: '₹5,000 · 50% OFF',   highlight: false },
  { img: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=300&q=80&auto=format&fit=crop',    label: 'Smartwatch',      sub: 'Premium Wearable',    highlight: false },
  { img: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=300&q=80&auto=format&fit=crop',    label: 'BT Speaker',      sub: 'Hi-Fi Sound',         highlight: false },
  { img: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=300&q=80&auto=format&fit=crop', label: 'Cash Prize',      sub: '₹10,000 · 5 Winners', highlight: false },
  { img: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=300&q=80&auto=format&fit=crop',    label: 'Air Fryer',       sub: 'Healthy Cooking',     highlight: false },
  { img: 'https://images.unsplash.com/photo-1541643600914-78b084683702?w=300&q=80&auto=format&fit=crop', label: 'Luxury Perfume',  sub: 'Designer Gift Set',   highlight: false },
];

const doubled = [...PRIZES, ...PRIZES];

export default function PromoSlider() {
  return (
    <div
      className="relative overflow-hidden select-none"
      style={{
        background: 'linear-gradient(180deg,#120f00 0%,#1c1500 100%)',
        borderBottom: '1px solid rgba(212,175,55,0.22)',
      }}
    >
      <style>{`
        @keyframes promo-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .promo-track {
          display: flex;
          align-items: center;
          gap: 8px;
          animation: promo-scroll 48s linear infinite;
          will-change: transform;
          padding: 0 8px;
        }
        .promo-track:hover { animation-play-state: paused; }

        /* ── Card sizes — mobile first (large!) ── */
        .promo-card {
          flex-shrink: 0;
          width: 108px;
          height: 76px;
          border-radius: 10px;
          overflow: hidden;
          position: relative;
          border: 1px solid rgba(255,255,255,0.09);
        }
        .promo-card.hi { border-color: rgba(212,175,55,0.55); }

        /* ── Mobile: persistent top "Bumper Prize" bar ── */
        .promo-top-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 7px 16px;
          background: linear-gradient(90deg,rgba(212,175,55,0.12),rgba(212,175,55,0.06));
          border-bottom: 1px solid rgba(212,175,55,0.15);
        }
        .promo-card-row {
          overflow: hidden;
          position: relative;
          height: 92px;
          display: flex;
          align-items: center;
        }

        /* ── Desktop (sm+): left badge layout ── */
        .promo-badge { display: none; }
        .promo-fade-right { width: 32px; }

        @media (min-width: 640px) {
          /* Desktop: hide top bar, show side badge, single row */
          .promo-top-bar { display: none; }
          .promo-badge { display: flex; }
          .promo-card-row {
            height: 96px;
            padding-left: 172px;
          }
          .promo-card { width: 120px; height: 80px; border-radius: 12px; }
          .promo-fade-right { width: 44px; }
        }
      `}</style>

      {/* ── Mobile: persistent "Bumper Prize" header row ── */}
      <div className="promo-top-bar sm:hidden">
        <span style={{ fontSize: '18px', lineHeight: 1 }}>🏆</span>
        <div>
          <p style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#D4AF37', lineHeight: 1 }}>
            Bumper Prize Draw
          </p>
          <p style={{ fontSize: '9px', color: 'rgba(212,175,55,0.5)', fontWeight: 700, letterSpacing: '0.08em', marginTop: '2px' }}>
            Book ₹999+ to enter · Win big this season
          </p>
        </div>
      </div>

      {/* ── Desktop: fixed left badge ── */}
      <div
        className="promo-badge absolute left-0 top-0 bottom-0 z-20 flex-col justify-center"
        style={{ paddingLeft: '16px', paddingRight: '56px', background: 'linear-gradient(90deg,#1c1500 58%,transparent)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '22px', lineHeight: 1 }}>🏆</span>
          <span style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.17em', color: '#D4AF37', lineHeight: 1 }}>
            Bumper Prize
          </span>
        </div>
        <span style={{ fontSize: '8.5px', fontWeight: 700, color: 'rgba(212,175,55,0.42)', textTransform: 'uppercase', letterSpacing: '0.1em', paddingLeft: '30px', marginTop: '4px' }}>
          Book ₹999+ to enter
        </span>
      </div>

      {/* ── Right edge fade ── */}
      <div
        className="promo-fade-right absolute right-0 top-0 bottom-0 z-20 pointer-events-none"
        style={{ background: 'linear-gradient(270deg,#120f00,transparent)' }}
      />

      {/* ── Scrolling prize cards ── */}
      <div className="promo-card-row">
        <div className="promo-track">
          {doubled.map((p, i) => (
            <div key={i} className={`promo-card ${p.highlight ? 'hi' : ''}`}>
              {/* Photo */}
              <img
                src={p.img} alt={p.label} loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.78 }}
              />
              {/* Overlay */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.08) 55%,transparent 100%)' }} />
              {/* Top Prize badge */}
              {p.highlight && (
                <div style={{ position: 'absolute', top: '4px', left: '4px', background: 'linear-gradient(90deg,#D4AF37,#F0D060)', borderRadius: '4px', padding: '2px 5px', fontSize: '7px', fontWeight: 900, letterSpacing: '0.05em', color: '#000', textTransform: 'uppercase', lineHeight: 1.4 }}>
                  Top Prize
                </div>
              )}
              {/* Label */}
              <div style={{ position: 'absolute', bottom: '4px', left: '5px', right: '4px' }}>
                <p style={{ fontSize: '9.5px', fontWeight: 800, color: '#fff', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</p>
                <p style={{ fontSize: '7.5px', fontWeight: 700, color: 'rgba(212,175,55,0.85)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
