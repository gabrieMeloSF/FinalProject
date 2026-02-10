import * as vscode from 'vscode';

/**
 * Classe de logging para a extensão SF DevOps Assistant
 * Fornece logging para o Output Channel e console
 */
export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private readonly prefix = '[SF DevOps]';

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('SF DevOps Assistant');
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Formata a mensagem com timestamp
     */
    private formatMessage(level: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `${timestamp} ${this.prefix} [${level}] ${message}`;
    }

    /**
     * Log de informação
     */
    public info(message: string, ...args: unknown[]): void {
        const formattedMessage = this.formatMessage('INFO', message);
        this.outputChannel.appendLine(formattedMessage);
        if (args.length > 0) {
            this.outputChannel.appendLine(JSON.stringify(args, null, 2));
        }
        console.log(formattedMessage, ...args);
    }

    /**
     * Log de warning
     */
    public warn(message: string, ...args: unknown[]): void {
        const formattedMessage = this.formatMessage('WARN', message);
        this.outputChannel.appendLine(formattedMessage);
        if (args.length > 0) {
            this.outputChannel.appendLine(JSON.stringify(args, null, 2));
        }
        console.warn(formattedMessage, ...args);
    }

    /**
     * Log de erro
     */
    public error(message: string, error?: Error | unknown): void {
        const formattedMessage = this.formatMessage('ERROR', message);
        this.outputChannel.appendLine(formattedMessage);
        
        if (error instanceof Error) {
            this.outputChannel.appendLine(`Stack: ${error.stack}`);
            console.error(formattedMessage, error);
        } else if (error) {
            this.outputChannel.appendLine(JSON.stringify(error, null, 2));
            console.error(formattedMessage, error);
        } else {
            console.error(formattedMessage);
        }
    }

    /**
     * Log de debug (apenas em desenvolvimento)
     */
    public debug(message: string, ...args: unknown[]): void {
        const formattedMessage = this.formatMessage('DEBUG', message);
        this.outputChannel.appendLine(formattedMessage);
        if (args.length > 0) {
            this.outputChannel.appendLine(JSON.stringify(args, null, 2));
        }
        console.debug(formattedMessage, ...args);
    }

    /**
     * Mostra o Output Channel
     */
    public show(): void {
        this.outputChannel.show();
    }

    /**
     * Limpa o Output Channel
     */
    public clear(): void {
        this.outputChannel.clear();
    }

    /**
     * Dispõe do Output Channel
     */
    public dispose(): void {
        this.outputChannel.dispose();
    }
}

export const logger = Logger.getInstance();
