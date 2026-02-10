import * as path from 'path';
import {
    DeploySelection,
    DeployItem,
    DeployPackage,
    PackageManifest,
    MetadataComponent,
    MetadataType,
    MetadataFile,
    PermissionSet,
    Profile,
    OperationResult
} from '../types';
import { logger } from '../utils/logger';
import { configManager } from '../utils/config';
import { xmlBuilder } from '../utils/xmlBuilder';
import { FileUtils } from '../utils/fileUtils';
import { sfdxService } from './sfdxService';
import { metadataService } from './metadataService';
import { auditService } from './auditService';

/**
 * Serviço para montagem e geração de pacotes de deploy
 * Feature central da extensão
 */
export class DeployService {
    private static instance: DeployService;
    private currentSelection: DeploySelection;

    private constructor() {
        this.currentSelection = this.createEmptySelection();
    }

    public static getInstance(): DeployService {
        if (!DeployService.instance) {
            DeployService.instance = new DeployService();
        }
        return DeployService.instance;
    }

    /**
     * Cria uma seleção vazia
     */
    private createEmptySelection(): DeploySelection {
        return {
            id: this.generateId(),
            items: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            sourceOrg: sfdxService.getCurrentOrg()?.alias || sfdxService.getCurrentOrg()?.username,
        };
    }

