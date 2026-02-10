import * as vscode from 'vscode';
import { MetadataComponent, MetadataType, PermissionSet, Profile, CustomObject, ApexClass, Flow } from '../types';
import { metadataService } from '../services/metadataService';
import { logger } from '../utils/logger';

/**
 * Tipos de itens na árvore de metadados
 */
type MetadataTreeItemType = 'category' | 'component' | 'detail' | 'loading' | 'empty';

/**
 * Item da árvore de metadados
 */
export class MetadataTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: MetadataTreeItemType,
        public readonly metadataType?: MetadataType,
        public readonly component?: MetadataComponent,
        public readonly detailKey?: string,
        public readonly detailValue?: string
    ) {
        super(label, collapsibleState);
        this.setupItem();
    }

    private setupItem(): void {
        switch (this.itemType) {
            case 'category':
                this.setupCategoryItem();
                break;
            case 'component':
                this.setupComponentItem();
                break;
            case 'detail':
                this.setupDetailItem();
                break;
            case 'loading':
                this.setupLoadingItem();
                break;
            case 'empty':
                this.setupEmptyItem();
                break;
        }
    }

    private setupCategoryItem(): void {
        this.contextValue = 'category';
        
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

    private setupComponentItem(): void {
        this.contextValue = 'component';
        
        if (this.component) {
            this.tooltip = new vscode.MarkdownString();
            this.tooltip.appendMarkdown(`**${this.component.label || this.component.fullName}**\n\n`);
            this.tooltip.appendMarkdown(`- **API Name:** ${this.component.fullName}\n`);
            this.tooltip.appendMarkdown(`- **Type:** ${this.component.type}\n`);
            
            if (this.component.description) {
                this.tooltip.appendMarkdown(`- **Description:** ${this.component.description}\n`);
            }
            
            if (this.component.lastModifiedDate) {
                this.tooltip.appendMarkdown(`- **Last Modified:** ${this.component.lastModifiedDate.toLocaleDateString()}\n`);
            }
            
            if (this.component.lastModifiedBy) {
                this.tooltip.appendMarkdown(`- **Modified By:** ${this.component.lastModifiedBy}\n`);
            }

            this.description = this.component.description?.substring(0, 50) || '';
        }

        switch (this.metadataType) {
            case 'PermissionSet':
                this.iconPath = new vscode.ThemeIcon('key');
                break;
            case 'Profile':
                this.iconPath = new vscode.ThemeIcon('account');
                break;
            case 'CustomObject':
                this.iconPath = new vscode.ThemeIcon('symbol-class');
                break;
            case 'ApexClass':
                this.iconPath = new vscode.ThemeIcon('symbol-method');
                break;
            case 'Flow':
                this.iconPath = new vscode.ThemeIcon('symbol-event');
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('file');
        }
    }

    private setupDetailItem(): void {
        this.contextValue = 'detail';
        this.iconPath = new vscode.ThemeIcon('symbol-property');
        this.description = this.detailValue;
    }

    private setupLoadingItem(): void {
        this.iconPath = new vscode.ThemeIcon('loading~spin');
    }

    private setupEmptyItem(): void {
        this.iconPath = new vscode.ThemeIcon('info');
    }
}

/**
 * Provider da árvore de metadados
 */
