export interface FileInfo {
  path: string;
  size: number;
  modifiedTime: number;
}

export interface StorageProvider {
  list(): Promise<FileInfo[]>;

  read(path: string): Promise<Buffer>;

  write(
    path: string,
    data: Buffer,
  ): Promise<void>;
}