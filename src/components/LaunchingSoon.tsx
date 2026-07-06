import { useEffect, useRef, useState } from "react";
import { Sparkles, Crown, Heart } from "lucide-react";

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap');

.nz-scope, .nz-scope *, .nz-scope *::before, .nz-scope *::after { box-sizing:border-box; margin:0; padding:0; }

.nz-scope {
  --gold:#C9A055; --gold-light:#E2C48D; --gold-bright:#F0D78C;
  --rose:#D4A0A0; --rose-soft:#E8C4C4;
  --bg:#060606; --card:#0C0C0C; --border:rgba(201,160,85,0.22);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  background:var(--bg); color:#fff; -webkit-font-smoothing:antialiased;
  padding:clamp(24px,6vw,80px) clamp(0px,4vw,48px);
  display:flex; justify-content:center;
}

.nz-card {
  width:100%; max-width:1100px;
  display:grid; grid-template-columns:1fr 1fr;
  background:var(--card); border:1px solid var(--border); border-radius:8px;
  overflow:hidden; position:relative;
  box-shadow:0 40px 100px -50px rgba(201,160,85,0.2), 0 0 0 1px rgba(0,0,0,0.4);
}

/* ── Left: Image side ── */
.nz-img-side {
  position:relative; background:#080808; min-height:560px;
  display:flex; align-items:center; justify-content:center; overflow:hidden;
}
.nz-img-side::before {
  content:""; position:absolute; inset:0;
  background:radial-gradient(ellipse at 50% 40%, rgba(201,160,85,0.06) 0%, transparent 70%);
  z-index:1; pointer-events:none;
}

.nz-img-frame {
  position:relative; z-index:2;
  width:clamp(200px,70%,300px); aspect-ratio:1;
}
.nz-img-ring {
  position:absolute; inset:-10px; border-radius:50%;
  border:2px solid transparent;
  border-top-color:var(--gold); border-bottom-color:var(--gold-light);
  animation:nz-spin 6s linear infinite;
}
.nz-img-ring2 {
  position:absolute; inset:-22px; border-radius:50%;
  border:1px solid transparent;
  border-left-color:rgba(201,160,85,0.15); border-right-color:rgba(212,160,160,0.1);
  animation:nz-spin 10s linear infinite reverse;
}
.nz-img-ring3 {
  position:absolute; inset:-34px; border-radius:50%;
  border:1px dashed rgba(201,160,85,0.08);
  animation:nz-spin 20s linear infinite;
}
@keyframes nz-spin { to { transform:rotate(360deg); } }

.nz-img-circle {
  width:100%; height:100%; border-radius:50%; overflow:hidden;
  border:3px solid var(--border); position:relative; z-index:1;
  box-shadow:0 0 60px rgba(201,160,85,0.15), 0 0 20px rgba(201,160,85,0.06) inset;
}
.nz-img-circle img {
  width:100%; height:100%; object-fit:cover; display:block;
  transition:transform 1.2s cubic-bezier(.2,.7,.2,1);
}
.nz-card:hover .nz-img-circle img { transform:scale(1.06); }

/* Corner accents on image side */
.nz-corner {
  position:absolute; width:36px; height:36px; z-index:3; pointer-events:none;
  border:1.5px solid var(--gold); opacity:0.4;
}
.nz-corner.tl { top:24px; left:24px; border-right:0; border-bottom:0; }
.nz-corner.br { bottom:24px; right:24px; border-left:0; border-top:0; }

/* Floating particles */
.nz-particle {
  position:absolute; border-radius:50%; z-index:1; pointer-events:none;
  background:var(--gold); opacity:0;
}
.nz-card.is-in .nz-particle { animation:nz-float 4s ease-in-out infinite; }
.nz-p1 { width:3px; height:3px; top:18%; left:12%; animation-delay:0s !important; }
.nz-p2 { width:2px; height:2px; top:72%; left:20%; animation-delay:1.5s !important; }
.nz-p3 { width:4px; height:4px; top:30%; right:15%; animation-delay:0.8s !important; }
.nz-p4 { width:2px; height:2px; top:80%; right:25%; animation-delay:2.2s !important; }
.nz-p5 { width:3px; height:3px; top:55%; left:8%; animation-delay:3s !important; }
@keyframes nz-float {
  0%,100% { opacity:0; transform:translateY(0) scale(1); }
  30% { opacity:0.6; }
  50% { opacity:0.8; transform:translateY(-20px) scale(1.3); }
  70% { opacity:0.4; }
}

