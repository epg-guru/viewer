/** Reads a byte range out of the OPFS file the worker wrote decompressed
 * EPG bytes into, decoding it to a UTF-8 string. Used for on-demand,
 * per-fragment retrieval when a user clicks a channel/programme cell,
 * cheap because Blob.slice() doesn't copy the whole file, only the range
 * actually read. */
export async function readOpfsFragment(fileName: string, byteStart: number, byteEnd: number): Promise<string> {
  const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<any> };
  if (typeof storage?.getDirectory !== 'function') {
    throw new Error('OPFS is not available in this browser.');
  }
  const dir = await storage.getDirectory();
  const fileHandle = await dir.getFileHandle(fileName);
  const file: File = await fileHandle.getFile();
  const slice = file.slice(byteStart, byteEnd);
  const buf = await slice.arrayBuffer();
  return new TextDecoder('utf-8').decode(buf);
}

export function readMemoryFragment(buffer: ArrayBuffer, byteStart: number, byteEnd: number): string {
  return new TextDecoder('utf-8').decode(new Uint8Array(buffer, byteStart, byteEnd - byteStart));
}
