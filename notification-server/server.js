const express = require('express');
const admin = require('firebase-admin');

const app = express();
const port = Number(process.env.PORT || 3001);

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccount) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT env var');
}

if (serviceAccount) {
  try {
    const parsed = JSON.parse(serviceAccount);
    admin.initializeApp({
      credential: admin.credential.cert(parsed),
    });
  } catch (error) {
    console.error('Invalid FIREBASE_SERVICE_ACCOUNT JSON:', error.message);
    process.exit(1);
  }
}

const db = admin.firestore();

app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

app.get('/', (_req, res) => {
  res.status(200).send('Notification server ready');
});

const listenForMessages = () => {
  const conversationsRef = db.collectionGroup('messages');

  conversationsRef.onSnapshot(async (snapshot) => {
    const changes = snapshot.docChanges();

    for (const change of changes) {
      if (change.type !== 'added') continue;

      const message = change.doc.data();
      const senderEmail = message.senderEmail;
      const text = message.text || 'Vous avez reçu un message';
      const conversationId = change.doc.ref.parent.parent?.id || 'private-conversation';

      if (!senderEmail) continue;

      const conversationRef = db.collection('conversations').doc(conversationId);
      const conversationDoc = await conversationRef.get();
      const participants = conversationDoc.data()?.participants || [];
      const recipientEmail = participants.find((email) => email && email.toLowerCase() !== senderEmail.toLowerCase());

      if (!recipientEmail) continue;

      const usersSnapshot = await db.collection('users').where('email', '==', recipientEmail).limit(1).get();
      const recipientDoc = usersSnapshot.docs[0];
      const recipientToken = recipientDoc?.data()?.fcmToken;

      if (!recipientToken) {
        console.log('No FCM token for recipient', recipientEmail);
        continue;
      }

      try {
        await admin.messaging().send({
          token: recipientToken,
          notification: {
            title: 'Nouveau message',
            body: text,
          },
          data: {
            conversationId,
            senderEmail,
            type: 'message',
          },
          android: {
            priority: 'high',
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
              },
            },
          },
        });

        console.log('Notification sent to', recipientEmail);
      } catch (error) {
        console.error('Failed to send notification:', error);
      }
    }
  }, (error) => {
    console.error('Firestore listener error:', error);
  });
};

if (serviceAccount) {
  listenForMessages();
}

app.listen(port, () => {
  console.log(`Notification server running on port ${port}`);
});
