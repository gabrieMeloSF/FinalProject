import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { OrgInfo, AuthResult, OperationResult } from '../types';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

/**
 * Interface para resultados do SFDX CLI
 */
interface SfdxResult<T> {
    status: number;
    result: T;
    warnings?: string[];
}

interface SfdxOrgListResult {
    nonScratchOrgs: SfdxOrgInfo[];
    scratchOrgs: SfdxOrgInfo[];
}

interface SfdxOrgInfo {
    alias?: string;
    username: string;
    orgId: string;
    instanceUrl: string;
    accessToken?: string;
    isDefaultDevHubUsername?: boolean;
    isDefaultUsername?: boolean;
    connectedStatus: string;
    isSandbox?: boolean;
}

interface SfdxOrgDisplayResult {
    alias?: string;
    username: string;
    id: string;
    instanceUrl: string;
    accessToken: string;
    connectedStatus: string;
    sfdxAuthUrl?: string;
}

/**
 * Serviço para integração com Salesforce CLI (SFDX)
 * Responsável por gerenciar conexões e executar comandos do CLI
 */
export class SfdxService {
    private static instance: SfdxService;
    private currentOrg: OrgInfo | null = null;
    private cachedOrgs: OrgInfo[] = [];

    private constructor() {}

    public static getInstance(): SfdxService {
        if (!SfdxService.instance) {
            SfdxService.instance = new SfdxService();
        }
        return SfdxService.instance;
    }

