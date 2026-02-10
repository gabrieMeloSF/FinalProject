import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from './logger';

/**
 * Utilitários para operações de arquivo
 */
export class FileUtils {
    /**
     * Escreve conteúdo em um arquivo
     */
    public static async writeFile(filePath: string, content: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
            logger.info(`Arquivo criado: ${filePath}`);
        } catch (error) {
            logger.error(`Erro ao escrever arquivo: ${filePath}`, error);
            throw error;
        }
    }

    /**
     * Lê conteúdo de um arquivo
     */
    public static async readFile(filePath: string): Promise<string> {
        try {
            const uri = vscode.Uri.file(filePath);
            const data = await vscode.workspace.fs.readFile(uri);
            const decoder = new TextDecoder();
            return decoder.decode(data);
        } catch (error) {
            logger.error(`Erro ao ler arquivo: ${filePath}`, error);
            throw error;
        }
    }

    /**
     * Verifica se um arquivo existe
     */
    public static async fileExists(filePath: string): Promise<boolean> {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Cria um diretório (e diretórios pai se necessário)
     */
    public static async ensureDirectory(dirPath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(dirPath);
            await vscode.workspace.fs.createDirectory(uri);
            logger.debug(`Diretório criado/verificado: ${dirPath}`);
        } catch (error) {
            // Ignora se já existe
            if ((error as vscode.FileSystemError).code !== 'FileExists') {
                logger.error(`Erro ao criar diretório: ${dirPath}`, error);
                throw error;
            }
        }
    }

    /**
     * Lista arquivos em um diretório
     */
    public static async listFiles(dirPath: string): Promise<string[]> {
        try {
            const uri = vscode.Uri.file(dirPath);
            const entries = await vscode.workspace.fs.readDirectory(uri);
            return entries
                .filter(([, type]) => type === vscode.FileType.File)
                .map(([name]) => path.join(dirPath, name));
        } catch (error) {
            logger.error(`Erro ao listar arquivos: ${dirPath}`, error);
            throw error;
        }
    }

    /**
     * Lista diretórios em um caminho
     */
    public static async listDirectories(dirPath: string): Promise<string[]> {
        try {
            const uri = vscode.Uri.file(dirPath);
            const entries = await vscode.workspace.fs.readDirectory(uri);
            return entries
                .filter(([, type]) => type === vscode.FileType.Directory)
                .map(([name]) => path.join(dirPath, name));
        } catch (error) {
            logger.error(`Erro ao listar diretórios: ${dirPath}`, error);
            throw error;
        }
    }

    /**
     * Deleta um arquivo
     */
    public static async deleteFile(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.delete(uri);
            logger.info(`Arquivo deletado: ${filePath}`);
        } catch (error) {
            logger.error(`Erro ao deletar arquivo: ${filePath}`, error);
            throw error;
        }
    }

    /**
     * Copia um arquivo
     */
    public static async copyFile(source: string, destination: string): Promise<void> {
        try {
            const sourceUri = vscode.Uri.file(source);
            const destUri = vscode.Uri.file(destination);
            await vscode.workspace.fs.copy(sourceUri, destUri, { overwrite: true });
            logger.info(`Arquivo copiado: ${source} -> ${destination}`);
        } catch (error) {
            logger.error(`Erro ao copiar arquivo: ${source} -> ${destination}`, error);
            throw error;
        }
    }

    /**
     * Obtém o caminho do workspace
     */
    public static getWorkspacePath(): string | undefined {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    /**
     * Gera um nome de arquivo único baseado em timestamp
     */
    public static generateTimestampedFilename(baseName: string, extension: string): string {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        return `${baseName}_${timestamp}.${extension}`;
    }

    /**
     * Obtém a extensão de um arquivo
     */
    public static getFileExtension(filePath: string): string {
        return path.extname(filePath).toLowerCase();
    }

    /**
     * Obtém o nome do arquivo sem extensão
     */
    public static getFileNameWithoutExtension(filePath: string): string {
        return path.basename(filePath, path.extname(filePath));
    }

    /**
     * Junta caminhos de forma segura
     */
    public static joinPath(...paths: string[]): string {
        return path.join(...paths);
    }

    /**
     * Normaliza um caminho
     */
    public static normalizePath(filePath: string): string {
        return path.normalize(filePath);
    }
}
