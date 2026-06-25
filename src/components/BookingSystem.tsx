/**
 * BookingSystem.tsx
 * Zomato-style salon booking — full-screen, self-contained.
 *
 * Screen flow (Zomato pattern):
 *   BROWSE  → category sidebar + service cards with images + sticky cart footer
 *   SLOTS   → date picker + time grid (bottom sheet style)
 *   DETAILS → name + phone (minimal, one screen)
 *   REVIEW  → order summary like Zomato "Place Order" page
 *   SUCCESS → confirmation
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, X, Plus, Minus, ChevronLeft, Clock, Calendar,
  User, Phone, CheckCircle2, Loader2, AlertCircle, Lock,
  CreditCard, Star, Users, CalendarX, Sun, CloudSun, Moon,
  Mic, MicOff, Wand2, RotateCcw, Sparkles, ShoppingBag,
  ArrowRight, Scissors, Tag, Coffee, Zap,
} from 'lucide-react';
import { format, addDays, isSameDay, startOfDay } from 'date-fns';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, getDoc, doc, updateDoc, increment, orderBy } from 'firebase/firestore';
import { type SalonConfig, DEFAULT_SALON_CONFIG, fetchSalonConfig } from '../lib/salonConfig';
import { servicesData, Service } from '../constants/services';
import { Link } from 'react-router-dom';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Screen = 'browse' | 'slots' | 'details' | 'pendingFound' | 'review' | 'success';

interface CartItem   { service: Service; qty: number; }
interface ClientInfo { name: string; phone: string; }

interface PendingExisting {
  id: string;
  customerName?: string;
  serviceNames?: string;
  serviceItems?: { id: string; name: string; qty: number; priceValue: number }[];
  bookingTime?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  totalAmount?: number;
}

interface ExistingBooking { startTime: string; endTime: string; }

interface SlotOption {
  label: string; startISO: string; endISO: string;
  available: number; session: 'morning' | 'afternoon' | 'evening';
}

interface VoiceIntent {
  intent: 'book_appointment' | 'unknown';
  requestedDate: string | null; requestedTime: string | null;
  services: string[]; language: string;
  confidence: number; rawTranscript: string; clarification?: string;
}

// ─── Razorpay ──────────────────────────────────────────────────────────────────

declare global { interface Window { Razorpay: new (o: any) => any; } }

// ─── Constants ─────────────────────────────────────────────────────────────────

const RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY_ID as string;
// Slot/capacity defaults — live values fetched from Firestore settings/salon

// Category display order — Combos first (highest demand), then by popularity
const CATEGORY_ORDER = [
  'Combos', 'Hair Cut', 'Beard & Shave', 'Hair Styling', 'Hair Wash',
  'Hair Colouring', 'Hair Spa', 'Hair Treatment', 'Basic Beauty',
  'Cleanup', 'Detan', 'Nail Services', 'Mani & Pedi',
  'Massages', 'Makeup', 'Scalp & Skin', 'Add-ons',
];
const _allCats = Array.from(new Set(servicesData.map(s => s.category)));
const CATEGORIES = [
  ...CATEGORY_ORDER.filter(c => _allCats.includes(c)),
  ..._allCats.filter(c => !CATEGORY_ORDER.includes(c)),
];

// ─── Image Maps ────────────────────────────────────────────────────────────────

const CAT_IMG: Record<string, string> = {
  'Hair Cut':       'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=600&q=85&auto=format&fit=crop',
  'Hair Styling':   'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=85&auto=format&fit=crop',
  'Hair Wash':      'https://images.unsplash.com/photo-1559894244-2ccea83bc218?w=600&q=85&auto=format&fit=crop',
  'Hair Colouring': 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=600&q=85&auto=format&fit=crop',
  'Hair Treatment': 'https://images.unsplash.com/photo-1626957341926-98752fc2ba62?w=600&q=85&auto=format&fit=crop',
  'Basic Beauty':   'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=85&auto=format&fit=crop',
  'Cleanup':        'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600&q=85&auto=format&fit=crop',
  'Detan':          'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&q=85&auto=format&fit=crop',
  'Add-ons':        'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=600&q=85&auto=format&fit=crop',
  'Nail Services':  'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600&q=85&auto=format&fit=crop',
  'Mani & Pedi':    'https://images.unsplash.com/photo-1519419451778-14599a49ec41?w=600&q=85&auto=format&fit=crop',
  'Beard & Shave':  'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=600&q=85&auto=format&fit=crop',
  'Massages':       'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&q=85&auto=format&fit=crop',
  'Makeup':         'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&q=85&auto=format&fit=crop',
  'Scalp & Skin':   'https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=600&q=85&auto=format&fit=crop',
  'Combos':         'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=600&q=85&auto=format&fit=crop',
};

const CAT_EMOJI: Record<string, string> = {
  'Add-ons':'✨','Basic Beauty':'🌸','Cleanup':'🧖','Detan':'☀️',
  'Hair Cut':'✂️','Hair Styling':'💇','Hair Wash':'🚿','Hair Colouring':'🎨',
  'Hair Treatment':'💊','Beard & Shave':'🪒','Nail Services':'💅',
  'Mani & Pedi':'🤲','Massages':'💆','Makeup':'💄','Scalp & Skin':'🧴','Combos':'🎁',
};

// Per-service image overrides keyed by name pattern
const SVC_IMG: Array<[RegExp, string]> = [
  [/male.*haircut|haircut.*male|^male: haircut$/i,   'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=600&q=85&auto=format&fit=crop'],
  [/wolf cut/i,                                       'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=600&q=85&auto=format&fit=crop'],
  [/layer cut|u cut|female.*haircut/i,                'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=85&auto=format&fit=crop'],
  [/beard|shave/i,                                    'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=600&q=85&auto=format&fit=crop'],
  [/wedding.*makeup|bridal.*makeup/i,                 'https://images.unsplash.com/photo-1519741497674-611481863552?w=600&q=85&auto=format&fit=crop'],
  [/engagement.*makeup/i,                             'https://images.unsplash.com/photo-1515374779-4fb19bb49f48?w=600&q=85&auto=format&fit=crop'],
  [/party makeup/i,                                   'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&q=85&auto=format&fit=crop'],
  [/gold facial/i,                                    'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600&q=85&auto=format&fit=crop'],
  [/hydra facial|hydra cleanup/i,                     'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=85&auto=format&fit=crop'],
  [/facial/i,                                         'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=85&auto=format&fit=crop'],
  [/nail art/i,                                       'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600&q=85&auto=format&fit=crop'],
  [/nail ext/i,                                       'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600&q=85&auto=format&fit=crop'],
  [/gel polish|gel overlay/i,                         'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600&q=85&auto=format&fit=crop'],
  [/manicure/i,                                       'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600&q=85&auto=format&fit=crop'],
  [/pedicure/i,                                       'https://images.unsplash.com/photo-1519419451778-14599a49ec41?w=600&q=85&auto=format&fit=crop'],
  [/body massage/i,                                   'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&q=85&auto=format&fit=crop'],
  [/head massage|champi/i,                            'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&q=85&auto=format&fit=crop'],
  [/full body wax|half back wax/i,                    'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&q=85&auto=format&fit=crop'],
  [/face wax|upper lips|eyebrow|threading/i,          'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=600&q=85&auto=format&fit=crop'],
  [/underarms/i,                                      'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&q=85&auto=format&fit=crop'],
  [/face scrub|face massage/i,                        'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600&q=85&auto=format&fit=crop'],
  [/highlight|balayage|ombre/i,                       'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600&q=85&auto=format&fit=crop'],
  [/colour|color/i,                                   'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=600&q=85&auto=format&fit=crop'],
  [/keratin|smoothen|rebond/i,                        'https://images.unsplash.com/photo-1626957341926-98752fc2ba62?w=600&q=85&auto=format&fit=crop'],
  [/hair spa|spa treatment/i,                         'https://images.unsplash.com/photo-1626957341926-98752fc2ba62?w=600&q=85&auto=format&fit=crop'],
  [/blow.?dry/i,                                      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=85&auto=format&fit=crop'],
  [/styling/i,                                        'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=85&auto=format&fit=crop'],
  [/hair wash/i,                                      'https://images.unsplash.com/photo-1559894244-2ccea83bc218?w=600&q=85&auto=format&fit=crop'],
  [/shampoo/i,                                        'https://images.unsplash.com/photo-1559894244-2ccea83bc218?w=600&q=85&auto=format&fit=crop'],
  [/detan|de-tan/i,                                   'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&q=85&auto=format&fit=crop'],
  [/cleanup|clean.?up/i,                              'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600&q=85&auto=format&fit=crop'],
  [/scalp/i,                                          'https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=600&q=85&auto=format&fit=crop'],
  [/combo/i,                                          'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=600&q=85&auto=format&fit=crop'],
  [/anti.?aging/i,                                    'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=85&auto=format&fit=crop'],
  [/brightening|fruit facial|organic facial/i,        'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600&q=85&auto=format&fit=crop'],
  [/o3 facial|o3 cleanup/i,                           'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=85&auto=format&fit=crop'],
  [/pearl facial/i,                                   'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=85&auto=format&fit=crop'],
];

function getImg(svc: Service): string {
  for (const [re, img] of SVC_IMG) if (re.test(svc.name)) return img;
  return CAT_IMG[svc.category]
    ?? 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=600&q=85&auto=format&fit=crop';
}

const isPremium = (s: Service) => /premium/i.test(s.id) || /premium/i.test(s.name);

// ─── Image with icon fallback ───────────────────────────────────────────────

function ImgWithFallback({ src, alt, className, emoji, loading: l }: {
  src: string; alt: string; className: string;
  emoji?: string; loading?: 'lazy' | 'eager';
}) {
  const [failed, setFailed] = React.useState(false);
  if (failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50`}>
        <span className="text-2xl leading-none select-none">{emoji ?? '💈'}</span>
      </div>
    );
  }
  return (
    <img
      src={src} alt={alt} className={className} loading={l}
      onError={() => setFailed(true)}
    />
  );
}

// ─── Service descriptions ──────────────────────────────────────────────────────
// Shown as a 1–2 line subtitle on each card. Covers every category + name pattern.
const SVC_DESC: Array<[RegExp, string]> = [
  // Haircut
  [/male: haircut$/i,          'Classic precision cut, wash & style included'],
  [/male: long hair/i,         'Tailored cut for longer hair with texture & shape'],
  [/wolf cut/i,                'Trendy layered wolf cut with face-framing texture'],
  [/male: senior/i,            'Expert cut by our senior stylist'],
  [/female.*haircut.*basic/i,  'Clean cut with basic styling finish'],
  [/female.*haircut.*advance/i,'Precision cut with blow-dry and styling'],
  [/female.*haircut.*premium/i,'Luxury cut, treatment & professional styling'],
  [/layer cut/i,               'Flowing layers for volume and movement'],
  [/u cut/i,                   'Neat U-shaped cut for a fresh clean look'],
  // Beard
  [/beard set/i,               'Shape, trim & clean up for a sharp look'],
  [/shave/i,                   'Classic clean shave with warm towel finish'],
  // Colour
  [/male.*colour.*basic/i,     'Root touch-up or global colour with basic dye'],
  [/male.*colour.*advance/i,   'Full colour with semi-permanent advanced tones'],
  [/male.*colour.*premium/i,   'Premium ammonia-free colour with deep conditioning'],
  [/male.*colour.*ultra/i,     'Ultra colour with toning, gloss & Olaplex treatment'],
  [/female.*colour.*tier 1/i,  'Salon-quality global colour for all hair lengths'],
  [/highlight/i,               'Hand-painted highlights for a sun-kissed effect'],
  [/balayage|ombre/i,          'Seamless colour melt from roots to tips'],
  // Hair Styling
  [/styling.*wash/i,           'Wash, blow-dry and styling for a polished look'],
  [/blow dry/i,                'Professional blow-dry for smooth, voluminous hair'],
  [/styling.*basic/i,          'Blow-dry and basic tong/flat iron styling'],
  [/styling.*premium/i,        'Blow-dry, heat styling with premium serum finish'],
  [/wash.*blow dry/i,          'Deep cleanse followed by professional blow-dry'],
  // Hair Wash
  [/male: hair wash/i,         'Refreshing shampoo with scalp massage'],
  [/female: hair wash/i,       'Nourishing wash with conditioner & scalp care'],
  [/regular shampoo.*basic/i,  'Basic cleanse with everyday shampoo'],
  [/regular shampoo.*premium/i,'Salon-grade shampoo with conditioning treatment'],
  [/spl shampoo.*basic/i,      'Special shampoo + blow-dry for smooth finish'],
  [/spl shampoo.*premium/i,    'Premium shampoo, mask treatment & blow-dry'],
  // Treatment
  [/keratin/i,                 'Formaldehyde-free keratin for frizz-free smooth hair'],
  [/smoothen|rebond/i,         'Deep smoothening for pin-straight silky hair'],
  [/spa/i,                     'Deep conditioning spa to restore shine & strength'],
  [/dandruff/i,                'Anti-dandruff treatment with medicated serum'],
  [/hair fall/i,               'Strengthening treatment to reduce breakage & fall'],
  [/heavy moisturising/i,      'Intense moisture therapy for dry, damaged hair'],
  // Facial
  [/anti.?aging/i,             'Firming facial to reduce fine lines & restore glow'],
  [/basic mini facial/i,       'Quick refreshing facial for instant brightness'],
  [/brightening/i,             'Vitamin C-powered facial for radiant, even skin'],
  [/fruit facial/i,            'Enzyme-rich fruit extracts for deep nourishment'],
  [/gold facial/i,             '24K gold infused facial for luxury skin glow'],
  [/green tea/i,               'Antioxidant-rich green tea facial for clear skin'],
  [/herbal.*basic/i,           'Gentle herbal facial for sensitive skin'],
  [/herbal.*premium/i,         'Premium herbal facial with intensive mask & serum'],
  [/organic/i,                 'Chemical-free organic facial for pure, healthy skin'],
  [/pearl/i,                   'Pearl extracts for brightening & skin softening'],
  [/o3.*basic/i,               'O3+ ozone facial for deep cleansing & glow'],
  [/o3.*advance/i,             'Advanced O3+ facial with brightening serum'],
  [/o3.*premium/i,             'Complete O3+ facial with anti-aging concentrate'],
  [/standard facial/i,         'All-round facial for clean, refreshed skin'],
  // Cleanup
  [/cleanup.*basic/i,          'Express cleanse, scrub & moisturiser'],
  [/cleanup.*standard/i,       'Cleanse, steam, scrub & soothing mask'],
  [/cleanup.*advance/i,        'Deep cleanse with extraction & vitamin mask'],
  [/cleanup.*premium/i,        'Premium cleanup with serum & hydrating mask'],
  [/cleanup.*ultra/i,          'Ultra luxury cleanup with multiple treatment steps'],
  [/cleanup.*luxury/i,         'Full luxury cleanup with premium imported products'],
  [/hydra cleanup/i,           'Hyaluronic acid infusion cleanup for deep hydration'],
  [/hydra facial/i,            'Medical-grade HydraFacial with vacuum exfoliation'],
  [/o3 cleanup.*basic/i,       'O3+ ozone cleanup for clear, clean skin'],
  [/o3 cleanup.*premium/i,     'Premium O3+ cleanup with brightening concentrate'],
  [/pure organic cleanup/i,    'Certified organic cleanup — chemical free'],
  // Detan
  [/face detan.*basic/i,       'Gentle tan removal for instant brightness'],
  [/face detan.*standard/i,    'Deep tan removal with brightening mask'],
  [/face detan.*advance/i,     'Advanced detan with serum & SPF finish'],
  [/face detan.*premium/i,     'Premium detan with vitamin infusion'],
  [/face detan.*ultra/i,       'Ultra detan — multiple-step tan reversal'],
  [/full body detan/i,         'Complete body tan removal from head to toe'],
  [/full hands detan/i,        'Arms and hands brightening treatment'],
  [/full back detan/i,         'Deep back tan removal & brightening'],
  [/full legs detan/i,         'Complete leg detan for even skin tone'],
  // Wax
  [/half back wax.*rica/i,     'Rica wax for gentle back waxing'],
  [/half back wax.*honey/i,    'Honey wax for smooth back hair removal'],
  [/half back wax.*spray/i,    'Spray wax for precise, clean application'],
  [/face wax.*honey/i,         'Honey wax for gentle facial hair removal'],
  [/face wax.*rica/i,          'Rica wax for sensitive face skin'],
  [/full body wax.*honey/i,    'Head-to-toe honey wax for silky smooth skin'],
  [/full body wax.*rica/i,     'Head-to-toe rica wax — ideal for sensitive skin'],
  [/full leg wax.*honey/i,     'Smooth leg wax with moisturising honey formula'],
  [/full leg wax.*rica/i,      'Rica leg wax — less painful, longer-lasting'],
  [/underarms wax/i,           'Quick, clean underarm wax'],
  [/upper lips/i,              'Precision upper lip hair removal'],
  [/eyebrow threading/i,       'Expert threading for perfectly shaped brows'],
  [/chin threading/i,          'Clean chin hair removal by threading'],
  [/face scrub.*basic/i,       'Gentle exfoliation to remove dead skin cells'],
  [/face scrub.*advance/i,     'Deep scrub with brightening micro-exfoliants'],
  [/face scrub.*premium/i,     'Premium scrub with vitamin E & collagen'],
  [/face massage.*basic/i,     'Relaxing face massage for blood circulation'],
  [/face massage.*advance/i,   'De-stress facial massage with essential oils'],
  [/face massage.*premium/i,   'Premium massage with anti-aging face serum'],
  // Nail
  [/nail art/i,                'Creative nail art designs by our nail artist'],
  [/nail ext/i,                'Acrylic or gel nail extensions for length & shape'],
  [/gel overlay/i,             'Gel overlay for stronger, natural-looking nails'],
  [/gel overlay removal/i,     'Safe, damage-free gel overlay removal'],
  [/acrylic removal/i,         'Professional acrylic nail removal'],
  [/gel polish.*feet/i,        'Long-lasting gel polish for toes'],
  [/gel polish.*hands/i,       'Chip-resistant gel polish for fingernails'],
  [/gel polish removal/i,      'Gentle gel polish removal without damage'],
  // Mani & Pedi
  [/manicure.*basic/i,         'File, buff & basic polish for neat hands'],
  [/manicure.*advance/i,       'Scrub, massage, mask & colour finish'],
  [/manicure.*premium/i,       'Luxury manicure with paraffin wax & serum'],
  [/pedicure.*basic/i,         'Foot soak, scrub, trim & basic polish'],
  [/pedicure.*advance/i,       'Deep foot care with scrub, mask & massage'],
  [/pedicure.*premium/i,       'Luxury pedicure with paraffin wax & heel repair'],
  // Massage
  [/body massage.*10/i,        'Quick revitalising massage for instant stress relief'],
  [/body massage.*20/i,        'Mid-session relaxation massage for tired muscles'],
  [/body massage.*30/i,        'Full relaxation massage for complete de-stress'],
  [/body massage.*1 hour/i,    'Head-to-toe luxury massage for total rejuvenation'],
  // Makeup
  [/party makeup.*basic/i,     'Stunning party-ready look with quality products'],
  [/party makeup.*advance/i,   'Advanced glam look with contouring & HD finish'],
  [/party makeup.*premium/i,   'Airbrush-finish premium party glam'],
  [/engagement.*basic/i,       'Beautiful engagement look with traditional touch'],
  [/engagement.*advance/i,     'Advanced bridal-prep look with skin prep'],
  [/engagement.*premium/i,     'Premium engagement glam with designer products'],
  [/wedding.*basic/i,          'Classic bridal look with long-lasting makeup'],
  [/wedding.*advance/i,        'High-definition bridal glam with airbrush finish'],
  [/wedding.*premium/i,        'Premium bridal experience with luxury brands'],
  [/wedding.*ultra/i,          'The ultimate bridal experience — no compromises'],
  // Scalp & Skin
  [/scalp.*male/i,             'Medicated scalp treatment for dandruff & hair fall'],
  [/scalp.*female/i,           'Nourishing scalp therapy for healthy hair growth'],
  [/skin.*body/i,              'Full body skin polishing, brightening & hydration'],
  // Combos
  [/combo 1/i,                 'Haircut + Wash + Head Massage + Beard Set'],
  [/combo 2/i,                 'Grooming combo + De-Tan for fresh, even skin'],
  [/combo 3/i,                 'Full grooming + Cleanup for a thorough refresh'],
  [/combo 4/i,                 'Grooming + Hair Colour — look sharp & vibrant'],
  [/combo 5/i,                 'Full groom + Spa + Cleanup — the works'],
  [/combo 6/i,                 'Premium all-in-one grooming + Facial + De-Tan'],
];

function getDesc(svc: Service): string {
  if (svc.description) return svc.description; // use stored desc if exists
  for (const [re, desc] of SVC_DESC) if (re.test(svc.name)) return desc;
  return `Professional ${svc.category.toLowerCase()} service · ${svc.time}`;
}

// ─── Scheduling engine ─────────────────────────────────────────────────────────

function parseMins(t: string): number {
  const m = t.match(/(\d+)\s*min/i); if (m) return +m[1];
  const h = t.match(/(\d+)\s*hr/i);  if (h) return +h[1] * 60;
  return 60;
}

function fmtT(d: Date) {
  let h = d.getHours(), mi = d.getMinutes();
  const p = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${String(mi).padStart(2,'0')} ${p}`;
}

function computeSlots(date: Date, mins: number, existing: ExistingBooking[], cfg: SalonConfig): SlotOption[] {
  if (mins <= 0) return [];
  const now      = new Date();
  const buf      = new Date(now.getTime() + cfg.bufferMins * 60_000);
  const openMs   = new Date(date).setHours(cfg.openHour,  0, 0, 0);
  const latestMs = new Date(date).setHours(cfg.closeHour, 0, 0, 0) - mins * 60_000;
  const out: SlotOption[] = [];

  for (let t = openMs; t <= latestMs; t += cfg.slotStepMins * 60_000) {
    const e = t + mins * 60_000;
    if (isSameDay(date, now) && t < buf.getTime()) continue;
    const concurrent = existing.filter(b =>
      new Date(b.startTime).getTime() < e && new Date(b.endTime).getTime() > t
    ).length;
    if (concurrent >= cfg.staffCount) continue;
    const sd = new Date(t), ed = new Date(e);
    const h  = sd.getHours();
    out.push({
      label: `${fmtT(sd)} – ${fmtT(ed)}`,
      startISO: sd.toISOString(), endISO: ed.toISOString(),
      available: cfg.staffCount - concurrent,
      session: h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening',
    });
  }
  return out;
}

// ─── Voice parser (no API key) ─────────────────────────────────────────────────

function fmtHour(h: number): string {
  if (h === 0)  return '12:00 AM';
  if (h === 12) return '12:00 PM';
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

async function parseVoice(transcript: string, servicesList: Service[], cfg: SalonConfig): Promise<VoiceIntent> {
  const today    = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dayName  = today.toLocaleDateString('en-IN', { weekday: 'long' });

  const serviceList = servicesList
    .map(s => `"${s.name}" (${s.category}, ${s.time}, ₹${s.priceValue})`)
    .join('\n');

  const system = `You are a multilingual booking assistant for Hair Tech Salon, Araria, Bihar.
Today is ${dayName}, ${todayStr}. Salon hours: ${fmtHour(cfg.openHour)} – ${fmtHour(cfg.closeHour)}.

The user speaks English, Hindi, or Hinglish (mixed). Parse their voice input and extract intent.

Hindi/Hinglish reference:
- Time: "5 baje" = 5 o'clock (default PM for 1–9 if no context), "subah" = morning (AM), "shaam/dopahar" = afternoon/evening (PM), "raat" = night (PM)
- Date: "aaj" = today, "kal" = tomorrow, "parso" = day after tomorrow
- Services: "baal kata do/haircut karo" = haircut, "dari/beard set karo" = beard, "facial kara do" = facial, "rang karna hai" = hair colour, "champi" = head massage

Available services:
${serviceList}

Respond ONLY with valid JSON, no markdown:
{
  "intent": "book_appointment" | "unknown",
  "requestedDate": "today" | "tomorrow" | "YYYY-MM-DD" | null,
  "requestedTime": "HH:MM" (24h) | null,
  "services": [exact service names from the list above],
  "language": "hindi" | "english" | "hinglish",
  "confidence": 0.0–1.0,
  "rawTranscript": "${transcript}",
  "clarification": "short friendly message in same language if unclear" | null
}

Rules:
- Match services fuzzily: "haircut" → use the most basic/common matching service name
- Default date to "today" if not mentioned
- Default PM for times 1–9 when no AM/PM given
- confidence < 0.6 → intent = "unknown", add clarification`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         import.meta.env.VITE_ANTHROPIC_KEY as string,
        'anthropic-version': '2023-06-01',
        // Required for direct browser calls — move to a backend proxy before production
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: transcript }],
      }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);
    const data  = await res.json();
    const text  = (data.content as Array<{type:string;text:string}>)
      .filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean) as VoiceIntent;

  } catch (err) {
    // Fallback to regex parser if API fails (network, quota, etc.)
    console.warn('[Voice] Claude API failed, using regex fallback:', err);
    return regexFallback(transcript);
  }
}

// Regex fallback — used if Claude API is unavailable
function regexFallback(transcript: string): VoiceIntent {
  const t        = transcript.toLowerCase();
  const hindi    = ['baje','kal','aaj','subah','shaam','karwa','chahiye','karo','baal'];
  const isHindi  = hindi.some(w => t.includes(w));
  let requestedDate: string | null = 'today';
  if (/\bkal\b|tomorrow/.test(t)) requestedDate = 'tomorrow';
  let requestedTime: string | null = null;
  const tod = /subah|morning/.test(t) ? 'am' : /shaam|evening|raat/.test(t) ? 'pm' : null;
  const tm  = t.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i) || t.match(/(\d{1,2})\s*baje/i) || t.match(/(\d{1,2})\s*(am|pm)/i);
  if (tm) {
    let h = +tm[1], mi = tm[2] && /^\d{2}$/.test(tm[2]) ? +tm[2] : 0;
    const ep = (tm[3] ?? tm[2] ?? '').toLowerCase();
    if (ep === 'pm' && h !== 12) h += 12;
    else if (!ep && tod === 'pm' && h !== 12) h += 12;
    else if (!ep && !tod && h >= 1 && h <= 9) h += 12;
    if (h >= 10 && h <= 22) requestedTime = `${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;
  }
  const services: string[] = [];
  const map: [RegExp,string][] = [
    [/haircut|baal.*kat/i,'Male: Haircut'],[/beard|shave/i,'Beard Set'],
    [/facial/i,'Basic Mini Facial'],[/colour|color/i,'Male: Hair Colour (Basic)'],
    [/massage|champi/i,'Body Massage (30 min)'],[/cleanup/i,'Cleanup (Basic)'],
  ];
  for (const [re, name] of map) if (re.test(t) && !services.includes(name)) services.push(name);
  const hasMeaning = /book|appoint|slot|karo|karwa|chahiye/.test(t) || !!requestedTime || services.length > 0;
  const confidence = !hasMeaning ? 0.3 : requestedTime && services.length ? 0.9 : 0.65;
  return {
    intent: confidence >= 0.6 ? 'book_appointment' : 'unknown',
    requestedDate, requestedTime, services,
    language: isHindi ? 'hinglish' : 'english',
    confidence, rawTranscript: transcript,
    clarification: confidence < 0.6
      ? (isHindi ? 'Dobara boliye, jaise: "5 baje haircut"' : 'Try: "Haircut at 5 PM"')
      : undefined,
  };
}

function loadRazorpay() {
  return new Promise<boolean>(resolve => {
    if (document.querySelector('script[src*="razorpay"]')) { resolve(true); return; }
    const s    = document.createElement('script');
    s.src      = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload   = () => resolve(true);
    s.onerror  = () => resolve(false);
    document.body.appendChild(s);
  });
}

// ─── Voice button ──────────────────────────────────────────────────────────────

function VoiceMic({ onResult, services: voiceServices, config: voiceConfig }: { onResult: (i: VoiceIntent) => void; services: Service[]; config: SalonConfig }) {
  const [st, setSt] = useState<'idle'|'listening'|'processing'|'error'>('idle');
  const [err, setErr] = useState('');
  const recRef = useRef<any>(null);
  const supported = typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const start = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = 'hi-IN'; r.continuous = false; r.maxAlternatives = 3;
    r.onresult = (e: any) => {
      setSt('processing');
      parseVoice(e.results[0][0].transcript, voiceServices, voiceConfig)
        .then(intent => { setSt('idle'); onResult(intent); })
        .catch(() => { setSt('error'); setErr("Couldn't understand."); });
    };
    r.onerror = () => { setSt('error'); setErr('Mic error. Try again.'); };
    recRef.current = r;
    r.start();
    setSt('listening');
  };

  const stop = () => { recRef.current?.stop(); setSt('idle'); };

  if (!supported) return null;

  return (
    <button
      onClick={st === 'listening' ? stop : start}
      className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all ${
        st === 'listening' ? 'bg-red-500/15 border-red-400/40 text-red-400 animate-pulse'
        : st === 'processing' ? 'bg-gold/10 border-gold/30 text-gold'
        : 'bg-white/[0.06] border-white/10 text-gray-400 hover:border-gold/40 hover:text-white'
      }`}
    >
      {st === 'processing' ? <Loader2 size={13} className="animate-spin" />
       : st === 'listening' ? <MicOff size={13} />
       : <Mic size={13} />}
      {st === 'listening' ? 'Stop' : st === 'processing' ? '…' : 'Voice'}
    </button>
  );
}

// ─── Slot picker screen ────────────────────────────────────────────────────────

function SlotScreen({ totalMins, onBack, onSelect, config }: {
  totalMins: number;
  onBack: () => void;
  onSelect: (date: Date, slot: SlotOption) => void;
  config: SalonConfig;
}) {
  const [selDate, setSelDate]       = useState(() => new Date());
  const [loading, setLoading]       = useState(false);
  const [bookings, setBookings]     = useState<ExistingBooking[]>([]);
  const dateStrip = useMemo(() => Array.from({length:7}, (_,i) => addDays(new Date(),i)), []);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    const s = startOfDay(selDate).toISOString();
    const e = startOfDay(addDays(selDate,1)).toISOString();
    getDocs(query(collection(db,'bookings'),
      where('startTime','>=',s), where('startTime','<',e),
      where('status','in',['paid','confirmed','pending']),
    )).then(snap => {
      if (dead) return;
      setBookings(snap.docs.map(d => {
        const x = d.data();
        if (x.startTime && x.endTime) return {startTime:x.startTime, endTime:x.endTime};
        if (x.bookingDate && x.bookingTime) {
          const dt = new Date(x.bookingDate);
          const [tp,per] = (x.bookingTime as string).split(' ');
          let [hh,mm] = tp.split(':').map(Number);
          if (per==='PM'&&hh!==12) hh+=12;
          dt.setHours(hh,mm??0,0,0);
          return {startTime:dt.toISOString(), endTime:new Date(dt.getTime()+(x.serviceDurationMins??60)*60000).toISOString()};
        }
        return null;
      }).filter(Boolean) as ExistingBooking[]);
    }).catch(()=>setBookings([])).finally(()=>{if(!dead)setLoading(false);});
    return ()=>{dead=true;};
  }, [selDate]);

  const slots    = useMemo(()=>computeSlots(selDate,totalMins,bookings,config),[selDate,totalMins,bookings,config]);
  const groups   = useMemo(()=>({
    morning:   slots.filter(s=>s.session==='morning'),
    afternoon: slots.filter(s=>s.session==='afternoon'),
    evening:   slots.filter(s=>s.session==='evening'),
  }),[slots]);
  const hasSlots = slots.length > 0;
  const isToday  = isSameDay(selDate, new Date());

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
          <ChevronLeft size={20} className="text-gray-700" />
        </button>
        <div>
          <h2 className="font-bold text-gray-900 text-base">Select Date & Time</h2>
          <p className="text-xs text-gray-400">~{totalMins} min session needed</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50">
        {/* Date strip */}
        <div className="bg-white px-4 py-4 border-b border-gray-100">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">Choose Date</p>
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
            {dateStrip.map(d => {
              const active = isSameDay(d, selDate);
              return (
                <button key={d.toString()} onClick={()=>{setSelDate(d);}}
                  className={`flex-shrink-0 w-14 h-16 rounded-2xl flex flex-col items-center justify-center transition-all border-2 ${
                    active ? 'bg-[#D4AF37] border-[#D4AF37] text-black shadow-md'
                           : 'bg-white border-gray-100 text-gray-400 hover:border-[#D4AF37]/40'
                  }`}>
                  <span className={`text-xs font-bold ${active?'text-black/70':'text-gray-400'}`}>{format(d,'EEE')}</span>
                  <span className="text-lg font-black">{format(d,'d')}</span>
                  {isSameDay(d,new Date())&&<span className={`text-[8px] font-bold ${active?'text-black/60':'text-[#D4AF37]'}`}>Today</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Slots */}
        <div className="px-4 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
              <Loader2 size={22} className="animate-spin text-[#D4AF37]" />
              <span className="text-sm">Checking availability…</span>
            </div>
          ) : !hasSlots ? (
            <div className="text-center py-16 space-y-3">
              <CalendarX size={36} className="text-gray-300 mx-auto" />
              <p className="font-bold text-gray-400">No slots available</p>
              <p className="text-sm text-gray-400">{isToday?'No slots left today.':'Fully booked.'} Try another date.</p>
              <button onClick={()=>setSelDate(addDays(selDate,1))}
                className="mt-2 px-5 py-2.5 bg-[#D4AF37] rounded-xl text-black font-bold text-sm">
                Next Day →
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {(['morning','afternoon','evening'] as const).map(sess => {
                const list = groups[sess];
                if (!list.length) return null;
                return (
                  <div key={sess}>
                    <div className="flex items-center gap-2 mb-3">
                      {sess==='morning'&&<Sun size={14} className="text-amber-500"/>}
                      {sess==='afternoon'&&<CloudSun size={14} className="text-orange-500"/>}
                      {sess==='evening'&&<Moon size={14} className="text-indigo-500"/>}
                      <span className="text-sm font-bold text-gray-700 capitalize">{sess}</span>
                      <span className="text-xs text-green-600 font-bold ml-auto">{list.length} available</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      {list.map(slot => (
                        <button key={slot.startISO}
                          onClick={()=>onSelect(selDate,slot)}
                          className={`py-3 px-2 rounded-xl border-2 text-[11px] font-bold text-center transition-all ${
                            slot.available===1
                              ? 'border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-300'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-[#D4AF37] hover:bg-[#D4AF37]/5'
                          }`}>
                          <div className="leading-tight">{slot.label}</div>
                          {slot.available===1&&<div className="text-[11px] text-orange-500 font-bold mt-0.5">1 spot left</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function BookingSystem() {
  const [screen, setScreen]         = useState<Screen>('browse');
  const [cart,   setCart]           = useState<CartItem[]>([]);
  const [search, setSearch]         = useState('');
  const [activeCategory, setActiveCat] = useState(CATEGORIES[0]);
  const [cartOpen, setCartOpen]     = useState(false);
  const [selDate, setSelDate]       = useState(new Date());
  const [selSlot, setSelSlot]       = useState<SlotOption|null>(null);
  const [info,   setInfo]           = useState<ClientInfo>({name:'',phone:''});
  const [loading, setLoading]       = useState(false);
  const [payErr,             setPayErr]           = useState<string|null>(null);
  const [autoFilled,         setAutoFilled]        = useState(false);
  const [phoneLookupLoading, setPhoneLookupLoading]= useState(false);
  const [pendingExisting,    setPendingExisting]   = useState<PendingExisting|null>(null);
  const [ignorePending,      setIgnorePending]     = useState(false);

  // Express service
  const [isExpress, setIsExpress] = useState(false);

  // Coupon
  const [couponInput,   setCouponInput]   = useState('');
  const [couponData,    setCouponData]    = useState<{ code:string; type:'percent'|'flat'; value:number; discount:number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError,   setCouponError]   = useState<string|null>(null);
  const catRefs = useRef<Record<string,HTMLDivElement|null>>({});

  const [salonConfig, setSalonConfig] = useState<SalonConfig>(DEFAULT_SALON_CONFIG);

  useEffect(() => {
    fetchSalonConfig().then(setSalonConfig).catch(() => {});
  }, []);

  const [firestoreServices, setFirestoreServices] = useState<Service[]>([]);

  useEffect(() => {
    let dead = false;
    getDocs(query(collection(db, 'services'), orderBy('category'), orderBy('name')))
      .then(snap => {
        if (dead) return;
        setFirestoreServices(snap.docs
          .filter(d => (d.data() as any).active !== false)
          .map(d => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name,
              category: data.category,
              price: data.price,
              priceValue: data.priceValue,
              time: data.time,
              ...(data.description && { description: data.description }),
            } as Service;
          }));
      })
      .catch(() => {});
    return () => { dead = true; };
  }, []);

  // Merge Firestore services with static fallback (Firestore takes precedence by name)
  const services = useMemo(() => {
    if (!firestoreServices.length) return servicesData;
    const fsNames = new Set(firestoreServices.map(s => s.name.toLowerCase()));
    return [...firestoreServices, ...servicesData.filter(s => !fsNames.has(s.name.toLowerCase()))];
  }, [firestoreServices]);

  // Dynamic category list — includes any new categories added via Firestore
  const dynamicCategories = useMemo(() => {
    const allCats = Array.from(new Set(services.map(s => s.category)));
    return [
      ...CATEGORY_ORDER.filter(c => allCats.includes(c)),
      ...allCats.filter(c => !CATEGORY_ORDER.includes(c)),
    ];
  }, [services]);

  // Derived
  const expressFee  = isExpress ? salonConfig.expressServiceFee : 0;
  const cartAmount  = useMemo(()=>cart.reduce((a,i)=>a+i.service.priceValue*i.qty,0),[cart]);
  const totalAmount = cartAmount + expressFee;
  const totalMins   = useMemo(()=>cart.reduce((a,i)=>a+parseMins(i.service.time)*i.qty,0),[cart]);
  const totalItems  = useMemo(()=>cart.reduce((a,i)=>a+i.qty,0),[cart]);
  const phoneDigits = info.phone.replace(/\D/g, '').slice(-10);
  const phoneValid  = /^[6-9]\d{9}$/.test(phoneDigits);
  const step2OK     = info.name.trim().length>0 && phoneValid;

  // Coupon derived
  const discount    = couponData?.discount ?? 0;
  const finalAmount = Math.max(0, totalAmount - discount);

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true); setCouponError(null);
    try {
      const snap = await getDoc(doc(db, 'coupons', code));
      if (!snap.exists())           { setCouponError('Invalid coupon code.'); return; }
      const d = snap.data();
      if (!d.active)                { setCouponError('This coupon is no longer active.'); return; }
      if (d.expiresAt && new Date(d.expiresAt) < new Date())
                                    { setCouponError('This coupon has expired.'); return; }
      if (d.maxUses > 0 && d.usedCount >= d.maxUses)
                                    { setCouponError('Coupon usage limit reached.'); return; }
      if (d.minOrder > 0 && totalAmount < d.minOrder)
                                    { setCouponError(`Minimum order ₹${d.minOrder} required for this coupon.`); return; }
      const disc = d.type === 'percent'
        ? Math.round(totalAmount * d.value / 100)
        : Math.min(d.value, totalAmount);
      setCouponData({ code, type: d.type, value: d.value, discount: disc });
    } catch { setCouponError('Could not verify coupon. Please try again.'); }
    finally   { setCouponLoading(false); }
  };

  const removeCoupon = () => { setCouponData(null); setCouponInput(''); setCouponError(null); };

  const lookupPhone = useCallback(async (phone: string) => {
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) { setPendingExisting(null); return; }
    setPhoneLookupLoading(true);
    try {
      // 1. Check customers collection first — instant O(1) lookup by document ID
      //    The customers collection uses normalized 10-digit phone as the doc ID
      const custSnap = await getDoc(doc(db, 'customers', digits));
      if (custSnap.exists()) {
        const name = (custSnap.data().name ?? '').trim();
        if (name) {
          setInfo(prev => ({ ...prev, name }));
          setAutoFilled(true);
        }
      }

      // 2. Fall back to bookings collection (for customers who have booked but not yet billed)
      const snaps = await Promise.all(
        [digits, `+91${digits}`, `+91 ${digits}`, `91${digits}`, `0${digits}`].map(
          fmt => getDocs(query(collection(db, 'bookings'), where('customerPhone', '==', fmt)))
        )
      );
      if (!custSnap.exists() || !(custSnap.data()?.name ?? '').trim()) {
        for (const snap of snaps) {
          if (!snap.empty) {
            const name = (snap.docs[0].data().customerName ?? '').trim();
            if (name) {
              setInfo(prev => ({ ...prev, name }));
              setAutoFilled(true);
              break;
            }
          }
        }
      }

      // 3. Check for a recent pending booking (created but never paid) for this number
      const dayMs = 24 * 60 * 60 * 1000;
      const pendingDocs = snaps.flatMap(snap => snap.docs)
        .filter(d => {
          const data = d.data();
          if (data.status !== 'pending') return false;
          if (!data.startTime) return false;
          return new Date(data.startTime).getTime() > Date.now() - dayMs;
        });
      pendingDocs.sort((a, b) => {
        const aT = a.data().createdAt?.toDate?.() ?? new Date(0);
        const bT = b.data().createdAt?.toDate?.() ?? new Date(0);
        return bT.getTime() - aT.getTime();
      });
      if (pendingDocs.length) {
        const d = pendingDocs[0];
        setPendingExisting({ id: d.id, ...(d.data() as any) });
      } else {
        setPendingExisting(null);
      }
    } catch { /* silent */ }
    finally { setPhoneLookupLoading(false); }
  }, []);

  // Filtered + grouped services
  const filtered = useMemo(()=>{
    if (!search.trim()) return services;
    const q = search.toLowerCase();
    return services.filter(s=>s.name.toLowerCase().includes(q)||s.category.toLowerCase().includes(q));
  },[search, services]);

  const grouped = useMemo(()=>{
    const g: Record<string,Service[]>={};
    filtered.forEach(s=>{(g[s.category]=g[s.category]??[]).push(s);});
    return g;
  },[filtered]);

  const visibleCats = useMemo(()=>dynamicCategories.filter(c=>grouped[c]?.length),[grouped, dynamicCategories]);

  // Cart helpers
  const qty    = (id:string) => cart.find(i=>i.service.id===id)?.qty??0;
  const setQty = useCallback((id:string, delta:number)=>{
    setCart(prev=>{
      const ex = prev.find(i=>i.service.id===id);
      if (!ex) {
        if (delta>0) return [...prev,{service:services.find(s=>s.id===id)!,qty:1}];
        return prev;
      }
      const n = ex.qty+delta;
      return n<=0 ? prev.filter(i=>i.service.id!==id) : prev.map(i=>i.service.id===id?{...i,qty:n}:i);
    });
  },[services]);

  // Scroll-spy
  useEffect(()=>{
    if (screen!=='browse') return;
    const obs = new IntersectionObserver(
      entries=>entries.forEach(e=>{if(e.isIntersecting)setActiveCat(e.target.getAttribute('data-cat')??'');}),
      {threshold:0.25,rootMargin:'-100px 0px -65% 0px'},
    );
    Object.values(catRefs.current).forEach(el=>{if(el)obs.observe(el);});
    return ()=>obs.disconnect();
  },[screen,visibleCats]);

  const scrollTo = (cat:string)=>{
    catRefs.current[cat]?.scrollIntoView({behavior:'smooth',block:'start'});
    setActiveCat(cat);
  };

  // Voice
  const handleVoice = useCallback((intent:VoiceIntent)=>{
    if (intent.intent==='unknown') return;
    intent.services.forEach(name=>{
      const s = services.find(x=>x.name===name);
      if (s) setCart(prev=>prev.find(i=>i.service.id===s.id)?prev:[...prev,{service:s,qty:1}]);
    });
    if (intent.requestedDate==='tomorrow') setSelDate(addDays(new Date(),1));
    if (cart.length>0||intent.services.length>0) setScreen('slots');
  },[cart.length, services]);

  // Payment
  const pay = async()=>{
    if (!selSlot) return;
    setLoading(true); setPayErr(null);
    const ok = await loadRazorpay();
    if (!ok){setPayErr('Payment failed to load.');setLoading(false);return;}

    const expressItem = isExpress ? [{ id:'express-service', name:'Express Service', qty:1, priceValue: salonConfig.expressServiceFee }] : [];
    const allServiceItems = [...cart.map(i=>({ id:i.service.id, name:i.service.name, qty:i.qty, priceValue:i.service.priceValue })), ...expressItem];
    const allServiceNames = [...cart.map(i=>i.service.name + (i.qty>1?` ×${i.qty}`:'')), ...(isExpress ? ['Express Service'] : [])].join(', ');

    const bookingData = {
      customerName:        info.name,
      customerPhone:       info.phone.replace(/\D/g, '').slice(-10),
      startTime:           selSlot.startISO,
      endTime:             selSlot.endISO,
      bookingTime:         selSlot.label,
      bookingDate:         startOfDay(selDate).toISOString(),
      serviceNames:        allServiceNames,
      serviceItems:        allServiceItems,
      serviceDurationMins: totalMins,
      totalAmount:         finalAmount,
      originalAmount:      totalAmount,
      ...(isExpress && { isExpress: true, expressServiceFee: salonConfig.expressServiceFee }),
      ...(couponData && { couponCode: couponData.code, discountAmount: couponData.discount }),
      status: 'pending' as const,
      createdAt: serverTimestamp(),
    };

    // Step 1: create pending booking so it's captured even if payment is abandoned
    let pendingId: string;
    try {
      const ref = await addDoc(collection(db,'bookings'), bookingData);
      pendingId = ref.id;
    } catch {
      setPayErr('Could not create booking. Please try again.');
      setLoading(false);
      return;
    }

    // Step 2: open Razorpay
    new window.Razorpay({
      key: "rzp_live_SmNepW6x97QG64", amount: finalAmount*100, currency:'INR',
      name:'Hair Tech Salon', description: bookingData.serviceNames,
      prefill:{name:info.name, contact:info.phone, email:''},
      theme:{color:'#D4AF37'},
      notes:{ bookingId: pendingId },
      handler:(res:any)=>{
        // Step 3: payment succeeded — update booking to paid
        updateDoc(doc(db,'bookings', pendingId),{
          status:    'paid',
          paymentId: res.razorpay_payment_id,
          updatedAt: serverTimestamp(),
        })
        .then(()=>{
          if (couponData?.code) {
            updateDoc(doc(db,'coupons',couponData.code),{usedCount:increment(1)}).catch(()=>{});
          }
          setScreen('success');
        })
        .catch(()=>setPayErr(`Payment received (ID:${res.razorpay_payment_id}) but confirmation failed. Please contact the salon with this ID.`))
        .finally(()=>setLoading(false));
      },
      modal:{
        ondismiss:()=>{
          // Booking stays as 'pending' — customer can retry via tracking
          setLoading(false);
          setPayErr('Payment was not completed. Your booking is saved as pending — you can retry payment from the "Track Booking" option.');
        },
      },
    }).open();
  };

  // Resume payment for an existing pending booking (avoid creating a duplicate)
  const payExisting = async (b: PendingExisting) => {
    setLoading(true); setPayErr(null);
    const ok = await loadRazorpay();
    if (!ok){setPayErr('Payment failed to load.');setLoading(false);return;}

    const amount = b.totalAmount ?? 0;
    new window.Razorpay({
      key: "rzp_live_SmNepW6x97QG64", amount: Math.round(amount*100), currency:'INR',
      name:'Hair Tech Salon', description: b.serviceNames ?? '',
      prefill:{name: b.customerName ?? info.name, contact:info.phone, email:''},
      theme:{color:'#D4AF37'},
      notes:{ bookingId: b.id },
      handler:(res:any)=>{
        updateDoc(doc(db,'bookings', b.id),{
          status:    'paid',
          paymentId: res.razorpay_payment_id,
          updatedAt: serverTimestamp(),
        })
        .then(()=>{
          setSelDate(b.startTime ? new Date(b.startTime) : selDate);
          setSelSlot({
            label: b.bookingTime ?? '',
            startISO: b.startTime ?? '',
            endISO: b.endTime ?? '',
            available: 0,
            session: 'morning',
          });
          setCart((b.serviceItems ?? []).map(item => ({
            service: services.find(s=>s.id===item.id) ?? {
              id: item.id, name: item.name, category: '', price: `₹${item.priceValue}`, priceValue: item.priceValue, time: '0 min',
            },
            qty: item.qty,
          })));
          setScreen('success');
        })
        .catch(()=>setPayErr(`Payment received (ID:${res.razorpay_payment_id}) but confirmation failed. Please contact the salon with this ID.`))
        .finally(()=>setLoading(false));
      },
      modal:{
        ondismiss:()=>{
          setLoading(false);
          setPayErr('Payment was not completed.');
        },
      },
    }).open();
  };

  // ── Success ─────────────────────────────────────────────────────────────────

  if (screen==='success') return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center px-6 text-center">
      <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:'spring',bounce:0.4}}
        className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(34,197,94,0.3)]">
        <CheckCircle2 size={40} className="text-white"/>
      </motion.div>
      <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.2}}>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Booking Confirmed!</h2>
        <p className="text-gray-500 text-sm mb-1">We'll see you at the salon</p>
        <p className="text-[#D4AF37] font-bold text-sm mb-1">{format(selDate,'EEE, MMM d, yyyy')}</p>
        <p className="text-gray-400 text-sm mb-6">{selSlot?.label}</p>
        <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-left space-y-2">
          {cart.map(({service,qty})=>(
            <div key={service.id} className="flex justify-between text-sm">
              <span className="text-gray-400">{service.name}{qty>1&&` ×${qty}`}</span>
              <span className="font-bold text-gray-900">₹{(service.priceValue*qty).toLocaleString('en-IN')}</span>
            </div>
          ))}
          {expressFee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-orange-400 flex items-center gap-1"><Zap size={12}/> Express Service</span>
              <span className="font-bold text-orange-600">₹{expressFee.toLocaleString('en-IN')}</span>
            </div>
          )}
          <div className="pt-2 border-t border-gray-200 flex justify-between font-black">
            <span>Total</span><span className="text-[#D4AF37]">₹{totalAmount.toLocaleString('en-IN')}</span>
          </div>
        </div>
        <Link to="/" className="block w-full py-3.5 bg-gray-900 rounded-2xl text-white font-bold text-center">
          Back to Home
        </Link>
      </motion.div>
    </div>
  );

  // ── Slot screen ─────────────────────────────────────────────────────────────

  if (screen==='slots') return (
    <div className="fixed inset-0 z-[200]">
      <SlotScreen totalMins={totalMins} onBack={()=>setScreen('browse')}
        onSelect={(date,slot)=>{setSelDate(date);setSelSlot(slot);setScreen('details');}}
        config={salonConfig}/>
    </div>
  );

  // ── Details screen ──────────────────────────────────────────────────────────

  if (screen==='details') return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={()=>setScreen('slots')} className="p-2 rounded-full hover:bg-gray-100">
          <ChevronLeft size={20} className="text-gray-700"/>
        </button>
        <h2 className="font-bold text-gray-900 text-base">Contact Details</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Appointment summary */}
        <div className={`rounded-2xl p-4 border ${isExpress ? 'bg-orange-500/8 border-orange-400/20' : 'bg-[#D4AF37]/8 border-[#D4AF37]/20'}`}>
          <div className="flex items-center gap-2 mb-1">
            {isExpress ? <Zap size={14} className="text-orange-500"/> : <Calendar size={14} className="text-[#D4AF37]"/>}
            <span className="text-sm font-bold text-gray-800">{format(selDate,'EEE, MMM d')} · {selSlot?.label}</span>
            {isExpress && <span className="text-[11px] font-black text-white bg-orange-500 rounded-md px-1.5 py-0.5 uppercase">Express</span>}
          </div>
          <p className="text-xs text-gray-500 pl-5">{cart.map(i=>i.service.name).join(', ')}</p>
        </div>

        {/* Phone — first field, triggers auto-fill lookup */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Mobile Number</label>
          <div className="relative">
            <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input
              type="tel" placeholder="+91 98765 43210" value={info.phone}
              maxLength={15}
              onChange={e=>{
                const raw = e.target.value;
                // Only allow digits, leading +, and spaces
                const cleaned = raw.replace(/[^0-9+ ]/g, '');
                // Block + anywhere except the start
                const val = cleaned.charAt(0) === '+' ? '+' + cleaned.slice(1).replace(/\+/g, '') : cleaned.replace(/\+/g, '');
                setInfo(p=>({...p,phone:val}));
                setAutoFilled(false);
                setIgnorePending(false);
                lookupPhone(val);
              }}
              className="w-full border-2 border-gray-200 rounded-2xl py-4 pl-11 pr-10 text-gray-900 text-sm focus:outline-none focus:border-[#D4AF37] transition-all placeholder:text-gray-300"
            />
            {phoneLookupLoading&&<Loader2 size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#D4AF37] animate-spin"/>}
          </div>
          {info.phone && !phoneValid && (
            <p className="text-orange-500 text-xs mt-1 flex items-center gap-1">
              <AlertCircle size={11}/>Enter a valid 10-digit mobile number (e.g. 9667833075)
            </p>
          )}
          {pendingExisting&&!ignorePending&&(
            <div className="mt-2 flex items-start gap-2 px-3 py-2.5 rounded-2xl bg-amber-500/8 border border-amber-500/20">
              <Clock size={14} className="text-amber-500 shrink-0 mt-0.5"/>
              <p className="text-amber-700 text-xs font-bold leading-snug">
                You already have a pending appointment with this number. Tap "Review Order" to view and confirm it.
              </p>
            </div>
          )}
        </div>

        {/* Name — second, auto-filled for returning customers */}
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Full Name</label>
          {autoFilled&&(
            <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
              <CheckCircle2 size={13} className="text-green-500 shrink-0"/>
              <p className="text-xs text-green-700 font-medium flex-1">Welcome back! Name filled from your last booking.</p>
              <button onClick={()=>{setAutoFilled(false);setInfo(p=>({...p,name:''}));}}>
                <X size={13} className="text-green-400 hover:text-green-700"/>
              </button>
            </div>
          )}
          <div className="relative">
            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input
              type="text" placeholder="e.g. Rahul Kumar" value={info.name}
              onChange={e=>{setInfo(p=>({...p,name:e.target.value}));setAutoFilled(false);}}
              className={`w-full border-2 rounded-2xl py-4 pl-11 pr-4 text-gray-900 text-sm focus:outline-none transition-all placeholder:text-gray-300 ${
                autoFilled?'border-green-300 bg-green-50/40 focus:border-green-400':'border-gray-200 focus:border-[#D4AF37]'
              }`}
            />
          </div>
        </div>

      </div>
      <div className="p-4 bg-white border-t border-gray-100">
        <button disabled={!step2OK || phoneLookupLoading}
          onClick={()=>setScreen(pendingExisting&&!ignorePending ? 'pendingFound' : 'review')}
          className="w-full py-4 bg-gray-900 disabled:bg-gray-300 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all">
          {phoneLookupLoading ? <Loader2 size={16} className="animate-spin"/> : <>Review Order <ArrowRight size={16}/></>}
        </button>
      </div>
    </div>
  );

  // ── Pending booking found screen ────────────────────────────────────────────

  if (screen==='pendingFound' && pendingExisting) return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={()=>setScreen('details')} className="p-2 rounded-full hover:bg-gray-100">
          <ChevronLeft size={20} className="text-gray-700"/>
        </button>
        <h2 className="font-bold text-gray-900 text-base">Pending Appointment</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-2xl bg-amber-500/8 border border-amber-500/20">
          <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5"/>
          <p className="text-amber-700 text-xs font-bold leading-snug">
            You already have an appointment waiting for payment confirmation. Pay now to confirm it, or continue to book a new appointment.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <Calendar size={15} className="text-[#D4AF37]"/>
            <p className="text-sm font-bold text-gray-800">
              {pendingExisting.startTime ? format(new Date(pendingExisting.startTime),'EEEE, MMMM d, yyyy') : ''}
            </p>
          </div>
          <div className="px-4 py-3 space-y-2">
            <p className="text-sm text-gray-400">{pendingExisting.bookingTime}</p>
            <p className="text-xs text-gray-500">{pendingExisting.serviceNames}</p>
            <div className="pt-2 border-t border-gray-100 flex justify-between font-black text-sm">
              <span>Total</span>
              <span className="text-[#D4AF37]">₹{(pendingExisting.totalAmount ?? 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {payErr&&(
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-2xl bg-red-50 border border-red-200">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5"/>
            <p className="text-red-600 text-xs font-bold leading-snug">{payErr}</p>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-gray-100 space-y-2">
        <button disabled={loading} onClick={()=>payExisting(pendingExisting)}
          className="w-full py-4 bg-gray-900 disabled:opacity-60 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all">
          {loading ? <Loader2 size={16} className="animate-spin"/> : <Lock size={16}/>}
          Pay ₹{(pendingExisting.totalAmount ?? 0).toLocaleString('en-IN')} to Confirm
        </button>
        <button disabled={loading} onClick={()=>{setIgnorePending(true);setScreen('review');}}
          className="w-full py-3.5 bg-white border-2 border-gray-200 disabled:opacity-60 rounded-2xl text-gray-700 font-bold text-sm transition-all">
          Book a New Appointment Instead
        </button>
      </div>
    </div>
  );

  // ── Review screen (Zomato "Place Order" style) ──────────────────────────────

  if (screen==='review') return (
    <div className="fixed inset-0 z-[200] bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={()=>setScreen('details')} className="p-2 rounded-full hover:bg-gray-100">
          <ChevronLeft size={20} className="text-gray-700"/>
        </button>
        <h2 className="font-bold text-gray-900 text-base">Review & Pay</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Appointment card */}
        <div className="bg-white mx-4 mt-4 rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <Calendar size={15} className="text-[#D4AF37]"/>
            <p className="text-sm font-bold text-gray-800">{format(selDate,'EEEE, MMMM d, yyyy')}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-sm text-gray-400">{selSlot?.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">~{totalMins} min · {info.name} · {info.phone}</p>
          </div>
        </div>

        {/* Services */}
        <div className="bg-white mx-4 mt-3 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-sm font-bold text-gray-800">Services</p>
          </div>
          <div className="divide-y divide-gray-50">
            {cart.map(({service,qty:q})=>(
              <div key={service.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0">
                  <ImgWithFallback src={getImg(service)} alt={service.name} className="w-full h-full object-cover" emoji={CAT_EMOJI[service.category] ?? '💈'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{service.name}</p>
                  <p className="text-xs text-gray-400">{service.time}{q>1?` × ${q}`:''}</p>
                </div>
                <p className="font-bold text-gray-900 text-sm">₹{(service.priceValue*q).toLocaleString('en-IN')}</p>
              </div>
            ))}
            {isExpress && (
              <div className="flex items-center gap-3 px-4 py-3 bg-orange-50">
                <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
                  <Zap size={20} className="text-white"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-orange-700">Express Service</p>
                  <p className="text-xs text-orange-400">Priority — skip the queue</p>
                </div>
                <p className="font-bold text-orange-600 text-sm">₹{salonConfig.expressServiceFee.toLocaleString('en-IN')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Coupon */}
        <div className="bg-white mx-4 mt-3 rounded-2xl border border-gray-100 shadow-sm px-4 py-4 space-y-3">
          <p className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Tag size={14} className="text-[#D4AF37]" /> Coupon Code
          </p>
          {couponData ? (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-green-50 border border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-green-500 shrink-0" />
                <div>
                  <p className="text-xs font-black text-green-700 tracking-wider">{couponData.code}</p>
                  <p className="text-xs text-green-600">
                    You save ₹{couponData.discount.toLocaleString('en-IN')}
                    {couponData.type === 'percent' ? ` (${couponData.value}% off)` : ''}
                  </p>
                </div>
              </div>
              <button onClick={removeCoupon} className="text-gray-400 hover:text-red-400 transition-colors">
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter coupon code"
                value={couponInput}
                onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                maxLength={20}
                className="flex-1 border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 font-mono uppercase tracking-wider focus:outline-none focus:border-[#D4AF37] transition-all placeholder:text-gray-300 placeholder:normal-case placeholder:tracking-normal"
              />
              <button
                onClick={applyCoupon}
                disabled={couponLoading || !couponInput.trim()}
                className="px-4 py-2.5 bg-gray-900 disabled:bg-gray-300 rounded-xl text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
              >
                {couponLoading ? <Loader2 size={13} className="animate-spin" /> : 'Apply'}
              </button>
            </div>
          )}
          {couponError && (
            <p className="flex items-center gap-1.5 text-red-500 text-xs">
              <AlertCircle size={11} /> {couponError}
            </p>
          )}
        </div>

        {/* Bill */}
        <div className="bg-white mx-4 mt-3 rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-sm font-bold text-gray-800">Bill Details</p>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div className="flex justify-between text-sm text-gray-400">
              <span>Services total</span>
              <span>₹{totalAmount.toLocaleString('en-IN')}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-green-600 font-medium">
                <span>Coupon discount ({couponData?.code})</span>
                <span>–₹{discount.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="pt-3 border-t border-gray-100 flex justify-between font-black text-gray-900">
              <span>To Pay</span>
              <span className="text-[#D4AF37] text-lg">₹{finalAmount.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* Payment methods */}
        <div className="bg-white mx-4 mt-3 mb-4 rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">Accepted Payments</p>
          <div className="flex flex-wrap gap-2">
            {['UPI','Cards','Net Banking','Wallets','PhonePe','GPay'].map(m=>(
              <span key={m} className="px-2.5 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-400">{m}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Pay button */}
      <div className="bg-white border-t border-gray-100 p-4 space-y-2">
        {payErr&&<p className="flex items-center gap-2 text-red-500 text-xs"><AlertCircle size={12}/>{payErr}</p>}
        <button onClick={pay} disabled={loading}
          className="w-full py-4 bg-[#D4AF37] disabled:opacity-50 rounded-2xl text-black font-black text-sm flex items-center justify-center gap-2 shadow-[0_4px_20px_-4px_rgba(212,175,55,0.5)] hover:shadow-[0_6px_24px_-4px_rgba(212,175,55,0.6)] transition-all">
          {loading ? <><Loader2 size={18} className="animate-spin"/> Opening Payment…</>
                   : <><CreditCard size={16}/> Pay ₹{finalAmount.toLocaleString('en-IN')} Securely</>}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <Lock size={10}/> Secured by Razorpay · PCI DSS Compliant
        </p>
      </div>
    </div>
  );

  // ── Browse screen ───────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col overflow-hidden">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-100 shrink-0">
        {/* Salon header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center">
              <Scissors size={16} className="text-[#D4AF37]"/>
            </div>
            <div>
              <p className="font-black text-gray-900 text-sm leading-none">Hair Tech Salon</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Star size={10} className="text-[#D4AF37] fill-[#D4AF37]"/>
                <span className="text-xs font-bold text-gray-500">4.8 · 10AM–10PM</span>
              </div>
            </div>
          </div>
          <Link to="/" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-400 text-xs font-bold hover:bg-gray-200 transition-colors">
            <X size={14}/> Close
          </Link>
        </div>
        {/* Search + voice */}
        <div className="px-4 pb-3 flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input type="text" placeholder="Search services…" value={search}
              onChange={e=>setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-800 focus:outline-none focus:border-[#D4AF37] transition-all placeholder:text-gray-300 bg-gray-50"
            />
            {search&&<button onClick={()=>setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={13}/></button>}
          </div>
          <VoiceMic onResult={handleVoice} services={services} config={salonConfig}/>
        </div>
      </div>

      {/* ── Main content: sidebar + services ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Category sidebar */}
        <div className="w-[72px] shrink-0 border-r border-gray-100 overflow-y-auto bg-gray-50 scrollbar-hide">
          {visibleCats.map(cat=>{
            const active = activeCategory===cat;
            return (
              <button key={cat} onClick={()=>scrollTo(cat)}
                className={`w-full flex flex-col items-center gap-1.5 py-3 px-1 transition-all border-r-[3px] ${
                  active ? 'border-[#D4AF37] bg-white' : 'border-transparent hover:bg-white/60'
                }`}>
                <div className={`w-11 h-11 rounded-xl overflow-hidden border-2 transition-all ${active?'border-[#D4AF37]':'border-gray-200'}`}>
                  <ImgWithFallback src={CAT_IMG[cat]??'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=200&q=70'} alt={cat} className="w-full h-full object-cover" loading="lazy" emoji={CAT_EMOJI[cat] ?? '💈'} />
                </div>
                <span className={`text-[8px] font-bold leading-tight text-center block px-0.5 ${active?'text-[#D4AF37]':'text-gray-500'}`}>
                  {cat.split(' ').join('\n')}
                </span>
              </button>
            );
          })}
        </div>

        {/* Service list */}
        <div className="flex-1 overflow-y-auto bg-white">
          {visibleCats.map(cat=>(
            <div key={cat} data-cat={cat} ref={el=>{catRefs.current[cat]=el;}} className="scroll-mt-0">

              {/* Category banner */}
              <div className="relative h-24 overflow-hidden">
                <ImgWithFallback src={CAT_IMG[cat]??'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800&q=80'} alt={cat} className="w-full h-full object-cover" loading="lazy" emoji={CAT_EMOJI[cat] ?? '💈'} />
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent"/>
                <div className="absolute inset-0 flex items-center px-4 gap-2.5">
                  <span className="text-xl">{CAT_EMOJI[cat]??'💈'}</span>
                  <div>
                    <h2 className="text-white font-black text-base leading-tight">{cat}</h2>
                    <p className="text-white/60 text-xs">{grouped[cat]?.length} services</p>
                  </div>
                </div>
              </div>

              {/* Service cards — Zomato row style */}
              <div className="divide-y divide-gray-50">
                {grouped[cat]?.map(svc=>{
                  const q     = qty(svc.id);
                  const added = q>0;
                  const prem  = isPremium(svc);

                  return (
                    <div key={svc.id}
                      className={`flex items-start gap-3 px-4 py-4 transition-colors ${added?'bg-[#D4AF37]/[0.03]':'hover:bg-gray-50/60'}`}>

                      {/* Left: text content */}
                      <div className="flex-1 min-w-0 pr-1">
                        {prem&&(
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-600 mb-1.5">
                            <Coffee size={8}/> Free Drink
                          </span>
                        )}
                        <p className={`text-[13px] font-semibold leading-snug mb-1 ${added?'text-[#B8941F]':'text-gray-900'}`}>
                          {svc.name}
                        </p>
                        {/* Description — always shown, generated if not in data */}
                        <p className="text-gray-400 text-[11px] leading-relaxed line-clamp-2 mb-2">
                          {getDesc(svc)}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">{svc.price}</span>
                          <span className="w-1 h-1 rounded-full bg-gray-300"/>
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock size={9}/>{svc.time}
                          </span>
                        </div>
                      </div>

                      {/* Right: image + add button */}
                      <div className="shrink-0 flex flex-col items-center gap-2">
                        {/* Service image */}
                        <div className="relative w-[90px] h-[90px] rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                          <ImgWithFallback src={getImg(svc)} alt={svc.name} className="w-full h-full object-cover" loading="lazy" emoji={CAT_EMOJI[svc.category] ?? '💈'} />
                          {added&&(
                            <div className="absolute inset-0 bg-[#D4AF37]/20"/>
                          )}
                        </div>

                        {/* Add / qty control — overlaps image bottom like Zomato */}
                        {q===0 ? (
                          <button onClick={()=>setQty(svc.id,1)}
                            className="w-[90px] py-2 border-2 border-[#D4AF37] rounded-xl text-[#B8941F] text-xs font-black uppercase tracking-wider hover:bg-[#D4AF37]/5 transition-all flex items-center justify-center gap-1">
                            <Plus size={12}/> ADD
                          </button>
                        ) : (
                          <div className="flex items-center gap-0 border-2 border-[#D4AF37] rounded-xl overflow-hidden w-[90px]">
                            <button onClick={()=>setQty(svc.id,-1)}
                              className="flex-1 py-2 flex items-center justify-center text-[#B8941F] hover:bg-[#D4AF37]/10 transition-colors">
                              <Minus size={13}/>
                            </button>
                            <span className="w-7 text-center text-sm font-black text-[#B8941F]">{q}</span>
                            <button onClick={()=>setQty(svc.id,1)}
                              className="flex-1 py-2 flex items-center justify-center text-[#B8941F] hover:bg-[#D4AF37]/10 transition-colors">
                              <Plus size={13}/>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Bottom padding for cart bar */}
          <div className="h-28"/>
        </div>
      </div>

      {/* ── Cart bar (Zomato sticky footer) ── */}
      <AnimatePresence>
        {totalItems>0&&(
          <motion.div
            initial={{y:100,opacity:0}} animate={{y:0,opacity:1}} exit={{y:100,opacity:0}}
            transition={{type:'spring',stiffness:300,damping:30}}
            className="absolute bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-2 bg-gradient-to-t from-white via-white/95 to-transparent space-y-2"
          >
            {/* Express toggle */}
            <button onClick={()=>setIsExpress(v=>!v)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all ${
                isExpress
                  ? 'bg-orange-50 border-orange-400 shadow-[0_4px_20px_-4px_rgba(251,146,60,0.3)]'
                  : 'bg-white border-gray-200 hover:border-orange-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isExpress ? 'bg-orange-500' : 'bg-gray-100'}`}>
                  <Zap size={14} className={isExpress ? 'text-white' : 'text-gray-400'} />
                </div>
                <div className="text-left">
                  <p className={`text-sm font-black leading-none ${isExpress ? 'text-orange-600' : 'text-gray-700'}`}>Express Service</p>
                  <p className="text-xs text-gray-400 mt-0.5">Skip the queue — walk in within 15 min</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-black ${isExpress ? 'text-orange-500' : 'text-gray-400'}`}>+₹{salonConfig.expressServiceFee}</span>
                <div className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-all ${isExpress ? 'bg-orange-500' : 'bg-gray-200'}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${isExpress ? 'translate-x-4' : ''}`}/>
                </div>
              </div>
            </button>

            {/* Main CTA */}
            <button onClick={()=>{
              if (isExpress) {
                const now = new Date();
                const start = new Date(now.getTime() + 15*60*1000);
                const end   = new Date(start.getTime() + totalMins*60*1000);
                const fmt = (d: Date) => { const h=d.getHours(),m=d.getMinutes(); return `${h>12?h-12:h||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; };
                setSelDate(now);
                setSelSlot({ label:`${fmt(start)} – ${fmt(end)} (Express)`, startISO:start.toISOString(), endISO:end.toISOString(), available:1, session: start.getHours()<12?'morning':start.getHours()<17?'afternoon':'evening' });
                setScreen('details');
              } else {
                setScreen('slots');
              }
            }}
              className="w-full flex items-center justify-between px-5 py-4 bg-gray-900 rounded-2xl shadow-[0_8px_30px_-8px_rgba(0,0,0,0.4)] hover:bg-gray-800 transition-all">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isExpress ? 'bg-orange-500' : 'bg-[#D4AF37]'}`}>
                  {isExpress ? <Zap size={16} className="text-white"/> : <span className="text-black font-black text-sm">{totalItems}</span>}
                </div>
                <div className="text-left">
                  <p className="text-white font-bold text-sm leading-none">
                    {isExpress ? 'Book Express' : `${totalItems} service${totalItems!==1?'s':''} added`}
                  </p>
                  <p className="text-gray-400 text-[11px] mt-0.5">
                    {isExpress ? 'Walk in within 15 min — priority service' : cart.map(i=>i.service.name.split(':')[0].trim()).join(', ').slice(0,32)+(cart.map(i=>i.service.name).join(', ').length>32?'…':'')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-black text-base ${isExpress ? 'text-orange-400' : 'text-[#D4AF37]'}`}>₹{totalAmount.toLocaleString('en-IN')}</span>
                <div className="flex items-center gap-1 text-white text-sm font-bold">
                  Next <ArrowRight size={16}/>
                </div>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
