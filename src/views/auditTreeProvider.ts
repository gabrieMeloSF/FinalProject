import * as vscode from 'vscode';
import { AuditEntry, AuditAction, SetupAuditTrailEntry } from '../types';
import { auditService } from '../services/auditService';
import { sfdxService } from '../services/sfdxService';
import { logger } from '../utils/logger';

/**
 * Tipos de itens na árvore de auditoria
 */
type AuditTreeItemType = 'entry' | 'detail' | 'empty' | 'category' | 'sfEntry' | 'sfDetail' | 'action' | 'loading';

/**
 * Item da árvore de auditoria
 */
export class AuditTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: AuditTreeItemType,
        public readonly entry?: AuditEntry,
        public readonly sfEntry?: SetupAuditTrailEntry,
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
            case 'sfEntry':
                this.setupSfEntryItem();
                break;
            case 'detail':
            case 'sfDetail':
                this.setupDetailItem();
                break;
            case 'empty':
                this.setupEmptyItem();
                break;
            case 'category':
                this.setupCategoryItem();
                break;
            case 'action':
                this.setupActionItem();
                break;
            case 'loading':
                this.setupLoadingItem();
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
    }

    private setupSfEntryItem(): void {
        if (!this.sfEntry) {return;}

        this.contextValue = 'sfAuditEntry';
        this.iconPath = this.getSectionIcon(this.sfEntry.section);
        
        this.description = this.sfEntry.createdDate.toLocaleTimeString('pt-BR');

        this.tooltip = new vscode.MarkdownString();
        this.tooltip.appendMarkdown(`**${this.sfEntry.section}**\n\n`);
        this.tooltip.appendMarkdown(`- **Ação:** ${this.sfEntry.action}\n`);
        this.tooltip.appendMarkdown(`- **Data:** ${this.sfEntry.createdDate.toLocaleString('pt-BR')}\n`);
        this.tooltip.appendMarkdown(`- **Usuário:** ${this.sfEntry.createdByName}\n`);
        this.tooltip.appendMarkdown(`\n---\n\n${this.sfEntry.display}`);
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
        this.iconPath = new vscode.ThemeIcon('calendar');
        this.contextValue = 'auditCategory';
    }

    private setupActionItem(): void {
        this.iconPath = new vscode.ThemeIcon('play');
        this.contextValue = 'auditAction';
    }

    private setupLoadingItem(): void {
        this.iconPath = new vscode.ThemeIcon('loading~spin');
        this.contextValue = 'loading';
    }

    private getSectionIcon(section: string): vscode.ThemeIcon {
        const sectionLower = section.toLowerCase();
        
        if (sectionLower.includes('permission')) {
            return new vscode.ThemeIcon('shield', new vscode.ThemeColor('charts.purple'));
        } else if (sectionLower.includes('profile')) {
            return new vscode.ThemeIcon('person', new vscode.ThemeColor('charts.blue'));
        } else if (sectionLower.includes('user')) {
            return new vscode.ThemeIcon('account', new vscode.ThemeColor('charts.green'));
        } else if (sectionLower.includes('object') || sectionLower.includes('field')) {
            return new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.orange'));
        } else if (sectionLower.includes('apex') || sectionLower.includes('class')) {
            return new vscode.ThemeIcon('code', new vscode.ThemeColor('charts.yellow'));
        } else if (sectionLower.includes('flow') || sectionLower.includes('process')) {
            return new vscode.ThemeIcon('workflow', new vscode.ThemeColor('charts.red'));
        } else if (sectionLower.includes('security')) {
            return new vscode.ThemeIcon('lock', new vscode.ThemeColor('charts.red'));
        } else {
            return new vscode.ThemeIcon('history', new vscode.ThemeColor('charts.gray'));
        }
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
            return date.toLocaleDateString('pt-BR');
        }
    }
}

/**
 * Provider da árvore de auditoria - Setup Audit Trail do Salesforce
 */
