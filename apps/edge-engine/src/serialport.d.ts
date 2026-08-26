/** Ambient fallback when IDE/tsserver cannot resolve optional native `serialport`. */
declare module "serialport" {
  export class SerialPort {
    constructor(options: Record<string, unknown>);
    open(callback: (err: Error | null | undefined) => void): void;
    close(callback?: () => void): void;
    write(data: Buffer | string): void;
    on(event: "data", listener: (chunk: Buffer) => void): void;
    isOpen: boolean;
  }
}
