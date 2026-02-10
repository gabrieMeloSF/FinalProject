import * as path from 'path';
import {
    AuditEntry,
    AuditAction,
    AuditDetails,
    AuditLog,
    DeployPackage,
    DiffResult,
    MetadataType,
    OperationResult
} from '../types';
import { logger } from '../utils/logger';
import { configManager } from '../utils/config';
import { FileUtils } from '../utils/fileUtils';

/**
 * Serviço de auditoria e rastreabilidade
 * Registra todas as operações realizadas pela extensão
 */
export class AuditService {
    private static instance: AuditService;
    private auditLog: AuditLog;
    private initialized = false;

    private constructor() {
        this.auditLog = {
            entries: [],
            lastUpdated: new Date(),
        };
    }

    public static getInstance(): AuditService {
        if (!AuditService.instance) {
            AuditService.instance = new AuditService();
        }
        return AuditService.instance;
    }

    /**
     * Inicializa o serviço de auditoria
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {return;}

        try {
            const logPath = configManager.getAuditLogPath();
            
            if (await FileUtils.fileExists(logPath)) {
                const content = await FileUtils.readFile(logPath);
                this.auditLog = JSON.parse(content);
                // Converte datas de string para Date
                this.auditLog.entries = this.auditLog.entries.map(entry => ({
                    ...entry,
                    timestamp: new Date(entry.timestamp),
                }));
                this.auditLog.lastUpdated = new Date(this.auditLog.lastUpdated);
            }

            this.initialized = true;
            logger.info('Serviço de auditoria inicializado');
        } catch (error) {
            logger.error('Erro ao inicializar serviço de auditoria', error);
            // Continua com log vazio
            this.initialized = true;
        }
    }

    /**
     * Gera um ID único para entrada de auditoria
     */
    private generateEntryId(): string {
        return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Obtém o usuário atual
     */
    private getCurrentUser(): string {
        return process.env.USER || process.env.USERNAME || 'unknown';
    }

    /**
     * Adiciona uma entrada de auditoria
     */
    private async addEntry(
        action: AuditAction,
        details: AuditDetails,
        sourceOrg?: string,
        targetOrg?: string
    ): Promise<void> {
        if (!configManager.get<boolean>('enableAuditLog')) {
            return;
        }

        const entry: AuditEntry = {
            id: this.generateEntryId(),
            timestamp: new Date(),
            action,
            user: this.getCurrentUser(),
            sourceOrg,
            targetOrg,
            details,
        };

        this.auditLog.entries.push(entry);
        this.auditLog.lastUpdated = new Date();

        // Persiste o log
        await this.saveLog();

        logger.debug(`Entrada de auditoria adicionada: ${action}`);
    }

    /**
     * Salva o log em disco
     */
    private async saveLog(): Promise<void> {
        try {
            const logPath = configManager.getAuditLogPath();
            const logDir = path.dirname(logPath);
            
            await FileUtils.ensureDirectory(logDir);
            await FileUtils.writeFile(logPath, JSON.stringify(this.auditLog, null, 2));
        } catch (error) {
            logger.error('Erro ao salvar log de auditoria', error);
        }
    }

    // =========================================================================
    // MÉTODOS DE LOG ESPECÍFICOS
    // =========================================================================

    /**
     * Registra criação de pacote de deploy
     */
    public async logPackageCreated(deployPackage: DeployPackage): Promise<void> {
        const componentTypes: MetadataType[] = [];
        
        for (const type of deployPackage.manifest.types) {
            if (!componentTypes.includes(type.name)) {
                componentTypes.push(type.name);
            }
        }

        await this.addEntry(
            'PACKAGE_CREATED',
            {
                componentsCount: deployPackage.metadataFiles.length,
                componentTypes,
            },
            deployPackage.sourceOrg,
            deployPackage.targetOrg
        );
    }

    /**
     * Registra exportação de pacote
     */
    public async logPackageExported(packagePath: string): Promise<void> {
        await this.addEntry(
            'PACKAGE_EXPORTED',
            {
                packagePath,
            }
        );
    }

    /**
     * Registra execução de diff
     */
    public async logDiffExecuted(diffResult: DiffResult): Promise<void> {
        await this.addEntry(
            'DIFF_EXECUTED',
            {
                componentTypes: [diffResult.componentType],
                diffSummary: diffResult.summary,
            },
            diffResult.source.identifier,
            diffResult.target.identifier
        );
    }

    /**
     * Registra recuperação de metadados
     */
    public async logMetadataRetrieved(
        componentType: MetadataType,
        count: number,
        sourceOrg: string
    ): Promise<void> {
        await this.addEntry(
            'METADATA_RETRIEVED',
            {
                componentsCount: count,
                componentTypes: [componentType],
            },
            sourceOrg
        );
    }

    /**
     * Registra atualização na seleção de deploy
     */
    public async logSelectionUpdated(
        componentsCount: number,
        componentTypes: MetadataType[]
    ): Promise<void> {
        await this.addEntry(
            'SELECTION_UPDATED',
            {
                componentsCount,
                componentTypes,
            }
        );
    }

    /**
     * Registra conexão com org
     */
    public async logOrgConnected(orgAlias: string): Promise<void> {
        await this.addEntry(
            'ORG_CONNECTED',
            {},
            orgAlias
        );
    }

    /**
     * Registra desconexão da org
     */
    public async logOrgDisconnected(orgAlias: string): Promise<void> {
        await this.addEntry(
            'ORG_DISCONNECTED',
            {},
            orgAlias
        );
    }

    // =========================================================================
    // MÉTODOS DE CONSULTA
    // =========================================================================

    /**
     * Obtém todas as entradas de auditoria
     */
    public getEntries(): AuditEntry[] {
        return [...this.auditLog.entries];
    }

    /**
     * Obtém entradas filtradas por ação
     */
    public getEntriesByAction(action: AuditAction): AuditEntry[] {
        return this.auditLog.entries.filter(entry => entry.action === action);
    }

    /**
     * Obtém entradas de um período
     */
    public getEntriesByDateRange(startDate: Date, endDate: Date): AuditEntry[] {
        return this.auditLog.entries.filter(
            entry => entry.timestamp >= startDate && entry.timestamp <= endDate
        );
    }

    /**
     * Obtém entradas recentes
     */
    public getRecentEntries(count: number = 10): AuditEntry[] {
        return [...this.auditLog.entries]
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, count);
    }

