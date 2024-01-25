<template>
  <div id="app">
    <div class="title"><img src="./assets/title.png"></div>
    <div style="color: red">{{ message }}</div>

    <!-- 入室済の場合、部屋の情報を表示 -->
    <header v-if="isJoined">
      <div>Room：{{ roomName }} ID：{{ roomId }}{{ roomPass == "" ? "" : " Pass：" + roomPass }}</div>
    </header>

    <!-- 未入室の場合 -->
    <div v-else>
      <!-- ニックネーム -->
      <div id="inputName">
        <label>ニックネーム</label>
        <input v-model="userName" class="userName textbox" type="text" />
      </div>
      <!-- 部屋 -->
      <div class="container" id="lobby">
        <!-- 作成 -->
        <div class="box">
          <input type="radio" v-model="selectedMenuType" id="createRoomMenu" value="createRoomMenu"
            @click="checkRadioStatus('createRoomMenu')" />
          <label class="btn roomMenu" for="createRoomMenu">部屋を作る</label>
          <div id="creatRoomMenu" v-if="(selectedMenuType == 'createRoomMenu')">
            <h3>ルーム名</h3> <input v-model="roomName" class="roomName textbox" type="text"><br>
            <h3>ルームパス</h3> <input v-model="roomPass" class="roomPass textbox" type="text">
            <input type="button" class="btn" id="randomBtn" value="ランダム" @click="roomPass = createRandomCode(6)"><br>
            <input class="btn" type="button" value="作成" @click="createRoom" />
          </div>
        </div>
        <!-- 入室 -->
        <div class="box">
          <input type="radio" v-model="selectedMenuType" id="enterRoomMenu" value="enterRoomMenu"
            @click="checkRadioStatus('enterRoomMenu')" />
          <label class="btn roomMenu" for="enterRoomMenu">部屋に入る</label>
          <div id="enterRoomMenu" v-if="(selectedMenuType == 'enterRoomMenu')">
            <h3>ルームID</h3> <input v-model="roomId" class="roomId textbox" type="text" /> <br>
            <h3>ルームパス</h3> <input v-model="roomPass" class="roomPass textbox" type="text" /> <br>
            <input class="btn" type="button" value="入室" @click="enterRoom" />
          </div>
        </div>
      </div>
    </div>

    <!-- 部屋 -->
    <div v-if="isJoined == 1 && inProgress == 0" class="container roomContainer">
      <!-- 戻る -->
      <div>
        <input class="btn leave" type="button" value="Leave" @click="reload()" />
      </div>
      <!-- ユーザー一覧 -->
      <div class="room">
        <h1>プレイヤー</h1>
        <ul class="players">
          <!-- isThemeがtrueの場合、classにselectedを追加 -->
          <li v-for="(user, userIndex) in users" :key="userIndex" :class="{ selectedTheme: isTheme[userIndex] }">
            {{ user }}
          </li>
        </ul>
      </div>
      <!-- ゲームモード -->
      <div class="room">
        <h1>ゲームモード</h1>
        <div class="gameModeContainer">
          <input class="gameModeBtn btn" type="button" value="AI" />
          <div class="inputs">
            <label>テーマ</label><input v-model="theme" class="textbox mode" type="text" maxlength="10" /><br>
            <!-- <label>レベル</label><input v-model="level" class="textbox mode" type="text" maxlength="10" /> -->
          </div>
        </div>
      </div>
      <!-- スタートボタン -->
      <div>
        <input class="btn start" type="button" value="決定" @click="startGame" />
      </div>
    </div>
    <!-- クイズ作成中 -->
    <div class="generating" v-if="inProgress == 1">
      <img class="gif" src="./assets/loading.gif">
      <h1>生成中...</h1>
    </div>
    <!-- ゲーム -->
    <div id="quiz" v-if="inProgress == 2">
      <div v-show="isGameOver" class="result">
        <!-- 正誤 回答締め切り後に表示 -->
        <h3 id="result">""</h3>
      </div>
      <!-- 問題文・タイマー -->
      <div class="quizTop">
        <div class="question">{{ question }}</div>
        <div id="countdown"></div>
      </div>
      <!-- 選択肢 -->
      <div class="choices">
        <div class="choice" v-for="(choice, index) in choices" :key="(index + 1)">
          <input type="radio" :value="(index + 1)" v-model="answer" :id="(index + 1)" />
          <label class="choice" :for="(index + 1)">
            <div class="choiceText"> {{ choice.text }} </div>
            <div class="choiceVotes">{{ votes[index] }}</div>
          </label>
        </div>
      </div>
      <!-- 回答ボタン -->
      <input v-show="!isGameOver" class="btn answer" type="button" value="回答" @click="answerQuestion" />
      <!-- 結果 -->
      <div v-show="isGameOver" class="result">
        <!-- 解説 -->
        <div id="explanation">{{ explanation }}</div>
        <!-- 次の問題へ -->
        <input class="btn" type="button" value="次へ" @click="next" />
        <div> {{ nextUsers }} / {{ users.length }}</div>
      </div>
    </div>

    <!-- 最終結果-->
    <div v-if="inProgress == 3">
      <!-- トップページに戻る -->
      <input class="btn" type="button" value="トップページに戻る" @click="reload();" />
      <!-- 結果一覧 -->
      <div v-for="(res) in gameResult" :key="res">
        {{ (res.result == 1) ? "○" : "×" }}
      </div>
      <div v-for="(res, indexRes) in gameResult" :key="indexRes">
        <div>問題: {{ res.quiz.question }}</div>
        <div>選択肢:
          <div v-for="(choice, num) in res.quiz.choices" :key="num">
            {{ res.votes[num] + "票 " + (num + 1) + "." + choice.text }}
          </div>
        </div>
        <div>正解: {{ (res.quiz.correctAnswer + 1) }}</div>
        <div>解説: {{ res.quiz.explanation }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import io from "socket.io-client";


export default {
  name: "App",
  data: () => ({
    userName: "",
    isJoined: false,
    selectedMenuType: null,
    message: "",
    roomId: "",
    roomName: "",
    roomPass: "",
    users: [],
    theme: "",
    isTheme: [],
    question: "",
    choices: [],
    answer: -1,
    votes: [0, 0, 0, 0],
    correctAnswer: -1,
    explanation: "",
    nextUsers: 0,
    gameResult: [],
    inProgress: 0, // 0: 未開始, 1: 開始, 2: クイズ中
    isGameOver: false,
    socket: io("http://localhost:3031"),
  }),


  // サーバーからのイベントを受け取る
  created() {
    this.socket.on("connect", () => {
      console.log("connected");
    });
  },

  mounted() {
    this.socket.on("createRoom", (room) => {
      this.isJoined = true;
      this.roomId = room.id;
      this.roomName = room.roomName;
      this.roomPass = room.pass;
      this.message = "";
      this.users = room.users.map((u) => u.name);
    });

    this.socket.on("joinRoom", (roomName, users, isThemeState) => {
      this.roomName = roomName;
      this.isJoined = true;
      this.users = users;
      this.isTheme = isThemeState;
    });

    this.socket.on("start", () => {
      this.inProgress = 1;
    });

    this.socket.on("updateQuiz", (question, choices) => {
      this.question = question;
      this.choices = choices;
      this.answer = -1;
      this.votes = [0, 0, 0, 0];
      this.inProgress = 2;
      this.isGameOver = false;
    });

    this.socket.on("nextUsers", (nextUsers) => {
      this.nextUsers = nextUsers;
    });

    this.socket.on("next", () => {
      this.message = "";
      this.nextUsers = 0;
      //correct classのリセット
      console.log(this.correctAnswer);
      document.getElementById(this.correctAnswer).nextElementSibling.classList.remove("correct");
    });

    this.socket.on("notify", (message) => {
      this.message = message;
      if (message == "クイズの生成に失敗しました。もう一度お試しください。") {
        this.inProgress = 0;
      }
    });



    this.socket.on("quizResult", (result, explanation, correctAnswer) => {
      this.isGameOver = true;
      this.explanation = explanation;
      this.correctAnswer = correctAnswer;
      // 正解の選択肢にcorrect classを付与
      document.getElementById(correctAnswer).nextElementSibling.classList.add("correct");
      // 結果表示
      switch (result) {
        case 0:
          document.getElementById("result").textContent = " ";
          break;
        case -1:
          document.getElementById("result").textContent = "✕";
          break;
        default:
          document.getElementById("result").textContent = "◯";
          break;
      }
    });

    this.socket.on("countdown", (countdown) => {
      document.getElementById("countdown").textContent = `${countdown}`;
    });

    this.socket.on("votes", (votes) => {
      this.votes = votes;
    });

    this.socket.on("finish", (res) => {
      this.inProgress = 3;
      this.gameResult = res;
    });
  },

  methods: {
    // Room
    checkRadioStatus(type) {
      if (this.selectedMenuType == type) {
        this.selectedMenuType = null;
      } else {
        this.roomPass = "";
      }
    },

    createRoom() {
      this.socket.emit("create", this.roomName, this.roomPass, this.userName);
      this.message = "";
    },

    enterRoom() {
      this.socket.emit("enter", this.roomId, this.roomPass, this.userName);
      console.log("enter", this.roomId, this.roomPass, this.userName);
      this.message = "";
    },

    createRandomCode(len) {
      var l = len;           // 生成する文字列の長さ
      var c = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ012345679"; // 生成する文字列に含める文字セット
      var r = "";
      for (var i = 0; i < l; i++) {
        r += c[Math.floor(Math.random() * c.length)];
      }
      return r;
    },

    // Quiz
    startGame() {
      this.message = "";
      this.socket.emit("start", this.theme, this.level);
    },

    answerQuestion() {
      this.message = "";
      this.socket.emit("answer", this.answer);
    },

    showResult() {
      this.message = "";
      this.isGameOver = true;
    },

    next() {
      this.socket.emit("next");
    },

    reload() {
      location.reload();
    },
  },
};
</script>

<style>
* {
  font-family: 'Sawarabi Gothic', sans-serif;
}

header {
  font-weight: bold;
  text-align: center;
  margin-bottom: 10px;
  font-size: 1.3em;
  color: #FF6B6B;
}

body {
  background-image: url("./assets/menu.png");
}

/* 背景 */

/* タイトル */
.title {
  text-align: center;
}

p {
  padding-top: 10px;
  font-size: 15px;
}

h1 {
  margin-top: 2px;
}

h3 {
  font-size: 1.6em;
}

.box {
  display: inline-table;
  flex: 1;
  padding: 20px 50px 20px 50px;
  line-height: 10px;
  border: 2px solid black;
  margin: 1%;
  text-align: center;
  width: 300px;
  height: 300px;
  background: rgb(255 255 255 / 75%);
}

.container {
  text-align: center;
  padding-top: 10px;
}

.roomContainer {
  margin-right: 7vw;
  margin-left: 7vw;
  padding: 30px 0px 30px 0px;
  background: rgb(255 255 255 / 75%);
}

.gameModeContainer {
  display: flex;
}

/* ボタン全般 */
.btn {
  border: none;
  border-radius: 3px;
  display: flex;
  justify-content: space-around;
  margin: 0 auto;
  max-width: 220px;
  padding: 10px 25px;
  color: #FFF;
  font-weight: 600;
  background: rgba(107, 182, 255, 1);
}

/* ランダムボタン */
#randomBtn {
  margin-left: 10px;
  margin-bottom: 20px;
  display: inline-block;
  padding: 5px;
  line-height: 1;
}

