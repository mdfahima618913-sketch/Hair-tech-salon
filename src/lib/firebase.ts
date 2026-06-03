import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  doc, 
  getDocFromServer, 
  collection, 
  getDocs, 
  writeBatch, 
  getDoc, 
  setDoc 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Using initializeFirestore with experimentalForceLongPolling can help in restricted network environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Test connection as per integration guidelines
const testConnection = async () => {
  try {
    // Try to reach the server directly using a public document
    await getDocFromServer(doc(db, 'website_config', 'main'));
    console.log("Firestore connection test successful.");
  } catch (error: any) {
    console.error("Firestore connection test failed:", error);
    if (error.code === 'unavailable') {
      console.warn("Firestore backend is unreachable. This may be a temporary network issue or a configuration mismatch.");
    }
  }
};
testConnection();

// Seed Services Helper
import { servicesData } from '../constants/services';

export const seedServicesIfEmpty = async () => {
  try {
    const servicesRef = collection(db, 'services');
    const snapshot = await getDocs(servicesRef);
    const existingDocs = snapshot.docs;
    
    const batch = writeBatch(db);
    let operationCount = 0;

    // 1. Ensure all servicesData are in the DB with correct IDs
    servicesData.forEach(service => {
      const docRef = doc(servicesRef, service.id);
      batch.set(docRef, {
        ...service,
        active: true,
        updatedAt: new Date()
      }, { merge: true });
      operationCount++;
    });

    // 2. Find and remove duplicates (different ID for same name) or old combo services
    const serviceNames = new Set(servicesData.map(s => s.name));
    const knownIds = new Set(servicesData.map(s => s.id));

    existingDocs.forEach(d => {
      const data = d.data();
      
      // Case A: Duplicate name but different ID (likely old auto-gen ID or different prefix)
      if (serviceNames.has(data.name) && !knownIds.has(d.id)) {
        batch.delete(d.ref);
        operationCount++;
      } else if (!knownIds.has(d.id)) {
        // Case B: Old combo services - If it's in Combos category but not in our list, remove it
        if (data.category === 'Combos' || d.id.startsWith('cb-')) {
          batch.delete(d.ref);
          operationCount++;
        }
      }
    });

    if (operationCount > 0) {
      await batch.commit();
      console.log("Services synchronized and deduplicated successfully!");
    } else {
      console.log("Services already synchronized.");
    }

    // Seed Website Config
    const configRef = doc(db, 'website_config', 'main');
    const configSnap = await getDoc(configRef);
    if (!configSnap.exists()) {
      await setDoc(configRef, {
        heroHeadline: "Precision Styling for the Modern Individual.",
        heroSubline: "Experience the ultimate grooming at Araria's premier unisex salon.",
        contactPhone: "+91 87896 03343",
        contactAddress: "Near Bus Stand, Araria, Bihar",
        promoActive: false,
        promoText: "Welcome to Hair Tech Unisex Salon!"
      });
    }

    // Seed Admin
    const adminEmail = 'mdfahima618913@gmail.com';
    const adminRef = doc(db, 'admins', adminEmail);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) {
      await setDoc(adminRef, {
        email: adminEmail,
        role: 'super-admin',
        addedAt: new Date().toISOString()
      });
    }
  } catch (error) {
    // Only log if it's not a permission error, or log as info for debugging
    console.info("Seeding skipped correctly or failed due to missing permissions (expected for non-admins).");
  }
};
