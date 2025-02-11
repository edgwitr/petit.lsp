interface ServerConfig {
  command: string;
  args: string[];
  workingDirectory: string;
}

export class LspClient {
  private process: Deno.ChildProcess | null = null;

  async startServer(config: ServerConfig): Promise<void> {
    if (this.process) {
      throw new Error("Server is already running");
    }

    // サーバー起動前の実行ファイルの状態を確認
    try {
      const stat = await Deno.stat(config.command);
      console.debug("Server binary stats:", {
        path: config.command,
        size: stat.size,
        mode: stat.mode?.toString(8),
        mtime: stat.mtime
      });
    } catch (err) {
      console.error("Failed to check server binary:", err);
      throw err;
    }

    console.debug(`Starting LSP server: ${config.command}`);
    console.debug(`Args: ${config.args.join(" ")}`);
    console.debug(`CWD: ${config.workingDirectory}`);

    try {
      const command = new Deno.Command(config.command, {
        args: config.args,
        cwd: config.workingDirectory,
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
      });

      this.process = command.spawn();
      console.debug("Server process spawned successfully");

      // Handle stdout
      this.process.stdout.pipeTo(new WritableStream({
        write: (chunk) => {
          const text = new TextDecoder().decode(chunk);
          console.log("Server stdout:", text);
        },
      }));

      // Handle stderr
      this.process.stderr.pipeTo(new WritableStream({
        write: (chunk) => {
          const text = new TextDecoder().decode(chunk);
          console.error("Server stderr:", text);
        },
      }));
    } catch (err) {
      console.error("Server spawn failed:", {
        command: config.command,
        error: err,
      });
      throw err;
    }
  }
}
