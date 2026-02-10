import * as vscode from 'vscode';
import { diffService } from '../services/diffService';
import { sfdxService } from '../services/sfdxService';
import { logger } from '../utils/logger';

/**
 * Comandos relacionados à comparação de metadados entre ambientes
 */
export class DiffCommands {
    /**
     * Registra todos os comandos de diff
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('sfdevops.diffMetadata', () => this.diffMetadata()),
            vscode.commands.registerCommand('sfdevops.diffLocalVsOrg', () => this.diffLocalVsOrg()),
            vscode.commands.registerCommand('sfdevops.diffOrgVsOrg', () => this.diffOrgVsOrg()),
        );
    }

    /**
     * Comando: Comparar metadados (menu principal)
     */
    private async diffMetadata(): Promise<void> {
        const choice = await vscode.window.showQuickPick([
            { 
                label: 'Org vs Org', 
                value: 'org-vs-org', 
                description: 'Comparar metadados entre duas orgs',
                detail: 'Útil para verificar diferenças entre ambientes (ex: Sandbox vs Production)'
            },
            { 
                label: 'Local vs Org', 
                value: 'local-vs-org', 
                description: 'Comparar metadados locais com uma org',
                detail: 'Útil para verificar o que está diferente entre seu código local e a org'
            },
        ], {
            placeHolder: 'Selecione o tipo de comparação',
            title: 'SF DevOps: Comparar Metadados',
        });

        if (!choice) {
            return;
        }

        if (choice.value === 'org-vs-org') {
            await this.diffOrgVsOrg();
        } else {
            await this.diffLocalVsOrg();
        }
    }

    /**
     * Comando: Comparar Local vs Org
     */
    private async diffLocalVsOrg(): Promise<void> {
        vscode.window.showInformationMessage(
            'A funcionalidade de diff Local vs Org será implementada em uma versão futura.'
        );
        
        // TODO: Implementar diff entre arquivos locais e org
        // Esta funcionalidade requer:
        // 1. Parsear arquivos XML locais
        // 2. Comparar com metadados da org
        // 3. Mostrar diferenças
    }

    /**
     * Comando: Comparar Org vs Org
     */
    private async diffOrgVsOrg(): Promise<void> {
        try {
            // Lista orgs disponíveis
            const orgsResult = await sfdxService.listOrgs();

            if (!orgsResult.success || !orgsResult.data || orgsResult.data.length < 2) {
                vscode.window.showWarningMessage(
                    'São necessárias pelo menos 2 orgs autenticadas para fazer uma comparação.'
                );
                return;
            }

            const orgItems = orgsResult.data.map(org => ({
                label: org.alias || org.username,
                description: org.isSandbox ? 'Sandbox' : 'Production',
                detail: org.username,
                org,
            }));

            // Seleciona org de origem
            const sourceOrg = await vscode.window.showQuickPick(orgItems, {
                placeHolder: 'Selecione a org de ORIGEM',
                title: 'SF DevOps: Diff Org vs Org - Origem',
            });

            if (!sourceOrg) {
                return;
            }

            // Remove a org de origem da lista para destino
            const targetItems = orgItems.filter(item => item.org.username !== sourceOrg.org.username);

            // Seleciona org de destino
            const targetOrg = await vscode.window.showQuickPick(targetItems, {
                placeHolder: 'Selecione a org de DESTINO',
                title: 'SF DevOps: Diff Org vs Org - Destino',
            });

            if (!targetOrg) {
                return;
            }

            // Seleciona tipo de metadado para comparar
            const metadataType = await vscode.window.showQuickPick([
                { label: 'Permission Sets', value: 'PermissionSet', description: 'Comparar Permission Sets' },
                // Outros tipos podem ser adicionados futuramente
            ], {
                placeHolder: 'Selecione o tipo de metadado para comparar',
                title: 'SF DevOps: Diff Org vs Org - Tipo de Metadado',
            });

            if (!metadataType) {
                return;
            }

            // Opcionalmente, seleciona um componente específico
            const specificComponent = await vscode.window.showInputBox({
                placeHolder: 'Nome do componente (deixe vazio para comparar todos)',
                prompt: 'Digite o nome de um componente específico ou deixe vazio',
                title: 'SF DevOps: Diff Org vs Org - Componente Específico',
            });

            // Executa o diff
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'SF DevOps: Executando comparação...',
                cancellable: false
            }, async (progress) => {
                progress.report({ 
                    message: `Comparando ${sourceOrg.label} vs ${targetOrg.label}...` 
                });

                const result = await diffService.diffPermissionSets(
                    sourceOrg.org.alias || sourceOrg.org.username,
                    targetOrg.org.alias || targetOrg.org.username,
                    specificComponent || undefined
                );

                if (!result.success || !result.data) {
                    throw new Error(result.error || 'Erro ao executar comparação');
                }

                // Formata e mostra o resultado
                const formattedResult = diffService.formatDiffResult(result.data);

                // Cria documento para mostrar o resultado
                const doc = await vscode.workspace.openTextDocument({
                    content: formattedResult,
                    language: 'plaintext',
                });

                await vscode.window.showTextDocument(doc, {
                    viewColumn: vscode.ViewColumn.Beside,
                    preview: true,
                });

                // Mostra resumo
                const summary = result.data.summary;
                vscode.window.showInformationMessage(
                    `Diff concluído: +${summary.added} -${summary.removed} ~${summary.modified} =${summary.unchanged}`
                );
            });
        } catch (error) {
            logger.error('Erro ao executar diff', error);
            vscode.window.showErrorMessage(
                `Erro ao comparar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            );
        }
    }
}
