importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyCh5az0L3WLfEcBtzgDJMaRsIb6cqJ_pHQ",
  authDomain: "yourchat-8caf0.firebaseapp.com",
  projectId: "yourchat-8caf0",
  storageBucket: "yourchat-8caf0.firebasestorage.app",
  messagingSenderId: "883219463448",
  appId: "1:883219463448:web:8773892c26849955e4326d",
  measurementId: "G-3ZMF1TH8K3",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || "Nouveau message";
  const notificationOptions = {
    body: payload.notification?.body || "Vous avez reçu un message.",
    icon: "/icon-192.png",
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
