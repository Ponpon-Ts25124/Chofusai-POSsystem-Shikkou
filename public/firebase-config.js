// この部分をFirebaseコンソールからコピーした自分のプロジェクトのコードに置き換えてください
const firebaseConfig = {
  apiKey: "AIzaSyCsesB7w6HFfkXXab8m5h5TLUK-wICXzP8",
  authDomain: "chofusai-possystem.firebaseapp.com",
  projectId: "chofusai-possystem",
  storageBucket: "chofusai-possystem.firebasestorage.app",
  messagingSenderId: "793708290435",
  appId: "1:793708290435:web:3a1452aa8dba2bf2bf16b6"
};

// Firebaseを初期化
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();