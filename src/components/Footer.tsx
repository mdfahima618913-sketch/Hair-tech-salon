import { motion } from 'motion/react';
import { Heart, Youtube, Facebook } from 'lucide-react';
import Logo from './Logo';

export default function Footer() {
  return (
    <footer className="py-12 border-t border-white/10 bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <Logo />

          <div className="flex gap-8 text-xs uppercase tracking-widest font-medium text-gray-500">
            <a href="#" className="hover:text-gold transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-gold transition-colors">Terms of Service</a>
          </div>

          <div className="flex items-center gap-6">
            <a 
              href="https://youtube.com/@hairtechsalon?si=b2we6WbB03Pl4RH0" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-gray-500 hover:text-gold transition-colors"
              aria-label="YouTube"
            >
              <Youtube size={20} />
            </a>
            <a 
              href="https://www.facebook.com/share/14hj1AS2YUJ/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-gray-500 hover:text-gold transition-colors"
              aria-label="Facebook"
            >
              <Facebook size={20} />
            </a>
          </div>

          <div className="flex flex-col items-center gap-4">
            <p className="text-gray-500 text-sm flex items-center gap-1 font-light">
              © 2026 Hair Tech Unisex Salon. Made with <Heart size={14} className="text-red-500 fill-red-500" /> in Araria.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

<p className="text-gray-500 text-sm flex items-center gap-1 font-light flex-wrap justify-center">
  © 2026 Hair Tech Unisex Salon. Made with{" "}
  <Heart size={14} className="text-red-500 fill-red-500" />{" "}
  in Araria • Designed & developed by{" "}
  <a
    href="https://github.com/YOUR_GITHUB_USERNAME"
    target="_blank"
    rel="noopener noreferrer"
    className="text-gold hover:underline"
  >
    Faheem
  </a>
</p>