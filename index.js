const http = require("http").createServer();
const createQuiz = require("./gpt.js");
const xss = require("xss");
const log4js = require("log4js");
log4js.configure("./log-config.json");

const logger = log4js.getLogger();

const io = require("socket.io")(http, {
    cors: {
        origin: ["http://localhost:8080"],
        methods: ["GET", "POST"],
    },
});
const rooms = [];
const users = [];
const countdownDuration = 99;
const questionNum = 5;

io.on("connection", (socket) => {
    logger.addContext("sessionid", socket.id);
    logger.info("Connected to the server.");
    // 部屋を新しく建てる
    socket.on("create", (roomName, roomPass, userName) => {
        roomName = xss(roomName);
        roomPass = xss(roomPass);
        userName = xss(userName);

        if (roomName == "") {
            io.to(socket.id).emit("notify", "ルーム名を入力してください");
            return;
        }
        if (userName == "") {
            io.to(socket.id).emit("notify", "名前を入力してください");
            return;
        }
        const roomId = generateRoomId();
        const user = { id: socket.id, name: userName, roomId, isThemeState: false };
        const room = {
            id: roomId,
            roomName: roomName,
            pass: roomPass,
            users: [user],
            themes: [],     // { user : user, theme : ""}
            quizzes: [],    //{ question: "", choices: [], correctAnswer: "", explanation: "" }
            quizNum: 0,
            results: [],    // { quiz: [], votes: [], result: 0 }
            answerAcceptance: false,
            votedUsers: [],
            countdownTimer: null,
            isCorrect: 0,
            inProgress: false,
        };
        rooms.push(room);
        users.push(user);
        socket.join(roomId);
        logger.addContext("sessionid", user.id);
        logger.addContext("username", user.name)
        logger.info("Created Room (ID:", roomId, ",Name:", roomName, ",Pass:", roomPass, ").");
        io.to(socket.id).emit("createRoom", room, "name:", room.roomName, "pass:", room.pass);
    });

    // 部屋に入室する
    socket.on("enter", (roomId, roomPass, userName) => {
        roomId = xss(roomId);
        roomPass = xss(roomPass);
        userName = xss(userName);

        if (userName == "") {
            io.to(socket.id).emit("notify", "名前を入力してください");
            return;
        }
        var roomIndex = rooms.findIndex((r) => r.id == roomId);
        if (roomIndex == -1) {
            io.to(socket.id).emit("notify", "部屋が見つかりません");
            return;
        }
        if (rooms[roomIndex].pass != roomPass) {
            io.to(socket.id).emit("notify", "パスワードが違います");
            return;
        }
        const user = { id: socket.id, name: userName, roomId, isThemeState: false };
        rooms[roomIndex].users.push(user);
        users.push(user);
        socket.join(rooms[roomIndex].id);

        logger.addContext("sessionid", user.id);
        logger.addContext("username", user.name)
        logger.info("Entered Room", rooms[roomIndex].id, "(", rooms[roomIndex].users.length, ").");

        io.in(rooms[roomIndex].id).emit("joinRoom", rooms[roomIndex].roomName, rooms[roomIndex].users.map((u) => u.name), rooms[roomIndex].users.map((u) => u.isThemeState));
        // ゲーム中の場合はゲームの状況を送信
        if (rooms[roomIndex].inProgress == true) {
            io.to(socket.id).emit("updateQuiz", rooms[roomIndex].quizzes[rooms[roomIndex].quizNum].question, rooms[roomIndex].quizzes[rooms[roomIndex].quizNum].choices);
            io.to(socket.id).emit("votes", getVotes(rooms[roomIndex]));

            // クイズの回答受付終了の場合
            if (rooms[roomIndex].answerAcceptance == false) {
                io.to(socket.id).emit("quizResult", rooms[roomIndex].isCorrect, rooms[roomIndex].quizzes[rooms[roomIndex].quizNum].explanation, (rooms[roomIndex].quizzes[rooms[roomIndex].quizNum].correctAnswer + 1));
            }
        }
    });

    // クイズの作成と出題
    socket.on("start", (theme) => {
        const userTheme = xss(theme);

        const user = users.find((u) => u.id == socket.id);
        const roomIndex = rooms.findIndex((r) => r.id == user.roomId);
        const room = rooms[roomIndex];

        if (room.inProgress == true) {
            return;
        }
        if (room.themes.find((t) => t.user == user)) {
            io.to(socket.id).emit("notify", "既にテーマを入力しています");
            return;
        }
        if (theme == "") {
            io.to(socket.id).emit("notify", "テーマを入力してください");
            return;
        }
        if (theme.length > 10) {
            io.to(socket.id).emit("notify", "テーマは10文字以内で入力してください");
            return;
        }

        rooms[roomIndex].themes.push({ user: user, theme: userTheme });
        user.isThemeState = true;

        if (rooms[roomIndex].themes.length != rooms[roomIndex].users.length) {
            // 全員のテーマが揃うまで待機
            io.in(room.id).emit("joinRoom", room.roomName, room.users.map((u) => u.name), room.users.map((u) => u.isThemeState));
            return;
        } else {
            // クイズの作成と出題
            io.in(room.id).emit("start");
            room.quiz = Quiz(room);
            room.inProgress = true;
        }
    });

    // ユーザーから回答を受け取る
    socket.on("answer", (answer) => {
        answer = xss(answer);
        const user = users.find((u) => u.id == socket.id);
        const roomIndex = rooms.findIndex((r) => r.id == user.roomId);
        const room = rooms[roomIndex];
        // 回答受付中か確認
        if (room.answerAcceptance == false) {
            io.to(socket.id).emit("notify", "回答は締め切りました");
            return;
        }
        // 回答済みか確認
        if (room.votedUsers.find((v) => v.id == user.id)) {
            io.to(socket.id).emit("notify", "回答済みです");
            return;
        }
        if (((answer == '') && (typeof answer == 'string')) || answer < 1 || answer > 4) {
            io.to(socket.id).emit("notify", "選択肢を選んでください");
            return;
        }
        // 回答を保存
        // answerは1~4のため、配列のインデックスに合わせるために-1する
        const vote = { id: user.id, choice: (answer - 1) };
        room.votedUsers.push(vote);
        logger.addContext("sessionid", user.id);
        logger.addContext("username", user.name)
        logger.info("Answer", vote.choice, "at", rooms[roomIndex].id);
        // 回答状況を送信
        io.in(room.id).emit("votes", getVotes(room));
        // 全員が回答したら回答受付を終了
        if (room.votedUsers.length == room.users.length) {
            stopAnswerAcceptance(room);
        }
    });

    // 次の問題へ
    socket.on("next", () => {
        const user = users.find((u) => u.id == socket.id);
        const roomIndex = rooms.findIndex((r) => r.id == user.roomId);
        const room = rooms[roomIndex];

        // Nextを押した人数をカウント
        if (room.votedUsers.find((v) => v.id == user.id)) {

        } else {
            room.votedUsers.push({ id: user.id, choice: -1 });
        }
        io.in(room.id).emit("nextUsers", room.votedUsers.length);


        if (room.votedUsers.length != room.users.length) {
            return;
        }

        room.votedUsers.length = 0;
        //全員がNextを押したら次の問題へ
        // 回答受付中の場合
        if (room.answerAcceptance == true) {
            return;
        } else {
            // 最終問題の場合
            if (room.quizNum == (questionNum - 1)) {
                io.in(room.id).emit("finish", room.results);
                room.answerAcceptance = false;
                return;
            }
            // 次の問題へ
            logger.addContext("sessionid", user.id);
            logger.addContext("username", user.name)
            logger.info("Moving to the next quiz Room", room.id);
            room.answerAcceptance = true;
            room.quizNum++;
            io.in(room.id).emit("next");
            io.in(room.id).emit("updateQuiz", room.quizzes[room.quizNum].question, room.quizzes[room.quizNum].choices);
            // カウントダウン
            countdown(room, countdownDuration);
        }
    });

    // 接続が切れた場合
    socket.on("disconnect", () => {
        const user = users.find((u) => u.id == socket.id);
        if (!user) {
            // userデータがないときは未入室なので何もせず終了
            return;
        }
        logger.addContext("sessionid", user.id);
        logger.info("Disconnected from the server.");

        const roomIndex = rooms.findIndex((r) => r.id == user.roomId);
        const room = rooms[roomIndex];
        const userIndex = room.users.findIndex((u) => u.id == socket.id);

        // テーマ入力済みの場合は削除
        room.themes.forEach((theme) => {
            if (theme.user == user) {
                room.themes.splice(room.themes.findIndex((t) => t.user == user), 1);
            }
        });

        // RoomのUsersから削除
        room.users.forEach((u) => {
            if (u.id == user.id) {
                room.users.splice(room.users.findIndex((u) => u.id == user.id), 1);
            }
        });

        io.in(room.id).emit("notify", user.name + "さんが退出しました");
        users.splice(users.findIndex((u) => u.id == socket.id), 1);
        io.in(room.id).emit("joinRoom", room.roomName, room.users.map((u) => u.name), room.users.map((u) => u.isThemeState));

        // ユーザーのいない部屋を削除
        if (room.users.length == 0) {
            logger.info("Room", room.id, "deleted.");
            rooms.splice(roomIndex, 1);
        }
    });

});

