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
  if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
  }
  const db = firebase.firestore();
  const auth = firebase.auth(); // authもここで定義しておくと他で使いやすい

	<!-- queue-display.html -->
	<script src="js/firebase-config.js"></script> <!-- ★これが先 -->
	<script src="js/queue-script.js"></script>    <!-- ★これが後 -->