    /**
     * Gera um ID único
     */
    private generateId(): string {
        return `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Obtém a seleção atual
     */
    public getCurrentSelection(): DeploySelection {
        return this.currentSelection;
    }

    /**
     * Adiciona um componente à seleção de deploy
     */
    public addToSelection(component: MetadataComponent, includeRelated = false): DeployItem {
        // Verifica se já existe
        const existing = this.currentSelection.items.find(
            item => item.component.fullName === component.fullName && 
                   item.component.type === component.type
        );

        if (existing) {
            logger.info(`Componente já na seleção: ${component.fullName}`);
            return existing;
        }

        const deployItem: DeployItem = {
            id: this.generateId(),
            component,
            includeRelated,
            action: 'add',
        };

        this.currentSelection.items.push(deployItem);
        this.currentSelection.updatedAt = new Date();

        logger.info(`Componente adicionado à seleção: ${component.type}/${component.fullName}`);
        return deployItem;
    }

    /**
     * Remove um componente da seleção
     */
    public removeFromSelection(itemId: string): boolean {
        const index = this.currentSelection.items.findIndex(item => item.id === itemId);
        
        if (index === -1) {
            logger.warn(`Item não encontrado na seleção: ${itemId}`);
            return false;
        }

        const removed = this.currentSelection.items.splice(index, 1)[0];
        this.currentSelection.updatedAt = new Date();

        logger.info(`Componente removido da seleção: ${removed.component.type}/${removed.component.fullName}`);
        return true;
    }

    /**
     * Limpa toda a seleção
     */
    public clearSelection(): void {
        this.currentSelection = this.createEmptySelection();
        logger.info('Seleção de deploy limpa');
    }

    /**
     * Define a ação para um item (add, update, delete)
     */
    public setItemAction(itemId: string, action: 'add' | 'update' | 'delete'): boolean {
        const item = this.currentSelection.items.find(i => i.id === itemId);
        
        if (!item) {
            return false;
        }

        item.action = action;
        this.currentSelection.updatedAt = new Date();
        return true;
    }

    /**
     * Adiciona componentes relacionados a um Permission Set
     */
    public async addPermissionSetWithRelated(permissionSetId: string): Promise<OperationResult<DeployItem[]>> {
        try {
            const psResult = await metadataService.getPermissionSetDetails(permissionSetId);
            
            if (!psResult.success || !psResult.data) {
                return { success: false, error: psResult.error };
            }

            const ps = psResult.data;
            const items: DeployItem[] = [];

            // Adiciona o Permission Set principal
            const mainItem = this.addToSelection(ps, true);
            items.push(mainItem);

            // Adiciona objetos relacionados
            for (const objPerm of ps.objectPermissions) {
                if (objPerm.object.endsWith('__c')) {
                    const objComponent: MetadataComponent = {
                        fullName: objPerm.object,
                        type: 'CustomObject',
                        label: objPerm.object,
                    };
                    items.push(this.addToSelection(objComponent));
                }
            }

            // Adiciona campos relacionados
            for (const fieldPerm of ps.fieldPermissions) {
                const [objectName, fieldName] = fieldPerm.field.split('.');
                if (fieldName?.endsWith('__c')) {
                    const fieldComponent: MetadataComponent = {
                        fullName: fieldPerm.field,
                        type: 'CustomField',
                        label: fieldName,
                    };
                    items.push(this.addToSelection(fieldComponent));
                }
            }

            // Adiciona classes relacionadas
            for (const classAccess of ps.classAccesses) {
                const classComponent: MetadataComponent = {
                    fullName: classAccess.apexClass,
                    type: 'ApexClass',
                    label: classAccess.apexClass,
                };
                items.push(this.addToSelection(classComponent));
            }

            logger.info(`Permission Set com relacionados adicionado: ${ps.label} (${items.length} componentes)`);
            return { success: true, data: items };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao adicionar Permission Set com relacionados', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Gera o package.xml a partir da seleção atual
     */
    public generatePackageXml(): string {
        const typesMap = new Map<MetadataType, string[]>();

        for (const item of this.currentSelection.items) {
            if (item.action === 'delete') {continue;}

            const type = item.component.type;
            if (!typesMap.has(type)) {
                typesMap.set(type, []);
            }
            typesMap.get(type)!.push(item.component.fullName);
        }

        const manifest = xmlBuilder.createManifest(
            typesMap,
            configManager.get<string>('metadataApiVersion')
        );

        return xmlBuilder.generatePackageXml(manifest);
    }

    /**
     * Gera o destructiveChanges.xml para itens marcados como delete
     */
    public generateDestructiveChangesXml(): string | null {
        const deleteItems = this.currentSelection.items.filter(item => item.action === 'delete');
        
        if (deleteItems.length === 0) {
            return null;
        }

        const typesMap = new Map<MetadataType, string[]>();

        for (const item of deleteItems) {
            const type = item.component.type;
            if (!typesMap.has(type)) {
                typesMap.set(type, []);
            }
            typesMap.get(type)!.push(item.component.fullName);
        }

        const manifest = xmlBuilder.createManifest(
            typesMap,
            configManager.get<string>('metadataApiVersion')
        );

        return xmlBuilder.generateDestructiveChangesXml(manifest);
    }

    /**
     * Gera o pacote completo de deploy
     */
    public async generateDeployPackage(targetOrg?: string): Promise<OperationResult<DeployPackage>> {
        try {
            if (this.currentSelection.items.length === 0) {
                return { success: false, error: 'Nenhum componente selecionado para deploy' };
            }

            const packageXml = this.generatePackageXml();
            const destructiveChangesXml = this.generateDestructiveChangesXml();

            // Gera arquivos de metadados
            const metadataFiles = await this.generateMetadataFiles();

            // Cria o manifest
            const typesMap = new Map<MetadataType, string[]>();
            for (const item of this.currentSelection.items) {
                if (item.action === 'delete') {continue;}
                const type = item.component.type;
                if (!typesMap.has(type)) {
                    typesMap.set(type, []);
                }
                typesMap.get(type)!.push(item.component.fullName);
            }

            const manifest = xmlBuilder.createManifest(
                typesMap,
                configManager.get<string>('metadataApiVersion')
            );

            const deployPackage: DeployPackage = {
                packageXml,
                destructiveChangesXml: destructiveChangesXml || undefined,
                metadataFiles,
                manifest,
                generatedAt: new Date(),
                generatedBy: process.env.USER || 'unknown',
                sourceOrg: this.currentSelection.sourceOrg || 'unknown',
                targetOrg,
            };

            logger.info(`Pacote de deploy gerado: ${metadataFiles.length} arquivo(s)`);

            // Registra na auditoria
            await auditService.logPackageCreated(deployPackage);

            return { success: true, data: deployPackage };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao gerar pacote de deploy', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Gera os arquivos de metadados
     */
    private async generateMetadataFiles(): Promise<MetadataFile[]> {
        const files: MetadataFile[] = [];

        for (const item of this.currentSelection.items) {
            if (item.action === 'delete') {continue;}

            const file = await this.generateMetadataFile(item);
            if (file) {
                files.push(file);
            }
        }

        return files;
    }

    /**
     * Gera um arquivo de metadado individual
     */
    private async generateMetadataFile(item: DeployItem): Promise<MetadataFile | null> {
        try {
            switch (item.component.type) {
                case 'PermissionSet':
                    return this.generatePermissionSetFile(item);
                case 'Profile':
                    return this.generateProfileFile(item);
                default:
                    // Para outros tipos, apenas referencia no package.xml
                    return null;
            }
        } catch (error) {
            logger.error(`Erro ao gerar arquivo para ${item.component.fullName}`, error);
            return null;
        }
    }

    /**
     * Gera arquivo de Permission Set
     */
    private async generatePermissionSetFile(item: DeployItem): Promise<MetadataFile> {
        const psResult = await metadataService.getPermissionSetDetails(item.component.id || '');
        
        if (!psResult.success || !psResult.data) {
            throw new Error(`Não foi possível obter detalhes do Permission Set: ${item.component.fullName}`);
        }

        const content = xmlBuilder.generatePermissionSetXml(psResult.data);

        return {
            path: `permissionsets/${item.component.fullName}.permissionset-meta.xml`,
            content,
            type: 'PermissionSet',
            componentName: item.component.fullName,
        };
    }

    /**
     * Gera arquivo de Profile
     */
    private async generateProfileFile(item: DeployItem): Promise<MetadataFile> {
        // Profiles são mais complexos, por enquanto geramos uma estrutura básica
        const profile = item.component as Profile;
        const content = xmlBuilder.generateProfileXml(profile);

        return {
            path: `profiles/${item.component.fullName}.profile-meta.xml`,
            content,
            type: 'Profile',
            componentName: item.component.fullName,
        };
    }

    /**
     * Exporta o pacote para o sistema de arquivos
     */
    public async exportPackage(deployPackage: DeployPackage, outputDir?: string): Promise<OperationResult<string>> {
        try {
            const baseDir = outputDir || configManager.getOutputDirectory();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const packageDir = path.join(baseDir, `deploy_${timestamp}`);

            // Cria diretório principal
            await FileUtils.ensureDirectory(packageDir);

            // Escreve package.xml
            await FileUtils.writeFile(
                path.join(packageDir, 'package.xml'),
                deployPackage.packageXml
            );

            // Escreve destructiveChanges.xml se existir
            if (deployPackage.destructiveChangesXml) {
                await FileUtils.writeFile(
                    path.join(packageDir, 'destructiveChanges.xml'),
                    deployPackage.destructiveChangesXml
                );

                // Cria package.xml vazio para destructive changes
                const emptyManifest = xmlBuilder.createManifest(
                    new Map(),
                    configManager.get<string>('metadataApiVersion')
                );
                await FileUtils.writeFile(
                    path.join(packageDir, 'destructiveChangesPost.xml'),
                    xmlBuilder.generatePackageXml(emptyManifest)
                );
            }

            // Escreve arquivos de metadados
            for (const file of deployPackage.metadataFiles) {
                const filePath = path.join(packageDir, file.path);
                const fileDir = path.dirname(filePath);
                
                await FileUtils.ensureDirectory(fileDir);
                await FileUtils.writeFile(filePath, file.content);
            }

            // Escreve arquivo de informações do deploy
            const infoContent = JSON.stringify({
                generatedAt: deployPackage.generatedAt.toISOString(),
                generatedBy: deployPackage.generatedBy,
                sourceOrg: deployPackage.sourceOrg,
                targetOrg: deployPackage.targetOrg,
                componentsCount: this.currentSelection.items.length,
                components: this.currentSelection.items.map(item => ({
                    type: item.component.type,
                    name: item.component.fullName,
                    action: item.action,
                })),
            }, null, 2);

            await FileUtils.writeFile(
                path.join(packageDir, 'deploy-info.json'),
                infoContent
            );

            logger.info(`Pacote exportado para: ${packageDir}`);

            // Registra na auditoria
            await auditService.logPackageExported(packageDir);

            return { success: true, data: packageDir };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao exportar pacote', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Gera sugestão de mensagem de commit
     */
    public generateCommitMessage(): string {
        const items = this.currentSelection.items;
        
        if (items.length === 0) {
            return '';
        }

        const typeCounts = new Map<MetadataType, number>();
        for (const item of items) {
            const count = typeCounts.get(item.component.type) || 0;
            typeCounts.set(item.component.type, count + 1);
        }

        const parts: string[] = [];
        typeCounts.forEach((count, type) => {
            parts.push(`${count} ${type}(s)`);
        });

        const sourceOrg = this.currentSelection.sourceOrg || 'unknown';
        const date = new Date().toISOString().split('T')[0];

        return `[Deploy] ${parts.join(', ')} from ${sourceOrg} - ${date}`;
    }

    /**
     * Obtém estatísticas da seleção atual
     */
    public getSelectionStats(): { total: number; byType: Map<MetadataType, number>; byAction: Map<string, number> } {
        const byType = new Map<MetadataType, number>();
        const byAction = new Map<string, number>();

        for (const item of this.currentSelection.items) {
            // Por tipo
            const typeCount = byType.get(item.component.type) || 0;
            byType.set(item.component.type, typeCount + 1);

            // Por ação
            const actionCount = byAction.get(item.action) || 0;
            byAction.set(item.action, actionCount + 1);
        }

        return {
            total: this.currentSelection.items.length,
            byType,
            byAction,
        };
    }
}

export const deployService = DeployService.getInstance();
