/**
 * notificationSound.ts
 * Shared Web Audio "ring" used to alert staff/admin about new bookings.
 * Two variants:
 *  - playNotificationSound()        — urgent alarm buzzer (paid/confirmed bookings)
 *  - playPendingNotificationSound() — gentle ding-dong chime (pending bookings)
 * startRinging()/stopRinging() loop one of these until explicitly stopped.
 */

export interface RingableBooking {
  id: string;
  customerName?: string;
  serviceNames?: string;
  bookingTime?: string;
  totalAmount?: number;
  status?: string;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied')  return 'denied';
  return Notification.requestPermission();
}

// Lazily created and reused — creating AudioContext on every notification
// can be blocked by browsers if the context limit is reached.
let _audioCtx: AudioContext | null = null;
let _stopSound: (() => void) | null = null; // allows early cutoff if needed

function getAudioContext(): AudioContext {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext();
  }
  return _audioCtx;
}

// Warm up the AudioContext on a user gesture so it's never suspended
// when a real notification arrives later.
export function warmUpAudio() {
  try { getAudioContext().resume(); } catch {}
}

/**
 * Vibrant 3-second notification ring built entirely from Web Audio API.
 * Urgent repeating BEEP-BEEP pulse pattern (alarm-register frequencies).
 */
export function playNotificationSound() {
  if (_stopSound) { _stopSound(); _stopSound = null; }

  try {
    const ctx = getAudioContext();

    const run = () => {
      const now      = ctx.currentTime;
      const DURATION = 3.0;
      const nodes: AudioNode[] = [];

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.001, now);
      master.gain.linearRampToValueAtTime(1.0, now + 0.02);
      master.gain.setValueAtTime(1.0, now + DURATION - 0.08);
      master.gain.linearRampToValueAtTime(0.001, now + DURATION);
      master.connect(ctx.destination);
      nodes.push(master);

      const BEEP_FREQ_HI = 1480;  // Eb6 — alarm-register frequency
      const BEEP_FREQ_LO = 740;   // Eb5 — one octave below for body
      const BEEP_ON      = 0.18;  // each beep lasts 180ms
      const BEEP_GAP     = 0.09;  // gap between the two beeps in a pair
      const PAIR_GAP     = 0.38;  // silence between pairs
      const PAIR_STEP    = BEEP_ON + BEEP_GAP + BEEP_ON + PAIR_GAP; // ~0.85s per pair

      for (let pair = 0; pair < 4; pair++) {
        const pairStart = now + pair * PAIR_STEP;
        if (pairStart >= now + DURATION) break;

        for (let b = 0; b < 2; b++) {
          const bStart = pairStart + b * (BEEP_ON + BEEP_GAP);
          const bEnd   = bStart + BEEP_ON;
          if (bEnd > now + DURATION) break;

          const oscHi  = ctx.createOscillator();
          const gainHi = ctx.createGain();
          oscHi.type = 'square';
          oscHi.frequency.setValueAtTime(BEEP_FREQ_HI, bStart);
          oscHi.frequency.linearRampToValueAtTime(BEEP_FREQ_HI * 1.04, bEnd);

          gainHi.gain.setValueAtTime(0.001, bStart);
          gainHi.gain.linearRampToValueAtTime(0.55, bStart + 0.005);
          gainHi.gain.setValueAtTime(0.55,          bEnd   - 0.01);
          gainHi.gain.linearRampToValueAtTime(0.001, bEnd);

          oscHi.connect(gainHi); gainHi.connect(master);
          oscHi.start(bStart); oscHi.stop(bEnd + 0.01);
          nodes.push(oscHi, gainHi);

          const oscLo  = ctx.createOscillator();
          const gainLo = ctx.createGain();
          oscLo.type = 'triangle';
          oscLo.frequency.setValueAtTime(BEEP_FREQ_LO, bStart);
          oscLo.frequency.linearRampToValueAtTime(BEEP_FREQ_LO * 1.04, bEnd);

          gainLo.gain.setValueAtTime(0.001, bStart);
          gainLo.gain.linearRampToValueAtTime(0.35, bStart + 0.005);
          gainLo.gain.setValueAtTime(0.35,          bEnd   - 0.01);
          gainLo.gain.linearRampToValueAtTime(0.001, bEnd);

          oscLo.connect(gainLo); gainLo.connect(master);
          oscLo.start(bStart); oscLo.stop(bEnd + 0.01);
          nodes.push(oscLo, gainLo);

          // Sub-punch — short bass thump for physical weight
          const subOsc  = ctx.createOscillator();
          const subGain = ctx.createGain();
          subOsc.type = 'sine';
          subOsc.frequency.setValueAtTime(120, bStart);
          subOsc.frequency.exponentialRampToValueAtTime(60, bStart + 0.06);
          subGain.gain.setValueAtTime(0.001, bStart);
          subGain.gain.linearRampToValueAtTime(0.7,  bStart + 0.005);
          subGain.gain.exponentialRampToValueAtTime(0.001, bStart + 0.08);
          subOsc.connect(subGain); subGain.connect(master);
          subOsc.start(bStart); subOsc.stop(bStart + 0.1);
          nodes.push(subOsc, subGain);
        }
      }

      _stopSound = () => {
        try {
          master.gain.cancelScheduledValues(ctx.currentTime);
          master.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.04);
        } catch {}
      };
      setTimeout(() => { _stopSound = null; }, DURATION * 1000 + 200);
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(run).catch(() => console.warn('[NOTIF SOUND] resume failed'));
    } else {
      run();
    }

  } catch (err) {
    console.warn('[NOTIF SOUND]', err);
  }
}

