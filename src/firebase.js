import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB03xYU6iyg-y8JjQdJHxv4qwQc3_20x0E",
    authDomain: "notes-app-33f99.firebaseapp.com",
    projectId: "notes-app-33f99",
    storageBucket: "notes-app-33f99.firebasestorage.app",
    messagingSenderId: "48692428369",
    appId: "1:48692428369:web:5f9abeab4bb8e1fc1c8270", // This is important for the path in your rules
    // measurementId: "G-XXXXXXXXXX" // If you enabled Analytics
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db }; 