/* 作成 */
#create {
  margin-top: 10px;
}


/* 戻るボタン */
.leave {
  margin-left: 7vw;
  font-weight: bold;
}

/* ゲームモード選択ボタン */
.gameModeBtn {
  font-size: 2em;
  background: dimgray;
  margin-right: 6px;
  width: 150px;
}

/* スタートボタン */
.start {
  margin-top: 30px;
  margin-right: 7vw;
  font-weight: bold;
  font-size: 24px;
  padding: 24px 73px;
}

.roomMenu {
  background-color: gray;
  user-select: none;
}

/* 文字入力欄 */
input[type=text] {
  margin-bottom: 10px;
}

.textbox {
  width: 30%;
  border: 1px solid #969da3;
  border-radius: 3px;
  color: #333;
  font-size: 1em;
  line-height: 1.5;
}

/* 名前入力 */
#inputName {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
  text-align: center;
}

#inputName>label {
  font-weight: bold;
  margin-right: 10px;
}

.userName {
  margin: 0 auto;
  text-align: center;
}

.roomPass,
.roomName,
.roomId {
  width: 50%;
}

.mode {
  width: 100% !important;
}

/* radioの見た目を消す（labelだけ表示） */
input[type=radio] {
  display: none;
}

/* 選択されたradioのlabel */
input[type="radio"]:checked+label {
  background: rgba(3, 88, 172, 0.815);
}

