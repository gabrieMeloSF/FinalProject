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
            vscode.commands.registerCommand('sfdevops.refreshAuditTrail', () => this.refreshAuditTrail()),
            vscode.commands.registerCommand('sfdevops.filterAuditTrail', () => this.filterAuditTrail()),
            vscode.commands.registerCommand('sfdevops.exportAuditTrail', () => this.exportAuditTrail()),
            vscode.commands.registerCommand('sfdevops.searchAuditTrail', () => this.searchAuditTrail()),
        );
    }

    /**
     * Comando: Atualizar Setup Audit Trail e exibir como documento
     */
    private async refreshAuditTrail(): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'SF DevOps: Carregando Setup Audit Trail...',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Buscando dados do Salesforce...' });
            
            const result = await auditService.fetchSetupAuditTrail({ limit: 200 });
            
            if (result.success && result.data && result.data.length > 0) {
                progress.report({ message: 'Formatando documento...' });
                
                // Exibe como documento formatado
                const formattedContent = auditService.formatSetupAuditTrail(result.data);
                
                const doc = await vscode.workspace.openTextDocument({
                    content: formattedContent,
                    language: 'plaintext',
                });

                await vscode.window.showTextDocument(doc, {
                    viewColumn: vscode.ViewColumn.One,
                    preview: false,
                });

                // Também atualiza a sidebar
                this.auditTreeProvider.refresh();
                
                vscode.window.showInformationMessage(`${result.data.length} registros do Setup Audit Trail carregados`);
            } else if (result.success && result.data && result.data.length === 0) {
                vscode.window.showInformationMessage('Nenhum registro encontrado no Setup Audit Trail');
            } else {
                vscode.window.showErrorMessage(`Erro ao carregar Audit Trail: ${result.error}`);
            }
        });
    }

    /**
     * Comando: Filtrar Setup Audit Trail por seção
     */
    private async filterAuditTrail(): Promise<void> {
        try {
            // Busca as seções disponíveis
            const sectionsResult = await auditService.getAuditTrailSections();
            
            const sections = sectionsResult.success && sectionsResult.data 
                ? sectionsResult.data 
                : ['All', 'Manage Users', 'Security Controls', 'Permission Sets', 'Profiles', 'Customize'];

            const items = sections.map(section => ({
                label: section,
                value: section,
                description: section === 'All' ? 'Todas as seções' : undefined,
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Selecione uma seção para filtrar',
                title: 'SF DevOps: Filtrar Audit Trail',
            });

            if (selected) {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Filtrando por "${selected.value}"...`,
                    cancellable: false
                }, async () => {
                    const filter = selected.value !== 'All' ? { section: selected.value } : undefined;
                    const result = await auditService.fetchSetupAuditTrail(filter);
                    
                    if (result.success && result.data && result.data.length > 0) {
                        const formattedContent = auditService.formatSetupAuditTrail(result.data);
                        
                        const doc = await vscode.workspace.openTextDocument({
                            content: formattedContent,
                            language: 'plaintext',
                        });

                        await vscode.window.showTextDocument(doc, {
                            viewColumn: vscode.ViewColumn.One,
                            preview: false,
                        });

                        this.auditTreeProvider.setFilter(selected.value);
                    } else if (result.success && result.data?.length === 0) {
                        vscode.window.showInformationMessage(`Nenhum registro encontrado para "${selected.value}"`);
                    } else {
                        vscode.window.showErrorMessage(`Erro: ${result.error}`);
                    }
                });
            }
        } catch (error) {
            logger.error('Erro ao filtrar Audit Trail', error);
            vscode.window.showErrorMessage('Erro ao carregar filtros');
        }
    }

    /**
     * Comando: Buscar no Setup Audit Trail
     */
    private async searchAuditTrail(): Promise<void> {
        const searchTerm = await vscode.window.showInputBox({
            prompt: 'Digite o termo de busca',
            placeHolder: 'Ex: permission, user, profile...',
            title: 'SF DevOps: Buscar no Audit Trail',
        });

        if (!searchTerm) {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Buscando "${searchTerm}"...`,
            cancellable: false
        }, async () => {
            const result = await auditService.fetchSetupAuditTrail({ searchTerm });
            
            if (result.success && result.data && result.data.length > 0) {
                const formattedContent = auditService.formatSetupAuditTrail(result.data);
                
                const doc = await vscode.workspace.openTextDocument({
                    content: formattedContent,
                    language: 'plaintext',
                });

                await vscode.window.showTextDocument(doc, {
                    viewColumn: vscode.ViewColumn.One,
                    preview: false,
                });

                this.auditTreeProvider.refresh();
                vscode.window.showInformationMessage(`${result.data.length} resultado(s) encontrado(s) para "${searchTerm}"`);
            } else if (result.success && result.data?.length === 0) {
                vscode.window.showInformationMessage(`Nenhum resultado encontrado para "${searchTerm}"`);
            } else {
                vscode.window.showErrorMessage(`Erro na busca: ${result.error}`);
            }
        });
    }

    /**
     * Comando: Exportar Setup Audit Trail
     */
    private async exportAuditTrail(): Promise<void> {
        const entries = auditService.getSetupAuditTrailCache();

        if (entries.length === 0) {
            vscode.window.showWarningMessage('Carregue o Audit Trail primeiro antes de exportar');
            return;
        }

        const formatChoice = await vscode.window.showQuickPick([
            { label: 'Texto Formatado (.txt)', value: 'txt' as const, description: 'Formato legível para humanos' },
            { label: 'JSON (.json)', value: 'json' as const, description: 'Formato estruturado para processamento' },
            { label: 'CSV (.csv)', value: 'csv' as const, description: 'Para abrir em planilhas' },
        ], {
            placeHolder: 'Selecione o formato de exportação',
            title: 'SF DevOps: Exportar Audit Trail',
        });

        if (!formatChoice) {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Exportando Audit Trail...',
            cancellable: false
        }, async () => {
            const result = await auditService.exportSetupAuditTrail(entries, formatChoice.value);

            if (result.success && result.data) {
                const openAction = await vscode.window.showInformationMessage(
                    `Audit Trail exportado: ${result.data}`,
                    'Abrir Arquivo',
                    'Abrir Pasta'
                );

                if (openAction === 'Abrir Arquivo') {
                    const doc = await vscode.workspace.openTextDocument(result.data);
                    await vscode.window.showTextDocument(doc);
                } else if (openAction === 'Abrir Pasta') {
                    const folderUri = vscode.Uri.file(result.data.substring(0, result.data.lastIndexOf('/')));
                    await vscode.commands.executeCommand('revealFileInOS', folderUri);
                }
            } else {
                vscode.window.showErrorMessage(`Erro ao exportar: ${result.error}`);
            }
        });
    }

    /**
     * Comando: Visualizar log de auditoria local
     */
    private async viewAuditLog(): Promise<void> {
        try {
            const choice = await vscode.window.showQuickPick([
                { 
                    label: '$(cloud-download) Setup Audit Trail (Salesforce)', 
                    value: 'sf', 
                    description: 'Histórico de alterações na org'
                },
                { 
                    label: '$(history) Log Local da Extensão', 
                    value: 'local', 
                    description: 'Ações realizadas pela extensão'
                },
            ], {
                placeHolder: 'Qual log deseja visualizar?',
                title: 'SF DevOps: Log de Auditoria',
            });

            if (!choice) {
                return;
            }

            if (choice.value === 'sf') {
                await this.showSetupAuditTrailOptions();
            } else {
                await this.showLocalLogOptions();
            }
        } catch (error) {
            logger.error('Erro ao processar comando de auditoria', error);
            vscode.window.showErrorMessage(
                `Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            );
        }
    }

    /**
     * Opções do Setup Audit Trail
     */
    private async showSetupAuditTrailOptions(): Promise<void> {
        const choice = await vscode.window.showQuickPick([
            { 
                label: '$(refresh) Carregar Audit Trail', 
                value: 'load', 
                description: 'Buscar dados do Salesforce'
            },
            { 
                label: '$(filter) Filtrar por Seção', 
                value: 'filter', 
                description: 'Mostrar apenas uma seção'
            },
            { 
                label: '$(search) Buscar', 
                value: 'search', 
                description: 'Buscar por termo'
            },
            { 
                label: '$(export) Exportar', 
                value: 'export', 
                description: 'Salvar em arquivo'
            },
        ], {
            placeHolder: 'Selecione uma ação',
            title: 'SF DevOps: Setup Audit Trail',
        });

        if (!choice) {
            return;
        }

        switch (choice.value) {
            case 'load':
                await this.refreshAuditTrail();
                break;
            case 'filter':
                await this.filterAuditTrail();
                break;
            case 'search':
                await this.searchAuditTrail();
                break;
            case 'export':
                await this.exportAuditTrail();
                break;
        }
    }

    /**
     * Opções do log local
     */
    private async showLocalLogOptions(): Promise<void> {
        const choice = await vscode.window.showQuickPick([
            { 
                label: '$(eye) Ver Log Completo', 
                value: 'view', 
                description: 'Abre o log de auditoria formatado'
            },
            { 
                label: '$(export) Exportar Log', 
                value: 'export', 
                description: 'Exporta o log para um arquivo JSON'
            },
            { 
                label: '$(trash) Limpar Log', 
                value: 'clear', 
                description: 'Remove todas as entradas de auditoria'
            },
        ], {
            placeHolder: 'Selecione uma ação',
            title: 'SF DevOps: Log Local',
        });

        if (!choice) {
            return;
        }

        switch (choice.value) {
            case 'view':
                await this.showFormattedLog();
                break;
            case 'export':
                await this.exportLocalLog();
                break;
            case 'clear':
                await this.clearLog();
                break;
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
     * Exporta o log local para arquivo
     */
    private async exportLocalLog(): Promise<void> {
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
