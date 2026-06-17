import { getDoc, setDoc, doc } from 'firebase/firestore';
import { db } from './firebase';

export interface SalonConfig {
  staffCount:       number;
  openHour:         number;
  closeHour:        number;
  slotStepMins:     number;
  bufferMins:       number;
  expressServiceFee: number;
}

export const DEFAULT_SALON_CONFIG: SalonConfig = {
  staffCount:       3,
  openHour:         10,
  closeHour:        22,
  slotStepMins:     15,
  bufferMins:       30,
  expressServiceFee: 499,
};

const DOC = () => doc(db, 'settings', 'salon');

export async function fetchSalonConfig(): Promise<SalonConfig> {
  const snap = await getDoc(DOC());
  if (!snap.exists()) return { ...DEFAULT_SALON_CONFIG };
  const d = snap.data();
  return {
    staffCount:       d.staffCount       ?? DEFAULT_SALON_CONFIG.staffCount,
    openHour:         d.openHour         ?? DEFAULT_SALON_CONFIG.openHour,
    closeHour:        d.closeHour        ?? DEFAULT_SALON_CONFIG.closeHour,
    slotStepMins:     d.slotStepMins     ?? DEFAULT_SALON_CONFIG.slotStepMins,
    bufferMins:       d.bufferMins       ?? DEFAULT_SALON_CONFIG.bufferMins,
    expressServiceFee: d.expressServiceFee ?? DEFAULT_SALON_CONFIG.expressServiceFee,
  };
}

export async function saveSalonConfig(cfg: SalonConfig): Promise<void> {
  await setDoc(DOC(), cfg, { merge: true });
}
