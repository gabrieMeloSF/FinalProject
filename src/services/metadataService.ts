import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import {
    MetadataComponent,
    MetadataType,
    PermissionSet,
    Profile,
    CustomObject,
    CustomField,
    ApexClass,
    Flow,
    ObjectPermission,
    FieldPermission,
    ClassAccess,
    UserPermission,
    TabSetting,
    RecordTypeVisibility,
    OperationResult
} from '../types';
import { logger } from '../utils/logger';
import { sfdxService } from './sfdxService';
import { configManager } from '../utils/config';

const execAsync = promisify(exec);

/**
 * Interface para resultados de query SOQL
 */
interface SoqlQueryResult<T> {
    status: number;
    result: {
        records: T[];
        totalSize: number;
        done: boolean;
    };
}

/**
 * Serviço para leitura e manipulação de metadados Salesforce
 */
export class MetadataService {
    private static instance: MetadataService;
    
    // Cache de metadados
    private permissionSetsCache: PermissionSet[] = [];
    private profilesCache: Profile[] = [];
    private objectsCache: CustomObject[] = [];
    private apexClassesCache: ApexClass[] = [];
    private flowsCache: Flow[] = [];

    private constructor() {}

    public static getInstance(): MetadataService {
        if (!MetadataService.instance) {
            MetadataService.instance = new MetadataService();
        }
        return MetadataService.instance;
    }

