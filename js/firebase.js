import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBwlJajNKlv7kTLAQjNJQcRcv0kAnne21g",
  authDomain: "fitch-6393c.firebaseapp.com",
  projectId: "fitch-6393c",
  storageBucket: "fitch-6393c.firebasestorage.app",
  messagingSenderId: "534101206246",
  appId: "1:534101206246:web:fcd25490c6f7acb901c727",
  measurementId: "G-Y1CF6T9WTY"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
