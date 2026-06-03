import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Minus, HelpCircle } from 'lucide-react';

interface FAQItemProps {
  key?: string | number;
  question: string;
  answer: string;
  isOpen: boolean;
  onClick: () => void;
}

function FAQItem({ question, answer, isOpen, onClick }: FAQItemProps) {
  return (
    <div className={`transition-all duration-500 border-b border-white/5 last:border-0 ${isOpen ? 'bg-white/[0.02] -mx-4 px-4 rounded-2xl' : ''}`}>
      <button
        onClick={onClick}
        className="w-full py-6 flex items-center justify-between text-left group transition-all"
        id={`faq-btn-${question.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <span className={`text-lg sm:text-xl font-medium transition-all duration-500 ${isOpen ? 'text-gold pl-2' : 'text-zinc-300 group-hover:text-white'}`}>
          {question}
        </span>
        <motion.div 
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 ${isOpen ? 'bg-gold text-zinc-950 shadow-lg shadow-gold/20' : 'bg-white/5 text-zinc-500 group-hover:bg-white/10 group-hover:text-zinc-300'}`}
        >
          {isOpen ? <Minus size={18} /> : <Plus size={18} />}
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <motion.p 
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="text-zinc-400 pb-8 pl-2 leading-relaxed font-medium md:text-lg max-w-2xl"
            >
              {answer}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const faqData = [
  {
    question: "How do I book an appointment?",
    answer: "You can book easily through our website by selecting your desired services and clicking 'Book Now'. We also accept bookings via WhatsApp or phone call at +91 87896 03343."
  },
  {
    question: "Is online payment mandatory for booking?",
    answer: "Yes, for online reservations, we require full payment via Razorpay to confirm your slot instantly. This ensures you get priority service and zero waiting time at the salon."
  },
  {
    question: "Can I cancel or reschedule my appointment?",
    answer: "Yes, you can reschedule your appointment up to 4 hours before the scheduled time by contacting us on WhatsApp. Cancellations are subject to our refund policy."
  },
  {
    question: "Do you offer bridal makeup packages?",
    answer: "Absolutely! We specialize in luxury bridal and pre-bridal packages. Please contact us directly for a personalized consultation and competitive pricing."
  },
  {
    question: "Is the salon safe and hygienic?",
    answer: "Hygiene is our top priority. We use sterilized tools, disposable sheets where applicable, and follow strict sanitization protocols after every client treatment."
  },
  {
    question: "Do you provide home salon services?",
    answer: "Currently, we offer all premium services exclusively at our salon in Araria to ensure you get the full luxury experience with our advanced equipment."
  }
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-12 sm:py-20 bg-black relative">
      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-2 mb-4"
            >
              <HelpCircle className="text-gold" size={20} />
              <span className="text-gold font-bold uppercase tracking-[0.3em] text-xs">Got Questions?</span>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl sm:text-5xl font-serif text-white"
            >
              Frequently Asked <span className="italic text-gold">Questions</span>
            </motion.h2>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-zinc-900/30 backdrop-blur-sm border border-white/5 rounded-2xl sm:rounded-[2rem] p-5 sm:p-12"
          >
            {faqData.map((item, index) => (
              <motion.div
                key={`faq-container-${index}`}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <FAQItem
                  question={item.question}
                  answer={item.answer}
                  isOpen={openIndex === index}
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                />
              </motion.div>
            ))}
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            className="mt-12 text-center"
          >
            <p className="text-gray-500 text-sm">
              Still have questions? <a href="#contact" className="text-gold hover:underline">Contact our concierge</a>
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