// ランダムなroomId(1000~9999)を生成する
function generateRoomId() {
    const id = Math.floor(Math.random() * 8999 + 1000);
    if (rooms.some((r) => r.id == id)) {
        // ランダムに生成したidが既に存在する場合は作り直す
        return generateRoomId();
    }
    return id;
}

// クイズの作成
function Quiz(room) {
    logger.info("Quiz generation started Room", room.id);

    createQuiz.func(room.themes).then((quizJSON) => {
        quizJSON = JSON.parse(quizJSON)["quizzes"];
        room.quizzes.length = 0;
        quizJSON.forEach(json => {
            room.quizzes.push({
                question: json["question"],
                choices: json["choices"],
                correctAnswer: json["answer"],
                explanation: json["explanation"],
            });
        });
        room.quizzes.forEach((quiz) => {
            if (quiz.correctAnswer > 3 || quiz.correctAnswer < 0) {
                throw new Error("正解の選択肢が不正です");
            }
            if (quiz.question == "") {
                throw new Error("問題文が不正です");
            }
            if (quiz.explanation == "") {
                throw new Error("解説文が不正です");
            }
            if (quiz.choices.length != 4) {
                throw new Error("選択肢が不正です");
            }
            quiz.choices.forEach((choice) => {
                if (choice.text == "") {
                    throw new Error("選択肢が不正です");
                }
            });
        });
        io.in(room.id).emit("updateQuiz", room.quizzes[room.quizNum].question, room.quizzes[room.quizNum].choices);
        io.in(room.id).emit("votes", getVotes(room));
        logger.info("Quiz generation completed. Game started in Room", room.id);

        // クイズの回答受付を開始
        startAnswerAcceptance(room);

        // カウントダウン
        countdown(room, countdownDuration);
    })
        .catch((error) => {
            console.error("Error creating quiz:", error);
            io.in(room.id).emit("notify", "クイズの生成に失敗しました。もう一度お試しください。");
        });
}

