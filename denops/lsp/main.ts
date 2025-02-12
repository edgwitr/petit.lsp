import type { Entrypoint, Denops } from "jsr:@denops/std@^7.4.0";
import * as autocmd from "jsr:@denops/std/autocmd";
import * as fn from "jsr:@denops/std/function";
import * as mod from "jsr:@denops/std/option";
import { LspClient } from "./client.ts";
import * as clangd from "./lang/clangd.ts";
import * as Path from "jsr:@std/path";
import { debounce } from "./debounce.ts";

const clients: Record<string, LspClient> = {};
// 入力イベントがあるたびに呼び出されるが、500ms 間隔で最後の入力のみ実行される
const onChange = (value: string) => {
  console.log('latest :', value);
};
const debouncedOnChange = debounce(onChange, 500);

export const main: Entrypoint = async (denops: Denops) => {

  denops.dispatcher = {
    async LSP() {
      const line = await fn.getline(denops, ".");
      debouncedOnChange(line);
    },
    async lspStart(): Promise<void> {
      const [bufnr, filetype] = [await fn.bufnr(denops), await mod.filetype.get(denops)];
      console.debug("called lspStart", bufnr);
      console.debug("filetype:", filetype);
      if (!filetype) {
        return;
      }
      await startLspServer(denops, filetype);
    },
    debug(): void {
      console.debug("called debug");
    },
  };

  await autocmd.group(denops, "LspOpen", (helper) => {
    helper.remove("*");
    helper.define(
      ["BufEnter"],
      "*",
      `call denops#request("${denops.name}", 'lspStart', [])`
    );
    helper.define(
      ["User"],
      "LspAttach",
      `call denops#request("${denops.name}", 'debug', [])`
    );
  });
};

async function startLspServer(denops: Denops, filetype: string): Promise<void> {
  try {
    const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
    if (!home) {
      throw new Error("HOME or USERPROFILE environment variable is not set");
    }

    const lspdir = Path.join(home, ".local", "share", "petit", "lsp");
    console.debug("lspdir:", lspdir);

    if (filetype === "c" || filetype === "cpp") {
      if (!clients.clangd) {
        clients.clangd = new LspClient();
        const serverPath = await clangd.binpath(lspdir);
        await clients.clangd.startServer({
          command: serverPath,
          args: ['--background-index', '--clang-tidy', '--log=verbose'],
          workingDirectory: await fn.getcwd(denops),
        });
        console.debug("clangd started successfully");
      }
    }

    await denops.cmd("doautocmd <nomodeline> User LspAttach");
  } catch (err) {
    console.error("LSP server start failed:", err);
    throw err;
  }
}
