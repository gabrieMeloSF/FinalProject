import {
    DiffResult,
    DiffSource,
    DiffItem,
    DiffDetail,
    DiffSummary,
    MetadataType,
    PermissionSet,
    ObjectPermission,
    FieldPermission,
    ClassAccess,
    OperationResult
} from '../types';
import { logger } from '../utils/logger';
import { sfdxService } from './sfdxService';
import { metadataService, MetadataService } from './metadataService';
import { auditService } from './auditService';

/**
 * Serviço para comparação (diff) de metadados entre ambientes
 */
export class DiffService {
    private static instance: DiffService;

    private constructor() {}

    public static getInstance(): DiffService {
        if (!DiffService.instance) {
            DiffService.instance = new DiffService();
        }
        return DiffService.instance;
    }

    /**
     * Compara Permission Sets entre duas orgs
     */
    public async diffPermissionSets(
        sourceOrg: string,
        targetOrg: string,
        permissionSetName?: string
    ): Promise<OperationResult<DiffResult>> {
        try {
            logger.info(`Iniciando diff de Permission Sets: ${sourceOrg} vs ${targetOrg}`);

            // Conecta à org de origem
            await sfdxService.setCurrentOrg(sourceOrg);
            const sourcePs = await metadataService.listPermissionSets(true);

            if (!sourcePs.success || !sourcePs.data) {
                return { success: false, error: `Erro ao obter Permission Sets da org origem: ${sourcePs.error}` };
            }

            // Conecta à org de destino
            await sfdxService.setCurrentOrg(targetOrg);
            const targetPs = await metadataService.listPermissionSets(true);

            if (!targetPs.success || !targetPs.data) {
                return { success: false, error: `Erro ao obter Permission Sets da org destino: ${targetPs.error}` };
            }

            // Filtra por nome se especificado
            const sourcePsList = permissionSetName 
                ? sourcePs.data.filter(ps => ps.fullName === permissionSetName)
                : sourcePs.data;

            const targetPsList = permissionSetName
                ? targetPs.data.filter(ps => ps.fullName === permissionSetName)
                : targetPs.data;

            // Compara os Permission Sets
            const differences = this.comparePermissionSetLists(sourcePsList, targetPsList);
            const summary = this.calculateSummary(differences);

            const result: DiffResult = {
                source: { type: 'org', identifier: sourceOrg },
                target: { type: 'org', identifier: targetOrg },
                componentType: 'PermissionSet',
                differences,
                summary,
                generatedAt: new Date(),
            };

            // Registra na auditoria
            await auditService.logDiffExecuted(result);

            logger.info(`Diff concluído: ${summary.added} adicionados, ${summary.removed} removidos, ${summary.modified} modificados`);
            return { success: true, data: result };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao executar diff de Permission Sets', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Compara um Permission Set específico em detalhes
     */
    public async diffPermissionSetDetails(
        sourceOrg: string,
        targetOrg: string,
        permissionSetId: string
    ): Promise<OperationResult<DiffResult>> {
        try {
            // Obtém detalhes do Permission Set na org de origem
            await sfdxService.setCurrentOrg(sourceOrg);
            const sourceResult = await metadataService.getPermissionSetDetails(permissionSetId);

            if (!sourceResult.success || !sourceResult.data) {
                return { success: false, error: `Erro ao obter Permission Set da origem: ${sourceResult.error}` };
            }

            const sourcePs = sourceResult.data;

            // Tenta encontrar o mesmo Permission Set na org de destino
            await sfdxService.setCurrentOrg(targetOrg);
            const targetPsList = await metadataService.listPermissionSets(true);

            if (!targetPsList.success || !targetPsList.data) {
                return { success: false, error: `Erro ao obter Permission Sets do destino: ${targetPsList.error}` };
            }

            const targetPsBasic = targetPsList.data.find(ps => ps.fullName === sourcePs.fullName);

            let targetPs: PermissionSet | null = null;
            if (targetPsBasic?.id) {
                const targetResult = await metadataService.getPermissionSetDetails(targetPsBasic.id);
                if (targetResult.success && targetResult.data) {
                    targetPs = targetResult.data;
                }
            }

            // Compara os detalhes
            const differences: DiffItem[] = [];

            if (!targetPs) {
                // Permission Set não existe no destino
                differences.push({
                    path: sourcePs.fullName,
                    componentName: sourcePs.fullName,
                    type: 'PermissionSet',
                    status: 'added',
                    sourceValue: JSON.stringify(sourcePs, null, 2),
                });
            } else {
                // Compara Object Permissions
                const objDiffs = this.compareObjectPermissions(
                    sourcePs.objectPermissions,
                    targetPs.objectPermissions
                );
                differences.push(...objDiffs);

                // Compara Field Permissions
                const fieldDiffs = this.compareFieldPermissions(
                    sourcePs.fieldPermissions,
                    targetPs.fieldPermissions
                );
                differences.push(...fieldDiffs);

                // Compara Class Accesses
                const classDiffs = this.compareClassAccesses(
                    sourcePs.classAccesses,
                    targetPs.classAccesses
                );
                differences.push(...classDiffs);
            }

            const summary = this.calculateSummary(differences);

            const result: DiffResult = {
                source: { type: 'org', identifier: sourceOrg },
                target: { type: 'org', identifier: targetOrg },
                componentType: 'PermissionSet',
                differences,
                summary,
                generatedAt: new Date(),
            };

            await auditService.logDiffExecuted(result);

            return { success: true, data: result };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            logger.error('Erro ao executar diff detalhado de Permission Set', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Compara listas de Permission Sets
     */
    private comparePermissionSetLists(
        sourceList: PermissionSet[],
        targetList: PermissionSet[]
    ): DiffItem[] {
        const differences: DiffItem[] = [];
        const sourceMap = new Map(sourceList.map(ps => [ps.fullName, ps]));
        const targetMap = new Map(targetList.map(ps => [ps.fullName, ps]));

        // Encontra adicionados e modificados
        for (const [name, sourcePs] of sourceMap) {
            const targetPs = targetMap.get(name);

            if (!targetPs) {
                differences.push({
                    path: name,
                    componentName: name,
                    type: 'PermissionSet',
                    status: 'added',
                    sourceValue: sourcePs.label,
                });
            } else {
                // Verifica se há diferenças
                const details: DiffDetail[] = [];

                if (sourcePs.label !== targetPs.label) {
                    details.push({
                        property: 'label',
                        sourceValue: sourcePs.label || '',
                        targetValue: targetPs.label || '',
                    });
                }

                if (sourcePs.description !== targetPs.description) {
                    details.push({
                        property: 'description',
                        sourceValue: sourcePs.description || '',
                        targetValue: targetPs.description || '',
                    });
                }

                if (sourcePs.hasActivationRequired !== targetPs.hasActivationRequired) {
                    details.push({
                        property: 'hasActivationRequired',
                        sourceValue: sourcePs.hasActivationRequired || false,
                        targetValue: targetPs.hasActivationRequired || false,
                    });
                }

                if (details.length > 0) {
                    differences.push({
                        path: name,
                        componentName: name,
                        type: 'PermissionSet',
                        status: 'modified',
                        sourceValue: sourcePs.label,
                        targetValue: targetPs.label,
                        details,
                    });
                }
            }
        }

        // Encontra removidos
        for (const [name, targetPs] of targetMap) {
            if (!sourceMap.has(name)) {
                differences.push({
                    path: name,
                    componentName: name,
                    type: 'PermissionSet',
                    status: 'removed',
                    targetValue: targetPs.label,
                });
            }
        }

        return differences;
    }

    /**
     * Compara Object Permissions
     */
    private compareObjectPermissions(
        sourcePerms: ObjectPermission[],
        targetPerms: ObjectPermission[]
    ): DiffItem[] {
        const differences: DiffItem[] = [];
        const sourceMap = new Map(sourcePerms.map(op => [op.object, op]));
        const targetMap = new Map(targetPerms.map(op => [op.object, op]));

        for (const [object, sourcePerm] of sourceMap) {
            const targetPerm = targetMap.get(object);

            if (!targetPerm) {
                differences.push({
                    path: `objectPermissions/${object}`,
                    componentName: object,
                    type: 'CustomObject',
                    status: 'added',
                    sourceValue: JSON.stringify(sourcePerm),
                });
            } else {
                const details: DiffDetail[] = [];

                if (sourcePerm.allowCreate !== targetPerm.allowCreate) {
                    details.push({
                        property: 'allowCreate',
                        sourceValue: sourcePerm.allowCreate,
                        targetValue: targetPerm.allowCreate,
                    });
                }

                if (sourcePerm.allowRead !== targetPerm.allowRead) {
                    details.push({
                        property: 'allowRead',
                        sourceValue: sourcePerm.allowRead,
                        targetValue: targetPerm.allowRead,
                    });
                }

                if (sourcePerm.allowEdit !== targetPerm.allowEdit) {
                    details.push({
                        property: 'allowEdit',
                        sourceValue: sourcePerm.allowEdit,
                        targetValue: targetPerm.allowEdit,
                    });
                }

                if (sourcePerm.allowDelete !== targetPerm.allowDelete) {
                    details.push({
                        property: 'allowDelete',
                        sourceValue: sourcePerm.allowDelete,
                        targetValue: targetPerm.allowDelete,
                    });
                }

                if (sourcePerm.viewAllRecords !== targetPerm.viewAllRecords) {
                    details.push({
                        property: 'viewAllRecords',
                        sourceValue: sourcePerm.viewAllRecords,
                        targetValue: targetPerm.viewAllRecords,
                    });
                }

                if (sourcePerm.modifyAllRecords !== targetPerm.modifyAllRecords) {
                    details.push({
                        property: 'modifyAllRecords',
                        sourceValue: sourcePerm.modifyAllRecords,
                        targetValue: targetPerm.modifyAllRecords,
                    });
                }

                if (details.length > 0) {
                    differences.push({
                        path: `objectPermissions/${object}`,
                        componentName: object,
                        type: 'CustomObject',
                        status: 'modified',
                        details,
                    });
                }
            }
        }

        for (const [object] of targetMap) {
            if (!sourceMap.has(object)) {
                differences.push({
                    path: `objectPermissions/${object}`,
                    componentName: object,
                    type: 'CustomObject',
                    status: 'removed',
                });
            }
        }

        return differences;
    }

    /**
     * Compara Field Permissions
     */
    private compareFieldPermissions(
        sourcePerms: FieldPermission[],
        targetPerms: FieldPermission[]
    ): DiffItem[] {
        const differences: DiffItem[] = [];
        const sourceMap = new Map(sourcePerms.map(fp => [fp.field, fp]));
        const targetMap = new Map(targetPerms.map(fp => [fp.field, fp]));

        for (const [field, sourcePerm] of sourceMap) {
            const targetPerm = targetMap.get(field);

            if (!targetPerm) {
                differences.push({
                    path: `fieldPermissions/${field}`,
                    componentName: field,
                    type: 'CustomField',
                    status: 'added',
                    sourceValue: JSON.stringify(sourcePerm),
                });
            } else {
                const details: DiffDetail[] = [];

                if (sourcePerm.readable !== targetPerm.readable) {
                    details.push({
                        property: 'readable',
                        sourceValue: sourcePerm.readable,
                        targetValue: targetPerm.readable,
                    });
                }

                if (sourcePerm.editable !== targetPerm.editable) {
                    details.push({
                        property: 'editable',
                        sourceValue: sourcePerm.editable,
                        targetValue: targetPerm.editable,
                    });
                }

                if (details.length > 0) {
                    differences.push({
                        path: `fieldPermissions/${field}`,
                        componentName: field,
                        type: 'CustomField',
                        status: 'modified',
                        details,
                    });
                }
            }
        }

        for (const [field] of targetMap) {
            if (!sourceMap.has(field)) {
                differences.push({
                    path: `fieldPermissions/${field}`,
                    componentName: field,
                    type: 'CustomField',
                    status: 'removed',
                });
            }
        }

        return differences;
    }

    /**
     * Compara Class Accesses
     */
    private compareClassAccesses(
        sourceAccesses: ClassAccess[],
        targetAccesses: ClassAccess[]
    ): DiffItem[] {
        const differences: DiffItem[] = [];
        const sourceMap = new Map(sourceAccesses.map(ca => [ca.apexClass, ca]));
        const targetMap = new Map(targetAccesses.map(ca => [ca.apexClass, ca]));

        for (const [className, sourceAccess] of sourceMap) {
            const targetAccess = targetMap.get(className);

            if (!targetAccess) {
                differences.push({
                    path: `classAccesses/${className}`,
                    componentName: className,
                    type: 'ApexClass',
                    status: 'added',
                    sourceValue: String(sourceAccess.enabled),
                });
            } else if (sourceAccess.enabled !== targetAccess.enabled) {
                differences.push({
                    path: `classAccesses/${className}`,
                    componentName: className,
                    type: 'ApexClass',
                    status: 'modified',
                    details: [{
                        property: 'enabled',
                        sourceValue: sourceAccess.enabled,
                        targetValue: targetAccess.enabled,
                    }],
                });
            }
        }

        for (const [className] of targetMap) {
            if (!sourceMap.has(className)) {
                differences.push({
                    path: `classAccesses/${className}`,
                    componentName: className,
                    type: 'ApexClass',
                    status: 'removed',
                });
            }
        }

        return differences;
    }

    /**
     * Calcula o resumo das diferenças
     */
    private calculateSummary(differences: DiffItem[]): DiffSummary {
        const summary: DiffSummary = {
            totalComponents: differences.length,
            added: 0,
            removed: 0,
            modified: 0,
            unchanged: 0,
        };

        for (const diff of differences) {
            switch (diff.status) {
                case 'added':
                    summary.added++;
                    break;
                case 'removed':
                    summary.removed++;
                    break;
                case 'modified':
                    summary.modified++;
                    break;
                case 'unchanged':
                    summary.unchanged++;
                    break;
            }
        }

        return summary;
    }

    /**
     * Formata o resultado do diff para exibição
     */
    public formatDiffResult(result: DiffResult): string {
        const lines: string[] = [];
        const dateFormatted = result.generatedAt.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        lines.push('╔═══════════════════════════════════════════════════════════════════════════════╗');
        lines.push(`║           COMPARAÇÃO DE METADADOS - ${result.componentType.padEnd(30)}       ║`);
        lines.push('╚═══════════════════════════════════════════════════════════════════════════════╝');
        lines.push('');
        lines.push('┌───────────────────────────────────────────────────────────────────────────────┐');
        lines.push('│  AMBIENTES COMPARADOS                                                         │');
        lines.push('├───────────────────────────────────────────────────────────────────────────────┤');
        lines.push(`│  🔵 ORIGEM:  ${result.source.identifier.padEnd(50)}        │`);
        lines.push(`│  🟢 DESTINO: ${result.target.identifier.padEnd(50)}        │`);
        lines.push(`│  📅 Data:    ${dateFormatted.padEnd(50)}        │`);
        lines.push('└───────────────────────────────────────────────────────────────────────────────┘');
        lines.push('');
        lines.push('┌───────────────────────────────────────────────────────────────────────────────┐');
        lines.push('│  RESUMO DA COMPARAÇÃO                                                         │');
        lines.push('├───────────────────────────────────────────────────────────────────────────────┤');
        lines.push(`│  Total de componentes analisados: ${result.summary.totalComponents}`.padEnd(80) + '│');
        lines.push('│                                                                               │');
        
        if (result.summary.added > 0) {
            lines.push(`│  ✅ ${result.summary.added} NOVO(S)       → Existe na ORIGEM, falta no DESTINO`.padEnd(80) + '│');
            lines.push('│                        (Ação: fazer deploy para o destino)'.padEnd(80) + '│');
        } else {
            lines.push('│  ✅ 0 NOVO(S)       → Nenhum componente novo'.padEnd(80) + '│');
        }
        
        if (result.summary.removed > 0) {
            lines.push(`│  ❌ ${result.summary.removed} REMOVIDO(S)  → Existe no DESTINO, não existe na ORIGEM`.padEnd(80) + '│');
            lines.push('│                        (Ação: remover do destino ou adicionar na origem)'.padEnd(80) + '│');
        } else {
            lines.push('│  ❌ 0 REMOVIDO(S)  → Nenhum componente extra no destino'.padEnd(80) + '│');
        }
        
        if (result.summary.modified > 0) {
            lines.push(`│  ⚠️  ${result.summary.modified} DIFERENTE(S) → Existe em ambos, mas com configurações diferentes`.padEnd(80) + '│');
            lines.push('│                        (Ação: sincronizar as diferenças)'.padEnd(80) + '│');
        } else {
            lines.push('│  ⚠️  0 DIFERENTE(S) → Nenhuma diferença de configuração'.padEnd(80) + '│');
        }
        
        if (result.summary.unchanged > 0) {
            lines.push(`│  ✔️  ${result.summary.unchanged} IDÊNTICO(S)  → Configuração igual em ambos os ambientes`.padEnd(80) + '│');
        }
        
        lines.push('└───────────────────────────────────────────────────────────────────────────────┘');
        lines.push('');

        if (result.differences.length > 0) {
            lines.push('┌───────────────────────────────────────────────────────────────────────────────┐');
            lines.push('│  DETALHES DAS DIFERENÇAS                                                      │');
            lines.push('└───────────────────────────────────────────────────────────────────────────────┘');
            lines.push('');

            const added = result.differences.filter(d => d.status === 'added');
            const removed = result.differences.filter(d => d.status === 'removed');
            const modified = result.differences.filter(d => d.status === 'modified');

            if (added.length > 0) {
                lines.push('  ┌─────────────────────────────────────────────────────────────────────────┐');
                lines.push('  │  ✅ COMPONENTES NOVOS (existem na origem, precisam ser criados no destino)');
                lines.push('  └─────────────────────────────────────────────────────────────────────────┘');
                for (const diff of added) {
                    lines.push(`     📦 ${diff.componentName}`);
                    lines.push(`        Tipo: ${diff.type}`);
                    lines.push(`        API Name: ${diff.path}`);
                    lines.push('');
                }
            }

            if (removed.length > 0) {
                lines.push('  ┌─────────────────────────────────────────────────────────────────────────┐');
                lines.push('  │  ❌ COMPONENTES EXTRAS (existem no destino, não existem na origem)');
                lines.push('  └─────────────────────────────────────────────────────────────────────────┘');
                for (const diff of removed) {
                    lines.push(`     📦 ${diff.componentName}`);
                    lines.push(`        Tipo: ${diff.type}`);
                    lines.push(`        API Name: ${diff.path}`);
                    lines.push('');
                }
            }

            if (modified.length > 0) {
                lines.push('  ┌─────────────────────────────────────────────────────────────────────────┐');
                lines.push('  │  ⚠️  COMPONENTES COM DIFERENÇAS (existem em ambos, mas estão diferentes)');
                lines.push('  └─────────────────────────────────────────────────────────────────────────┘');
                for (const diff of modified) {
                    lines.push(`     📦 ${diff.componentName}`);
                    lines.push(`        Tipo: ${diff.type}`);
                    lines.push(`        API Name: ${diff.path}`);
                    lines.push('');
                    if (diff.details && diff.details.length > 0) {
                        lines.push('        Diferenças encontradas:');
                        lines.push('        ┌──────────────────────────────────────────────────────────────┐');
                        for (const detail of diff.details) {
                            lines.push(`        │  Campo: ${detail.property}`);
                            lines.push(`        │    🔵 Origem:  ${detail.sourceValue || '(vazio)'}`);
                            lines.push(`        │    🟢 Destino: ${detail.targetValue || '(vazio)'}`);
                            lines.push('        │');
                        }
                        lines.push('        └──────────────────────────────────────────────────────────────┘');
                    }
                    lines.push('');
                }
            }
        } else {
            lines.push('┌───────────────────────────────────────────────────────────────────────────────┐');
            lines.push('│  ✅ NENHUMA DIFERENÇA ENCONTRADA                                              │');
            lines.push('│                                                                               │');
            lines.push('│  Os ambientes estão sincronizados para este tipo de metadado.                │');
            lines.push('└───────────────────────────────────────────────────────────────────────────────┘');
        }

        lines.push('');
        lines.push('═══════════════════════════════════════════════════════════════════════════════');
        lines.push('                              FIM DO RELATÓRIO                                 ');
        lines.push('═══════════════════════════════════════════════════════════════════════════════');

        return lines.join('\n');
    }

    /**
     * Obtém o ícone de status
     */
    private getStatusIcon(status: DiffItem['status']): string {
        switch (status) {
            case 'added':
                return '✅';
            case 'removed':
                return '❌';
            case 'modified':
                return '⚠️';
            case 'unchanged':
                return '✔️';
            default:
                return '❓';
        }
    }
}

export const diffService = DiffService.getInstance();
