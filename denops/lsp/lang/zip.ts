import * as zip_js from "jsr:@zip-js/zip-js";
import * as Path from "jsr:@std/path";

// ダウンロード
export const zipdownload = async (url: string, targetDir: string) => {
  console.log("Downloading", url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  console.log("Downloaded", url);
  console.log("Extracting", url);
  const array = await res.arrayBuffer();

  // Blobに変換
  const blob = new Blob([array]);

  // zip-jsでZipReader作成
  const reader = new zip_js.ZipReader(new zip_js.BlobReader(blob));
  const entries = await reader.getEntries();

  await Promise.all(entries.map(async (entry) => {
    // entry.filenameがバージョン名のディレクトリの中にあるので、最上位のディレクトリを取り除く
    const filename = entry.filename.replace(/^[^/]+\//, "");
    const outPath = Path.join(targetDir, filename);
    if (filename.endsWith("/")) {
      await Deno.mkdir(outPath, { recursive: true });
    } else {
      await Deno.mkdir(Path.dirname(outPath), { recursive: true });
      if (!entry.getData) throw new Error("entry.getData is undefined");
      const dataBlob = await entry.getData(new zip_js.BlobWriter());
      const data = new Uint8Array(await dataBlob.arrayBuffer());
      await Deno.writeFile(outPath, data);
    }
  }));
  console.log("Extracted", url);

  await reader.close();
};
