import { useEffect, useRef, useState } from "react";

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');

.ht-scope, .ht-scope *, .ht-scope *::before, .ht-scope *::after { box-sizing: border-box; margin: 0; padding: 0; }

.ht-scope {
  --ink:#2A211B; --ink-soft:#6E6055; --paper:#F4EDE3; --card:#FBF7F0;
  --brass:#B0822F; --brass-bright:#CDA257; --hair:rgba(42,33,27,0.12);
  font-family:"Hanken Grotesk",-apple-system,BlinkMacSystemFont,sans-serif;
  background:var(--paper); color:var(--ink); -webkit-font-smoothing:antialiased;
  line-height:1.6; padding:clamp(20px,5vw,72px) clamp(16px,4vw,48px);
  display:flex; justify-content:center;
}
.ht-card {
  width:100%; max-width:1080px; background:var(--card);
  border:1px solid var(--hair); border-radius:4px;
  box-shadow:0 1px 0 rgba(255,255,255,0.6) inset, 0 30px 70px -40px rgba(42,33,27,0.45);
  overflow:hidden; display:grid; grid-template-columns:0.86fr 1.14fr;
}
.ht-portrait { position:relative; background:linear-gradient(160deg,#EDE3D6,#E3D6C5); min-height:100%; }
.ht-portrait img {
  width:100%; height:100%; object-fit:cover; object-position:center 18%; display:block;
  transition:transform 1.1s cubic-bezier(.2,.7,.2,1);
}
.ht-card:hover .ht-portrait img { transform:scale(1.025); }
.ht-bracket { position:absolute; width:30px; height:30px; border:1.5px solid var(--brass); z-index:2; pointer-events:none; }
.ht-bracket.tl { top:20px; left:20px; border-right:0; border-bottom:0; }
.ht-bracket.br { bottom:20px; right:20px; border-left:0; border-top:0; }
.ht-tag {
  position:absolute; left:20px; bottom:20px; z-index:2; font-size:0.66rem;
  letter-spacing:0.26em; text-transform:uppercase; color:#FBF7F0;
  background:rgba(42,33,27,0.62); backdrop-filter:blur(3px);
  padding:7px 13px; border:1px solid rgba(205,162,87,0.5);
}
.ht-body { padding:clamp(28px,4vw,56px); display:flex; flex-direction:column; }
.ht-eyebrow {
  font-size:0.72rem; font-weight:600; letter-spacing:0.26em; text-transform:uppercase;
  color:var(--brass); display:flex; align-items:center; gap:12px;
}
.ht-eyebrow::after { content:""; flex:1; height:1px; background:linear-gradient(90deg,var(--brass),transparent); opacity:0.55; }
.ht-quote {
  position:relative; margin:22px 0 26px; font-family:"Fraunces",Georgia,serif;
  font-optical-sizing:auto; font-weight:500; font-size:clamp(1.32rem,2.3vw,1.72rem);
  line-height:1.34; color:var(--ink); letter-spacing:-0.01em; padding-left:34px;
}
.ht-quote::before {
  content:"\\201C"; position:absolute; left:-8px; top:-18px; font-family:"Fraunces",Georgia,serif;
  font-size:4.6rem; line-height:1; color:var(--brass-bright); opacity:0.55;
}
.ht-quote em { font-style:italic; color:var(--brass); }
.ht-text p { font-size:1.025rem; line-height:1.78; color:var(--ink-soft); margin-bottom:16px; }
.ht-text p:last-child { margin-bottom:0; }
.ht-text strong { color:var(--ink); font-weight:600; }
.ht-creds { margin-top:26px; display:flex; flex-wrap:wrap; gap:10px; }
.ht-chip {
  display:inline-flex; align-items:center; gap:8px; font-size:0.78rem; font-weight:600;
  letter-spacing:0.02em; color:var(--ink); background:var(--card); border:1px solid var(--brass);
  border-radius:100px; padding:8px 15px 8px 13px; transition:background .3s ease,color .3s ease;
}
.ht-chip:hover { background:var(--brass); color:#FBF7F0; }
.ht-chip:hover .ht-dot { background:#FBF7F0; }
.ht-dot { width:6px; height:6px; border-radius:50%; background:var(--brass); transition:background .3s ease; }
.ht-foot { margin-top:auto; padding-top:26px; }
.ht-rule { height:1px; background:var(--hair); margin-bottom:22px; }
.ht-sign { display:flex; gap:40px; flex-wrap:wrap; }
.ht-person .ht-role {
  font-size:0.66rem; font-weight:700; letter-spacing:0.2em; text-transform:uppercase;
  color:var(--brass); margin-bottom:3px;
}
.ht-person .ht-name { font-family:"Fraunces",Georgia,serif; font-weight:500; font-size:1.18rem; color:var(--ink); letter-spacing:-0.01em; }
.ht-anim { opacity:0; transform:translateY(14px); }
.ht-card.is-in .ht-anim { opacity:1; transform:none; transition:opacity .7s ease, transform .7s cubic-bezier(.2,.7,.2,1); }
.ht-card.is-in .ht-d1 { transition-delay:.05s; }
.ht-card.is-in .ht-d2 { transition-delay:.13s; }
.ht-card.is-in .ht-d3 { transition-delay:.21s; }
.ht-card.is-in .ht-d4 { transition-delay:.29s; }
.ht-card.is-in .ht-d5 { transition-delay:.37s; }
@media (max-width:760px) {
  .ht-card { grid-template-columns:1fr; }
  .ht-portrait { aspect-ratio:4/5; min-height:0; }
  .ht-quote { padding-left:26px; }
}
@media (prefers-reduced-motion:reduce) {
  .ht-anim { opacity:1 !important; transform:none !important; }
  .ht-portrait img, .ht-card:hover .ht-portrait img { transition:none; transform:none; }
}
.ht-scope :focus-visible { outline:2px solid var(--brass); outline-offset:3px; }
`;

export default function FounderStory({ imageSrc = "/images/founder.jpeg" }: { imageSrc?: string }) {
  const cardRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || !("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="ht-scope">
      <style>{STYLES}</style>

      <article ref={cardRef} className={`ht-card${inView ? " is-in" : ""}`}>
        <div className="ht-portrait">
          <span className="ht-bracket tl" />
          <span className="ht-bracket br" />
          <img src={imageSrc} alt="Faizul Islam, Founder of Hair Tech" />
          <span className="ht-tag">Founder · Hair Tech</span>
        </div>

        <div className="ht-body">
          <p className="ht-eyebrow ht-anim ht-d1">The Hair Tech Story</p>

          <blockquote className="ht-quote ht-anim ht-d2">
            Hair Tech sirf ek salon nahi hai — yeh ek <em>sapne</em>, ek{" "}
            <em>junoon</em>, aur saalon ki lagataar mehnat ki kahani hai.
          </blockquote>

          <div className="ht-text ht-anim ht-d3">
            <p>
              Jab maine is safar ki shuruaat ki thi, tab mere paas sirf ek vision
              tha — apne shehar mein aisi professional salon services lana jo bade
              shehron ke standards ko bhi takkar de sakein. Har challenge ne mujhe
              mazboot banaya, har mushkil ne kuch naya sikhaya, aur har client ne
              mujhe behtar banne ki prerna di.
            </p>
            <p>
              Professional excellence ki talaash mein mujhe industry ke kuch
              behtareen experts se seekhne ka mauka mila. Mujhe <strong>Jawed Habib</strong> se
              certification prapt hua — meri journey ka ek gauravshali milestone.
              Saath hi, <strong>Naseem Salmani</strong> ke saath kaam karne ke anubhav aur unke
              creative approach ne meri professional understanding ko aur gehrai di.
            </p>
          </div>

          <div className="ht-creds ht-anim ht-d4">
            <span className="ht-chip"><span className="ht-dot" />Jawed Habib Certified</span>
            <span className="ht-chip"><span className="ht-dot" />Trained under Naseem Salmani</span>
          </div>

          <footer className="ht-foot ht-anim ht-d5">
            <div className="ht-rule" />
            <div className="ht-sign">
              <div className="ht-person">
                <div className="ht-role">Founder</div>
                <div className="ht-name">Faizul Islam</div>
              </div>
              <div className="ht-person">
                <div className="ht-role">Co-Founder</div>
                <div className="ht-name">Naziya Islam</div>
              </div>
            </div>
          </footer>
        </div>
      </article>
    </div>
  );
}
