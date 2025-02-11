import * as Path from "jsr:@std/path";
import { zipdownload } from "./zip.ts";
const os = Deno.build.os;
export async function binpath(lspdir: string): Promise<string> {
  const dir = Path.join(lspdir, "clangd");
  const clangd = Path.join(dir, "bin", "clangd") + (os === "windows" ? ".exe" : "");
  try {
    await Deno.stat(clangd);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      const urls: { [key: string]: string } = {
        windows: "https://github.com/clangd/clangd/releases/download/19.1.2/clangd-windows-19.1.2.zip",
        darwin:  "https://github.com/clangd/clangd/releases/download/19.1.2/clangd-mac-19.1.2.zip",
        linux:   "https://github.com/clangd/clangd/releases/download/19.1.2/clangd-linux-19.1.2.zip"
      };

      const url = urls[os] ?? (() => { throw new Error("Unsupported OS: " + os); })();
      await zipdownload(url, dir);

      // Windows以外の場合、実行権限を付与
      if (os !== "windows") {
        try {
          await Deno.chmod(clangd, 0o755);
          console.debug(`chmod 755 ${clangd}`);
        } catch (chmodErr) {
          console.error("Failed to chmod:", chmodErr);
          throw chmodErr;
        }
      }
    } else {
      throw err;
    }
  }

  // 最終確認
  try {
    const stat = await Deno.stat(clangd);
    console.debug(`clangd path: ${clangd}`);
    console.debug(`executable: ${stat.mode}`);
  } catch (err) {
    console.error("Failed to verify clangd:", err);
    throw err;
  }

  return clangd;
}