    /**
     * Executa um comando SFDX e retorna o resultado parseado
     */
    private async executeSfdxCommand<T>(command: string): Promise<SfdxResult<T>> {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        logger.debug(`Executando comando SFDX: ${command}`);
        
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: workspacePath,
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            });

            if (stderr && !stderr.includes('Warning')) {
                logger.warn(`SFDX stderr: ${stderr}`);
            }

            const result = JSON.parse(stdout) as SfdxResult<T>;
            logger.debug('Comando SFDX executado com sucesso');
            return result;
        } catch (error) {
            logger.error('Erro ao executar comando SFDX', error);
            throw error;
        }
    }

    /**
     * Verifica se o Salesforce CLI está instalado
     */
    public async checkSfdxInstallation(): Promise<boolean> {
        try {
            await execAsync('sf --version');
            logger.info('Salesforce CLI detectado');
            return true;
        } catch {
            try {
                await execAsync('sfdx --version');
                logger.info('SFDX CLI detectado');
                return true;
            } catch {
                logger.error('Salesforce CLI não encontrado');
                return false;
            }
        }
    }

    /**
     * Lista todas as orgs autenticadas
     */
    public async listOrgs(): Promise<OperationResult<OrgInfo[]>> {
        try {
            const result = await this.executeSfdxCommand<SfdxOrgListResult>(
                'sf org list --json'
            );

            const orgs: OrgInfo[] = [];

            // Processa non-scratch orgs
            if (result.result.nonScratchOrgs) {
                for (const org of result.result.nonScratchOrgs) {
                    orgs.push(this.mapSfdxOrgToOrgInfo(org));
                }
            }

            // Processa scratch orgs
            if (result.result.scratchOrgs) {
                for (const org of result.result.scratchOrgs) {
                    orgs.push(this.mapSfdxOrgToOrgInfo(org));
                }
            }

            this.cachedOrgs = orgs;
            logger.info(`${orgs.length} org(s) encontrada(s)`);

            return { success: true, data: orgs };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao listar orgs', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Obtém informações detalhadas de uma org
     */
    public async getOrgInfo(aliasOrUsername: string): Promise<OperationResult<OrgInfo>> {
        try {
            const result = await this.executeSfdxCommand<SfdxOrgDisplayResult>(
                `sf org display --target-org ${aliasOrUsername} --json`
            );

            const orgInfo: OrgInfo = {
                alias: result.result.alias,
                username: result.result.username,
                orgId: result.result.id,
                instanceUrl: result.result.instanceUrl,
                accessToken: result.result.accessToken,
                isDefault: false,
                isSandbox: result.result.instanceUrl?.includes('sandbox') || 
                           result.result.instanceUrl?.includes('.cs') || false,
                connectedStatus: result.result.connectedStatus === 'Connected' ? 'Connected' : 'Disconnected',
            };

            return { success: true, data: orgInfo };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error(`Erro ao obter informações da org: ${aliasOrUsername}`, error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Define a org atual para operações
     */
    public async setCurrentOrg(aliasOrUsername: string): Promise<AuthResult> {
        try {
            const orgResult = await this.getOrgInfo(aliasOrUsername);
            
            if (!orgResult.success || !orgResult.data) {
                return { success: false, error: orgResult.error || 'Org não encontrada' };
            }

            this.currentOrg = orgResult.data;
            logger.info(`Org atual definida: ${aliasOrUsername}`);

            return { success: true, org: this.currentOrg };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao definir org atual', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Obtém a org atual
     */
    public getCurrentOrg(): OrgInfo | null {
        return this.currentOrg;
    }

    /**
     * Obtém a org padrão do projeto
     */
    public async getDefaultOrg(): Promise<OperationResult<OrgInfo>> {
        try {
            const result = await this.executeSfdxCommand<SfdxOrgDisplayResult>(
                'sf org display --json'
            );

            const orgInfo: OrgInfo = {
                alias: result.result.alias,
                username: result.result.username,
                orgId: result.result.id,
                instanceUrl: result.result.instanceUrl,
                accessToken: result.result.accessToken,
                isDefault: true,
                isSandbox: result.result.instanceUrl?.includes('sandbox') || false,
                connectedStatus: result.result.connectedStatus === 'Connected' ? 'Connected' : 'Disconnected',
            };

            this.currentOrg = orgInfo;
            return { success: true, data: orgInfo };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao obter org padrão', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Executa um comando Salesforce genérico
     */
    public async executeCommand<T>(command: string): Promise<OperationResult<T>> {
        try {
            const result = await this.executeSfdxCommand<T>(command);
            return { success: true, data: result.result, warnings: result.warnings };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Obtém o access token da org atual
     */
    public async getAccessToken(aliasOrUsername?: string): Promise<string | null> {
        try {
            const target = aliasOrUsername || this.currentOrg?.alias || this.currentOrg?.username;
            
            if (!target) {
                logger.error('Nenhuma org especificada para obter access token');
                return null;
            }

            const result = await this.getOrgInfo(target);
            return result.data?.accessToken || null;
        } catch (error) {
            logger.error('Erro ao obter access token', error);
            return null;
        }
    }

    /**
     * Obtém a instância URL da org atual
     */
    public getInstanceUrl(): string | null {
        return this.currentOrg?.instanceUrl || null;
    }

    /**
     * Valida as permissões da org atual para leitura de metadados
     */
    public async validateOrgPermissions(): Promise<OperationResult<boolean>> {
        try {
            // Tenta uma query simples para validar acesso
            const testQuery = 'sf data query --query "SELECT Id FROM Organization LIMIT 1" --json';
            await this.executeSfdxCommand(testQuery);
            
            logger.info('Permissões da org validadas');
            return { success: true, data: true };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Falha na validação de permissões', error);
            return { success: false, error: errorMessage, data: false };
        }
    }

    /**
     * Obtém as orgs em cache
     */
    public getCachedOrgs(): OrgInfo[] {
        return this.cachedOrgs;
    }

    /**
     * Mapeia o resultado do SFDX para OrgInfo
     */
    private mapSfdxOrgToOrgInfo(sfdxOrg: SfdxOrgInfo): OrgInfo {
        return {
            alias: sfdxOrg.alias,
            username: sfdxOrg.username,
            orgId: sfdxOrg.orgId,
            instanceUrl: sfdxOrg.instanceUrl,
            accessToken: sfdxOrg.accessToken,
            isDefault: sfdxOrg.isDefaultUsername || false,
            isSandbox: sfdxOrg.isSandbox || false,
            connectedStatus: sfdxOrg.connectedStatus === 'Connected' ? 'Connected' : 'Disconnected',
        };
    }

    /**
     * Abre a org no navegador
     */
    public async openOrg(aliasOrUsername?: string): Promise<OperationResult<void>> {
        try {
            const target = aliasOrUsername || this.currentOrg?.alias || this.currentOrg?.username;
            
            if (!target) {
                return { success: false, error: 'Nenhuma org especificada' };
            }

            await execAsync(`sf org open --target-org ${target}`);
            logger.info(`Org aberta no navegador: ${target}`);
            return { success: true };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao abrir org', error);
            return { success: false, error: errorMessage };
        }
    }
}

export const sfdxService = SfdxService.getInstance();
