import { useEffect } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Landing Page Components
import Navbar       from './components/Navbar';
import PromoSlider  from './components/PromoSlider';
import Hero         from './components/Hero';
import About     from './components/About';
import Offers    from './components/Offers';
import Services  from './components/Services';
import Stats     from './components/Stats';
import Reviews  from './components/Reviews';
import Gallery  from './components/Gallery';
import FAQ      from './components/FAQ';
import Contact   from './components/Contact';
import Footer    from './components/Footer';

// Full-screen routes
import BookingSystem   from './components/BookingSystem';
import AdminDashboard  from './components/AdminDashboard';

import { seedServicesIfEmpty } from './lib/firebase';

function LandingPage({ scaleX }: { scaleX: any }) {
  return (
    <div className="relative bg-black min-h-screen">
      {/* Scroll progress bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[2px] bg-gold z-[60] origin-left"
        style={{ scaleX }}
      />

      <div className="fixed top-0 left-0 right-0 z-50">
        <Navbar />
        <PromoSlider />
      </div>

      <main>
        <Hero />
        <About />
        <Offers />
        <Services />
        <Stats />
        <Reviews />
        <Gallery />
        <FAQ />
        <Contact />
      </main>

      <Footer />
      {/* <WhatsAppButton /> */}
    </div>
  );
}

export default function App() {
  useEffect(() => { seedServicesIfEmpty(); }, []);

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  return (
    <Router>
      <Routes>
        <Route path="/"        element={<LandingPage scaleX={scaleX} />} />
        {/* Booking opens as a full-screen page — completely isolated from landing */}
        <Route path="/booking" element={<BookingSystem />} />
        <Route path="/admin"   element={<AdminDashboard />} />
        <Route path="*"        element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}