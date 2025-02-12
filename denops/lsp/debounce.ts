/**
 * 指定した delay ミリ秒の間、連続して呼び出された場合は最後の1回だけ実行するデバウンス関数
 * @param fn 実行する関数
 * @param delay 待機時間（ミリ秒）
 * @returns デバウンスされた新しい関数
 */
export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    // 既存のタイマーがあればクリアする
    if (timer) {
      clearTimeout(timer);
    }
    // delay ミリ秒後に関数を実行するタイマーを設定する
    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}