export class MetadataTreeProvider implements vscode.TreeDataProvider<MetadataTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MetadataTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<MetadataTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MetadataTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private isLoading = false;
    private expandedCategories = new Set<MetadataType>();

    /**
     * Atualiza a árvore
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Força atualização dos metadados
     */
    public async forceRefresh(): Promise<void> {
        metadataService.clearCache();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: MetadataTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: MetadataTreeItem): Promise<MetadataTreeItem[]> {
        if (!element) {
            return this.getCategoryItems();
        }

        if (element.itemType === 'category' && element.metadataType) {
            return this.getComponentItems(element.metadataType);
        }

        if (element.itemType === 'component' && element.component) {
            return this.getComponentDetails(element.component);
        }

        return [];
    }

    /**
     * Obtém os itens de categoria (raiz)
     */
    private getCategoryItems(): MetadataTreeItem[] {
        const categories: { type: MetadataType; label: string }[] = [
            { type: 'PermissionSet', label: 'Permission Sets' },
            { type: 'Profile', label: 'Profiles' },
            { type: 'CustomObject', label: 'Objetos' },
            { type: 'ApexClass', label: 'Apex Classes' },
            { type: 'Flow', label: 'Flows' },
        ];

        return categories.map(cat => new MetadataTreeItem(
            cat.label,
            vscode.TreeItemCollapsibleState.Collapsed,
            'category',
            cat.type
        ));
    }

    /**
     * Obtém os componentes de uma categoria
     */
    private async getComponentItems(type: MetadataType): Promise<MetadataTreeItem[]> {
        try {
            const result = await metadataService.getMetadataByType(type);

            if (!result.success || !result.data) {
                return [new MetadataTreeItem(
                    result.error || 'Erro ao carregar',
                    vscode.TreeItemCollapsibleState.None,
                    'empty'
                )];
            }

            if (result.data.length === 0) {
                return [new MetadataTreeItem(
                    'Nenhum item encontrado',
                    vscode.TreeItemCollapsibleState.None,
                    'empty'
                )];
            }

            return result.data.map(component => new MetadataTreeItem(
                component.label || component.fullName,
                vscode.TreeItemCollapsibleState.Collapsed,
                'component',
                type,
                component
            ));
        } catch (error) {
            logger.error(`Erro ao carregar componentes do tipo ${type}`, error);
            return [new MetadataTreeItem(
                'Erro ao carregar metadados',
                vscode.TreeItemCollapsibleState.None,
                'empty'
            )];
        }
    }

    /**
     * Obtém os detalhes de um componente
     */
    private async getComponentDetails(component: MetadataComponent): Promise<MetadataTreeItem[]> {
        const items: MetadataTreeItem[] = [];

        // Detalhes básicos
        items.push(new MetadataTreeItem(
            'API Name',
            vscode.TreeItemCollapsibleState.None,
            'detail',
            component.type,
            component,
            'API Name',
            component.fullName
        ));

        if (component.description) {
            items.push(new MetadataTreeItem(
                'Description',
                vscode.TreeItemCollapsibleState.None,
                'detail',
                component.type,
                component,
                'Description',
                component.description
            ));
        }

        if (component.lastModifiedBy) {
            items.push(new MetadataTreeItem(
                'Modified By',
                vscode.TreeItemCollapsibleState.None,
                'detail',
                component.type,
                component,
                'Modified By',
                component.lastModifiedBy
            ));
        }

        if (component.lastModifiedDate) {
            items.push(new MetadataTreeItem(
                'Last Modified',
                vscode.TreeItemCollapsibleState.None,
                'detail',
                component.type,
                component,
                'Last Modified',
                component.lastModifiedDate.toLocaleDateString()
            ));
        }

        // Detalhes específicos por tipo
        switch (component.type) {
            case 'PermissionSet':
                items.push(...this.getPermissionSetDetails(component as PermissionSet));
                break;
            case 'Profile':
                items.push(...this.getProfileDetails(component as Profile));
                break;
            case 'ApexClass':
                items.push(...this.getApexClassDetails(component as ApexClass));
                break;
            case 'Flow':
                items.push(...this.getFlowDetails(component as Flow));
                break;
        }

        return items;
    }

    private getPermissionSetDetails(ps: PermissionSet): MetadataTreeItem[] {
        const items: MetadataTreeItem[] = [];

        if (ps.license) {
            items.push(new MetadataTreeItem(
                'License',
                vscode.TreeItemCollapsibleState.None,
                'detail',
                'PermissionSet',
                ps,
                'License',
                ps.license
            ));
        }

        items.push(new MetadataTreeItem(
            'Custom',
            vscode.TreeItemCollapsibleState.None,
            'detail',
            'PermissionSet',
            ps,
            'Custom',
            ps.isCustom ? 'Yes' : 'No'
        ));

        if (ps.hasActivationRequired !== undefined) {
            items.push(new MetadataTreeItem(
                'Activation Required',
                vscode.TreeItemCollapsibleState.None,
                'detail',
                'PermissionSet',
                ps,
                'Activation Required',
                ps.hasActivationRequired ? 'Yes' : 'No'
            ));
        }

        return items;
    }

    private getProfileDetails(profile: Profile): MetadataTreeItem[] {
        const items: MetadataTreeItem[] = [];

        if (profile.userLicense) {
            items.push(new MetadataTreeItem(
                'User License',
                vscode.TreeItemCollapsibleState.None,
                'detail',
                'Profile',
                profile,
                'User License',
                profile.userLicense
            ));
        }

        items.push(new MetadataTreeItem(
            'Custom',
            vscode.TreeItemCollapsibleState.None,
            'detail',
            'Profile',
            profile,
            'Custom',
            profile.isCustom ? 'Yes' : 'No'
        ));

        return items;
    }

    private getApexClassDetails(apexClass: ApexClass): MetadataTreeItem[] {
        const items: MetadataTreeItem[] = [];

        items.push(new MetadataTreeItem(
            'API Version',
            vscode.TreeItemCollapsibleState.None,
            'detail',
            'ApexClass',
            apexClass,
            'API Version',
            apexClass.apiVersion
        ));

        items.push(new MetadataTreeItem(
            'Status',
            vscode.TreeItemCollapsibleState.None,
            'detail',
            'ApexClass',
            apexClass,
            'Status',
            apexClass.status
        ));

        items.push(new MetadataTreeItem(
            'Valid',
            vscode.TreeItemCollapsibleState.None,
            'detail',
            'ApexClass',
            apexClass,
            'Valid',
            apexClass.isValid ? 'Yes' : 'No'
        ));

        items.push(new MetadataTreeItem(
            'Length (without comments)',
            vscode.TreeItemCollapsibleState.None,
            'detail',
            'ApexClass',
            apexClass,
            'Length',
            String(apexClass.lengthWithoutComments)
        ));

        return items;
    }

    private getFlowDetails(flow: Flow): MetadataTreeItem[] {
        const items: MetadataTreeItem[] = [];

        items.push(new MetadataTreeItem(
            'Process Type',
            vscode.TreeItemCollapsibleState.None,
            'detail',
            'Flow',
            flow,
            'Process Type',
            flow.processType
        ));

        items.push(new MetadataTreeItem(
            'Status',
            vscode.TreeItemCollapsibleState.None,
            'detail',
            'Flow',
            flow,
            'Status',
            flow.status
        ));

        items.push(new MetadataTreeItem(
            'API Version',
            vscode.TreeItemCollapsibleState.None,
            'detail',
            'Flow',
            flow,
            'API Version',
            flow.apiVersion
        ));

        return items;
    }
}
