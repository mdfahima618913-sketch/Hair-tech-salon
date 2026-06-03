import { format, addMinutes, isAfter, isBefore, parse, startOfDay, addHours, isToday } from 'date-fns';

export interface TimeSlot {
  time: string; // "HH:mm"
  display: string; // "10:00 AM"
  available: boolean;
  reason?: string;
}

export const BUSINESS_HOURS = {
  open: '10:00',
  close: '20:30',
  interval: 30, // minutes
  buffer: 30, // minutes for same-day bookings
};

/**
 * Generates all possible time slots for a given date based on business hours.
 */
export const generateTimeSlots = (date: Date): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  const [openHour, openMin] = BUSINESS_HOURS.open.split(':').map(Number);
  const [closeHour, closeMin] = BUSINESS_HOURS.close.split(':').map(Number);

  let current = startOfDay(date);
  current = addMinutes(addHours(current, openHour), openMin);
  
  const end = addMinutes(addHours(startOfDay(date), closeHour), closeMin);

  while (isBefore(current, end)) {
    const timeFormatted = format(current, 'HH:mm');
    const displayFormatted = format(current, 'hh:mm a');
    
    slots.push({
      time: timeFormatted,
      display: displayFormatted,
      available: true,
    });

    current = addMinutes(current, BUSINESS_HOURS.interval);
  }

  return slots;
};

/**
 * Filters slots based on current time (if today) and external availability data.
 */
export const filterAndLabelSlots = (
  slots: TimeSlot[],
  date: Date,
  bookings: any[], // confirmed bookings for this date
  lockedSlots: any[], // temporary locks for this date
  blockedSlots: any[], // admin manual blocks for this date
): TimeSlot[] => {
  const now = new Date();
  const bufferTime = addMinutes(now, BUSINESS_HOURS.buffer);

  return slots.map(slot => {
    const slotDateTime = parse(slot.time, 'HH:mm', date);
    
    // 1. Past time check (Today only)
    if (isToday(date) && isBefore(slotDateTime, bufferTime)) {
      return { ...slot, available: false, reason: 'Past or too soon' };
    }

    // 2. Booking check
    const isBooked = bookings.some(b => b.timeSlot === slot.time && b.status === "confirmed");
    if (isBooked) {
      return { ...slot, available: false, reason: 'Already booked' };
    }

    // 3. Lock check (Expired locks should be ignored)
    const isLocked = lockedSlots.some(l => {
      if (!l.expiresAt) return false;
      const expiry = l.expiresAt.toDate ? l.expiresAt.toDate() : new Date(l.expiresAt);
      return l.timeSlot === slot.time && isAfter(expiry, now);
    });
    if (isLocked) {
      return { ...slot, available: false, reason: 'Temporarily locked' };
    }

    // 4. Block check
    const isBlocked = blockedSlots.some(b => b.timeSlot === slot.time);
    if (isBlocked) {
      return { ...slot, available: false, reason: 'Manually blocked' };
    }

    return slot;
  });
};

/**
 * Finds the first available slot from a list.
 */
export const getNextAvailableSlot = (slots: TimeSlot[]): TimeSlot | undefined => {
  return slots.find(s => s.available);
};
