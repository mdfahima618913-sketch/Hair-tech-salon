import { useEffect } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Landing Page Components
import Navbar       from './components/Navbar';
import PromoSlider  from './components/PromoSlider';
import Hero         from './components/Hero';
import FounderStory  from './components/FounderStory';
import LaunchingSoon from './components/LaunchingSoon';
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
import MyAppointments  from './components/MyAppointments';

import { seedServicesIfEmpty } from './lib/firebase';
import { LanguageProvider } from './lib/LanguageContext';

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

      <main className="pb-32 sm:pb-0">
        <Hero />
        <FounderStory />
        <LaunchingSoon />
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
    <LanguageProvider>
    <Router>
      <Routes>
        <Route path="/"        element={<LandingPage scaleX={scaleX} />} />
        <Route path="/booking"         element={<BookingSystem />} />
        <Route path="/my-appointments" element={<MyAppointments />} />
        <Route path="/admin"           element={<AdminDashboard />} />
        <Route path="*"                element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
    </LanguageProvider>
  );
}