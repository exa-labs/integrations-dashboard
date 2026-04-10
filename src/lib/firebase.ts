import * as admin from "firebase-admin";

let firebaseApp: admin.app.App | null = null;

export function getFirebaseApp(): admin.app.App | null {
  if (firebaseApp) return firebaseApp;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    console.warn("[Firebase] FIREBASE_SERVICE_ACCOUNT not configured");
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);

    if (admin.apps.length > 0) {
      firebaseApp = admin.apps[0] ?? null;
      return firebaseApp;
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log(
      "[Firebase] Initialized for project:",
      serviceAccount.project_id,
    );
    return firebaseApp;
  } catch (error) {
    console.error("[Firebase] Failed to initialize:", error);
    return null;
  }
}

export function getFirestore(): admin.firestore.Firestore | null {
  const app = getFirebaseApp();
  return app ? admin.firestore(app) : null;
}
