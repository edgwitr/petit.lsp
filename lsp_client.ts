// 必要なエンコーダ/デコーダ（Deno ではグローバルに使えます）
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ★ サーバープロセスの起動 ★
// clangd のパスは適宜変更してください。
const cmd = new Deno.Command("C:\\Users\\yseki.DKR\\Downloads\\clangd-windows-19.1.2\\clangd_19.1.2\\bin\\clangd.exe", {
  args: [],
  stdin: "piped",
  stdout: "piped",
  stderr: "piped",
});
const serverProcess = await cmd.spawn();
console.log("clangd サーバーを起動しました");

// ★ メッセージ送信用のヘルパー関数 ★
async function sendMessage(messageObj: any) {
  // JSON に変換して本文の長さを算出
  const payload = JSON.stringify(messageObj);
  const contentLength = encoder.encode(payload).length;
  // ヘッダーと本文を連結。ヘッダーは "\r\n\r\n" で区切る必要があります
  const message = `Content-Length: ${contentLength}\r\n\r\n${payload}`;

  // stdin はストリームなので writer を取得して書き込み
  const writer = serverProcess.stdin.getWriter();
  await writer.write(encoder.encode(message));
  writer.releaseLock();
}

// ★ initialize リクエストの送信 ★
const initializeParams = {
  processId: Deno.pid,  // 現在のプロセスID（必要に応じて null も可能）
  rootUri: null,        // プロジェクトのルート URI。無ければ null
  capabilities: {},     // クライアントの機能を記述するオブジェクト
};

const initializeRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: initializeParams,
};

await sendMessage(initializeRequest);
console.log("initialize リクエストを送信しました");

// ★ サーバーからの出力を継続的に読み取り、LSP メッセージを解析する処理 ★
async function readLoop(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      console.log("サーバーの出力が終了しました");
      break;
    }
    // chunk を文字列に変換してバッファに追加
    buffer += decoder.decode(value, { stream: true });

    // ヘッダーと本文の区切り "\r\n\r\n" を検出
    while (true) {
      const headerEndIndex = buffer.indexOf("\r\n\r\n");
      if (headerEndIndex === -1) break; // ヘッダーが完全に受信される前

      // ヘッダー部分を抽出して各行に分割
      const headerPart = buffer.slice(0, headerEndIndex);
      const headerLines = headerPart.split("\r\n");
      let contentLength = 0;
      for (const line of headerLines) {
        const [name, value] = line.split(":").map(s => s.trim());
        if (name.toLowerCase() === "content-length") {
          contentLength = parseInt(value, 10);
        }
      }
      if (isNaN(contentLength) || contentLength <= 0) {
        console.error("無効な Content-Length ヘッダー:", headerPart);
        // ヘッダー部分をスキップして続行
        buffer = buffer.slice(headerEndIndex + 4);
        continue;
      }

      // ヘッダー部分＋本文の長さがバッファに揃っているか確認
      const totalMessageLength = headerEndIndex + 4 + contentLength;
      if (buffer.length < totalMessageLength) {
        // 本文が全て受信されていないので待つ
        break;
      }

      // 本文部分を抜き出し、JSON としてパース
      const jsonPayload = buffer.slice(headerEndIndex + 4, totalMessageLength);
      buffer = buffer.slice(totalMessageLength); // 受信済み部分を除去
      try {
        const messageObj = JSON.parse(jsonPayload);
        handleMessage(messageObj);
      } catch (e) {
        console.error("JSON パースエラー:", e, jsonPayload);
      }
    }
  }
}

// ★ 受信したメッセージの内容を処理する関数 ★
function handleMessage(message: any) {
  // レスポンス（id が存在する場合）や通知の場合で処理を分岐
  if (message.id !== undefined) {
    console.log("サーバーからのレスポンス:", message);
  }
  if (message.method === "textDocument/publishDiagnostics") {
    // diagnostics が存在し、かつ空でない場合のみ通知を出す
    if (message.params?.diagnostics && message.params.diagnostics.length > 0) {
      console.log("get diagnostics");
      console.dir(message.params, { depth: null });
    } else {
      // 空の場合は通知を抑制する（必要に応じてログ出力する場合）
      console.debug("empty diagnostics");
    }
  } else if (message.method) {
    // その他の通知（initialize の完了通知など）
    console.log("サーバーからの通知:", message);
  }
}

// stdout の reader を取得して readLoop を開始
const stdoutReader = serverProcess.stdout.getReader();
readLoop(stdoutReader);


class lspDocumentNotification {
  documentUri: string;
  documentVersion: number;
  count: number;
  language: string;
  constructor (uri: string, lang: string) {
    this.documentUri = uri;
    this.documentVersion = 1;
    this.count = 1;
    this.language = lang;
  }
  sendDidOpenNotification = async(documentText: string = "") => {
    const didOpenNotification = {
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri: this.documentUri,
          languageId: this.language,
          version: this.documentVersion,
          text: documentText,
        },
      },
    };
    await sendMessage(didOpenNotification);
    console.debug("send 'didOpen'");
  }
  sendDidChangeNotification = async(newText: string) => {
    this.documentVersion++;
    const didChangeNotification = {
      jsonrpc: "2.0",
      method: "textDocument/didChange",
      params: {
        textDocument: {
          uri: this.documentUri,
          version: this.documentVersion,
        },
        // "text" フィールドを持つ Full 更新の例
        contentChanges: [
          {
            text: newText,
          },
        ],
      },
    }
    await sendMessage(didChangeNotification);
    console.debug(`send didChange -> version: ${this.documentVersion}`);
  }
  sendDidCloseNotification = async () => {
    const didCloseNotification = {
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: {
        textDocument: {
          uri: this.documentUri,
        },
      },
    };

    await sendMessage(didCloseNotification);
    console.debug("send 'didClose'");
  }
}

// ★ ファイルパスなどの定義 ★
const uri = "file:///C:/Users/yseki.DKR/denotest/test.c";
const path = "C:/Users/yseki.DKR/denotest/test.c";

let text = await Deno.readTextFile(path);

const llsspp = new lspDocumentNotification(uri, "c");
await llsspp.sendDidOpenNotification(text);

// ★ サンプルとして、一定時間後に編集とクローズの通知を送信する例 ★
setTimeout(async () => {
  // 例として、ファイルのテキストに " // edited" を追記
  text += "\n// edited";
  await llsspp.sendDidChangeNotification(text);
}, 3000);  // 3秒後に編集通知

setTimeout(async () => {
  await llsspp.sendDidCloseNotification();
}, 6000);  // 6秒後にクローズ通知

// ※ 必要に応じて、実際のエディタのイベントハンドラなどから
//     sendDidChangeNotification() や sendDidCloseNotification() を呼び出してください。
