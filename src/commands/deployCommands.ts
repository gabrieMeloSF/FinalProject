import * as vscode from 'vscode';
import { deployService } from '../services/deployService';
import { metadataService } from '../services/metadataService';
import { sfdxService } from '../services/sfdxService';
import { logger } from '../utils/logger';
import { DeploySelectionTreeProvider, DeploySelectionTreeItem } from '../views/deploySelectionTreeProvider';
import { configManager } from '../utils/config';

/**
 * Comandos relacionados à montagem e geração de pacotes de deploy
 */
export class DeployCommands {
    constructor(
        private deploySelectionTreeProvider: DeploySelectionTreeProvider
    ) {}

    /**
     * Registra todos os comandos de deploy
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('sfdevops.createDeployPackage', () => this.createDeployPackage()),
            vscode.commands.registerCommand('sfdevops.assistedDeploy', () => this.assistedDeploy()),
            vscode.commands.registerCommand('sfdevops.removeFromDeploySelection', 
                (item?: DeploySelectionTreeItem) => this.removeFromDeploySelection(item)),
            vscode.commands.registerCommand('sfdevops.clearDeploySelection', () => this.clearDeploySelection()),
            vscode.commands.registerCommand('sfdevops.generatePackageXml', () => this.generatePackageXml()),
            vscode.commands.registerCommand('sfdevops.generateCommitMessage', () => this.generateCommitMessage()),
        );
    }

    /**
     * Comando: Criar pacote de deploy
     */
    private async createDeployPackage(): Promise<void> {
        const selection = deployService.getCurrentSelection();

        if (selection.items.length === 0) {
            vscode.window.showWarningMessage(
                'Nenhum componente selecionado. Adicione componentes antes de criar o pacote.'
            );
            return;
        }

        try {
            // Pergunta se quer especificar org de destino
            const targetOrg = await vscode.window.showInputBox({
                placeHolder: 'Alias ou username da org de destino (opcional)',
                prompt: 'Digite a org de destino para referência no pacote',
                title: 'SF DevOps: Org de Destino',
            });

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'SF DevOps: Gerando pacote de deploy...',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Coletando metadados...' });

                const packageResult = await deployService.generateDeployPackage(targetOrg);

                if (!packageResult.success || !packageResult.data) {
                    throw new Error(packageResult.error || 'Erro ao gerar pacote');
                }

                progress.report({ message: 'Exportando arquivos...' });

                const exportResult = await deployService.exportPackage(packageResult.data);

                if (!exportResult.success || !exportResult.data) {
                    throw new Error(exportResult.error || 'Erro ao exportar pacote');
                }

                // Abre o diretório do pacote
                const openAction = await vscode.window.showInformationMessage(
                    `Pacote gerado com sucesso em: ${exportResult.data}`,
                    'Abrir Pasta',
                    'Abrir package.xml'
                );

                if (openAction === 'Abrir Pasta') {
                    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(exportResult.data));
                } else if (openAction === 'Abrir package.xml') {
                    const packageXmlPath = vscode.Uri.file(`${exportResult.data}/package.xml`);
                    vscode.window.showTextDocument(packageXmlPath);
                }
            });
        } catch (error) {
            logger.error('Erro ao criar pacote de deploy', error);
            vscode.window.showErrorMessage(
                `Erro ao criar pacote: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            );
        }
    }

    /**
     * Comando: Montagem assistida de deploy (Feature Central)
     */
    private async assistedDeploy(): Promise<void> {
        const currentOrg = sfdxService.getCurrentOrg();

        if (!currentOrg) {
            vscode.window.showWarningMessage(
                'Nenhuma org conectada. Use "SF DevOps: Conectar à Org" primeiro.'
            );
            return;
        }

        try {
            // Passo 1: Selecionar tipo de componente principal
            const componentType = await vscode.window.showQuickPick([
                { label: 'Permission Set', value: 'PermissionSet', description: 'Começar a partir de um Permission Set' },
                { label: 'Profile', value: 'Profile', description: 'Começar a partir de um Profile' },
                { label: 'Custom Object', value: 'CustomObject', description: 'Começar a partir de um Objeto' },
                { label: 'Apex Class', value: 'ApexClass', description: 'Começar a partir de uma Classe Apex' },
            ], {
                placeHolder: 'Selecione o tipo de componente para iniciar',
                title: 'SF DevOps: Montagem Assistida - Passo 1/4',
            });

            if (!componentType) {
                return;
            }

            // Passo 2: Carregar e selecionar componentes
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `SF DevOps: Carregando ${componentType.label}...`,
                cancellable: false
            }, async () => {
                const result = await metadataService.getMetadataByType(
                    componentType.value as 'PermissionSet' | 'Profile' | 'CustomObject' | 'ApexClass',
                    true
                );

                if (!result.success || !result.data || result.data.length === 0) {
                    throw new Error(`Nenhum ${componentType.label} encontrado na org.`);
                }

                const items = result.data.map(comp => ({
                    label: comp.label || comp.fullName,
                    description: comp.fullName,
                    detail: comp.description,
                    component: comp,
                }));

                const selectedComponents = await vscode.window.showQuickPick(items, {
                    placeHolder: `Selecione os ${componentType.label}s para o deploy`,
                    title: 'SF DevOps: Montagem Assistida - Passo 2/4',
                    canPickMany: true,
                });

                if (!selectedComponents || selectedComponents.length === 0) {
                    return;
                }

                // Passo 3: Incluir relacionados (para Permission Sets)
                let includeRelated = false;
                if (componentType.value === 'PermissionSet') {
                    const relatedChoice = await vscode.window.showQuickPick([
                        { label: 'Sim', value: true, description: 'Incluir objetos, campos e classes do Permission Set' },
                        { label: 'Não', value: false, description: 'Incluir apenas os Permission Sets' },
                    ], {
                        placeHolder: 'Deseja incluir componentes relacionados?',
                        title: 'SF DevOps: Montagem Assistida - Passo 3/4',
                    });

                    includeRelated = relatedChoice?.value || false;
                }

                // Adiciona os componentes à seleção
                for (const item of selectedComponents) {
                    if (includeRelated && componentType.value === 'PermissionSet' && item.component.id) {
                        await deployService.addPermissionSetWithRelated(item.component.id);
                    } else {
                        deployService.addToSelection(item.component, false);
                    }
                }

                this.deploySelectionTreeProvider.refresh();

                // Passo 4: Perguntar se quer gerar o pacote agora
                const generateNow = await vscode.window.showQuickPick([
                    { label: 'Gerar Pacote Agora', value: 'generate', description: 'Criar os arquivos de deploy imediatamente' },
                    { label: 'Continuar Adicionando', value: 'continue', description: 'Adicionar mais componentes antes de gerar' },
                    { label: 'Ver Seleção', value: 'view', description: 'Revisar os componentes selecionados' },
                ], {
                    placeHolder: 'O que deseja fazer agora?',
                    title: 'SF DevOps: Montagem Assistida - Passo 4/4',
                });

                if (generateNow?.value === 'generate') {
                    await this.createDeployPackage();
                } else if (generateNow?.value === 'view') {
                    // Foca na view de seleção
                    vscode.commands.executeCommand('sfdevops-deploy-selection.focus');
                }

                const stats = deployService.getSelectionStats();
                vscode.window.showInformationMessage(
                    `${stats.total} componente(s) adicionado(s) à seleção de deploy.`
                );
            });
        } catch (error) {
            logger.error('Erro na montagem assistida', error);
            vscode.window.showErrorMessage(
                `Erro na montagem assistida: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            );
        }
    }

    /**
     * Comando: Remover da seleção de deploy
     */
    private async removeFromDeploySelection(item?: DeploySelectionTreeItem): Promise<void> {
        if (!item || !item.deployItem) {
            vscode.window.showWarningMessage('Selecione um item para remover.');
            return;
        }

        const removed = deployService.removeFromSelection(item.deployItem.id);

        if (removed) {
            this.deploySelectionTreeProvider.refresh();
            vscode.window.showInformationMessage(
                `Componente "${item.deployItem.component.fullName}" removido da seleção.`
            );
        }
    }

    /**
     * Comando: Limpar seleção de deploy
     */
    private async clearDeploySelection(): Promise<void> {
        const selection = deployService.getCurrentSelection();

        if (selection.items.length === 0) {
            vscode.window.showInformationMessage('A seleção já está vazia.');
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Deseja remover todos os ${selection.items.length} componente(s) da seleção?`,
            { modal: true },
            'Sim, Limpar'
        );

        if (confirm === 'Sim, Limpar') {
            deployService.clearSelection();
            this.deploySelectionTreeProvider.refresh();
            vscode.window.showInformationMessage('Seleção de deploy limpa.');
        }
    }

    /**
     * Comando: Gerar apenas o package.xml
     */
    private async generatePackageXml(): Promise<void> {
        const selection = deployService.getCurrentSelection();

        if (selection.items.length === 0) {
            vscode.window.showWarningMessage(
                'Nenhum componente selecionado. Adicione componentes antes de gerar o package.xml.'
            );
            return;
        }

        try {
            const packageXml = deployService.generatePackageXml();

            // Cria um documento temporário para mostrar o XML
            const doc = await vscode.workspace.openTextDocument({
                content: packageXml,
                language: 'xml',
            });

            await vscode.window.showTextDocument(doc);

            // Oferece salvar
            const saveAction = await vscode.window.showInformationMessage(
                'package.xml gerado. Deseja salvar?',
                'Salvar Como'
            );

            if (saveAction === 'Salvar Como') {
                const saveUri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file('package.xml'),
                    filters: {
                        'XML Files': ['xml'],
                    },
                });

                if (saveUri) {
                    const encoder = new TextEncoder();
                    await vscode.workspace.fs.writeFile(saveUri, encoder.encode(packageXml));
                    vscode.window.showInformationMessage(`Arquivo salvo: ${saveUri.fsPath}`);
                }
            }
        } catch (error) {
            logger.error('Erro ao gerar package.xml', error);
            vscode.window.showErrorMessage(
                `Erro ao gerar package.xml: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            );
        }
    }

    /**
     * Comando: Gerar sugestão de mensagem de commit
     */
    private async generateCommitMessage(): Promise<void> {
        const selection = deployService.getCurrentSelection();

        if (selection.items.length === 0) {
            vscode.window.showWarningMessage(
                'Nenhum componente selecionado para gerar mensagem de commit.'
            );
            return;
        }

        const message = deployService.generateCommitMessage();

        // Mostra a mensagem e oferece copiar
        const action = await vscode.window.showInformationMessage(
            `Sugestão de commit:\n${message}`,
            'Copiar',
            'Usar no Git'
        );

        if (action === 'Copiar') {
            await vscode.env.clipboard.writeText(message);
            vscode.window.showInformationMessage('Mensagem copiada para a área de transferência.');
        } else if (action === 'Usar no Git') {
            // Tenta abrir o painel de controle de fonte com a mensagem
            vscode.commands.executeCommand('workbench.view.scm');
            // A mensagem é copiada para uso manual
            await vscode.env.clipboard.writeText(message);
            vscode.window.showInformationMessage(
                'Mensagem copiada. Cole no campo de mensagem do commit.'
            );
        }
    }
}