export class AuditTreeProvider implements vscode.TreeDataProvider<AuditTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AuditTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<AuditTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<AuditTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private isLoading = false;
    private currentFilter: string = 'All';
    private sfAuditTrailEntries: SetupAuditTrailEntry[] = [];

    /**
     * Atualiza a árvore
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Busca o Audit Trail do Salesforce
     */
    public async fetchAuditTrail(): Promise<void> {
        const org = sfdxService.getCurrentOrg();
        if (!org) {
            vscode.window.showWarningMessage('Conecte-se a uma org para ver o Setup Audit Trail');
            return;
        }

        this.isLoading = true;
        this.refresh();

        try {
            const filter = this.currentFilter !== 'All' ? { section: this.currentFilter } : undefined;
            const result = await auditService.fetchSetupAuditTrail(filter);
            
            if (result.success && result.data) {
                this.sfAuditTrailEntries = result.data;
                vscode.window.showInformationMessage(`${result.data.length} registros do Audit Trail carregados`);
            } else {
                vscode.window.showErrorMessage(`Erro ao carregar Audit Trail: ${result.error}`);
            }
        } catch (error) {
            logger.error('Erro ao buscar Audit Trail', error);
        } finally {
            this.isLoading = false;
            this.refresh();
        }
    }

    /**
     * Define o filtro de seção
     */
    public setFilter(section: string): void {
        this.currentFilter = section;
        this.fetchAuditTrail();
    }

    /**
     * Obtém o filtro atual
     */
    public getFilter(): string {
        return this.currentFilter;
    }

    getTreeItem(element: AuditTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: AuditTreeItem): Promise<AuditTreeItem[]> {
        if (!element) {
            return this.getRootItems();
        }

        if (element.itemType === 'sfEntry' && element.sfEntry) {
            return this.getSfEntryDetails(element.sfEntry);
        }

        if (element.itemType === 'category') {
            return this.getCategoryEntries(element.label);
        }

        return [];
    }

    /**
     * Obtém os itens raiz
     */
    private getRootItems(): AuditTreeItem[] {
        const items: AuditTreeItem[] = [];
        const org = sfdxService.getCurrentOrg();

        // Se não há org conectada
        if (!org) {
            items.push(new AuditTreeItem(
                'Conecte-se a uma org',
                vscode.TreeItemCollapsibleState.None,
                'empty'
            ));
            return items;
        }

        // Se está carregando
        if (this.isLoading) {
            items.push(new AuditTreeItem(
                'Carregando Audit Trail...',
                vscode.TreeItemCollapsibleState.None,
                'loading'
            ));
            return items;
        }

        // Ação: Carregar/Atualizar
        const loadItem = new AuditTreeItem(
            '⟳ Carregar Setup Audit Trail',
            vscode.TreeItemCollapsibleState.None,
            'action'
        );
        loadItem.command = {
            command: 'sfdevops.refreshAuditTrail',
            title: 'Carregar Audit Trail'
        };
        loadItem.iconPath = new vscode.ThemeIcon('refresh');
        items.push(loadItem);

        // Se não há entradas
        if (this.sfAuditTrailEntries.length === 0) {
            items.push(new AuditTreeItem(
                'Clique acima para carregar',
                vscode.TreeItemCollapsibleState.None,
                'empty'
            ));
            return items;
        }

        // Info do filtro atual
        const filterItem = new AuditTreeItem(
            `Filtro: ${this.currentFilter}`,
            vscode.TreeItemCollapsibleState.None,
            'empty'
        );
        filterItem.iconPath = new vscode.ThemeIcon('filter');
        filterItem.command = {
            command: 'sfdevops.filterAuditTrail',
            title: 'Filtrar'
        };
        items.push(filterItem);

        // Info de última atualização
        const lastFetch = auditService.getSetupAuditTrailLastFetch();
        if (lastFetch) {
            const infoItem = new AuditTreeItem(
                `${this.sfAuditTrailEntries.length} registros`,
                vscode.TreeItemCollapsibleState.None,
                'empty'
            );
            infoItem.description = `atualizado ${lastFetch.toLocaleTimeString('pt-BR')}`;
            infoItem.iconPath = new vscode.ThemeIcon('info');
            items.push(infoItem);
        }

        // Agrupa por data
        const byDate = new Map<string, SetupAuditTrailEntry[]>();
        for (const entry of this.sfAuditTrailEntries) {
            const dateKey = entry.createdDate.toLocaleDateString('pt-BR');
            if (!byDate.has(dateKey)) {
                byDate.set(dateKey, []);
            }
            byDate.get(dateKey)!.push(entry);
        }

        // Cria categorias por data
        for (const [date, entries] of byDate) {
            const categoryItem = new AuditTreeItem(
                `📅 ${date} (${entries.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'category'
            );
            items.push(categoryItem);
        }

        return items;
    }

    /**
     * Obtém as entradas de uma categoria (data)
     */
    private getCategoryEntries(categoryLabel: string): AuditTreeItem[] {
        const items: AuditTreeItem[] = [];
        
        // Extrai a data do label (formato: "📅 DD/MM/YYYY (N)")
        const dateMatch = categoryLabel.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (!dateMatch) return items;

        const dateStr = dateMatch[1];
        
        const entries = this.sfAuditTrailEntries.filter(entry => {
            return entry.createdDate.toLocaleDateString('pt-BR') === dateStr;
        });

        for (const entry of entries) {
            const displayText = entry.display.length > 60 
                ? entry.display.substring(0, 57) + '...' 
                : entry.display;
            
            items.push(new AuditTreeItem(
                displayText,
                vscode.TreeItemCollapsibleState.Collapsed,
                'sfEntry',
                undefined,
                entry
            ));
        }

        return items;
    }

    /**
     * Obtém os detalhes de uma entrada do Salesforce
     */
    private getSfEntryDetails(entry: SetupAuditTrailEntry): AuditTreeItem[] {
        const items: AuditTreeItem[] = [];

        items.push(new AuditTreeItem(
            'Usuário',
            vscode.TreeItemCollapsibleState.None,
            'sfDetail',
            undefined,
            entry,
            'Usuário',
            entry.createdByName
        ));

        items.push(new AuditTreeItem(
            'Data/Hora',
            vscode.TreeItemCollapsibleState.None,
            'sfDetail',
            undefined,
            entry,
            'Data/Hora',
            entry.createdDate.toLocaleString('pt-BR')
        ));

        items.push(new AuditTreeItem(
            'Seção',
            vscode.TreeItemCollapsibleState.None,
            'sfDetail',
            undefined,
            entry,
            'Seção',
            entry.section
        ));

        items.push(new AuditTreeItem(
            'Ação',
            vscode.TreeItemCollapsibleState.None,
            'sfDetail',
            undefined,
            entry,
            'Ação',
            entry.action
        ));

        // Descrição completa
        const descItem = new AuditTreeItem(
            'Descrição',
            vscode.TreeItemCollapsibleState.None,
            'sfDetail',
            undefined,
            entry,
            'Descrição',
            entry.display
        );
        descItem.tooltip = entry.display;
        items.push(descItem);

        if (entry.delegateUser) {
            items.push(new AuditTreeItem(
                'Delegado',
                vscode.TreeItemCollapsibleState.None,
                'sfDetail',
                undefined,
                entry,
                'Delegado',
                entry.delegateUser
            ));
        }

        return items;
    }
}
