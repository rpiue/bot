const { initializeApp } = require("firebase/app");
const { getFirestore, collection, query, where, getDocs } = require("firebase/firestore/lite");

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAImehLPFTGMupcVxuzNNyWkrkkB6utx34",
  authDomain: "apppagos-1ec3f.firebaseapp.com",
  projectId: "apppagos-1ec3f",
  storageBucket: "apppagos-1ec3f.appspot.com",
  messagingSenderId: "296133590526",
  appId: "1:296133590526:web:a47a8e69d5e9bfa26bd4af",
  measurementId: "G-5QZSJN2S1Z",
};

// Inicializar Firebase y Firestore
const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);

// Variable global para almacenar los emails
let emailCache = [];

// Función para obtener emails desde Firestore
const fetchEmailsFromFirestore = async () => {
  try {
    const usuariosRef = collection(db, "usuarios");
    const q = query(usuariosRef, where("plan", "!=", "Sin Plan"));
    const querySnapshot = await getDocs(q);

    const emails = [];
    querySnapshot.forEach(doc => {
      emails.push(doc.data().email);
    });

    emailCache = emails; // Actualiza la variable global
    console.log("Emails actualizados en la caché.");
    return emailCache;
  } catch (error) {
    console.error("Error al obtener los datos de Firestore: ", error);
    return [];
  }
};

// Función para buscar un email en la caché
const findEmailInCache = (email) => {
  return emailCache.includes(email);
};

// Exportar funciones
module.exports = {
  fetchEmailsFromFirestore,
  findEmailInCache,
  getCachedEmails: () => emailCache,
};
