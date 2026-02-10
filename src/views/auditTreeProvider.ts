import * as vscode from 'vscode';
import { AuditEntry, AuditAction } from '../types';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';

/**
 * Tipos de itens na árvore de auditoria
 */
type AuditTreeItemType = 'entry' | 'detail' | 'empty' | 'category';

/**
 * Item da árvore de auditoria
 */
export class AuditTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: AuditTreeItemType,
        public readonly entry?: AuditEntry,
        public readonly detailKey?: string,
        public readonly detailValue?: string
    ) {
        super(label, collapsibleState);
        this.setupItem();
    }

    private setupItem(): void {
        switch (this.itemType) {
            case 'entry':
                this.setupEntryItem();
                break;
            case 'detail':
                this.setupDetailItem();
                break;
            case 'empty':
                this.setupEmptyItem();
                break;
            case 'category':
                this.setupCategoryItem();
                break;
        }
    }

    private setupEntryItem(): void {
        if (!this.entry) {return;}

        this.contextValue = 'auditEntry';
        this.iconPath = this.getActionIcon(this.entry.action);
        
        const date = this.entry.timestamp;
        this.description = this.formatDate(date);

        this.tooltip = new vscode.MarkdownString();
        this.tooltip.appendMarkdown(`**${this.getActionLabel(this.entry.action)}**\n\n`);
        this.tooltip.appendMarkdown(`- **Date:** ${date.toLocaleString()}\n`);
        this.tooltip.appendMarkdown(`- **User:** ${this.entry.user}\n`);
        
        if (this.entry.sourceOrg) {
            this.tooltip.appendMarkdown(`- **Source Org:** ${this.entry.sourceOrg}\n`);
        }
        
        if (this.entry.targetOrg) {
            this.tooltip.appendMarkdown(`- **Target Org:** ${this.entry.targetOrg}\n`);
        }
        
        if (this.entry.details.componentsCount !== undefined) {
            this.tooltip.appendMarkdown(`- **Components:** ${this.entry.details.componentsCount}\n`);
        }
    }

    private setupDetailItem(): void {
        this.contextValue = 'auditDetail';
        this.iconPath = new vscode.ThemeIcon('symbol-property');
        this.description = this.detailValue;
    }

    private setupEmptyItem(): void {
        this.iconPath = new vscode.ThemeIcon('info');
        this.contextValue = 'empty';
    }

    private setupCategoryItem(): void {
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'auditCategory';
    }

    private getActionIcon(action: AuditAction): vscode.ThemeIcon {
        switch (action) {
            case 'PACKAGE_CREATED':
                return new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.green'));
            case 'PACKAGE_EXPORTED':
                return new vscode.ThemeIcon('export', new vscode.ThemeColor('charts.blue'));
            case 'DIFF_EXECUTED':
                return new vscode.ThemeIcon('diff', new vscode.ThemeColor('charts.yellow'));
            case 'METADATA_RETRIEVED':
                return new vscode.ThemeIcon('cloud-download', new vscode.ThemeColor('charts.purple'));
            case 'SELECTION_UPDATED':
                return new vscode.ThemeIcon('checklist', new vscode.ThemeColor('charts.orange'));
            case 'ORG_CONNECTED':
                return new vscode.ThemeIcon('plug', new vscode.ThemeColor('charts.green'));
            case 'ORG_DISCONNECTED':
                return new vscode.ThemeIcon('debug-disconnect', new vscode.ThemeColor('charts.red'));
            default:
                return new vscode.ThemeIcon('history');
        }
    }

    private getActionLabel(action: AuditAction): string {
        const labels: Record<AuditAction, string> = {
            'PACKAGE_CREATED': 'Pacote Criado',
            'PACKAGE_EXPORTED': 'Pacote Exportado',
            'DIFF_EXECUTED': 'Diff Executado',
            'METADATA_RETRIEVED': 'Metadados Recuperados',
            'SELECTION_UPDATED': 'Seleção Atualizada',
            'ORG_CONNECTED': 'Org Conectada',
            'ORG_DISCONNECTED': 'Org Desconectada',
        };

        return labels[action] || action;
    }

    private formatDate(date: Date): string {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) {
            return 'Agora';
        } else if (minutes < 60) {
            return `${minutes}m atrás`;
        } else if (hours < 24) {
            return `${hours}h atrás`;
        } else if (days < 7) {
            return `${days}d atrás`;
        } else {
            return date.toLocaleDateString();
        }
    }
}

/**
 * Provider da árvore de auditoria
 */
