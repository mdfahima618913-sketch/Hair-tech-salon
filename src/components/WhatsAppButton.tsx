import { motion } from 'motion/react';
import { MessageCircle } from 'lucide-react';

export default function WhatsAppButton() {
  const phoneNumber = "918789603343";
  const message = "Hi Hair Tech! I'd like to inquire about your services.";
  const whatsappUrl = `https://wa.me/${phoneNumber.replace('+', '')}?text=${encodeURIComponent(message)}`;

  return (
    <motion.a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.1, y: -5 }}
      whileTap={{ scale: 0.9 }}
      transition={{ 
        type: "spring", 
        stiffness: 260, 
        damping: 20,
        delay: 2 
      }}
      className="fixed bottom-8 right-8 z-50 flex items-center gap-3 group"
    >
      <div className="hidden md:block overflow-hidden max-w-0 group-hover:max-w-xs transition-all duration-500 ease-in-out">
        <div className="bg-zinc-900/90 backdrop-blur-xl border border-gold/30 px-5 py-2 rounded-2xl whitespace-nowrap shadow-2xl">
          <span className="text-gold text-[10px] font-black uppercase tracking-[0.2em]">
            Chat with Experts
          </span>
        </div>
      </div>
      
      <div className="relative">
        <div className="absolute inset-0 bg-gold blur-xl opacity-20 animate-pulse" />
        <div className="w-16 h-16 rounded-[2rem] bg-gold flex items-center justify-center text-black shadow-[0_15px_40px_-5px_rgba(212,175,55,0.4)] border border-white/20 relative z-10">
          <MessageCircle size={28} className="fill-current" />
        </div>
        
        {/* Notification Dot */}
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full border-2 border-black flex items-center justify-center z-20">
          <div className="w-1.5 h-1.5 bg-gold rounded-full animate-ping" />
        </div>
      </div>
    </motion.a>
  );
}