/* ── Right: Text side ── */
.nz-body {
  padding:clamp(32px,5vw,60px); display:flex; flex-direction:column;
  justify-content:center; position:relative;
}
.nz-body::before {
  content:""; position:absolute; top:0; right:0; width:250px; height:250px;
  background:radial-gradient(circle, rgba(201,160,85,0.04) 0%, transparent 70%);
  pointer-events:none;
}

.nz-badge {
  display:inline-flex; align-items:center; gap:8px; align-self:flex-start;
  font-size:0.68rem; font-weight:700; letter-spacing:0.3em; text-transform:uppercase;
  color:var(--gold); background:rgba(201,160,85,0.08);
  border:1px solid var(--border); border-radius:100px;
  padding:8px 20px; margin-bottom:28px;
}

.nz-brand {
  font-family:"Cormorant Garamond",Georgia,serif; font-weight:700;
  font-size:clamp(2.4rem,5vw,3.8rem); letter-spacing:0.12em; text-transform:uppercase;
  background:linear-gradient(135deg, #fff 20%, var(--gold-light) 50%, #fff 80%);
  background-size:200% auto;
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
  background-clip:text;
  animation:nz-text-shine 4s linear infinite;
  margin-bottom:4px; line-height:1.1;
}
@keyframes nz-text-shine { to { background-position:200% center; } }

.nz-sub {
  font-family:"Cormorant Garamond",Georgia,serif; font-weight:400; font-style:italic;
  font-size:clamp(1rem,2vw,1.4rem); color:var(--rose); letter-spacing:0.06em;
  margin-bottom:28px;
}

.nz-divider-wrap { display:flex; align-items:center; gap:12px; margin-bottom:28px; }
.nz-divider-line { flex:1; height:1px; background:linear-gradient(90deg, var(--gold), transparent); }
.nz-divider-line.right { background:linear-gradient(270deg, var(--gold), transparent); }
.nz-divider-icon { color:var(--gold); opacity:0.5; }

.nz-tagline {
  font-family:"Cormorant Garamond",Georgia,serif; font-weight:500;
  font-size:clamp(1.05rem,1.8vw,1.3rem); line-height:1.7;
  color:rgba(255,255,255,0.6); margin-bottom:36px;
}
.nz-tagline em { font-style:italic; color:var(--gold-light); font-weight:600; }

.nz-highlight {
  display:flex; gap:16px; margin-bottom:36px; flex-wrap:wrap;
}
.nz-hi-chip {
  display:inline-flex; align-items:center; gap:6px;
  font-size:0.72rem; font-weight:600; letter-spacing:0.06em;
  color:rgba(255,255,255,0.5); padding:8px 16px;
  border:1px solid rgba(255,255,255,0.08); border-radius:100px;
  background:rgba(255,255,255,0.02);
  transition:border-color .3s, color .3s;
}
.nz-hi-chip:hover { border-color:var(--border); color:var(--gold-light); }
.nz-hi-dot { width:5px; height:5px; border-radius:50%; background:var(--rose); opacity:0.6; }

/* ── Launching Soon banner ── */
.nz-coming-wrap { margin-bottom:32px; }
.nz-coming {
  display:inline-flex; align-items:center; gap:14px;
  font-family:"Cormorant Garamond",Georgia,serif; font-weight:700;
  font-size:clamp(1.3rem,2.8vw,1.8rem); letter-spacing:0.2em; text-transform:uppercase;
  color:var(--gold-bright); padding:16px 40px;
  border:2px solid var(--border); border-radius:6px;
  position:relative; overflow:hidden;
  background:linear-gradient(135deg, rgba(201,160,85,0.1), transparent 50%, rgba(201,160,85,0.05));
  box-shadow:0 0 40px rgba(201,160,85,0.08);
  transition:box-shadow .4s, border-color .4s;
}
.nz-coming:hover { box-shadow:0 0 60px rgba(201,160,85,0.15); border-color:rgba(201,160,85,0.4); }
.nz-coming::before {
  content:""; position:absolute; top:0; left:-120%; width:80%; height:100%;
  background:linear-gradient(90deg, transparent 0%, rgba(201,160,85,0.15) 50%, transparent 100%);
  animation:nz-shimmer 3.5s ease-in-out infinite;
}
@keyframes nz-shimmer { 0%{left:-120%;} 100%{left:220%;} }

.nz-sparkle-1 { animation:nz-pulse 2.5s ease-in-out infinite; }
.nz-sparkle-2 { animation:nz-pulse 2.5s ease-in-out infinite 1.25s; }
@keyframes nz-pulse {
  0%,100% { opacity:0.4; transform:scale(0.8) rotate(0deg); }
  50% { opacity:1; transform:scale(1.2) rotate(15deg); }
}

/* ── Powered by ── */
.nz-powered {
  display:inline-flex; align-items:center; gap:10px; align-self:flex-start;
  padding:10px 24px; border-radius:100px;
  border:1px solid rgba(201,160,85,0.12);
  background:linear-gradient(135deg, rgba(201,160,85,0.04), transparent);
}
.nz-powered-label {
  font-size:0.7rem; font-weight:600; letter-spacing:0.15em; text-transform:uppercase;
  color:rgba(255,255,255,0.3);
}
.nz-powered-sep { width:1px; height:14px; background:rgba(201,160,85,0.2); }
.nz-powered-name {
  font-family:"Cormorant Garamond",Georgia,serif; font-weight:700;
  font-size:0.88rem; letter-spacing:0.1em; text-transform:uppercase;
  background:linear-gradient(135deg, var(--gold), var(--gold-bright));
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
  background-clip:text;
}

/* ── Entry animations ── */
.nz-anim { opacity:0; transform:translateY(22px); }
.nz-card.is-in .nz-anim { opacity:1; transform:none; transition:opacity .9s ease, transform .9s cubic-bezier(.2,.7,.2,1); }
.nz-card.is-in .nz-d1 { transition-delay:.1s; }
.nz-card.is-in .nz-d2 { transition-delay:.22s; }
.nz-card.is-in .nz-d3 { transition-delay:.34s; }
.nz-card.is-in .nz-d4 { transition-delay:.42s; }
.nz-card.is-in .nz-d5 { transition-delay:.50s; }
.nz-card.is-in .nz-d6 { transition-delay:.58s; }
.nz-card.is-in .nz-d7 { transition-delay:.66s; }
.nz-card.is-in .nz-d8 { transition-delay:.74s; }
.nz-card.is-in .nz-d9 { transition-delay:.82s; }

.nz-img-anim { opacity:0; transform:scale(0.9); }
.nz-card.is-in .nz-img-anim { opacity:1; transform:scale(1); transition:opacity 1.2s ease, transform 1.2s cubic-bezier(.2,.7,.2,1); transition-delay:.15s; }

@media (max-width:760px) {
  .nz-scope { padding: 20px 0; }
  .nz-card { grid-template-columns:1fr; border-radius:0; border-left:0; border-right:0; }
  .nz-img-side { min-height:240px; }
  .nz-img-frame { width:clamp(120px,40%,160px) !important; }
  .nz-corner { display:none; }
  .nz-body { text-align:center; align-items:center; padding:24px 20px 32px; }
  .nz-badge { margin-bottom:16px; padding:6px 14px; font-size:0.62rem; }
  .nz-brand { font-size:2rem; margin-bottom:2px; }
  .nz-sub { font-size:0.9rem; margin-bottom:16px; }
  .nz-divider-wrap { margin-bottom:16px; }
  .nz-tagline { font-size:0.88rem; line-height:1.65; margin-bottom:20px; }
  .nz-highlight { gap:8px; margin-bottom:20px; }
  .nz-hi-chip { font-size:0.65rem; padding:6px 12px; }
  .nz-coming-wrap { margin-bottom:20px; }
  .nz-coming { padding:12px 20px; gap:10px; font-size:1rem; letter-spacing:0.12em; }
  .nz-powered { padding:8px 16px; }
  .nz-badge, .nz-powered { align-self:center; }
  .nz-highlight { justify-content:center; }
}

@media (prefers-reduced-motion:reduce) {
  .nz-anim, .nz-img-anim { opacity:1 !important; transform:none !important; }
  .nz-img-ring, .nz-img-ring2, .nz-img-ring3 { animation:none; }
  .nz-coming::before { animation:none; }
  .nz-sparkle-1, .nz-sparkle-2 { animation:none; }
  .nz-card.is-in .nz-particle { animation:none; }
  .nz-brand { animation:none; }
}
`;

export default function LaunchingSoon({ logoSrc = "/images/nazaura-logo.jpeg" }: { logoSrc?: string }) {
  const cardRef = useRef<HTMLElement>(null);
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
    <section className="nz-scope">
      <style>{STYLES}</style>

      <article ref={cardRef} className={`nz-card${inView ? " is-in" : ""}`}>

        {/* ── Left: Image ── */}
        <div className="nz-img-side">
          <span className="nz-corner tl" />
          <span className="nz-corner br" />

          <span className="nz-particle nz-p1" />
          <span className="nz-particle nz-p2" />
          <span className="nz-particle nz-p3" />
          <span className="nz-particle nz-p4" />
          <span className="nz-particle nz-p5" />

          <div className="nz-img-frame nz-img-anim">
            <span className="nz-img-ring" />
            <span className="nz-img-ring2" />
            <span className="nz-img-ring3" />
            <div className="nz-img-circle">
              <img src={logoSrc} alt="Nazaura Makeup Studio" />
            </div>
          </div>
        </div>

        {/* ── Right: Text ── */}
        <div className="nz-body">

          <span className="nz-badge nz-anim nz-d1">
            <Sparkles size={13} /> A New Chapter
          </span>

          <h2 className="nz-brand nz-anim nz-d2">Nazaura</h2>
          <p className="nz-sub nz-anim nz-d3">Makeup Studio</p>

          <div className="nz-divider-wrap nz-anim nz-d4">
            <span className="nz-divider-line" />
            <Crown size={14} className="nz-divider-icon" />
            <span className="nz-divider-line right" />
          </div>

          <p className="nz-tagline nz-anim nz-d5">
            Where Every Bride Becomes a <em>Masterpiece</em>.
            A premium bridal makeup studio crafted to make your
            special day truly <em>unforgettable</em>.
          </p>

          <div className="nz-highlight nz-anim nz-d6">
            <span className="nz-hi-chip"><span className="nz-hi-dot" /> Bridal Makeup</span>
            <span className="nz-hi-chip"><span className="nz-hi-dot" /> Party Looks</span>
            <span className="nz-hi-chip"><span className="nz-hi-dot" /> HD Makeover</span>
          </div>

          <div className="nz-coming-wrap nz-anim nz-d7">
            <span className="nz-coming">
              <Sparkles size={18} className="nz-sparkle-1" />
              Launching Soon
              <Sparkles size={18} className="nz-sparkle-2" />
            </span>
          </div>

          <span className="nz-powered nz-anim nz-d8">
            <Heart size={12} style={{ color: 'var(--rose)', opacity: 0.6 }} />
            <span className="nz-powered-label">Powered by</span>
            <span className="nz-powered-sep" />
            <span className="nz-powered-name">Hair Tech Salon</span>
          </span>
        </div>
      </article>
    </section>
  );
}
