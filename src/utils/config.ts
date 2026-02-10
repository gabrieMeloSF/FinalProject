import * as vscode from 'vscode';
import { ExtensionConfig } from '../types';

/**
 * Gerenciador de configurações da extensão
 */
export class ConfigManager {
    private static instance: ConfigManager;
    private readonly configSection = 'sfdevops';

    private constructor() {}

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    /**
     * Obtém todas as configurações
     */
    public getConfig(): ExtensionConfig {
        const config = vscode.workspace.getConfiguration(this.configSection);
        
        return {
            defaultOrg: config.get<string>('defaultOrg', ''),
            outputDirectory: config.get<string>('outputDirectory', './deploy-packages'),
            enableAuditLog: config.get<boolean>('enableAuditLog', true),
            auditLogPath: config.get<string>('auditLogPath', './.sfdevops/audit.log'),
            autoGenerateCommitMessage: config.get<boolean>('autoGenerateCommitMessage', true),
            metadataApiVersion: config.get<string>('metadataApiVersion', '59.0'),
        };
    }

    /**
     * Obtém uma configuração específica
     */
    public get<T>(key: keyof ExtensionConfig): T {
        const config = vscode.workspace.getConfiguration(this.configSection);
        return config.get<T>(key) as T;
    }

    /**
     * Define uma configuração específica
     */
    public async set<T>(key: keyof ExtensionConfig, value: T, global = false): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.configSection);
        await config.update(key, value, global ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace);
    }

    /**
     * Obtém o diretório de saída absoluto
     */
    public getOutputDirectory(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const outputDir = this.get<string>('outputDirectory');
        
        if (workspaceFolder && outputDir.startsWith('./')) {
            return vscode.Uri.joinPath(workspaceFolder.uri, outputDir.slice(2)).fsPath;
        }
        
        return outputDir;
    }

    /**
     * Obtém o caminho do arquivo de auditoria
     */
    public getAuditLogPath(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const logPath = this.get<string>('auditLogPath');
        
        if (workspaceFolder && logPath.startsWith('./')) {
            return vscode.Uri.joinPath(workspaceFolder.uri, logPath.slice(2)).fsPath;
        }
        
        return logPath;
    }
}

export const configManager = ConfigManager.getInstance();
