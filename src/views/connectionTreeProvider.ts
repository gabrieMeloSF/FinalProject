import * as vscode from 'vscode';
import { OrgInfo } from '../types';
import { sfdxService } from '../services/sfdxService';
import { logger } from '../utils/logger';

/**
 * Item da árvore de conexão
 */
export class ConnectionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly orgInfo?: OrgInfo,
        public readonly itemType: 'org' | 'info' | 'action' = 'info'
    ) {
        super(label, collapsibleState);

        this.setupItem();
    }

    private setupItem(): void {
        switch (this.itemType) {
            case 'org':
                this.setupOrgItem();
                break;
            case 'action':
                this.setupActionItem();
                break;
            default:
                this.setupInfoItem();
        }
    }

    private setupOrgItem(): void {
        if (!this.orgInfo) {return;}

        const isConnected = this.orgInfo.connectedStatus === 'Connected';
        
        this.iconPath = new vscode.ThemeIcon(
            isConnected ? 'cloud' : 'cloud-offline',
            isConnected 
                ? new vscode.ThemeColor('charts.green') 
                : new vscode.ThemeColor('charts.red')
        );

        this.description = this.orgInfo.isSandbox ? 'Sandbox' : 'Production';
        
        this.tooltip = new vscode.MarkdownString();
        this.tooltip.appendMarkdown(`**${this.orgInfo.alias || this.orgInfo.username}**\n\n`);
        this.tooltip.appendMarkdown(`- **Username:** ${this.orgInfo.username}\n`);
        this.tooltip.appendMarkdown(`- **Org ID:** ${this.orgInfo.orgId}\n`);
        this.tooltip.appendMarkdown(`- **Instance:** ${this.orgInfo.instanceUrl}\n`);
        this.tooltip.appendMarkdown(`- **Status:** ${this.orgInfo.connectedStatus}\n`);
        this.tooltip.appendMarkdown(`- **Type:** ${this.orgInfo.isSandbox ? 'Sandbox' : 'Production'}\n`);

        if (this.orgInfo.isDefault) {
            this.description += ' (Default)';
        }

        this.contextValue = 'org';
        this.command = {
            command: 'sfdevops.selectOrg',
            title: 'Selecionar Org',
            arguments: [this.orgInfo],
        };
    }

    private setupInfoItem(): void {
        this.iconPath = new vscode.ThemeIcon('info');
    }

    private setupActionItem(): void {
        this.iconPath = new vscode.ThemeIcon('add');
        this.contextValue = 'action';
    }
}

/**
 * Provider da árvore de conexão
 */
export class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ConnectionTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<ConnectionTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ConnectionTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private currentOrg: OrgInfo | null = null;
    private availableOrgs: OrgInfo[] = [];

    constructor() {
        this.refresh();
    }

    /**
     * Atualiza a árvore
     */
    public async refresh(): Promise<void> {
        try {
            // Lista todas as orgs disponíveis primeiro
            const orgsResult = await sfdxService.listOrgs();
            if (orgsResult.success && orgsResult.data) {
                this.availableOrgs = orgsResult.data;
            }

            // Tenta obter a org atual (pode já estar definida no serviço)
            const currentOrgFromService = sfdxService.getCurrentOrg();
            if (currentOrgFromService) {
                this.currentOrg = currentOrgFromService;
            } else {
                // Tenta obter a org padrão do CLI
                const defaultOrgResult = await sfdxService.getDefaultOrg();
                if (defaultOrgResult.success && defaultOrgResult.data) {
                    this.currentOrg = defaultOrgResult.data;
                }
            }

            this._onDidChangeTreeData.fire();
        } catch (error) {
            logger.error('Erro ao atualizar árvore de conexão', error);
        }
    }

    /**
     * Define a org atual
     */
    public setCurrentOrg(org: OrgInfo): void {
        this.currentOrg = org;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ConnectionTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ConnectionTreeItem): Promise<ConnectionTreeItem[]> {
        if (!element) {
            return this.getRootItems();
        }

        return this.getChildItems(element);
    }

    private getRootItems(): ConnectionTreeItem[] {
        const items: ConnectionTreeItem[] = [];

        // Org atual
        if (this.currentOrg) {
            items.push(new ConnectionTreeItem(
                'Org Atual',
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'info'
            ));
        }

        // Outras orgs disponíveis
        if (this.availableOrgs.length > 0) {
            items.push(new ConnectionTreeItem(
                'Orgs Disponíveis',
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'info'
            ));
        }

        // Mensagem se não há orgs
        if (!this.currentOrg && this.availableOrgs.length === 0) {
            const item = new ConnectionTreeItem(
                'Nenhuma org autenticada',
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'info'
            );
            item.iconPath = new vscode.ThemeIcon('warning');
            item.tooltip = 'Use o Salesforce CLI para autenticar uma org';
            items.push(item);
        }

        return items;
    }

    private getChildItems(element: ConnectionTreeItem): ConnectionTreeItem[] {
        const items: ConnectionTreeItem[] = [];

        if (element.label === 'Org Atual' && this.currentOrg) {
            items.push(new ConnectionTreeItem(
                this.currentOrg.alias || this.currentOrg.username,
                vscode.TreeItemCollapsibleState.None,
                this.currentOrg,
                'org'
            ));

            // Informações adicionais
            const infoItem = new ConnectionTreeItem(
                `Instance: ${this.currentOrg.instanceUrl}`,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'info'
            );
            infoItem.iconPath = new vscode.ThemeIcon('globe');
            items.push(infoItem);
        }

        if (element.label === 'Orgs Disponíveis') {
            for (const org of this.availableOrgs) {
                // Não mostra a org atual na lista
                if (this.currentOrg && 
                    (org.username === this.currentOrg.username || 
                     org.alias === this.currentOrg.alias)) {
                    continue;
                }

                items.push(new ConnectionTreeItem(
                    org.alias || org.username,
                    vscode.TreeItemCollapsibleState.None,
                    org,
                    'org'
                ));
            }
        }

        return items;
    }
}
