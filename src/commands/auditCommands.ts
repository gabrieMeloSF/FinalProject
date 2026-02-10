import * as vscode from 'vscode';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';
import { AuditTreeProvider } from '../views/auditTreeProvider';
import { FileUtils } from '../utils/fileUtils';

/**
 * Comandos relacionados à auditoria e logs
 */
export class AuditCommands {
    constructor(
        private auditTreeProvider: AuditTreeProvider
    ) {}

    /**
     * Registra todos os comandos de auditoria
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('sfdevops.viewAuditLog', () => this.viewAuditLog()),
        );
    }

    /**
     * Comando: Visualizar log de auditoria
     */
    private async viewAuditLog(): Promise<void> {
        try {
            const choice = await vscode.window.showQuickPick([
                { 
                    label: 'Ver Log Completo', 
                    value: 'view', 
                    description: 'Abre o log de auditoria formatado'
                },
                { 
                    label: 'Exportar Log', 
                    value: 'export', 
                    description: 'Exporta o log para um arquivo JSON'
                },
                { 
                    label: 'Limpar Log', 
                    value: 'clear', 
                    description: 'Remove todas as entradas de auditoria'
                },
            ], {
                placeHolder: 'Selecione uma ação',
                title: 'SF DevOps: Log de Auditoria',
            });

            if (!choice) {
                return;
            }

            switch (choice.value) {
                case 'view':
                    await this.showFormattedLog();
                    break;
                case 'export':
                    await this.exportLog();
                    break;
                case 'clear':
                    await this.clearLog();
                    break;
            }
        } catch (error) {
            logger.error('Erro ao processar comando de auditoria', error);
            vscode.window.showErrorMessage(
                `Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            );
        }
    }

    /**
     * Mostra o log formatado
     */
    private async showFormattedLog(): Promise<void> {
        const formattedLog = auditService.formatLogForDisplay();

        const doc = await vscode.workspace.openTextDocument({
            content: formattedLog,
            language: 'plaintext',
        });

        await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: true,
        });
    }

    /**
     * Exporta o log para arquivo
     */
    private async exportLog(): Promise<void> {
        const workspacePath = FileUtils.getWorkspacePath();
        const defaultName = FileUtils.generateTimestampedFilename('audit-log', 'json');
        const defaultPath = workspacePath 
            ? vscode.Uri.file(FileUtils.joinPath(workspacePath, defaultName))
            : vscode.Uri.file(defaultName);

        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: defaultPath,
            filters: {
                'JSON Files': ['json'],
            },
            title: 'SF DevOps: Exportar Log de Auditoria',
        });

        if (!saveUri) {
            return;
        }

        const result = await auditService.exportLog(saveUri.fsPath);

        if (result.success) {
            const openAction = await vscode.window.showInformationMessage(
                `Log exportado para: ${saveUri.fsPath}`,
                'Abrir Arquivo'
            );

            if (openAction === 'Abrir Arquivo') {
                vscode.window.showTextDocument(saveUri);
            }
        } else {
            vscode.window.showErrorMessage(`Erro ao exportar log: ${result.error}`);
        }
    }

    /**
     * Limpa o log de auditoria
     */
    private async clearLog(): Promise<void> {
        const entries = auditService.getEntries();

        if (entries.length === 0) {
            vscode.window.showInformationMessage('O log de auditoria já está vazio.');
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Deseja remover todas as ${entries.length} entrada(s) do log de auditoria?`,
            { modal: true },
            'Sim, Limpar'
        );

        if (confirm === 'Sim, Limpar') {
            await auditService.clearLog();
            this.auditTreeProvider.refresh();
            vscode.window.showInformationMessage('Log de auditoria limpo.');
        }
    }
}