.generating {
  text-align: center;
  margin-top: 10%;
}

/* 部屋 */
.room {
  display: inline-flex;
  flex-direction: column;
  margin: 0px 8vw 0px 8vw;
}

/* プレイヤーリスト */
.players {
  list-style: none;
  padding: 0;
  margin: 0;
  text-align: left;
}

.players>li {
  margin: 0px 0px 10px 0px;
  padding: 2px 0px 2px 10px;
  font-size: 1.1em;
  font-weight: bold;
  background: #429cefcc;
  color: white;
  border-radius: 15px;
}
.selectedTheme{
  background: #FF6B6B !important;
}

.inputs {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

img {
  user-select: none;
  -webkit-user-drag: none;
}

/* クイズ */
#quiz {
  font-size: 1.4em;
}

/* カウントダウン */
#countdown {
  margin-left: 10px;
  display: inline-block;
  border-radius: 50%;
  width: 1.8em;
  height: 1.8em;
  background-color: #629feb;
  border: none;
  font-family: sans-serif;
  text-align: center;
  line-height: 2em;
  font-size: 2em;
  color: #fff;
  font-weight: bold;
}

/* 問題文,、解説文 */
.question,
#explanation {
  padding: 30px 20px 30px 20px;
  border: 2px solid #55ABFA;
  border-radius: 3px;
  text-align: center;
  overflow-wrap: anywhere;
  width: 80%;
}