    /**
     * Obtém o log completo
     */
    public getAuditLog(): AuditLog {
        return { ...this.auditLog };
    }

    /**
     * Limpa o log de auditoria
     */
    public async clearLog(): Promise<void> {
        this.auditLog = {
            entries: [],
            lastUpdated: new Date(),
        };
        await this.saveLog();
        logger.info('Log de auditoria limpo');
    }

    /**
     * Exporta o log para arquivo
     */
    public async exportLog(outputPath: string): Promise<OperationResult<string>> {
        try {
            const content = JSON.stringify(this.auditLog, null, 2);
            await FileUtils.writeFile(outputPath, content);
            logger.info(`Log de auditoria exportado para: ${outputPath}`);
            return { success: true, data: outputPath };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao exportar log de auditoria', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Formata o log para exibição
     */
    public formatLogForDisplay(): string {
        const lines: string[] = [];
        const entries = this.getRecentEntries(50);

        lines.push('═══════════════════════════════════════════════════════════');
        lines.push('LOG DE AUDITORIA - SF DevOps Assistant');
        lines.push('═══════════════════════════════════════════════════════════');
        lines.push(`Última atualização: ${this.auditLog.lastUpdated.toISOString()}`);
        lines.push(`Total de entradas: ${this.auditLog.entries.length}`);
        lines.push('');

        if (entries.length === 0) {
            lines.push('Nenhuma entrada de auditoria encontrada.');
        } else {
            for (const entry of entries) {
                lines.push('───────────────────────────────────────────────────────────');
                lines.push(`[${entry.timestamp.toISOString()}] ${entry.action}`);
                lines.push(`Usuário: ${entry.user}`);
                
                if (entry.sourceOrg) {
                    lines.push(`Org Origem: ${entry.sourceOrg}`);
                }
                
                if (entry.targetOrg) {
                    lines.push(`Org Destino: ${entry.targetOrg}`);
                }
                
                if (entry.details.componentsCount !== undefined) {
                    lines.push(`Componentes: ${entry.details.componentsCount}`);
                }
                
                if (entry.details.componentTypes && entry.details.componentTypes.length > 0) {
                    lines.push(`Tipos: ${entry.details.componentTypes.join(', ')}`);
                }
                
                if (entry.details.packagePath) {
                    lines.push(`Pacote: ${entry.details.packagePath}`);
                }
                
                if (entry.details.diffSummary) {
                    const s = entry.details.diffSummary;
                    lines.push(`Diff: +${s.added} -${s.removed} ~${s.modified}`);
                }
                
                lines.push('');
            }
        }

        lines.push('═══════════════════════════════════════════════════════════');

        return lines.join('\n');
    }

    /**
     * Gera sugestão de mensagem de commit baseada no log recente
     */
    public generateCommitMessageFromLog(): string {
        const recentPackageCreated = this.getEntriesByAction('PACKAGE_CREATED')
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

        if (!recentPackageCreated) {
            return '';
        }

        const types = recentPackageCreated.details.componentTypes || [];
        const count = recentPackageCreated.details.componentsCount || 0;
        const sourceOrg = recentPackageCreated.sourceOrg || 'unknown';
        const date = recentPackageCreated.timestamp.toISOString().split('T')[0];

        const typesStr = types.length > 0 ? types.join(', ') : 'components';

        return `[Deploy] ${count} ${typesStr} from ${sourceOrg} - ${date}`;
    }
}

export const auditService = AuditService.getInstance();