    /**
     * Executa uma query SOQL
     */
    private async executeQuery<T>(query: string): Promise<T[]> {
        const org = sfdxService.getCurrentOrg();
        if (!org) {
            throw new Error('Nenhuma org conectada');
        }

        const escapedQuery = query.replace(/"/g, '\\"');
        const command = `sf data query --query "${escapedQuery}" --target-org ${org.alias || org.username} --json`;
        
        logger.debug(`Executando query: ${query}`);

        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const { stdout } = await execAsync(command, { 
            cwd: workspacePath,
            maxBuffer: 10 * 1024 * 1024 
        });

        const result = JSON.parse(stdout) as SoqlQueryResult<T>;
        return result.result.records;
    }

    /**
     * Obtém a versão da API de metadados
     */
    private getApiVersion(): string {
        return configManager.get<string>('metadataApiVersion');
    }

    // =========================================================================
    // PERMISSION SETS
    // =========================================================================

    /**
     * Lista todos os Permission Sets da org
     */
    public async listPermissionSets(forceRefresh = false): Promise<OperationResult<PermissionSet[]>> {
        try {
            if (this.permissionSetsCache.length > 0 && !forceRefresh) {
                return { success: true, data: this.permissionSetsCache };
            }

            const query = `
                SELECT Id, Name, Label, Description, IsCustom, License.Name, 
                       HasActivationRequired, CreatedDate, CreatedBy.Name,
                       LastModifiedDate, LastModifiedBy.Name
                FROM PermissionSet 
                WHERE IsOwnedByProfile = false
                ORDER BY Label
            `;

            const records = await this.executeQuery<Record<string, unknown>>(query);

            this.permissionSetsCache = records.map(record => ({
                id: record.Id as string,
                fullName: record.Name as string,
                label: record.Label as string,
                description: record.Description as string | undefined,
                type: 'PermissionSet' as const,
                isCustom: record.IsCustom as boolean,
                license: (record.License as Record<string, string>)?.Name,
                hasActivationRequired: record.HasActivationRequired as boolean,
                createdDate: record.CreatedDate ? new Date(record.CreatedDate as string) : undefined,
                createdBy: (record.CreatedBy as Record<string, string>)?.Name,
                lastModifiedDate: record.LastModifiedDate ? new Date(record.LastModifiedDate as string) : undefined,
                lastModifiedBy: (record.LastModifiedBy as Record<string, string>)?.Name,
                objectPermissions: [],
                fieldPermissions: [],
                classAccesses: [],
                userPermissions: [],
                tabSettings: [],
                recordTypeVisibilities: [],
            }));

            logger.info(`${this.permissionSetsCache.length} Permission Set(s) encontrado(s)`);
            return { success: true, data: this.permissionSetsCache };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao listar Permission Sets', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Obtém detalhes completos de um Permission Set
     */
    public async getPermissionSetDetails(permissionSetId: string): Promise<OperationResult<PermissionSet>> {
        try {
            // Obtém informações básicas
            const basicQuery = `
                SELECT Id, Name, Label, Description, IsCustom, License.Name,
                       HasActivationRequired, CreatedDate, CreatedBy.Name,
                       LastModifiedDate, LastModifiedBy.Name
                FROM PermissionSet 
                WHERE Id = '${permissionSetId}'
            `;
            const basicRecords = await this.executeQuery<Record<string, unknown>>(basicQuery);
            
            if (basicRecords.length === 0) {
                return { success: false, error: 'Permission Set não encontrado' };
            }

            const record = basicRecords[0];

            // Obtém Object Permissions
            const objectPermissions = await this.getObjectPermissionsForPermissionSet(permissionSetId);

            // Obtém Field Permissions
            const fieldPermissions = await this.getFieldPermissionsForPermissionSet(permissionSetId);

            // Obtém Class Accesses
            const classAccesses = await this.getClassAccessesForPermissionSet(permissionSetId);

            // Obtém User Permissions
            const userPermissions = await this.getUserPermissionsForPermissionSet(permissionSetId);

            // Obtém Tab Settings
            const tabSettings = await this.getTabSettingsForPermissionSet(permissionSetId);

            const permissionSet: PermissionSet = {
                id: record.Id as string,
                fullName: record.Name as string,
                label: record.Label as string,
                description: record.Description as string | undefined,
                type: 'PermissionSet',
                isCustom: record.IsCustom as boolean,
                license: (record.License as Record<string, string>)?.Name,
                hasActivationRequired: record.HasActivationRequired as boolean,
                createdDate: record.CreatedDate ? new Date(record.CreatedDate as string) : undefined,
                createdBy: (record.CreatedBy as Record<string, string>)?.Name,
                lastModifiedDate: record.LastModifiedDate ? new Date(record.LastModifiedDate as string) : undefined,
                lastModifiedBy: (record.LastModifiedBy as Record<string, string>)?.Name,
                objectPermissions,
                fieldPermissions,
                classAccesses,
                userPermissions,
                tabSettings,
                recordTypeVisibilities: [],
            };

            logger.info(`Detalhes do Permission Set obtidos: ${permissionSet.label}`);
            return { success: true, data: permissionSet };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao obter detalhes do Permission Set', error);
            return { success: false, error: errorMessage };
        }
    }

    private async getObjectPermissionsForPermissionSet(permissionSetId: string): Promise<ObjectPermission[]> {
        try {
            const query = `
                SELECT SobjectType, PermissionsCreate, PermissionsRead, PermissionsEdit,
                       PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords
                FROM ObjectPermissions
                WHERE ParentId = '${permissionSetId}'
            `;
            const records = await this.executeQuery<Record<string, unknown>>(query);
            
            return records.map(record => ({
                object: record.SobjectType as string,
                allowCreate: record.PermissionsCreate as boolean,
                allowRead: record.PermissionsRead as boolean,
                allowEdit: record.PermissionsEdit as boolean,
                allowDelete: record.PermissionsDelete as boolean,
                viewAllRecords: record.PermissionsViewAllRecords as boolean,
                modifyAllRecords: record.PermissionsModifyAllRecords as boolean,
            }));
        } catch (error) {
            logger.error('Erro ao obter Object Permissions', error);
            return [];
        }
    }

    private async getFieldPermissionsForPermissionSet(permissionSetId: string): Promise<FieldPermission[]> {
        try {
            const query = `
                SELECT Field, PermissionsRead, PermissionsEdit
                FROM FieldPermissions
                WHERE ParentId = '${permissionSetId}'
            `;
            const records = await this.executeQuery<Record<string, unknown>>(query);
            
            return records.map(record => ({
                field: record.Field as string,
                readable: record.PermissionsRead as boolean,
                editable: record.PermissionsEdit as boolean,
            }));
        } catch (error) {
            logger.error('Erro ao obter Field Permissions', error);
            return [];
        }
    }

    private async getClassAccessesForPermissionSet(permissionSetId: string): Promise<ClassAccess[]> {
        try {
            const query = `
                SELECT SetupEntityId, SetupEntity.Name
                FROM SetupEntityAccess
                WHERE ParentId = '${permissionSetId}'
                AND SetupEntityType = 'ApexClass'
            `;
            const records = await this.executeQuery<Record<string, unknown>>(query);
            
            return records.map(record => ({
                apexClass: (record.SetupEntity as Record<string, string>)?.Name || record.SetupEntityId as string,
                enabled: true,
            }));
        } catch (error) {
            logger.error('Erro ao obter Class Accesses', error);
            return [];
        }
    }

    private async getUserPermissionsForPermissionSet(permissionSetId: string): Promise<UserPermission[]> {
        try {
            // User Permissions são obtidas via Metadata API, mas podemos fazer uma aproximação
            // via Tooling API ou query direta em PermissionSet
            const query = `
                SELECT PermissionsApiEnabled, PermissionsViewSetup, PermissionsModifyAllData,
                       PermissionsViewAllData, PermissionsManageUsers
                FROM PermissionSet
                WHERE Id = '${permissionSetId}'
            `;
            const records = await this.executeQuery<Record<string, unknown>>(query);
            
            if (records.length === 0) {return [];}

            const record = records[0];
            const permissions: UserPermission[] = [];

            const permissionFields = [
                { name: 'ApiEnabled', field: 'PermissionsApiEnabled' },
                { name: 'ViewSetup', field: 'PermissionsViewSetup' },
                { name: 'ModifyAllData', field: 'PermissionsModifyAllData' },
                { name: 'ViewAllData', field: 'PermissionsViewAllData' },
                { name: 'ManageUsers', field: 'PermissionsManageUsers' },
            ];

            for (const perm of permissionFields) {
                if (record[perm.field] === true) {
                    permissions.push({ name: perm.name, enabled: true });
                }
            }

            return permissions;
        } catch (error) {
            logger.error('Erro ao obter User Permissions', error);
            return [];
        }
    }

    private async getTabSettingsForPermissionSet(permissionSetId: string): Promise<TabSetting[]> {
        try {
            const query = `
                SELECT Name, Visibility
                FROM PermissionSetTabSetting
                WHERE ParentId = '${permissionSetId}'
            `;
            const records = await this.executeQuery<Record<string, unknown>>(query);
            
            return records.map(record => ({
                tab: record.Name as string,
                visibility: record.Visibility as 'DefaultOn' | 'DefaultOff' | 'Hidden',
            }));
        } catch (error) {
            logger.error('Erro ao obter Tab Settings', error);
            return [];
        }
    }

    // =========================================================================
    // PROFILES
    // =========================================================================

    /**
     * Lista todos os Profiles da org
     */
    public async listProfiles(forceRefresh = false): Promise<OperationResult<Profile[]>> {
        try {
            if (this.profilesCache.length > 0 && !forceRefresh) {
                return { success: true, data: this.profilesCache };
            }

            const query = `
                SELECT Id, Name, Description, UserLicense.Name, 
                       CreatedDate, CreatedBy.Name,
                       LastModifiedDate, LastModifiedBy.Name
                FROM Profile
                ORDER BY Name
            `;

            const records = await this.executeQuery<Record<string, unknown>>(query);

            this.profilesCache = records.map(record => ({
                id: record.Id as string,
                fullName: record.Name as string,
                label: record.Name as string,
                description: record.Description as string | undefined,
                type: 'Profile' as const,
                isCustom: !(record.Name as string).startsWith('Standard'),
                userLicense: (record.UserLicense as Record<string, string>)?.Name,
                createdDate: record.CreatedDate ? new Date(record.CreatedDate as string) : undefined,
                createdBy: (record.CreatedBy as Record<string, string>)?.Name,
                lastModifiedDate: record.LastModifiedDate ? new Date(record.LastModifiedDate as string) : undefined,
                lastModifiedBy: (record.LastModifiedBy as Record<string, string>)?.Name,
                objectPermissions: [],
                fieldPermissions: [],
                classAccesses: [],
                layoutAssignments: [],
                recordTypeVisibilities: [],
                tabVisibilities: [],
            }));

            logger.info(`${this.profilesCache.length} Profile(s) encontrado(s)`);
            return { success: true, data: this.profilesCache };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao listar Profiles', error);
            return { success: false, error: errorMessage };
        }
    }

    // =========================================================================
    // CUSTOM OBJECTS
    // =========================================================================

    /**
     * Lista todos os Custom Objects da org
     */
    public async listCustomObjects(forceRefresh = false): Promise<OperationResult<CustomObject[]>> {
        try {
            if (this.objectsCache.length > 0 && !forceRefresh) {
                return { success: true, data: this.objectsCache };
            }

            // EntityDefinition - query simplificada (NOT LIKE não é bem suportado)
            // Filtramos no código após receber os resultados
            const entityQuery = "SELECT QualifiedApiName, Label, KeyPrefix FROM EntityDefinition WHERE IsCustomizable = true ORDER BY Label LIMIT 500";

            const records = await this.executeQuery<Record<string, unknown>>(entityQuery);

            // Filtra objetos de sistema no código
            const filteredRecords = records.filter(record => {
                const apiName = record.QualifiedApiName as string;
                if (!apiName) return false;
                // Exclui objetos de sistema
                if (apiName.endsWith('Share')) return false;
                if (apiName.endsWith('History')) return false;
                if (apiName.endsWith('Feed')) return false;
                if (apiName.endsWith('ChangeEvent')) return false;
                if (apiName.startsWith('AI')) return false;
                if (apiName.includes('__')) {
                    // Inclui apenas custom objects (__c) e exclui managed packages complexos
                    return apiName.endsWith('__c') || apiName.endsWith('__mdt') || apiName.endsWith('__e');
                }
                return true;
            });

            this.objectsCache = filteredRecords.slice(0, 200).map(record => ({
                id: record.QualifiedApiName as string,
                fullName: record.QualifiedApiName as string,
                label: record.Label as string || record.QualifiedApiName as string,
                description: undefined,
                type: 'CustomObject' as const,
                isCustom: (record.QualifiedApiName as string).endsWith('__c'),
                fields: [],
                recordTypes: [],
                validationRules: [],
            }));

            logger.info(`${this.objectsCache.length} Object(s) encontrado(s)`);
            return { success: true, data: this.objectsCache };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao listar Custom Objects', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Lista campos de um objeto
     */
    public async listObjectFields(objectName: string): Promise<OperationResult<CustomField[]>> {
        try {
            // FieldDefinition - query em linha única para evitar problemas com CLI
            const query = `SELECT QualifiedApiName, Label, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' ORDER BY Label LIMIT 300`;

            const records = await this.executeQuery<Record<string, unknown>>(query);

            const fields: CustomField[] = records.map(record => ({
                id: record.QualifiedApiName as string,
                fullName: `${objectName}.${record.QualifiedApiName}`,
                label: record.Label as string || record.QualifiedApiName as string,
                description: undefined,
                type: 'CustomField' as const,
                objectName,
                fieldType: record.DataType as string || 'Unknown',
                isRequired: false,
                isUnique: false,
                isExternalId: false,
                length: undefined,
                precision: undefined,
                scale: undefined,
                referenceTo: undefined,
            }));

            logger.info(`${fields.length} campo(s) encontrado(s) para ${objectName}`);
            return { success: true, data: fields };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error(`Erro ao listar campos do objeto ${objectName}`, error);
            return { success: false, error: errorMessage };
        }
    }

    // =========================================================================
    // APEX CLASSES
    // =========================================================================

    /**
     * Lista todas as Apex Classes da org
     */
    public async listApexClasses(forceRefresh = false): Promise<OperationResult<ApexClass[]>> {
        try {
            if (this.apexClassesCache.length > 0 && !forceRefresh) {
                return { success: true, data: this.apexClassesCache };
            }

            const query = `
                SELECT Id, Name, NamespacePrefix, ApiVersion, Status,
                       IsValid, LengthWithoutComments,
                       CreatedDate, CreatedBy.Name,
                       LastModifiedDate, LastModifiedBy.Name
                FROM ApexClass
                WHERE NamespacePrefix = null
                ORDER BY Name
            `;

            const records = await this.executeQuery<Record<string, unknown>>(query);

            this.apexClassesCache = records.map(record => ({
                id: record.Id as string,
                fullName: record.Name as string,
                label: record.Name as string,
                type: 'ApexClass' as const,
                apiVersion: String(record.ApiVersion),
                status: record.Status as 'Active' | 'Deleted',
                isValid: record.IsValid as boolean,
                lengthWithoutComments: record.LengthWithoutComments as number,
                createdDate: record.CreatedDate ? new Date(record.CreatedDate as string) : undefined,
                createdBy: (record.CreatedBy as Record<string, string>)?.Name,
                lastModifiedDate: record.LastModifiedDate ? new Date(record.LastModifiedDate as string) : undefined,
                lastModifiedBy: (record.LastModifiedBy as Record<string, string>)?.Name,
            }));

            logger.info(`${this.apexClassesCache.length} Apex Class(es) encontrada(s)`);
            return { success: true, data: this.apexClassesCache };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao listar Apex Classes', error);
            return { success: false, error: errorMessage };
        }
    }

    // =========================================================================
    // FLOWS
    // =========================================================================

    /**
     * Lista todos os Flows da org
     */
    public async listFlows(forceRefresh = false): Promise<OperationResult<Flow[]>> {
        try {
            if (this.flowsCache.length > 0 && !forceRefresh) {
                return { success: true, data: this.flowsCache };
            }

            // FlowDefinitionView não tem campos de auditoria (CreatedDate, etc)
            // Apenas campos básicos estão disponíveis
            const query = `
                SELECT Id, ApiName, Label, Description, ProcessType, 
                       ActiveVersionId, LatestVersionId, IsActive
                FROM FlowDefinitionView
                WHERE IsTemplate = false
                ORDER BY Label
                LIMIT 200
            `;

            const records = await this.executeQuery<Record<string, unknown>>(query);

            this.flowsCache = records.map(record => ({
                id: record.Id as string,
                fullName: record.ApiName as string,
                label: record.Label as string || record.ApiName as string,
                description: record.Description as string | undefined,
                type: 'Flow' as const,
                processType: record.ProcessType as string || 'Flow',
                status: record.IsActive ? 'Active' as const : 'Inactive' as const,
                apiVersion: this.getApiVersion(),
                createdDate: undefined,
                createdBy: undefined,
                lastModifiedDate: undefined,
                lastModifiedBy: undefined,
            }));

            logger.info(`${this.flowsCache.length} Flow(s) encontrado(s)`);
            return { success: true, data: this.flowsCache };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao listar Flows', error);
            return { success: false, error: errorMessage };
        }
    }

    // =========================================================================
    // MÉTODOS UTILITÁRIOS
    // =========================================================================

    /**
     * Limpa todo o cache de metadados
     */
    public clearCache(): void {
        this.permissionSetsCache = [];
        this.profilesCache = [];
        this.objectsCache = [];
        this.apexClassesCache = [];
        this.flowsCache = [];
        logger.info('Cache de metadados limpo');
    }

    /**
     * Obtém metadados por tipo
     */
    public async getMetadataByType(type: MetadataType, forceRefresh = false): Promise<OperationResult<MetadataComponent[]>> {
        switch (type) {
            case 'PermissionSet':
                return this.listPermissionSets(forceRefresh);
            case 'Profile':
                return this.listProfiles(forceRefresh);
            case 'CustomObject':
                return this.listCustomObjects(forceRefresh);
            case 'ApexClass':
                return this.listApexClasses(forceRefresh);
            case 'Flow':
                return this.listFlows(forceRefresh);
            default:
                return { success: false, error: `Tipo de metadado não suportado: ${type}` };
        }
    }

    /**
     * Busca metadados por nome
     */
    public async searchMetadata(searchTerm: string): Promise<MetadataComponent[]> {
        const results: MetadataComponent[] = [];
        const term = searchTerm.toLowerCase();

        // Busca em todos os caches
        results.push(...this.permissionSetsCache.filter(ps => 
            ps.fullName.toLowerCase().includes(term) || 
            ps.label?.toLowerCase().includes(term)
        ));

        results.push(...this.profilesCache.filter(p => 
            p.fullName.toLowerCase().includes(term) || 
            p.label?.toLowerCase().includes(term)
        ));

        results.push(...this.objectsCache.filter(o => 
            o.fullName.toLowerCase().includes(term) || 
            o.label?.toLowerCase().includes(term)
        ));

        results.push(...this.apexClassesCache.filter(ac => 
            ac.fullName.toLowerCase().includes(term)
        ));

        results.push(...this.flowsCache.filter(f => 
            f.fullName.toLowerCase().includes(term) || 
            f.label?.toLowerCase().includes(term)
        ));

        return results;
    }
}

export const metadataService = MetadataService.getInstance();
