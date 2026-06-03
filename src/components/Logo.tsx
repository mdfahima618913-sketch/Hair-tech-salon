import { motion } from 'motion/react';

export default function Logo() {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-2 group cursor-pointer"
    >
      <div className="flex flex-col leading-none">
        <span className="text-xl font-serif font-black tracking-tight flex items-center">
          HAIR<span className="text-gold ml-1">TECH</span>
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] font-bold text-gray-500 mt-0.5">
          Unisex Salon
        </span>
      </div>
    </motion.div>
  );
}
