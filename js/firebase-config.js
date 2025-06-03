  // Firebase SDKの設定情報
		console.log("firebase-config.js: File loaded and script started.");
    
    const firebaseConfig = {
    apiKey: "AIzaSyCsesB7w6HFfkXXab8m5h5TLUK-wICXzP8",
    authDomain: "chofusai-possystem.firebaseapp.com",
    projectId: "chofusai-possystem",
    storageBucket: "chofusai-possystem.firebasestorage.app",
    messagingSenderId: "793708290435",
    appId: "1:793708290435:web:33525fe27c63b753bf16b6"
  };

  // Firebaseを初期化
  if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
  }
  const db = firebase.firestore();
  const auth = firebase.auth(); // authもここで定義しておくと他で使いやすい

	if (typeof db !== 'undefined') {
    console.log("firebase-config.js: Firestore 'db' instance created successfully.");
} else {
    console.error("firebase-config.js: Firestore 'db' instance creation FAILED.");
}
if (typeof auth !== 'undefined') {
    console.log("firebase-config.js: Firebase 'auth' instance created successfully.");
} else {
    console.error("firebase-config.js: Firebase 'auth' instance creation FAILED.");
}