import * as vscode from 'vscode';
import { OrgInfo } from '../types';
import { sfdxService } from '../services/sfdxService';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';
import { ConnectionTreeProvider } from '../views/connectionTreeProvider';

/**
 * Comandos relacionados à autenticação e conexão com orgs
 */
export class AuthCommands {
    constructor(
        private connectionTreeProvider: ConnectionTreeProvider
    ) {}

    /**
     * Registra todos os comandos de autenticação
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('sfdevops.authenticate', () => this.authenticate()),
            vscode.commands.registerCommand('sfdevops.selectOrg', (org?: OrgInfo) => this.selectOrg(org)),
        );
    }

    /**
     * Comando: Autenticar/verificar conexão
     */
    private async authenticate(): Promise<void> {
        try {
            // Verifica se o SFDX está instalado
            const isInstalled = await sfdxService.checkSfdxInstallation();
            
            if (!isInstalled) {
                const action = await vscode.window.showErrorMessage(
                    'Salesforce CLI não encontrado. Por favor, instale o Salesforce CLI para usar esta extensão.',
                    'Ver Documentação'
                );

                if (action === 'Ver Documentação') {
                    vscode.env.openExternal(vscode.Uri.parse('https://developer.salesforce.com/tools/salesforcecli'));
                }
                return;
            }

            // Tenta obter a org padrão
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'SF DevOps: Conectando...',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Verificando conexão...' });

                const defaultOrgResult = await sfdxService.getDefaultOrg();

                if (defaultOrgResult.success && defaultOrgResult.data) {
                    const org = defaultOrgResult.data;
                    
                    // Valida permissões
                    progress.report({ message: 'Validando permissões...' });
                    const permResult = await sfdxService.validateOrgPermissions();

                    if (permResult.success) {
                        vscode.window.showInformationMessage(
                            `Conectado à org: ${org.alias || org.username}`
                        );
                        
                        await auditService.logOrgConnected(org.alias || org.username);
                        this.connectionTreeProvider.setCurrentOrg(org);
                    } else {
                        vscode.window.showWarningMessage(
                            `Conectado à org ${org.alias || org.username}, mas algumas permissões podem estar faltando.`
                        );
                    }
                } else {
                    const action = await vscode.window.showWarningMessage(
                        'Nenhuma org padrão configurada. Deseja selecionar uma org?',
                        'Selecionar Org',
                        'Cancelar'
                    );

                    if (action === 'Selecionar Org') {
                        await this.selectOrg();
                    }
                }
            });

            this.connectionTreeProvider.refresh();
        } catch (error) {
            logger.error('Erro ao autenticar', error);
            vscode.window.showErrorMessage(
                `Erro ao conectar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            );
        }
    }

    /**
     * Comando: Selecionar org
     */
    private async selectOrg(org?: OrgInfo): Promise<void> {
        try {
            // Se org foi passada diretamente (via tree view)
            if (org) {
                await this.setOrg(org);
                return;
            }

            // Lista orgs disponíveis
            const orgsResult = await sfdxService.listOrgs();

            if (!orgsResult.success || !orgsResult.data || orgsResult.data.length === 0) {
                vscode.window.showWarningMessage(
                    'Nenhuma org autenticada encontrada. Use "sf org login" no terminal para autenticar uma org.'
                );
                return;
            }

            // Mostra quick pick com as orgs
            const items = orgsResult.data.map(o => ({
                label: o.alias || o.username,
                description: o.isSandbox ? 'Sandbox' : 'Production',
                detail: o.username,
                org: o,
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Selecione uma org',
                title: 'SF DevOps: Selecionar Org',
            });

            if (selected) {
                await this.setOrg(selected.org);
            }
        } catch (error) {
            logger.error('Erro ao selecionar org', error);
            vscode.window.showErrorMessage(
                `Erro ao selecionar org: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            );
        }
    }

    /**
     * Define a org atual
     */
    private async setOrg(org: OrgInfo): Promise<void> {
        const result = await sfdxService.setCurrentOrg(org.alias || org.username);

        if (result.success) {
            vscode.window.showInformationMessage(
                `Org selecionada: ${org.alias || org.username}`
            );
            
            await auditService.logOrgConnected(org.alias || org.username);
            this.connectionTreeProvider.setCurrentOrg(org);
            this.connectionTreeProvider.refresh();
        } else {
            vscode.window.showErrorMessage(
                `Erro ao selecionar org: ${result.error}`
            );
        }
    }
}