/**
 * Gentle two-tone "ding-dong" chime for new PENDING bookings — distinct from
 * the urgent alarm buzzer used for paid/confirmed bookings.
 */
export function playPendingNotificationSound() {
  if (_stopSound) { _stopSound(); _stopSound = null; }

  try {
    const ctx = getAudioContext();

    const run = () => {
      const now      = ctx.currentTime;
      const DURATION = 2.4;
      const nodes: AudioNode[] = [];

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.001, now);
      master.gain.linearRampToValueAtTime(1.0, now + 0.02);
      master.gain.setValueAtTime(1.0, now + DURATION - 0.08);
      master.gain.linearRampToValueAtTime(0.001, now + DURATION);
      master.connect(ctx.destination);
      nodes.push(master);

      // Two-note "ding-dong" doorbell chime (E6 → C6), repeated twice.
      const NOTE_HI = 1318.5; // E6
      const NOTE_LO = 1046.5; // C6
      const NOTE_ON = 0.35;
      const GAP     = 0.12;
      const CHIME_STEP = NOTE_ON + GAP + NOTE_ON + 0.5; // ~1.32s per ding-dong

      for (let chime = 0; chime < 2; chime++) {
        const chimeStart = now + chime * CHIME_STEP;
        if (chimeStart >= now + DURATION) break;

        ([[NOTE_HI, chimeStart], [NOTE_LO, chimeStart + NOTE_ON + GAP]] as const).forEach(([freq, start]) => {
          const end = start + NOTE_ON;
          const osc  = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.5, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, end);
          osc.connect(gain); gain.connect(master);
          osc.start(start); osc.stop(end + 0.05);
          nodes.push(osc, gain);
        });
      }

      _stopSound = () => {
        try {
          master.gain.cancelScheduledValues(ctx.currentTime);
          master.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.04);
        } catch {}
      };
      setTimeout(() => { _stopSound = null; }, DURATION * 1000 + 200);
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(run).catch(() => console.warn('[NOTIF SOUND] resume failed'));
    } else {
      run();
    }

  } catch (err) {
    console.warn('[NOTIF SOUND]', err);
  }
}

// Plays the ring repeatedly until stopRinging() is called.
// `kind` selects which sound loops — 'pending' uses the gentler ding-dong chime,
// 'confirmed' (default) uses the urgent alarm buzzer.
// Safe to call multiple times — stops previous loop first.
let _ringLoopTimer: ReturnType<typeof setTimeout> | null = null;

export function startRinging(kind: 'confirmed' | 'pending' = 'confirmed') {
  stopRinging(); // clear any existing loop
  const playSound = kind === 'pending' ? playPendingNotificationSound : playNotificationSound;
  const interval  = kind === 'pending' ? 2700 : 3200; // sound duration + gap before repeat
  const loop = () => {
    playSound();
    _ringLoopTimer = setTimeout(loop, interval);
  };
  loop();
}

export function stopRinging() {
  if (_ringLoopTimer) { clearTimeout(_ringLoopTimer); _ringLoopTimer = null; }
  if (_stopSound) { _stopSound(); _stopSound = null; }
}

export function fireDesktopNotification(booking: RingableBooking) {
  // Play sound regardless of notification permission —
  // audio only requires a prior user gesture (clicking the page counts).
  const isPending = booking.status === 'pending';
  if (isPending) playPendingNotificationSound(); else playNotificationSound();

  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const title = isPending
    ? '⏳ New Pending Booking — Review Required'
    : '💇 New Booking — Hair Tech Salon';
  const body  = [
    booking.customerName ?? 'Guest',
    booking.serviceNames ?? '',
    booking.bookingTime  ?? '',
    booking.totalAmount  ? `₹${booking.totalAmount}` : '',
  ].filter(Boolean).join(' · ');
  const n = new Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `booking-${booking.id}`,
  });
  setTimeout(() => n.close(), 8000);
}
