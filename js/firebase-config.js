  // Firebase SDKの設定情報
  const firebaseConfig = {
    apiKey: "AIzaSyCsesB7w6HFfkXXab8m5h5TLUK-wICXzP8",
    authDomain: "chofusai-possystem.firebaseapp.com",
    projectId: "chofusai-possystem",
    storageBucket: "chofusai-possystem.firebasestorage.app",
    messagingSenderId: "793708290435",
    appId: "1:793708290435:web:33525fe27c63b753bf16b6"
  };

  // Firebaseを初期化
  firebaseConfig.initializeApp(firebaseConfig);
  const db = firebase.firestore(); //Firestoreインスタンスを取得