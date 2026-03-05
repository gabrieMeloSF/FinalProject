import * as path from 'path';
import {
    AuditEntry,
    AuditAction,
    AuditDetails,
    AuditLog,
    DeployPackage,
    DiffResult,
    MetadataType,
    OperationResult,
    SetupAuditTrailEntry,
    AuditTrailFilter
} from '../types';
import { logger } from '../utils/logger';
import { configManager } from '../utils/config';
import { FileUtils } from '../utils/fileUtils';
import { sfdxService } from './sfdxService';

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
    // SETUP AUDIT TRAIL (SALESFORCE)
    // =========================================================================

    private setupAuditTrailCache: SetupAuditTrailEntry[] = [];
    private setupAuditTrailLastFetch: Date | null = null;

    /**
     * Busca o Setup Audit Trail da org conectada
     */
    public async fetchSetupAuditTrail(filter?: AuditTrailFilter): Promise<OperationResult<SetupAuditTrailEntry[]>> {
        try {
            const org = sfdxService.getCurrentOrg();
            if (!org) {
                return { success: false, error: 'Nenhuma org conectada' };
            }

            const limit = filter?.limit || 200;
            let whereClause = '';
            const conditions: string[] = [];

            if (filter?.section && filter.section !== 'All') {
                conditions.push(`Section = '${filter.section}'`);
            }

            if (filter?.userId) {
                conditions.push(`CreatedById = '${filter.userId}'`);
            }

            if (filter?.dateFrom) {
                conditions.push(`CreatedDate >= ${filter.dateFrom.toISOString()}`);
            }

            if (filter?.dateTo) {
                conditions.push(`CreatedDate <= ${filter.dateTo.toISOString()}`);
            }

            if (conditions.length > 0) {
                whereClause = `WHERE ${conditions.join(' AND ')}`;
            }

            const query = `SELECT Id, Action, Section, Display, CreatedDate, CreatedById, CreatedBy.Name, DelegateUser FROM SetupAuditTrail ${whereClause} ORDER BY CreatedDate DESC LIMIT ${limit}`;

            logger.debug(`Buscando Setup Audit Trail: ${query}`);

            const target = org.alias || org.username;
            const command = `sf data query --query "${query}" --target-org ${target} --json`;
            
            const result = await this.executeQuery(command);

            if (!result.success) {
                return { success: false, error: result.error };
            }

            const entries: SetupAuditTrailEntry[] = (result.data || []).map((record: Record<string, unknown>) => ({
                id: record.Id as string,
                action: record.Action as string || '',
                section: record.Section as string || '',
                display: record.Display as string || '',
                createdDate: new Date(record.CreatedDate as string),
                createdById: record.CreatedById as string,
                createdByName: (record.CreatedBy as Record<string, string>)?.Name || 'Unknown',
                delegateUser: record.DelegateUser as string | undefined,
            }));

            // Aplica filtro de texto se especificado
            let filteredEntries = entries;
            if (filter?.searchTerm) {
                const term = filter.searchTerm.toLowerCase();
                filteredEntries = entries.filter(entry => 
                    entry.display.toLowerCase().includes(term) ||
                    entry.action.toLowerCase().includes(term) ||
                    entry.section.toLowerCase().includes(term) ||
                    entry.createdByName.toLowerCase().includes(term)
                );
            }

            this.setupAuditTrailCache = filteredEntries;
            this.setupAuditTrailLastFetch = new Date();

            logger.info(`${filteredEntries.length} entrada(s) do Setup Audit Trail encontrada(s)`);
            return { success: true, data: filteredEntries };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao buscar Setup Audit Trail', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Executa uma query SOQL
     */
    private async executeQuery(command: string): Promise<OperationResult<Record<string, unknown>[]>> {
        return new Promise((resolve) => {
            const { exec } = require('child_process');
            
            exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error: Error | null, stdout: string, stderr: string) => {
                if (error) {
                    try {
                        const errorJson = JSON.parse(stdout);
                        resolve({ success: false, error: errorJson.message || error.message });
                    } catch {
                        resolve({ success: false, error: error.message });
                    }
                    return;
                }

                try {
                    const result = JSON.parse(stdout);
                    if (result.status === 0 && result.result?.records) {
                        resolve({ success: true, data: result.result.records });
                    } else {
                        resolve({ success: false, error: result.message || 'Erro na query' });
                    }
                } catch (parseError) {
                    resolve({ success: false, error: 'Erro ao processar resposta' });
                }
            });
        });
    }

    /**
     * Obtém o cache do Setup Audit Trail
     */
    public getSetupAuditTrailCache(): SetupAuditTrailEntry[] {
        return [...this.setupAuditTrailCache];
    }

    /**
     * Obtém a data do último fetch
     */
    public getSetupAuditTrailLastFetch(): Date | null {
        return this.setupAuditTrailLastFetch;
    }

    /**
     * Obtém as seções disponíveis do Audit Trail
     */
    public async getAuditTrailSections(): Promise<OperationResult<string[]>> {
        try {
            const org = sfdxService.getCurrentOrg();
            if (!org) {
                return { success: false, error: 'Nenhuma org conectada' };
            }

            const target = org.alias || org.username;
            const query = `SELECT Section, COUNT(Id) cnt FROM SetupAuditTrail GROUP BY Section ORDER BY Section`;
            const command = `sf data query --query "${query}" --target-org ${target} --json`;
            
            const result = await this.executeQuery(command);

            if (!result.success) {
                return { success: false, error: result.error };
            }

            const sections = (result.data || []).map((record: Record<string, unknown>) => record.Section as string);
            return { success: true, data: ['All', ...sections] };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Formata uma entrada do Audit Trail para exibição
     */
    public formatAuditTrailEntry(entry: SetupAuditTrailEntry): string {
        const date = entry.createdDate.toLocaleString('pt-BR');
        return `[${date}] ${entry.createdByName}: ${entry.display}`;
    }

    /**
     * Formata o Audit Trail completo para exibição
     */
    public formatSetupAuditTrail(entries: SetupAuditTrailEntry[]): string {
        const lines: string[] = [];
        
        lines.push('═══════════════════════════════════════════════════════════════════════════════');
        lines.push('                          SETUP AUDIT TRAIL                                     ');
        lines.push('═══════════════════════════════════════════════════════════════════════════════');
        lines.push('');

        const org = sfdxService.getCurrentOrg();
        if (org) {
            lines.push(`Org: ${org.alias || org.username}`);
            lines.push(`Data da consulta: ${new Date().toLocaleString('pt-BR')}`);
            lines.push(`Total de registros: ${entries.length}`);
            lines.push('');
        }

        // Agrupa por data
        const byDate = new Map<string, SetupAuditTrailEntry[]>();
        for (const entry of entries) {
            const dateKey = entry.createdDate.toLocaleDateString('pt-BR');
            if (!byDate.has(dateKey)) {
                byDate.set(dateKey, []);
            }
            byDate.get(dateKey)!.push(entry);
        }

        for (const [date, dateEntries] of byDate) {
            lines.push('───────────────────────────────────────────────────────────────────────────────');
            lines.push(`📅 ${date}`);
            lines.push('───────────────────────────────────────────────────────────────────────────────');
            
            for (const entry of dateEntries) {
                const time = entry.createdDate.toLocaleTimeString('pt-BR');
                lines.push(`  ⏰ ${time}`);
                lines.push(`  👤 ${entry.createdByName}`);
                lines.push(`  📂 ${entry.section}`);
                lines.push(`  📝 ${entry.display}`);
                if (entry.delegateUser) {
                    lines.push(`  🔄 Delegado: ${entry.delegateUser}`);
                }
                lines.push('');
            }
        }

        lines.push('═══════════════════════════════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }

    /**
     * Exporta o Setup Audit Trail para arquivo
     */
    public async exportSetupAuditTrail(entries: SetupAuditTrailEntry[], format: 'txt' | 'json' | 'csv' = 'txt'): Promise<OperationResult<string>> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputDir = configManager.getOutputDirectory();
            
            let filename: string;
            let content: string;

            switch (format) {
                case 'json':
                    filename = `audit-trail-${timestamp}.json`;
                    content = JSON.stringify(entries, null, 2);
                    break;
                case 'csv':
                    filename = `audit-trail-${timestamp}.csv`;
                    const headers = 'Data,Hora,Usuario,Secao,Acao,Descricao,Delegado';
                    const rows = entries.map(e => {
                        const date = e.createdDate.toLocaleDateString('pt-BR');
                        const time = e.createdDate.toLocaleTimeString('pt-BR');
                        return `"${date}","${time}","${e.createdByName}","${e.section}","${e.action}","${e.display.replace(/"/g, '""')}","${e.delegateUser || ''}"`;
                    });
                    content = [headers, ...rows].join('\n');
                    break;
                default:
                    filename = `audit-trail-${timestamp}.txt`;
                    content = this.formatSetupAuditTrail(entries);
            }

            const filePath = path.join(outputDir, filename);
            await FileUtils.ensureDirectory(outputDir);
            await FileUtils.writeFile(filePath, content);

            logger.info(`Setup Audit Trail exportado: ${filePath}`);
            return { success: true, data: filePath };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao exportar Setup Audit Trail', error);
            return { success: false, error: errorMessage };
        }
    }

    // =========================================================================
    // MÉTODOS DE CONSULTA (LOG LOCAL)
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
