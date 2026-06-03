import { useState, useEffect, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Star, Plus, X, Loader2, Send, Quote } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, where } from 'firebase/firestore';

interface Review {
  id?: string;
  name: string;
  text: string;
  rating: number;
  status: 'pending' | 'approved' | 'flagged';
  createdAt: any;
}

const staticReviews: Omit<Review, 'status' | 'createdAt'>[] = [
  { name: 'Rahul Kumar',   text: 'Best salon in Araria! Very professional staff and super hygienic. Highly recommended.', rating: 5 },
  { name: 'Priya Singh',   text: 'Got my bridal makeup done here and it was absolutely flawless. Everyone loved it!',     rating: 5 },
  { name: 'Amit Sharma',   text: 'The hair spa is very relaxing. Most premium salon experience in the city, hands down.',  rating: 5 },
  { name: 'Sneha Gupta',   text: 'They really listen to what you want and deliver even better results every time.',        rating: 4 },
  { name: 'Vikram Raj',    text: 'Beard grooming here is top-notch. Love the attention to detail. 5 stars!',              rating: 5 },
];

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={size} className={i <= rating ? 'text-gold fill-gold' : 'text-gray-700'} />
      ))}
    </div>
  );
}

export default function Reviews() {
  const [reviews,       setReviews]       = useState<Review[]>([]);
  const [showForm,      setShowForm]      = useState(false);
  const [form,          setForm]          = useState({ name: '', text: '', rating: 5 });
  const [submitting,    setSubmitting]    = useState(false);
  const [formError,     setFormError]     = useState('');
  const [submitted,     setSubmitted]     = useState(false);

  useEffect(() => {
    getDocs(query(collection(db, 'reviews'), where('status', '==', 'approved'), orderBy('createdAt', 'desc')))
      .then(snap => setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as Review))))
      .catch(() => {});
  }, []);

  const all = [...reviews, ...staticReviews];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.text.trim()) { setFormError('Please fill in all fields.'); return; }
    setFormError(''); setSubmitting(true);
    try {
      await addDoc(collection(db, 'reviews'), { ...form, status: 'pending', createdAt: serverTimestamp() });
      setSubmitted(true);
      setTimeout(() => { setShowForm(false); setSubmitted(false); setForm({ name: '', text: '', rating: 5 }); }, 2000);
    } catch { setFormError('Failed to submit. Please try again.'); }
    finally { setSubmitting(false); }
  };

  return (
    <section id="reviews" className="py-12 sm:py-20 bg-zinc-950 overflow-hidden">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 mb-12">
        <div className="flex items-end justify-between gap-6">
          <div>
            <motion.span initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-gold mb-3">
              <span className="w-5 h-px bg-gold" /> Client Testimonials
            </motion.span>
            <motion.h2 initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-4xl sm:text-5xl font-serif font-bold text-white">
              What They <span className="text-gold italic">Say</span>
            </motion.h2>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/12 text-gray-400 hover:text-white hover:border-gold/30 transition-all text-xs font-bold uppercase tracking-wider shrink-0"
          >
            <Plus size={14} /> Write Review
          </motion.button>
        </div>
      </div>

      {/* Infinite carousel */}
      <div className="flex overflow-hidden">
        <motion.div
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: all.length * 5, repeat: Infinity, ease: 'linear' }}
          className="flex gap-5 w-max"
        >
          {[...all, ...all].map((r, i) => (
            <div key={i} className="w-[270px] sm:w-80 shrink-0 bg-zinc-900/60 border border-white/6 rounded-2xl p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <StarRow rating={r.rating} />
                <Quote size={24} className="text-gold/15" />
              </div>
              <p className="text-gray-300 text-sm leading-relaxed mb-5 line-clamp-4">"{r.text}"</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gold/15 border border-gold/20 flex items-center justify-center text-gold font-black text-sm shrink-0">
                  {r.name[0]}
                </div>
                <span className="text-white font-bold text-sm">{r.name}</span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Review form modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-3xl p-8 shadow-2xl"
            >
              <button onClick={() => setShowForm(false)}
                className="absolute top-5 right-5 p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors">
                <X size={18} />
              </button>

              {submitted ? (
                <div className="text-center py-8">
                  <div className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Send size={24} className="text-white" />
                  </div>
                  <p className="text-white font-bold text-lg">Review submitted!</p>
                  <p className="text-gray-500 text-sm mt-1">It'll appear after approval.</p>
                </div>
              ) : (
                <>
                  <h3 className="text-xl font-black text-white uppercase tracking-tight mb-6">Write a Review</h3>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    {formError && <p className="text-red-400 text-xs p-3 bg-red-500/10 rounded-xl border border-red-500/20">{formError}</p>}
                    
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-gold block mb-2">Rating</label>
                      <div className="flex gap-2">
                        {[1,2,3,4,5].map(s => (
                          <button key={s} type="button" onClick={() => setForm(f => ({ ...f, rating: s }))}>
                            <Star size={28} className={s <= form.rating ? 'text-gold fill-gold' : 'text-gray-700'} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-gold block mb-2">Name</label>
                      <input type="text" placeholder="Your name" value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all placeholder:text-gray-700" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-gold block mb-2">Your Experience</label>
                      <textarea rows={4} placeholder="Tell us about your visit…" value={form.text}
                        onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-gold/50 transition-all resize-none placeholder:text-gray-700" />
                    </div>
                    <button type="submit" disabled={submitting}
                      className="w-full py-4 bg-gold text-black font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 hover:bg-gold/90 transition-all disabled:opacity-50">
                      {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      {submitting ? 'Submitting…' : 'Submit Review'}
                    </button>
                  </form>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}