// カウントダウン
function countdown(room, time) {
    let countdown = time;
    io.in(room.id).emit("countdown", countdown);
    room.countdownTimer = setInterval(() => {
        countdown--;
        io.in(room.id).emit("countdown", countdown);
        if (countdown <= 0) {
            stopAnswerAcceptance(room);
        }
    }, 1000);
}

// 回答受付
function startAnswerAcceptance(room) {
    room.answerAcceptance = true;
}

// 回答停止
function stopAnswerAcceptance(room) {
    room.answerAcceptance = false;

    clearInterval(room.countdownTimer);
    // 正誤判定
    isCorrect(room);
}

// 正誤判定
function isCorrect(room) {
    room.isCorrect = getMostVotedAnswer(room);

    room.results.push({
        quiz: room.quizzes[room.quizNum],
        votes: getVotes(room),
        result: room.isCorrect
    });
    // 結果を送信
    io.in(room.id).emit("quizResult", room.isCorrect, room.quizzes[room.quizNum].explanation, (room.quizzes[room.quizNum].correctAnswer + 1));

    room.votedUsers.length = 0;
}

// 回答数を判定
function getVotes(room) {
    const votes = Array(4).fill(0);   // 選択肢ごとの回答数を格納する配列

    // 各回答の回答数をカウント
    // votedUsers[vote] の vote の choice => votes[choice]++
    Object.values(room.votedUsers).forEach((vote) => {
        votes[vote.choice]++;
    });

    return votes;
}

// 最も多く回答された選択肢を判定
function getMostVotedAnswer(room) {
    const votes = getVotes(room);   // 各選択肢の回答数を取得 [][][][]
    const maxVotes = Math.max(...votes);    // 最大回答数を取得

    // 最大回答数に対応する選択を取得
    const mostVotedAnswers = votes.reduce((acc, vote, index) => {
        if (vote === maxVotes) {
            acc.push(index);
        }
        return acc;
    }, []);

    // 最も多く回答された選択肢が1つであり、かつ正解の選択肢 : その他;
    return (mostVotedAnswers.length === 1 && mostVotedAnswers[0] == room.quizzes[room.quizNum].correctAnswer) ? 1 : -1;

}

const port = process.env.PORT || 3031;
http.listen(port, () => {
    logger.debug("Server started on port" ,port);
});

//process.env.HEROKUURL;