export class AuditTreeProvider implements vscode.TreeDataProvider<AuditTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AuditTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<AuditTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<AuditTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    /**
     * Atualiza a árvore
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AuditTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: AuditTreeItem): Promise<AuditTreeItem[]> {
        if (!element) {
            return this.getRootItems();
        }

        if (element.itemType === 'entry' && element.entry) {
            return this.getEntryDetails(element.entry);
        }

        return [];
    }

    /**
     * Obtém os itens raiz (entradas recentes)
     */
    private getRootItems(): AuditTreeItem[] {
        const entries = auditService.getRecentEntries(20);
        const items: AuditTreeItem[] = [];

        if (entries.length === 0) {
            items.push(new AuditTreeItem(
                'Nenhuma entrada de auditoria',
                vscode.TreeItemCollapsibleState.None,
                'empty'
            ));
            
            const helpItem = new AuditTreeItem(
                'As ações serão registradas aqui',
                vscode.TreeItemCollapsibleState.None,
                'empty'
            );
            helpItem.iconPath = new vscode.ThemeIcon('lightbulb');
            items.push(helpItem);
            
            return items;
        }

        // Agrupa por dia
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const todayEntries = entries.filter(e => e.timestamp >= today);
        const yesterdayEntries = entries.filter(e => e.timestamp >= yesterday && e.timestamp < today);
        const olderEntries = entries.filter(e => e.timestamp < yesterday);

        if (todayEntries.length > 0) {
            items.push(new AuditTreeItem(
                `Hoje (${todayEntries.length})`,
                vscode.TreeItemCollapsibleState.Expanded,
                'category'
            ));
            
            for (const entry of todayEntries) {
                items.push(new AuditTreeItem(
                    this.getActionLabel(entry.action),
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'entry',
                    entry
                ));
            }
        }

        if (yesterdayEntries.length > 0) {
            items.push(new AuditTreeItem(
                `Ontem (${yesterdayEntries.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'category'
            ));
            
            for (const entry of yesterdayEntries) {
                items.push(new AuditTreeItem(
                    this.getActionLabel(entry.action),
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'entry',
                    entry
                ));
            }
        }

        if (olderEntries.length > 0) {
            items.push(new AuditTreeItem(
                `Anteriores (${olderEntries.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'category'
            ));
            
            for (const entry of olderEntries) {
                items.push(new AuditTreeItem(
                    this.getActionLabel(entry.action),
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'entry',
                    entry
                ));
            }
        }

        return items;
    }

    /**
     * Obtém os detalhes de uma entrada
     */
    private getEntryDetails(entry: AuditEntry): AuditTreeItem[] {
        const items: AuditTreeItem[] = [];

        items.push(new AuditTreeItem(
            'Usuário',
            vscode.TreeItemCollapsibleState.None,
            'detail',
            entry,
            'Usuário',
            entry.user
        ));

        items.push(new AuditTreeItem(
            'Data/Hora',
            vscode.TreeItemCollapsibleState.None,
            'detail',
            entry,
            'Data/Hora',
            entry.timestamp.toLocaleString()
        ));

        if (entry.sourceOrg) {
            items.push(new AuditTreeItem(
                'Org Origem',
                vscode.TreeItemCollapsibleState.None,
                'detail',
                entry,
                'Org Origem',
                entry.sourceOrg
            ));
        }

        if (entry.targetOrg) {
            items.push(new AuditTreeItem(
                'Org Destino',
                vscode.TreeItemCollapsibleState.None,
                'detail',
                entry,
                'Org Destino',
                entry.targetOrg
            ));
        }

        if (entry.details.componentsCount !== undefined) {
            items.push(new AuditTreeItem(
                'Componentes',
                vscode.TreeItemCollapsibleState.None,
                'detail',
                entry,
                'Componentes',
                String(entry.details.componentsCount)
            ));
        }

        if (entry.details.componentTypes && entry.details.componentTypes.length > 0) {
            items.push(new AuditTreeItem(
                'Tipos',
                vscode.TreeItemCollapsibleState.None,
                'detail',
                entry,
                'Tipos',
                entry.details.componentTypes.join(', ')
            ));
        }

        if (entry.details.packagePath) {
            items.push(new AuditTreeItem(
                'Pacote',
                vscode.TreeItemCollapsibleState.None,
                'detail',
                entry,
                'Pacote',
                entry.details.packagePath
            ));
        }

        if (entry.details.diffSummary) {
            const s = entry.details.diffSummary;
            items.push(new AuditTreeItem(
                'Resultado Diff',
                vscode.TreeItemCollapsibleState.None,
                'detail',
                entry,
                'Resultado',
                `+${s.added} -${s.removed} ~${s.modified}`
            ));
        }

        return items;
    }

    private getActionLabel(action: AuditAction): string {
        const labels: Record<AuditAction, string> = {
            'PACKAGE_CREATED': 'Pacote Criado',
            'PACKAGE_EXPORTED': 'Pacote Exportado',
            'DIFF_EXECUTED': 'Diff Executado',
            'METADATA_RETRIEVED': 'Metadados Recuperados',
            'SELECTION_UPDATED': 'Seleção Atualizada',
            'ORG_CONNECTED': 'Org Conectada',
            'ORG_DISCONNECTED': 'Org Desconectada',
        };

        return labels[action] || action;
    }
}
