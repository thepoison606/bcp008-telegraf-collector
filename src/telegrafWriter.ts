// src/telegrafWriter.ts

import { Socket } from 'net';

export class TelegrafWriter {
    private socket: Socket | null = null;

    constructor(private readonly host: string, private readonly port: number) {}

    public connect(): Promise<void> {
        if (this.socket && !this.socket.destroyed) {
            return Promise.resolve();
        }

        this.socket = new Socket();
        this.socket.setKeepAlive(true, 10_000);
        return new Promise((resolve, reject) => {
            this.socket?.once('connect', () => {
            console.log(`Connected to Telegraf at ${this.host}:${this.port}`);
            resolve();
            });
            this.socket?.once('error', reject);
            this.socket?.connect(this.port, this.host);
        });
    }

    public write(lineProtocol: string): void {
        if (!this.socket || this.socket.destroyed) {
            console.error('Telegraf socket not connected.');
            return;
        }
        this.socket.write(`${lineProtocol}\n`);
    }

    public close(): void {
        if (!this.socket) {
            return;
        }

        if (!this.socket.destroyed) {
            this.socket.end();
        }

        this.socket.removeAllListeners();
        this.socket = null;
    }
}
