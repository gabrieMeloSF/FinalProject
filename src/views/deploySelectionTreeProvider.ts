import * as vscode from 'vscode';
import { DeployItem, MetadataType } from '../types';
import { deployService } from '../services/deployService';
import { logger } from '../utils/logger';

/**
 * Tipos de itens na árvore de seleção de deploy
 */
type DeployTreeItemType = 'category' | 'item' | 'empty' | 'summary';

/**
 * Item da árvore de seleção de deploy
 */
export class DeploySelectionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: DeployTreeItemType,
        public readonly deployItem?: DeployItem,
        public readonly metadataType?: MetadataType,
        public readonly summaryInfo?: { total: number; byType: Map<MetadataType, number> }
    ) {
        super(label, collapsibleState);
        this.setupItem();
    }

    private setupItem(): void {
        switch (this.itemType) {
            case 'category':
                this.setupCategoryItem();
                break;
            case 'item':
                this.setupDeployItem();
                break;
            case 'empty':
                this.setupEmptyItem();
                break;
            case 'summary':
                this.setupSummaryItem();
                break;
        }
    }

    private setupCategoryItem(): void {
        this.contextValue = 'deployCategory';
        
        switch (this.metadataType) {
            case 'PermissionSet':
                this.iconPath = new vscode.ThemeIcon('shield');
                break;
            case 'Profile':
                this.iconPath = new vscode.ThemeIcon('person');
                break;
            case 'CustomObject':
                this.iconPath = new vscode.ThemeIcon('database');
                break;
            case 'CustomField':
                this.iconPath = new vscode.ThemeIcon('symbol-field');
                break;
            case 'ApexClass':
                this.iconPath = new vscode.ThemeIcon('code');
                break;
            case 'Flow':
                this.iconPath = new vscode.ThemeIcon('git-merge');
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('folder');
        }
    }

    private setupDeployItem(): void {
        if (!this.deployItem) {return;}

        this.contextValue = 'deployItem';
        
        // Ícone baseado na ação
        switch (this.deployItem.action) {
            case 'add':
                this.iconPath = new vscode.ThemeIcon('add', new vscode.ThemeColor('charts.green'));
                this.description = 'Adicionar';
                break;
            case 'update':
                this.iconPath = new vscode.ThemeIcon('edit', new vscode.ThemeColor('charts.yellow'));
                this.description = 'Atualizar';
                break;
            case 'delete':
                this.iconPath = new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.red'));
                this.description = 'Remover';
                break;
        }

        this.tooltip = new vscode.MarkdownString();
        this.tooltip.appendMarkdown(`**${this.deployItem.component.label || this.deployItem.component.fullName}**\n\n`);
        this.tooltip.appendMarkdown(`- **Type:** ${this.deployItem.component.type}\n`);
        this.tooltip.appendMarkdown(`- **API Name:** ${this.deployItem.component.fullName}\n`);
        this.tooltip.appendMarkdown(`- **Action:** ${this.deployItem.action}\n`);
        
        if (this.deployItem.includeRelated) {
            this.tooltip.appendMarkdown(`- **Include Related:** Yes\n`);
        }
    }

    private setupEmptyItem(): void {
        this.iconPath = new vscode.ThemeIcon('info');
        this.contextValue = 'empty';
    }

    private setupSummaryItem(): void {
        this.iconPath = new vscode.ThemeIcon('checklist');
        this.contextValue = 'summary';
    }
}

/**
 * Provider da árvore de seleção de deploy
 */
export class DeploySelectionTreeProvider implements vscode.TreeDataProvider<DeploySelectionTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DeploySelectionTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<DeploySelectionTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DeploySelectionTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    /**
     * Atualiza a árvore
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DeploySelectionTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DeploySelectionTreeItem): Promise<DeploySelectionTreeItem[]> {
        if (!element) {
            return this.getRootItems();
        }

        if (element.itemType === 'category' && element.metadataType) {
            return this.getCategoryItems(element.metadataType);
        }

        return [];
    }

    /**
     * Obtém os itens raiz
     */
    private getRootItems(): DeploySelectionTreeItem[] {
        const selection = deployService.getCurrentSelection();
        const items: DeploySelectionTreeItem[] = [];

        if (selection.items.length === 0) {
            items.push(new DeploySelectionTreeItem(
                'Nenhum componente selecionado',
                vscode.TreeItemCollapsibleState.None,
                'empty'
            ));
            
            const helpItem = new DeploySelectionTreeItem(
                'Use o explorador de Metadados para adicionar componentes',
                vscode.TreeItemCollapsibleState.None,
                'empty'
            );
            helpItem.iconPath = new vscode.ThemeIcon('lightbulb');
            items.push(helpItem);
            
            return items;
        }

        // Agrupa por tipo
        const stats = deployService.getSelectionStats();

        // Resumo
        const summaryItem = new DeploySelectionTreeItem(
            `Total: ${stats.total} componente(s)`,
            vscode.TreeItemCollapsibleState.None,
            'summary',
            undefined,
            undefined,
            stats
        );
        items.push(summaryItem);

        // Categorias
        for (const [type, count] of stats.byType) {
            items.push(new DeploySelectionTreeItem(
                `${this.getTypeLabel(type)} (${count})`,
                vscode.TreeItemCollapsibleState.Expanded,
                'category',
                undefined,
                type
            ));
        }

        return items;
    }

    /**
     * Obtém os itens de uma categoria
     */
    private getCategoryItems(type: MetadataType): DeploySelectionTreeItem[] {
        const selection = deployService.getCurrentSelection();
        const itemsOfType = selection.items.filter(item => item.component.type === type);

        return itemsOfType.map(item => new DeploySelectionTreeItem(
            item.component.label || item.component.fullName,
            vscode.TreeItemCollapsibleState.None,
            'item',
            item,
            type
        ));
    }

    /**
     * Obtém o label amigável do tipo
     */
    private getTypeLabel(type: MetadataType): string {
        const labels: Record<MetadataType, string> = {
            'PermissionSet': 'Permission Sets',
            'Profile': 'Profiles',
            'CustomObject': 'Objetos',
            'CustomField': 'Campos',
            'ApexClass': 'Apex Classes',
            'ApexTrigger': 'Apex Triggers',
            'Flow': 'Flows',
            'Layout': 'Layouts',
            'RecordType': 'Record Types',
            'ValidationRule': 'Validation Rules',
            'WorkflowRule': 'Workflow Rules',
        };

        return labels[type] || type;
    }
}
