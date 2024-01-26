const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
require("dotenv").config();

const endpoint = process.env["ENDPOINT"] || "<endpoint>";
const azureApiKey = process.env["AZURE_API_KEY"] || "<api key>";

const createQuiz = {
  name: "createQUIZ",
  description: "生成されたクイズをJSONとして処理する。",
  parameters: {
    type: "object",
    properties: {
      quizzes: {
        type: "array",
        description: "クイズの配列",
        uniqueItems: true,
        items: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "クイズの問題文",
            },
            choices: {
              type: "array",
              description: "クイズの選択肢4つ。正解の選択肢は1つ。正解の選択肢は問題の解答であり、正しい内容である。ハズレの選択肢は3つ。ただし明らかに間違いだとわかるな選択肢は禁止されている。",
              uniqueItems: true,
              items: {
                type: "object",
                properties: {
                  text: {
                    type: 'string',
                    description: "選択肢",
                  }
                }
              },
              minItems: 4,
              maxItems: 4,
            },
            answer: {
              type: "integer",
              description: "半角数字であり、取りうる数値は0から3。クイズの正解の選択肢の配列のインデックス。",
            },
            explanation: {
              type: "string",
              description: "クイズの解説文"
            },
          },
          required: ["question", "choices", "answer", "explanation"],
        },
        minItems: 3,
        minItems: 3,
      },
    },
    required: ["quizzes"],
  }
};

exports.func = async (themes) => {
  try {

    let themesList = "";

    themes.forEach((theme) => {
      themesList += theme.theme + "、";
    });

    console.log(themesList);
    const messages = [
      { role: "system", content: "あなたは4択クイズ作問者です。テーマが複数与えられることがあります。そのテーマを上手く組み合わせてください。" },
      { role: "system", content: "クイズを作成します。条件はありますか？" },
      { role: "user", content: "答えがすぐわかる問題「日本の首都はどこでしょう」「富士山の標高は何mでしょう」といったものは禁止。曖昧な問題「最も使われている〇〇はなんでしょう」「一番人気の〇〇は何でしょう」も禁止。 問題文から答えが自明な問題「問題：Pythonの由来はなんでしょう。答え：モンティ・パイソン」も禁止。問題文・解説文は日本語で40字程度。解説は繰り返すのではなく豆知識的だと良い。選択肢は単語のみ。" },
      { role: "system", content: "わかりました。他に条件はありますか？" },
      { role: "user", content: "面白い問題、例えばクイズサークルなどで出されている問題のように難しい嬉しいです。" },
      { role: "system", content: "よろこんで。テーマを指定してください。" },
      { role: "user", content: "テーマは「+" + themesList + "」で5問作成しなさい。answerは0から3の値を取ること" },
    ];

    const client = new OpenAIClient(endpoint, new AzureKeyCredential(azureApiKey));
    const deploymentId = "gpt-4";

    const result = await client.getChatCompletions(deploymentId, messages, {
      functions: [createQuiz],
      temperature: 0.8,
    });

    const message = result.choices[0].message;
    console.log(message.functionCall.arguments);
    return (message.functionCall.arguments);

  } catch (e) {
    console.log(e);
    return null;
  };
};