.question {
  background: #DCEEFE;
  font-size: 1.2em;
  font-weight: bold;
}

#explanation {
  margin: 0 auto;
  margin-bottom: 2%;
  padding: 20px 20px 20px 20px;
  margin-top: 2%;
  font-size: 0.75em;
  background-color: white;
}

.quizTop {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}

/* 結果文字 */
#reslut {
  font-size: 2em;
  text-align: center;
}

/* 選択肢の親 */
.choices {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: 1.3%;
}

/* クイズの選択肢 */
label.choice {
  padding-left: 2vw;
  width: 32vw;
  display: flex;
  border: 2px solid rgba(107, 182, 255, 1);
  border-radius: 3px;
  position: relative;
  margin: 1vw 1vw 1vw 1vw;
  height: 114px;
  padding: 10px 25px;
  color: #000;
  background: rgb(255, 255, 255);
  flex-direction: column;
  justify-content: center;
  flex-wrap: wrap;
  align-content: space-between;
}

input[type="radio"]:checked+label.choice {
  background: #b5dbff;
}

/* 正解の選択肢 */
.correct {
  background: #FEFFB8 !important;
}

.choiceText {
  padding-left: 2vw;
  font-size: 1.3em;
  margin: 0 auto;
}

/* 選択肢の票数 */
.choiceVotes {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 30px;
  height: 30px;
  color: #FFF;
  background-color: rgba(107, 182, 255, 1);
  text-align: center;
  line-height: 30px;
  font-weight: bold;
}

/* 結果 */
#result {
  font-size: 2em;
  text-align: center;
  margin: 0 auto;
}
</style>