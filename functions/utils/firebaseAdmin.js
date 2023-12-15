const admin = require('firebase-admin');
const serviceAccount = require('./pdosloveni-firebase-adminsdk-3csez-1541c582f9.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://pdosloveni.firebaseio.com'
});

const db = admin.firestore();

module.exports = db;
