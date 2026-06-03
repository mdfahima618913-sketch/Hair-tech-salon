import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from './firebase';

export async function testConnection() {
  try {
    // Testing connection to a dummy path that likely doesn't exist but triggers the logic
    await getDocFromServer(doc(db, 'system', 'connection-test'));
    console.log("Firebase connection successful.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    } else {
      // It's normal if it fails with 'permission-denied' because we haven't configured the system collection,
      // as long as it reaches the server it's "connected" in terms of network.
      console.log("Firebase connection test performed.");
    }
  }
}
