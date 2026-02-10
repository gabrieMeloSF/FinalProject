import * as vscode from 'vscode';

// Services
import { sfdxService } from './services/sfdxService';
import { auditService } from './services/auditService';

// Views
import { ConnectionTreeProvider } from './views/connectionTreeProvider';
import { MetadataTreeProvider } from './views/metadataTreeProvider';
import { DeploySelectionTreeProvider } from './views/deploySelectionTreeProvider';
import { AuditTreeProvider } from './views/auditTreeProvider';

// Commands
import { AuthCommands } from './commands/authCommands';
import { MetadataCommands } from './commands/metadataCommands';
import { DeployCommands } from './commands/deployCommands';
import { DiffCommands } from './commands/diffCommands';
import { AuditCommands } from './commands/auditCommands';

// Utils
import { logger } from './utils/logger';

/**
 * Função de ativação da extensão
 * Chamada quando a extensão é ativada pela primeira vez
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    logger.info('Ativando extensão SF DevOps Assistant...');

    try {
        // Inicializa o serviço de auditoria
        await auditService.initialize();

        // Cria os providers de Tree View
        const connectionTreeProvider = new ConnectionTreeProvider();
        const metadataTreeProvider = new MetadataTreeProvider();
        const deploySelectionTreeProvider = new DeploySelectionTreeProvider();
        const auditTreeProvider = new AuditTreeProvider();

        // Registra as Tree Views
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('sfdevops-connection', connectionTreeProvider),
            vscode.window.registerTreeDataProvider('sfdevops-metadata', metadataTreeProvider),
            vscode.window.registerTreeDataProvider('sfdevops-deploy-selection', deploySelectionTreeProvider),
            vscode.window.registerTreeDataProvider('sfdevops-audit', auditTreeProvider)
        );

        // Cria instâncias dos handlers de comandos
        const authCommands = new AuthCommands(connectionTreeProvider);
        const metadataCommands = new MetadataCommands(metadataTreeProvider, deploySelectionTreeProvider);
        const deployCommands = new DeployCommands(deploySelectionTreeProvider);
        const diffCommands = new DiffCommands();
        const auditCommands = new AuditCommands(auditTreeProvider);

        // Registra os comandos
        authCommands.registerCommands(context);
        metadataCommands.registerCommands(context);
        deployCommands.registerCommands(context);
        diffCommands.registerCommands(context);
        auditCommands.registerCommands(context);

        // Verifica instalação do SFDX na ativação
        const sfdxInstalled = await sfdxService.checkSfdxInstallation();
        
        if (!sfdxInstalled) {
            vscode.window.showWarningMessage(
                'SF DevOps: Salesforce CLI não encontrado. Algumas funcionalidades podem não funcionar corretamente.'
            );
        } else {
            // Tenta conectar à org padrão automaticamente
            try {
                await sfdxService.getDefaultOrg();
                logger.info('Org padrão carregada automaticamente');
            } catch {
                logger.info('Nenhuma org padrão configurada');
            }
        }

        // Mostra mensagem de boas-vindas
        logger.info('SF DevOps Assistant ativado com sucesso!');
        
        // Mostra a sidebar da extensão
        vscode.commands.executeCommand('workbench.view.extension.sfdevops-explorer');

    } catch (error) {
        logger.error('Erro ao ativar a extensão', error);
        vscode.window.showErrorMessage(
            `SF DevOps: Erro ao ativar a extensão: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
        );
    }
}

/**
 * Função de desativação da extensão
 * Chamada quando a extensão é desativada
 */
export function deactivate(): void {
    logger.info('Desativando extensão SF DevOps Assistant...');
    logger.dispose();
}
