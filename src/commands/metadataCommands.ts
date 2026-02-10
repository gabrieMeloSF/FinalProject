import * as vscode from 'vscode';
import { MetadataComponent, MetadataType } from '../types';
import { metadataService } from '../services/metadataService';
import { deployService } from '../services/deployService';
import { sfdxService } from '../services/sfdxService';
import { logger } from '../utils/logger';
import { MetadataTreeProvider, MetadataTreeItem } from '../views/metadataTreeProvider';
import { DeploySelectionTreeProvider } from '../views/deploySelectionTreeProvider';

/**
 * Comandos relacionados à leitura e manipulação de metadados
 */
export class MetadataCommands {
    constructor(
        private metadataTreeProvider: MetadataTreeProvider,
        private deploySelectionTreeProvider: DeploySelectionTreeProvider
    ) {}

    /**
     * Registra todos os comandos de metadados
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('sfdevops.refreshMetadata', () => this.refreshMetadata()),
            vscode.commands.registerCommand('sfdevops.viewPermissionSets', () => this.viewMetadataType('PermissionSet')),
            vscode.commands.registerCommand('sfdevops.viewProfiles', () => this.viewMetadataType('Profile')),
            vscode.commands.registerCommand('sfdevops.viewObjects', () => this.viewMetadataType('CustomObject')),
            vscode.commands.registerCommand('sfdevops.viewApexClasses', () => this.viewMetadataType('ApexClass')),
            vscode.commands.registerCommand('sfdevops.viewFlows', () => this.viewMetadataType('Flow')),
            vscode.commands.registerCommand('sfdevops.addToDeploySelection', 
                (item?: MetadataTreeItem) => this.addToDeploySelection(item)),
        );
    }

    /**
     * Comando: Atualizar metadados
     */
    private async refreshMetadata(): Promise<void> {
        const currentOrg = sfdxService.getCurrentOrg();

        if (!currentOrg) {
            vscode.window.showWarningMessage(
                'Nenhuma org conectada. Use "SF DevOps: Conectar à Org" primeiro.'
            );
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'SF DevOps: Atualizando metadados...',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Limpando cache...' });
                metadataService.clearCache();

                progress.report({ message: 'Carregando Permission Sets...' });
                await metadataService.listPermissionSets(true);

                progress.report({ message: 'Carregando Profiles...' });
                await metadataService.listProfiles(true);

                progress.report({ message: 'Carregando Objetos...' });
                await metadataService.listCustomObjects(true);

                progress.report({ message: 'Carregando Apex Classes...' });
                await metadataService.listApexClasses(true);

                progress.report({ message: 'Carregando Flows...' });
                await metadataService.listFlows(true);
            });

            this.metadataTreeProvider.refresh();
            vscode.window.showInformationMessage('Metadados atualizados com sucesso!');
        } catch (error) {
            logger.error('Erro ao atualizar metadados', error);
            vscode.window.showErrorMessage(
                `Erro ao atualizar metadados: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            );
        }
    }

    /**
     * Comando: Visualizar tipo de metadado específico
     */
    private async viewMetadataType(type: MetadataType): Promise<void> {
        const currentOrg = sfdxService.getCurrentOrg();

        if (!currentOrg) {
            vscode.window.showWarningMessage(
                'Nenhuma org conectada. Use "SF DevOps: Conectar à Org" primeiro.'
            );
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `SF DevOps: Carregando ${type}...`,
                cancellable: false
            }, async () => {
                const result = await metadataService.getMetadataByType(type, true);

                if (!result.success || !result.data) {
                    throw new Error(result.error || 'Erro ao carregar metadados');
                }

                // Cria uma lista formatada para exibição
                if (result.data.length === 0) {
                    vscode.window.showInformationMessage(`Nenhum ${type} encontrado na org.`);
                    return;
                }

                const items = result.data.map(comp => ({
                    label: comp.label || comp.fullName,
                    description: comp.fullName,
                    detail: comp.description,
                    component: comp,
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `Selecione um ${type} para adicionar ao deploy`,
                    title: `SF DevOps: ${type} (${result.data.length} encontrados)`,
                    canPickMany: true,
                });

                if (selected && selected.length > 0) {
                    for (const item of selected) {
                        deployService.addToSelection(item.component);
                    }
                    
                    this.deploySelectionTreeProvider.refresh();
                    vscode.window.showInformationMessage(
                        `${selected.length} componente(s) adicionado(s) à seleção de deploy.`
                    );
                }
            });

            this.metadataTreeProvider.refresh();
        } catch (error) {
            logger.error(`Erro ao visualizar ${type}`, error);
            vscode.window.showErrorMessage(
                `Erro ao carregar ${type}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            );
        }
    }

    /**
     * Comando: Adicionar componente à seleção de deploy
     */
    private async addToDeploySelection(item?: MetadataTreeItem): Promise<void> {
        try {
            if (!item || !item.component) {
                // Se não foi passado item, mostra busca
                const searchTerm = await vscode.window.showInputBox({
                    placeHolder: 'Nome do componente',
                    prompt: 'Digite o nome do componente para buscar',
                    title: 'SF DevOps: Buscar Componente',
                });

                if (!searchTerm) {
                    return;
                }

                const results = await metadataService.searchMetadata(searchTerm);

                if (results.length === 0) {
                    vscode.window.showInformationMessage(
                        `Nenhum componente encontrado para "${searchTerm}"`
                    );
                    return;
                }

                const items = results.map(comp => ({
                    label: comp.label || comp.fullName,
                    description: comp.type,
                    detail: comp.fullName,
                    component: comp,
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Selecione componentes para adicionar',
                    canPickMany: true,
                });

                if (selected && selected.length > 0) {
                    for (const s of selected) {
                        deployService.addToSelection(s.component);
                    }
                    
                    this.deploySelectionTreeProvider.refresh();
                    vscode.window.showInformationMessage(
                        `${selected.length} componente(s) adicionado(s) à seleção.`
                    );
                }
                return;
            }

            // Se é um Permission Set, pergunta se quer incluir relacionados
            if (item.component.type === 'PermissionSet' && item.component.id) {
                const includeRelated = await vscode.window.showQuickPick(
                    [
                        { label: 'Sim', description: 'Incluir objetos, campos e classes relacionados', value: true },
                        { label: 'Não', description: 'Adicionar apenas o Permission Set', value: false },
                    ],
                    {
                        placeHolder: 'Deseja incluir os componentes relacionados?',
                        title: 'SF DevOps: Adicionar Permission Set',
                    }
                );

                if (includeRelated === undefined) {
                    return;
                }

                if (includeRelated.value) {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: 'SF DevOps: Carregando componentes relacionados...',
                        cancellable: false
                    }, async () => {
                        const result = await deployService.addPermissionSetWithRelated(item.component!.id!);
                        
                        if (result.success && result.data) {
                            this.deploySelectionTreeProvider.refresh();
                            vscode.window.showInformationMessage(
                                `Permission Set e ${result.data.length - 1} componente(s) relacionado(s) adicionados.`
                            );
                        } else {
                            throw new Error(result.error);
                        }
                    });
                    return;
                }
            }

            // Adiciona o componente simples
            deployService.addToSelection(item.component);
            this.deploySelectionTreeProvider.refresh();
            
            vscode.window.showInformationMessage(
                `Componente "${item.component.label || item.component.fullName}" adicionado à seleção.`
            );
        } catch (error) {
            logger.error('Erro ao adicionar à seleção de deploy', error);
            vscode.window.showErrorMessage(
                `Erro ao adicionar componente: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            );
        }
    }
}
