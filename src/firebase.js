import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAvzNLRcwgSj2-CKCWr-7_4bJZX-qiR2zw",
  authDomain: "coupleconnect-a6c1d.firebaseapp.com",
  projectId: "coupleconnect-a6c1d",
  storageBucket: "coupleconnect-a6c1d.firebasestorage.app",
  messagingSenderId: "480630684110",
  appId: "1:480630684110:web:ce8fef2ade64b3bf0cd39f",
  measurementId: "G-32TVJYZWKZ"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

isSupported()
  .then((supported) => {
    if (supported) getAnalytics(firebaseApp);
  })
  .catch(() => {});
