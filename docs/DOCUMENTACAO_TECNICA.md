# Documentação Técnica - SF DevOps Assistant

## Sumário

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Estrutura de Diretórios](#2-estrutura-de-diretórios)
3. [Tipos e Interfaces](#3-tipos-e-interfaces)
4. [Utilitários (Utils)](#4-utilitários-utils)
5. [Serviços (Services)](#5-serviços-services)
6. [Views (Tree Providers)](#6-views-tree-providers)
7. [Comandos (Commands)](#7-comandos-commands)
8. [Ponto de Entrada (Extension)](#8-ponto-de-entrada-extension)
9. [Configurações da Extensão](#9-configurações-da-extensão)
10. [Fluxos de Trabalho](#10-fluxos-de-trabalho)

---

## 1. Visão Geral da Arquitetura

A extensão SF DevOps Assistant segue uma arquitetura modular em camadas, separando responsabilidades de forma clara:

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code Extension                       │
├─────────────────────────────────────────────────────────────┤
│  Commands Layer (Handlers de interação do usuário)          │
│  ├── authCommands.ts                                        │
│  ├── metadataCommands.ts                                    │
│  ├── deployCommands.ts                                      │
│  ├── diffCommands.ts                                        │
│  └── auditCommands.ts                                       │
├─────────────────────────────────────────────────────────────┤
│  Views Layer (Interface gráfica - Tree Views)               │
│  ├── connectionTreeProvider.ts                              │
│  ├── metadataTreeProvider.ts                                │
│  ├── deploySelectionTreeProvider.ts                         │
│  └── auditTreeProvider.ts                                   │
├─────────────────────────────────────────────────────────────┤
│  Services Layer (Lógica de negócio)                         │
│  ├── sfdxService.ts                                         │
│  ├── metadataService.ts                                     │
│  ├── deployService.ts                                       │
│  ├── diffService.ts                                         │
│  └── auditService.ts                                        │
├─────────────────────────────────────────────────────────────┤
│  Utils Layer (Utilitários compartilhados)                   │
│  ├── logger.ts                                              │
│  ├── config.ts                                              │
│  ├── xmlBuilder.ts                                          │
│  └── fileUtils.ts                                           │
├─────────────────────────────────────────────────────────────┤
│  Types Layer (Definições de tipos TypeScript)               │
│  └── index.ts                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Salesforce CLI                           │
│                  (Execução de comandos sf/sfdx)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Salesforce Orgs                          │
│              (APIs: Metadata, Tooling, SOQL)                 │
└─────────────────────────────────────────────────────────────┘
```

### Padrões de Design Utilizados

- **Singleton Pattern**: Todos os serviços utilizam o padrão Singleton para garantir uma única instância.
- **Observer Pattern**: Tree Providers utilizam eventos para notificar mudanças na UI.
- **Facade Pattern**: Services encapsulam a complexidade das APIs Salesforce.
- **Factory Pattern**: XML Builder cria estruturas XML de diferentes tipos de metadados.

---

## 2. Estrutura de Diretórios

```
src/
├── types/
│   └── index.ts              # Todas as interfaces e tipos TypeScript
├── utils/
│   ├── index.ts              # Exportações dos utilitários
│   ├── logger.ts             # Sistema de logging
│   ├── config.ts             # Gerenciador de configurações
│   ├── xmlBuilder.ts         # Construtor de XML Salesforce
│   └── fileUtils.ts          # Operações de sistema de arquivos
├── services/
│   ├── index.ts              # Exportações dos serviços
│   ├── sfdxService.ts        # Integração com Salesforce CLI
│   ├── metadataService.ts    # Leitura de metadados via SOQL
│   ├── deployService.ts      # Montagem de pacotes de deploy
│   ├── diffService.ts        # Comparação de metadados
│   └── auditService.ts       # Auditoria e rastreabilidade
├── views/
│   ├── index.ts              # Exportações das views
│   ├── connectionTreeProvider.ts      # Tree View de conexão
│   ├── metadataTreeProvider.ts        # Tree View de metadados
│   ├── deploySelectionTreeProvider.ts # Tree View de seleção
│   └── auditTreeProvider.ts           # Tree View de auditoria
├── commands/
│   ├── index.ts              # Exportações dos comandos
│   ├── authCommands.ts       # Comandos de autenticação
│   ├── metadataCommands.ts   # Comandos de metadados
│   ├── deployCommands.ts     # Comandos de deploy
│   ├── diffCommands.ts       # Comandos de diff
│   └── auditCommands.ts      # Comandos de auditoria
└── extension.ts              # Ponto de entrada da extensão
```

---

## 3. Tipos e Interfaces

### Arquivo: `src/types/index.ts`

Este arquivo contém todas as definições de tipos TypeScript utilizadas pela extensão.

### 3.1 Tipos de Conexão e Org

```typescript
interface OrgInfo {
    alias?: string;           // Alias da org (ex: "DevSandbox")
    username: string;         // Username do usuário (ex: "user@org.com")
    orgId: string;            // ID único da org (18 caracteres)
    instanceUrl: string;      // URL da instância (ex: "https://myorg.my.salesforce.com")
    accessToken?: string;     // Token de acesso OAuth
    isDefault: boolean;       // Se é a org padrão do projeto
    isSandbox: boolean;       // Se é uma sandbox
    connectedStatus: 'Connected' | 'Disconnected' | 'Unknown';
}
```

**Uso**: Representa informações de uma org Salesforce autenticada.

```typescript
interface AuthResult {
    success: boolean;         // Se a autenticação foi bem-sucedida
    org?: OrgInfo;            // Informações da org (se sucesso)
    error?: string;           // Mensagem de erro (se falha)
}
```

**Uso**: Retorno de operações de autenticação.

### 3.2 Tipos de Metadados

```typescript
type MetadataType = 
    | 'PermissionSet'
    | 'Profile'
    | 'CustomObject'
    | 'CustomField'
    | 'ApexClass'
    | 'ApexTrigger'
    | 'Flow'
    | 'Layout'
    | 'RecordType'
    | 'ValidationRule'
    | 'WorkflowRule';
```

**Uso**: Union type com todos os tipos de metadados suportados.

```typescript
interface MetadataComponent {
    id?: string;                    // ID do registro no Salesforce
    fullName: string;               // Nome da API (ex: "Account")
    type: MetadataType;             // Tipo do metadado
    label?: string;                 // Label amigável
    description?: string;           // Descrição
    lastModifiedDate?: Date;        // Data da última modificação
    lastModifiedBy?: string;        // Usuário que modificou
    createdDate?: Date;             // Data de criação
    createdBy?: string;             // Usuário que criou
}
```

**Uso**: Interface base para todos os componentes de metadados.

### 3.3 Permission Set (Detalhado)

```typescript
interface PermissionSet extends MetadataComponent {
    type: 'PermissionSet';
    license?: string;                           // Licença associada
    hasActivationRequired?: boolean;            // Requer ativação de sessão
    isCustom: boolean;                          // Se é customizado
    objectPermissions: ObjectPermission[];      // Permissões de objetos
    fieldPermissions: FieldPermission[];        // Permissões de campos
    classAccesses: ClassAccess[];               // Acesso a classes Apex
    userPermissions: UserPermission[];          // Permissões de usuário
    tabSettings: TabSetting[];                  // Configurações de tabs
    recordTypeVisibilities: RecordTypeVisibility[]; // Visibilidade de Record Types
}
```

**Uso**: Representa um Permission Set completo com todas suas permissões.

### 3.4 Tipos de Permissões

```typescript
interface ObjectPermission {
    object: string;              // Nome do objeto (ex: "Account")
    allowCreate: boolean;        // Permissão de criar
    allowRead: boolean;          // Permissão de ler
    allowEdit: boolean;          // Permissão de editar
    allowDelete: boolean;        // Permissão de deletar
    viewAllRecords: boolean;     // Ver todos os registros
    modifyAllRecords: boolean;   // Modificar todos os registros
}

interface FieldPermission {
    field: string;               // Campo (ex: "Account.Industry")
    readable: boolean;           // Pode ler
    editable: boolean;           // Pode editar
}

interface ClassAccess {
    apexClass: string;           // Nome da classe Apex
    enabled: boolean;            // Acesso habilitado
}
```

### 3.5 Tipos de Deploy

```typescript
interface DeploySelection {
    id: string;                  // ID único da seleção
    items: DeployItem[];         // Itens selecionados
    createdAt: Date;             // Data de criação
    updatedAt: Date;             // Última atualização
    sourceOrg?: string;          // Org de origem
    targetOrg?: string;          // Org de destino
}

interface DeployItem {
    id: string;                  // ID único do item
    component: MetadataComponent; // Componente de metadado
    includeRelated: boolean;     // Incluir relacionados
    relatedItems?: DeployItem[]; // Itens relacionados
    action: 'add' | 'update' | 'delete'; // Ação do deploy
}

interface DeployPackage {
    packageXml: string;                    // Conteúdo do package.xml
    destructiveChangesXml?: string;        // Conteúdo do destructiveChanges.xml
    metadataFiles: MetadataFile[];         // Arquivos de metadados
    manifest: PackageManifest;             // Manifest estruturado
    generatedAt: Date;                     // Data de geração
    generatedBy: string;                   // Usuário que gerou
    sourceOrg: string;                     // Org de origem
    targetOrg?: string;                    // Org de destino
}
```

### 3.6 Tipos de Diff

```typescript
interface DiffResult {
    source: DiffSource;              // Fonte da comparação
    target: DiffSource;              // Destino da comparação
    componentType: MetadataType;     // Tipo comparado
    differences: DiffItem[];         // Lista de diferenças
    summary: DiffSummary;            // Resumo
    generatedAt: Date;               // Data da geração
}

interface DiffItem {
    path: string;                    // Caminho do item
    componentName: string;           // Nome do componente
    type: MetadataType;              // Tipo do metadado
    status: 'added' | 'removed' | 'modified' | 'unchanged';
    sourceValue?: string;            // Valor na origem
    targetValue?: string;            // Valor no destino
    details?: DiffDetail[];          // Detalhes das diferenças
}

interface DiffSummary {
    totalComponents: number;         // Total de componentes
    added: number;                   // Quantidade adicionada
    removed: number;                 // Quantidade removida
    modified: number;                // Quantidade modificada
    unchanged: number;               // Quantidade inalterada
}
```

### 3.7 Tipos de Auditoria

#### Log Local da Extensão

```typescript
interface AuditEntry {
    id: string;                      // ID único da entrada
    timestamp: Date;                 // Data/hora da ação
    action: AuditAction;             // Tipo de ação
    user: string;                    // Usuário responsável
    sourceOrg?: string;              // Org de origem
    targetOrg?: string;              // Org de destino
    details: AuditDetails;           // Detalhes adicionais
}

type AuditAction = 
    | 'PACKAGE_CREATED'              // Pacote criado
    | 'PACKAGE_EXPORTED'             // Pacote exportado
    | 'DIFF_EXECUTED'                // Diff executado
    | 'METADATA_RETRIEVED'           // Metadados recuperados
    | 'SELECTION_UPDATED'            // Seleção atualizada
    | 'ORG_CONNECTED'                // Org conectada
    | 'ORG_DISCONNECTED';            // Org desconectada
```

#### Setup Audit Trail (Salesforce)

```typescript
// Representa uma entrada do Setup Audit Trail do Salesforce
interface SetupAuditTrailEntry {
    id: string;                      // ID do registro
    action: string;                  // Ação realizada (ex: "insertedPermissionSetAssignment")
    section: string;                 // Seção do Setup (ex: "Permission Sets")
    display: string;                 // Descrição legível da ação
    createdDate: Date;               // Data/hora da alteração
    createdById: string;             // ID do usuário
    createdByName: string;           // Nome do usuário
    delegateUser?: string;           // Usuário delegado (se aplicável)
}

// Filtros para busca do Audit Trail
interface AuditTrailFilter {
    section?: string;                // Filtrar por seção
    userId?: string;                 // Filtrar por usuário
    dateFrom?: Date;                 // Data inicial
    dateTo?: Date;                   // Data final
    searchTerm?: string;             // Busca por texto
    limit?: number;                  // Limite de registros (padrão: 200)
}

// Seções comuns do Setup Audit Trail
type AuditTrailSection = 
    | 'Manage Users'
    | 'Company Profile'
    | 'Security Controls'
    | 'Data Management'
    | 'Customize'
    | 'Permission Sets'
    | 'Profiles'
    | 'Custom Objects'
    | 'Apex Classes'
    | 'Flows'
    | 'All';
```

### 3.8 Tipo de Resultado de Operação

```typescript
interface OperationResult<T = void> {
    success: boolean;                // Se a operação foi bem-sucedida
    data?: T;                        // Dados retornados (se sucesso)
    error?: string;                  // Mensagem de erro (se falha)
    warnings?: string[];             // Avisos (mesmo se sucesso)
}
```

**Uso**: Padrão de retorno para todas as operações que podem falhar.

---

## 4. Utilitários (Utils)

### 4.1 Logger (`src/utils/logger.ts`)

Sistema de logging centralizado para a extensão.

#### Classe: `Logger`

```typescript
class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    
    static getInstance(): Logger;
    
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, error?: Error | unknown): void;
    debug(message: string, ...args: unknown[]): void;
    
    show(): void;      // Mostra o Output Channel
    clear(): void;     // Limpa o Output Channel
    dispose(): void;   // Libera recursos
}
```

**Exemplo de uso:**
```typescript
import { logger } from './utils/logger';

logger.info('Operação iniciada');
logger.error('Falha na operação', new Error('Detalhes do erro'));
```

**Formato de saída:**
```
2024-01-15T10:30:45.123Z [SF DevOps] [INFO] Operação iniciada
2024-01-15T10:30:45.456Z [SF DevOps] [ERROR] Falha na operação
Stack: Error: Detalhes do erro
    at ...
```

---

### 4.2 Config Manager (`src/utils/config.ts`)

Gerenciador de configurações da extensão.

#### Classe: `ConfigManager`

```typescript
class ConfigManager {
    private static instance: ConfigManager;
    private readonly configSection = 'sfdevops';
    
    static getInstance(): ConfigManager;
    
    getConfig(): ExtensionConfig;           // Obtém todas as configurações
    get<T>(key: keyof ExtensionConfig): T;  // Obtém uma configuração específica
    set<T>(key: keyof ExtensionConfig, value: T, global?: boolean): Promise<void>;
    
    getOutputDirectory(): string;            // Caminho absoluto do diretório de saída
    getAuditLogPath(): string;               // Caminho absoluto do log de auditoria
}
```

**Configurações disponíveis:**

| Chave | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| `defaultOrg` | string | `""` | Alias da org padrão |
| `outputDirectory` | string | `"./deploy-packages"` | Diretório para pacotes |
| `enableAuditLog` | boolean | `true` | Habilitar auditoria |
| `auditLogPath` | string | `"./.sfdevops/audit.log"` | Caminho do log |
| `autoGenerateCommitMessage` | boolean | `true` | Gerar mensagem de commit |
| `metadataApiVersion` | string | `"59.0"` | Versão da API |

**Exemplo de uso:**
```typescript
import { configManager } from './utils/config';

const apiVersion = configManager.get<string>('metadataApiVersion');
await configManager.set('defaultOrg', 'MySandbox');
```

---

### 4.3 XML Builder (`src/utils/xmlBuilder.ts`)

Utilitário para construção e parsing de XML no formato Salesforce.

#### Classe: `XmlBuilderUtil`

```typescript
class XmlBuilderUtil {
    private parser: XMLParser;
    private builder: XMLBuilder;
    
    // Geração de XMLs
    generatePackageXml(manifest: PackageManifest): string;
    generateDestructiveChangesXml(manifest: PackageManifest): string;
    generatePermissionSetXml(permissionSet: PermissionSet): string;
    generateProfileXml(profile: Profile): string;
    
    // Geração parcial (fragmentos)
    generateObjectPermissionsXml(permissions: ObjectPermission[]): string;
    generateFieldPermissionsXml(permissions: FieldPermission[]): string;
    generateClassAccessesXml(accesses: ClassAccess[]): string;
    
    // Parsing e validação
    parseXml<T>(xml: string): T;
    validateXml(xml: string): { valid: boolean; error?: string };
    formatXml(xml: string): string;
    
    // Criação de manifest
    createManifest(types: Map<MetadataType, string[]>, version: string): PackageManifest;
}
```

**Exemplo de package.xml gerado:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>MyPermissionSet</members>
        <name>PermissionSet</name>
    </types>
    <types>
        <members>Account</members>
        <members>Contact</members>
        <name>CustomObject</name>
    </types>
    <version>59.0</version>
</Package>
```

**Exemplo de Permission Set XML gerado:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>My Permission Set</label>
    <description>Description here</description>
    <objectPermissions>
        <object>Account</object>
        <allowCreate>true</allowCreate>
        <allowRead>true</allowRead>
        <allowEdit>true</allowEdit>
        <allowDelete>false</allowDelete>
        <viewAllRecords>false</viewAllRecords>
        <modifyAllRecords>false</modifyAllRecords>
    </objectPermissions>
    <fieldPermissions>
        <field>Account.Industry</field>
        <editable>true</editable>
        <readable>true</readable>
    </fieldPermissions>
</PermissionSet>
```

---

### 4.4 File Utils (`src/utils/fileUtils.ts`)

Utilitários para operações de sistema de arquivos.

#### Classe: `FileUtils`

```typescript
class FileUtils {
    // Operações de arquivo
    static async writeFile(filePath: string, content: string): Promise<void>;
    static async readFile(filePath: string): Promise<string>;
    static async fileExists(filePath: string): Promise<boolean>;
    static async deleteFile(filePath: string): Promise<void>;
    static async copyFile(source: string, destination: string): Promise<void>;
    
    // Operações de diretório
    static async ensureDirectory(dirPath: string): Promise<void>;
    static async listFiles(dirPath: string): Promise<string[]>;
    static async listDirectories(dirPath: string): Promise<string[]>;
    
    // Utilitários de caminho
    static getWorkspacePath(): string | undefined;
    static generateTimestampedFilename(baseName: string, extension: string): string;
    static getFileExtension(filePath: string): string;
    static getFileNameWithoutExtension(filePath: string): string;
    static joinPath(...paths: string[]): string;
    static normalizePath(filePath: string): string;
}
```

**Exemplo de uso:**
```typescript
import { FileUtils } from './utils/fileUtils';

// Cria diretório se não existir
await FileUtils.ensureDirectory('/path/to/deploy');

// Escreve arquivo
await FileUtils.writeFile('/path/to/package.xml', xmlContent);

// Gera nome único com timestamp
const filename = FileUtils.generateTimestampedFilename('deploy', 'zip');
// Resultado: "deploy_2024-01-15T10-30-45-123Z.zip"
```

---

## 5. Serviços (Services)

### 5.1 SFDX Service (`src/services/sfdxService.ts`)

Serviço de integração com o Salesforce CLI.

#### Classe: `SfdxService`

```typescript
class SfdxService {
    private static instance: SfdxService;
    private currentOrg: OrgInfo | null = null;
    private cachedOrgs: OrgInfo[] = [];
    
    static getInstance(): SfdxService;
    
    // Verificação de instalação
    checkSfdxInstallation(): Promise<boolean>;
    
    // Gerenciamento de orgs
    listOrgs(): Promise<OperationResult<OrgInfo[]>>;
    getOrgInfo(aliasOrUsername: string): Promise<OperationResult<OrgInfo>>;
    getDefaultOrg(): Promise<OperationResult<OrgInfo>>;
    setCurrentOrg(aliasOrUsername: string): Promise<AuthResult>;
    getCurrentOrg(): OrgInfo | null;
    getCachedOrgs(): OrgInfo[];
    
    // Utilitários
    getAccessToken(aliasOrUsername?: string): Promise<string | null>;
    getInstanceUrl(): string | null;
    validateOrgPermissions(): Promise<OperationResult<boolean>>;
    openOrg(aliasOrUsername?: string): Promise<OperationResult<void>>;
    
    // Execução genérica
    executeCommand<T>(command: string): Promise<OperationResult<T>>;
}
```

#### Fluxo de Autenticação

```
┌──────────────────┐
│  checkSfdxInstallation()
│  Verifica se SF CLI está instalado
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  listOrgs()
│  Lista orgs autenticadas via "sf org list"
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  setCurrentOrg()
│  Define org ativa para operações
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  validateOrgPermissions()
│  Testa acesso com query simples
└──────────────────┘
```

#### Comandos SFDX Utilizados

| Método | Comando SFDX |
|--------|--------------|
| `checkSfdxInstallation` | `sf --version` |
| `listOrgs` | `sf org list --json` |
| `getOrgInfo` | `sf org display --target-org <alias> --json` |
| `getDefaultOrg` | `sf org display --json` |
| `validateOrgPermissions` | `sf data query --query "SELECT Id FROM Organization LIMIT 1" --json` |
| `openOrg` | `sf org open --target-org <alias>` |

---

### 5.2 Metadata Service (`src/services/metadataService.ts`)

Serviço de leitura de metadados da org Salesforce.

#### Classe: `MetadataService`

```typescript
class MetadataService {
    private static instance: MetadataService;
    
    // Cache de metadados
    private permissionSetsCache: PermissionSet[] = [];
    private profilesCache: Profile[] = [];
    private objectsCache: CustomObject[] = [];
    private apexClassesCache: ApexClass[] = [];
    private flowsCache: Flow[] = [];
    
    static getInstance(): MetadataService;
    
    // Permission Sets
    listPermissionSets(forceRefresh?: boolean): Promise<OperationResult<PermissionSet[]>>;
    getPermissionSetDetails(permissionSetId: string): Promise<OperationResult<PermissionSet>>;
    
    // Profiles
    listProfiles(forceRefresh?: boolean): Promise<OperationResult<Profile[]>>;
    
    // Custom Objects
    listCustomObjects(forceRefresh?: boolean): Promise<OperationResult<CustomObject[]>>;
    listObjectFields(objectName: string): Promise<OperationResult<CustomField[]>>;
    
    // Apex Classes
    listApexClasses(forceRefresh?: boolean): Promise<OperationResult<ApexClass[]>>;
    
    // Flows
    listFlows(forceRefresh?: boolean): Promise<OperationResult<Flow[]>>;
    
    // Utilitários
    clearCache(): void;
    getMetadataByType(type: MetadataType, forceRefresh?: boolean): Promise<OperationResult<MetadataComponent[]>>;
    searchMetadata(searchTerm: string): Promise<MetadataComponent[]>;
}
```

#### Queries SOQL Utilizadas

**Permission Sets:**
```sql
SELECT Id, Name, Label, Description, IsCustom, License.Name, 
       HasActivationRequired, CreatedDate, CreatedBy.Name,
       LastModifiedDate, LastModifiedBy.Name
FROM PermissionSet 
WHERE IsOwnedByProfile = false
ORDER BY Label
```

**Object Permissions (para um Permission Set):**
```sql
SELECT SobjectType, PermissionsCreate, PermissionsRead, PermissionsEdit,
       PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords
FROM ObjectPermissions
WHERE ParentId = '<permissionSetId>'
```

**Field Permissions:**
```sql
SELECT Field, PermissionsRead, PermissionsEdit
FROM FieldPermissions
WHERE ParentId = '<permissionSetId>'
```

**Class Accesses:**
```sql
SELECT SetupEntityId, SetupEntity.Name
FROM SetupEntityAccess
WHERE ParentId = '<permissionSetId>'
AND SetupEntityType = 'ApexClass'
```

**Profiles:**
```sql
SELECT Id, Name, Description, UserLicense.Name, 
       CreatedDate, CreatedBy.Name,
       LastModifiedDate, LastModifiedBy.Name
FROM Profile
ORDER BY Name
```

**Custom Objects (via EntityDefinition):**
```sql
SELECT QualifiedApiName, Label, Description, IsCustomizable,
       DeveloperName, NamespacePrefix
FROM EntityDefinition
WHERE IsCustomizable = true
ORDER BY Label
```

**Fields (via FieldDefinition):**
```sql
SELECT QualifiedApiName, Label, DataType, IsNillable, 
       IsUnique, Length, Precision, Scale, Description,
       ReferenceTo.QualifiedApiName
FROM FieldDefinition
WHERE EntityDefinition.QualifiedApiName = '<objectName>'
ORDER BY Label
```

**Apex Classes:**
```sql
SELECT Id, Name, NamespacePrefix, ApiVersion, Status,
       IsValid, LengthWithoutComments,
       CreatedDate, CreatedBy.Name,
       LastModifiedDate, LastModifiedBy.Name
FROM ApexClass
WHERE NamespacePrefix = null
ORDER BY Name
```

**Flows:**
```sql
SELECT Id, ApiName, Label, Description, ProcessType, Status,
       CreatedDate, CreatedBy.Name,
       LastModifiedDate, LastModifiedBy.Name
FROM FlowDefinitionView
WHERE IsTemplate = false
ORDER BY Label
```

---

### 5.3 Deploy Service (`src/services/deployService.ts`)

Serviço para montagem e geração de pacotes de deploy.

#### Classe: `DeployService`

```typescript
class DeployService {
    private static instance: DeployService;
    private currentSelection: DeploySelection;
    
    static getInstance(): DeployService;
    
    // Gerenciamento de seleção
    getCurrentSelection(): DeploySelection;
    addToSelection(component: MetadataComponent, includeRelated?: boolean): DeployItem;
    removeFromSelection(itemId: string): boolean;
    clearSelection(): void;
    setItemAction(itemId: string, action: 'add' | 'update' | 'delete'): boolean;
    
    // Adição com relacionados
    addPermissionSetWithRelated(permissionSetId: string): Promise<OperationResult<DeployItem[]>>;
    
    // Geração de pacotes
    generatePackageXml(): string;
    generateDestructiveChangesXml(): string | null;
    generateDeployPackage(targetOrg?: string): Promise<OperationResult<DeployPackage>>;
    
    // Exportação
    exportPackage(deployPackage: DeployPackage, outputDir?: string): Promise<OperationResult<string>>;
    
    // Utilitários
    generateCommitMessage(): string;
    getSelectionStats(): { total: number; byType: Map<MetadataType, number>; byAction: Map<string, number> };
}
```

#### Fluxo de Montagem Assistida

```
┌─────────────────────────────────────────┐
│  1. Usuário seleciona Permission Set    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  2. addPermissionSetWithRelated()       │
│     - Obtém detalhes do Permission Set  │
│     - Lista Object Permissions          │
│     - Lista Field Permissions           │
│     - Lista Class Accesses              │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  3. Adiciona componentes à seleção      │
│     - Permission Set principal          │
│     - Objetos customizados referenciados│
│     - Campos customizados               │
│     - Classes Apex                      │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  4. generateDeployPackage()             │
│     - Gera package.xml                  │
│     - Gera XMLs de metadados            │
│     - Gera destructiveChanges (se ação  │
│       for 'delete')                     │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  5. exportPackage()                     │
│     - Cria diretório com timestamp      │
│     - Escreve todos os arquivos         │
│     - Gera deploy-info.json             │
└─────────────────────────────────────────┘
```

#### Estrutura do Pacote Exportado

```
deploy_2024-01-15T10-30-45-123Z/
├── package.xml
├── destructiveChanges.xml (opcional)
├── deploy-info.json
├── permissionsets/
│   └── MyPermissionSet.permissionset-meta.xml
└── profiles/
    └── Admin.profile-meta.xml
```

**Conteúdo do deploy-info.json:**
```json
{
  "generatedAt": "2024-01-15T10:30:45.123Z",
  "generatedBy": "username",
  "sourceOrg": "MySandbox",
  "targetOrg": "Production",
  "componentsCount": 5,
  "components": [
    { "type": "PermissionSet", "name": "MyPermissionSet", "action": "add" },
    { "type": "CustomObject", "name": "Account", "action": "add" }
  ]
}
```

---

### 5.4 Diff Service (`src/services/diffService.ts`)

Serviço de comparação de metadados entre ambientes.

#### Classe: `DiffService`

```typescript
class DiffService {
    private static instance: DiffService;
    
    static getInstance(): DiffService;
    
    // Comparações
    diffPermissionSets(
        sourceOrg: string,
        targetOrg: string,
        permissionSetName?: string
    ): Promise<OperationResult<DiffResult>>;
    
    diffPermissionSetDetails(
        sourceOrg: string,
        targetOrg: string,
        permissionSetId: string
    ): Promise<OperationResult<DiffResult>>;
    
    // Formatação
    formatDiffResult(result: DiffResult): string;
}
```

#### Algoritmo de Comparação

```
┌─────────────────────────────────────────┐
│  1. Conecta à org de origem             │
│     - Carrega Permission Sets           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  2. Conecta à org de destino            │
│     - Carrega Permission Sets           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  3. Compara listas                      │
│     - Cria Maps por fullName            │
│     - Identifica adicionados            │
│     - Identifica removidos              │
│     - Identifica modificados            │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  4. Para cada Permission Set modificado │
│     - Compara Object Permissions        │
│     - Compara Field Permissions         │
│     - Compara Class Accesses            │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  5. Gera relatório                      │
│     - Summary com contagens             │
│     - Lista detalhada de diferenças     │
└─────────────────────────────────────────┘
```

#### Exemplo de Saída do Diff

```
═══════════════════════════════════════════════════════════
DIFF DE METADADOS - PermissionSet
═══════════════════════════════════════════════════════════

Origem: DevSandbox (org)
Destino: Production (org)
Data: 2024-01-15T10:30:45.123Z

───────────────────────────────────────────────────────────
RESUMO
───────────────────────────────────────────────────────────
Total de componentes: 10
  + Adicionados: 2
  - Removidos: 1
  ~ Modificados: 3
  = Inalterados: 4

───────────────────────────────────────────────────────────
DETALHES
───────────────────────────────────────────────────────────
[+] NewPermissionSet (PermissionSet)
   Path: NewPermissionSet

[-] OldPermissionSet (PermissionSet)
   Path: OldPermissionSet

[~] ExistingPermissionSet (PermissionSet)
   Path: ExistingPermissionSet
   - hasActivationRequired: false → true

═══════════════════════════════════════════════════════════
```

---

### 5.5 Audit Service (`src/services/auditService.ts`)

Serviço de auditoria e rastreabilidade com duas funcionalidades principais:
1. **Log Local**: Registra ações realizadas pela extensão
2. **Setup Audit Trail**: Busca e exibe o histórico de alterações do Salesforce

#### Classe: `AuditService`

```typescript
class AuditService {
    private static instance: AuditService;
    private auditLog: AuditLog;
    private setupAuditTrailCache: SetupAuditTrailEntry[];
    
    static getInstance(): AuditService;
    
    // Inicialização
    initialize(): Promise<void>;
    
    // ========== LOG LOCAL ==========
    
    // Logging de ações
    logPackageCreated(deployPackage: DeployPackage): Promise<void>;
    logPackageExported(packagePath: string): Promise<void>;
    logDiffExecuted(diffResult: DiffResult): Promise<void>;
    logMetadataRetrieved(componentType: MetadataType, count: number, sourceOrg: string): Promise<void>;
    logSelectionUpdated(componentsCount: number, componentTypes: MetadataType[]): Promise<void>;
    logOrgConnected(orgAlias: string): Promise<void>;
    logOrgDisconnected(orgAlias: string): Promise<void>;
    
    // Consultas do log local
    getEntries(): AuditEntry[];
    getEntriesByAction(action: AuditAction): AuditEntry[];
    getEntriesByDateRange(startDate: Date, endDate: Date): AuditEntry[];
    getRecentEntries(count?: number): AuditEntry[];
    getAuditLog(): AuditLog;
    
    // Manutenção
    clearLog(): Promise<void>;
    exportLog(outputPath: string): Promise<OperationResult<string>>;
    formatLogForDisplay(): string;
    generateCommitMessageFromLog(): string;
    
    // ========== SETUP AUDIT TRAIL (SALESFORCE) ==========
    
    // Busca de dados
    fetchSetupAuditTrail(filter?: AuditTrailFilter): Promise<OperationResult<SetupAuditTrailEntry[]>>;
    getAuditTrailSections(): Promise<OperationResult<string[]>>;
    
    // Cache
    getSetupAuditTrailCache(): SetupAuditTrailEntry[];
    getSetupAuditTrailLastFetch(): Date | null;
    
    // Formatação e Exportação
    formatAuditTrailEntry(entry: SetupAuditTrailEntry): string;
    formatSetupAuditTrail(entries: SetupAuditTrailEntry[]): string;
    exportSetupAuditTrail(entries: SetupAuditTrailEntry[], format: 'txt' | 'json' | 'csv'): Promise<OperationResult<string>>;
}
```

#### Query SOQL para Setup Audit Trail

```sql
SELECT Id, Action, Section, Display, CreatedDate, 
       CreatedById, CreatedBy.Name, DelegateUser 
FROM SetupAuditTrail 
ORDER BY CreatedDate DESC 
LIMIT 200
```

#### Exemplo de Saída Formatada

```
═══════════════════════════════════════════════════════════════════════════════
                          SETUP AUDIT TRAIL                                     
═══════════════════════════════════════════════════════════════════════════════

Org: minha-org@salesforce.com
Data da consulta: 24/02/2026, 14:30:00
Total de registros: 150

───────────────────────────────────────────────────────────────────────────────
📅 24/02/2026
───────────────────────────────────────────────────────────────────────────────
  ⏰ 10:30:45
  👤 admin@empresa.com
  📂 Permission Sets
  📝 Added permission set "Sales_Admin" to user João Silva

  ⏰ 09:15:22
  👤 admin@empresa.com
  📂 Profiles
  📝 Changed profile "Standard User": Enabled object permission for Account

═══════════════════════════════════════════════════════════════════════════════
```

#### Formatos de Exportação

| Formato | Extensão | Descrição |
|---------|----------|-----------|
| Texto | `.txt` | Documento formatado legível |
| JSON | `.json` | Estrutura para processamento |
| CSV | `.csv` | Para abrir em planilhas |

#### Estrutura do Arquivo de Log Local

O log local é armazenado em `.sfdevops/audit.log` (configurável) no formato JSON:

```json
{
  "entries": [
    {
      "id": "audit_1705315845123_a1b2c3d4e",
      "timestamp": "2024-01-15T10:30:45.123Z",
      "action": "PACKAGE_CREATED",
      "user": "gabriel.silva",
      "sourceOrg": "DevSandbox",
      "targetOrg": "Production",
      "details": {
        "componentsCount": 5,
        "componentTypes": ["PermissionSet", "CustomObject"]
      }
    }
  ],
  "lastUpdated": "2024-01-15T10:31:30.456Z"
}
```

---

## 6. Views (Tree Providers)

### 6.1 Connection Tree Provider (`src/views/connectionTreeProvider.ts`)

Exibe informações de conexão com orgs Salesforce.

#### Classes

```typescript
class ConnectionTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        orgInfo?: OrgInfo,
        itemType: 'org' | 'info' | 'action' = 'info'
    );
}

class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
    onDidChangeTreeData: vscode.Event<ConnectionTreeItem | undefined | null | void>;
    
    refresh(): Promise<void>;
    setCurrentOrg(org: OrgInfo): void;
    getTreeItem(element: ConnectionTreeItem): vscode.TreeItem;
    getChildren(element?: ConnectionTreeItem): Promise<ConnectionTreeItem[]>;
}
```

#### Estrutura da Árvore

```
Conexão
├── Org Atual
│   ├── MySandbox (Sandbox)
│   └── Instance: https://mysandbox.my.salesforce.com
└── Orgs Disponíveis
    ├── DevOrg (Sandbox)
    └── Production (Production)
```

---

### 6.2 Metadata Tree Provider (`src/views/metadataTreeProvider.ts`)

Exibe metadados da org organizado por tipo.

#### Classes

```typescript
class MetadataTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        itemType: 'category' | 'component' | 'detail' | 'loading' | 'empty',
        metadataType?: MetadataType,
        component?: MetadataComponent,
        detailKey?: string,
        detailValue?: string
    );
}

class MetadataTreeProvider implements vscode.TreeDataProvider<MetadataTreeItem> {
    onDidChangeTreeData: vscode.Event<MetadataTreeItem | undefined | null | void>;
    
    refresh(): void;
    forceRefresh(): Promise<void>;
    getTreeItem(element: MetadataTreeItem): vscode.TreeItem;
    getChildren(element?: MetadataTreeItem): Promise<MetadataTreeItem[]>;
}
```

#### Estrutura da Árvore

```
Metadados
├── Permission Sets
│   ├── Sales_User
│   │   ├── API Name: Sales_User
│   │   ├── License: Salesforce Platform
│   │   └── Custom: Yes
│   └── Marketing_Manager
├── Profiles
│   ├── System Administrator
│   └── Standard User
├── Objetos
│   ├── Account
│   └── Contact
├── Apex Classes
│   ├── AccountController
│   └── ContactService
└── Flows
    └── Lead_Assignment
```

---

### 6.3 Deploy Selection Tree Provider (`src/views/deploySelectionTreeProvider.ts`)

Exibe os componentes selecionados para deploy.

#### Classes

```typescript
class DeploySelectionTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        itemType: 'category' | 'item' | 'empty' | 'summary',
        deployItem?: DeployItem,
        metadataType?: MetadataType,
        summaryInfo?: { total: number; byType: Map<MetadataType, number> }
    );
}

class DeploySelectionTreeProvider implements vscode.TreeDataProvider<DeploySelectionTreeItem> {
    onDidChangeTreeData: vscode.Event<DeploySelectionTreeItem | undefined | null | void>;
    
    refresh(): void;
    getTreeItem(element: DeploySelectionTreeItem): vscode.TreeItem;
    getChildren(element?: DeploySelectionTreeItem): Promise<DeploySelectionTreeItem[]>;
}
```

#### Estrutura da Árvore

```
Seleção de Deploy
├── Total: 5 componente(s)
├── Permission Sets (2)
│   ├── Sales_User (Adicionar)
│   └── Marketing_Manager (Adicionar)
├── Objetos (2)
│   ├── Account (Atualizar)
│   └── Contact (Adicionar)
└── Apex Classes (1)
    └── AccountController (Adicionar)
```

---

### 6.4 Audit Tree Provider (`src/views/auditTreeProvider.ts`)

Exibe o Setup Audit Trail do Salesforce e permite interação via sidebar.

#### Classes

```typescript
type AuditTreeItemType = 'entry' | 'detail' | 'empty' | 'category' | 
                         'sfEntry' | 'sfDetail' | 'action' | 'loading';

class AuditTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        itemType: AuditTreeItemType,
        entry?: AuditEntry,              // Para log local
        sfEntry?: SetupAuditTrailEntry,  // Para Setup Audit Trail
        detailKey?: string,
        detailValue?: string
    );
}

class AuditTreeProvider implements vscode.TreeDataProvider<AuditTreeItem> {
    onDidChangeTreeData: vscode.Event<AuditTreeItem | undefined | null | void>;
    
    refresh(): void;
    fetchAuditTrail(): Promise<void>;        // Busca dados do Salesforce
    setFilter(section: string): void;         // Define filtro de seção
    getFilter(): string;                      // Obtém filtro atual
    getTreeItem(element: AuditTreeItem): vscode.TreeItem;
    getChildren(element?: AuditTreeItem): Promise<AuditTreeItem[]>;
}
```

#### Estrutura da Árvore (Setup Audit Trail)

```
Histórico de Auditoria
├── ⟳ Carregar Setup Audit Trail     [Clicável]
├── Filtro: All                       [Clicável para alterar]
├── 150 registros (atualizado 14:30)
├── 📅 24/02/2026 (45)
│   ├── Added permission set "Sales_Admin" to user João
│   │   ├── Usuário: admin@empresa.com
│   │   ├── Data/Hora: 24/02/2026 10:30:45
│   │   ├── Seção: Permission Sets
│   │   ├── Ação: insertedPermissionSetAssignment
│   │   └── Descrição: Added permission set...
│   └── Changed profile "Standard User"...
├── 📅 23/02/2026 (35)
│   └── ...
└── 📅 22/02/2026 (70)
    └── ...
```

#### Ícones por Seção

| Seção | Ícone | Cor |
|-------|-------|-----|
| Permission Sets | shield | Roxo |
| Profiles | person | Azul |
| Users | account | Verde |
| Objects/Fields | database | Laranja |
| Apex Classes | code | Amarelo |
| Flows | workflow | Vermelho |
| Security | lock | Vermelho |
| Outros | history | Cinza |

---

## 7. Comandos (Commands)

### 7.1 Auth Commands (`src/commands/authCommands.ts`)

Comandos de autenticação e conexão.

#### Classe: `AuthCommands`

```typescript
class AuthCommands {
    constructor(connectionTreeProvider: ConnectionTreeProvider);
    
    registerCommands(context: vscode.ExtensionContext): void;
}
```

#### Comandos Registrados

| Comando | ID | Descrição |
|---------|-----|-----------|
| Conectar à Org | `sfdevops.authenticate` | Verifica conexão e valida permissões |
| Selecionar Org | `sfdevops.selectOrg` | Alterna entre orgs autenticadas |

#### Fluxo do Comando `authenticate`

```
┌─────────────────────────────────────────┐
│  1. Verifica se SF CLI está instalado   │
└────────────────┬────────────────────────┘
                 │
        ┌────────┴────────┐
        │ Instalado?      │
        └────────┬────────┘
                 │
       ┌─────────┴─────────┐
       ▼ Não               ▼ Sim
┌──────────────┐    ┌──────────────┐
│ Mostra erro  │    │ Obtém org    │
│ com link de  │    │ padrão       │
│ documentação │    └──────┬───────┘
└──────────────┘           │
                           ▼
                    ┌──────────────┐
                    │ Valida       │
                    │ permissões   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Atualiza UI  │
                    │ e log audit  │
                    └──────────────┘
```

---

### 7.2 Metadata Commands (`src/commands/metadataCommands.ts`)

Comandos de leitura e manipulação de metadados.

#### Classe: `MetadataCommands`

```typescript
class MetadataCommands {
    constructor(
        metadataTreeProvider: MetadataTreeProvider,
        deploySelectionTreeProvider: DeploySelectionTreeProvider
    );
    
    registerCommands(context: vscode.ExtensionContext): void;
}
```

#### Comandos Registrados

| Comando | ID | Descrição |
|---------|-----|-----------|
| Atualizar Metadados | `sfdevops.refreshMetadata` | Recarrega todos os metadados |
| Ver Permission Sets | `sfdevops.viewPermissionSets` | Lista Permission Sets |
| Ver Profiles | `sfdevops.viewProfiles` | Lista Profiles |
| Ver Objetos | `sfdevops.viewObjects` | Lista objetos |
| Ver Apex Classes | `sfdevops.viewApexClasses` | Lista classes Apex |
| Ver Flows | `sfdevops.viewFlows` | Lista Flows |
| Adicionar ao Deploy | `sfdevops.addToDeploySelection` | Adiciona componente à seleção |

---

### 7.3 Deploy Commands (`src/commands/deployCommands.ts`)

Comandos de montagem e geração de pacotes.

#### Classe: `DeployCommands`

```typescript
class DeployCommands {
    constructor(deploySelectionTreeProvider: DeploySelectionTreeProvider);
    
    registerCommands(context: vscode.ExtensionContext): void;
}
```

#### Comandos Registrados

| Comando | ID | Descrição |
|---------|-----|-----------|
| Criar Pacote de Deploy | `sfdevops.createDeployPackage` | Gera pacote completo |
| Montagem Assistida | `sfdevops.assistedDeploy` | Wizard de montagem |
| Remover do Deploy | `sfdevops.removeFromDeploySelection` | Remove item da seleção |
| Limpar Seleção | `sfdevops.clearDeploySelection` | Remove todos os itens |
| Gerar package.xml | `sfdevops.generatePackageXml` | Gera apenas o manifest |
| Gerar Mensagem Commit | `sfdevops.generateCommitMessage` | Sugere mensagem de commit |

#### Fluxo do Comando `assistedDeploy`

```
┌─────────────────────────────────────────┐
│  Passo 1/4: Selecionar tipo             │
│  [ ] Permission Set                     │
│  [ ] Profile                            │
│  [ ] Custom Object                      │
│  [ ] Apex Class                         │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Passo 2/4: Selecionar componentes      │
│  [x] Sales_User                         │
│  [x] Marketing_Manager                  │
│  [ ] Service_Rep                        │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Passo 3/4: Incluir relacionados?       │
│  ( ) Sim - objetos, campos, classes     │
│  ( ) Não - apenas Permission Sets       │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Passo 4/4: O que fazer agora?          │
│  [ ] Gerar Pacote Agora                 │
│  [ ] Continuar Adicionando              │
│  [ ] Ver Seleção                        │
└─────────────────────────────────────────┘
```

---

### 7.4 Diff Commands (`src/commands/diffCommands.ts`)

Comandos de comparação de metadados.

#### Classe: `DiffCommands`

```typescript
class DiffCommands {
    registerCommands(context: vscode.ExtensionContext): void;
}
```

#### Comandos Registrados

| Comando | ID | Descrição |
|---------|-----|-----------|
| Comparar Metadados | `sfdevops.diffMetadata` | Menu principal de diff |
| Diff Local vs Org | `sfdevops.diffLocalVsOrg` | Compara local com org |
| Diff Org vs Org | `sfdevops.diffOrgVsOrg` | Compara duas orgs |

---

### 7.5 Audit Commands (`src/commands/auditCommands.ts`)

Comandos de auditoria e logs, incluindo integração com Setup Audit Trail do Salesforce.

#### Classe: `AuditCommands`

```typescript
class AuditCommands {
    constructor(auditTreeProvider: AuditTreeProvider);
    
    registerCommands(context: vscode.ExtensionContext): void;
}
```

#### Comandos Registrados

| Comando | ID | Descrição |
|---------|-----|-----------|
| Ver Log de Auditoria | `sfdevops.viewAuditLog` | Menu principal de auditoria |
| Carregar Setup Audit Trail | `sfdevops.refreshAuditTrail` | Busca dados do Salesforce e exibe em documento |
| Filtrar Audit Trail | `sfdevops.filterAuditTrail` | Filtra por seção do Setup |
| Buscar no Audit Trail | `sfdevops.searchAuditTrail` | Busca por termo no Audit Trail |
| Exportar Audit Trail | `sfdevops.exportAuditTrail` | Exporta em TXT, JSON ou CSV |

#### Fluxo do Setup Audit Trail

```
┌─────────────────────────────────────────────────────────────┐
│                 Carregar Setup Audit Trail                   │
├─────────────────────────────────────────────────────────────┤
│  1. Usuário executa comando                                 │
│  2. Extensão executa SOQL em SetupAuditTrail               │
│  3. Dados são processados e formatados                      │
│  4. Documento é aberto no editor com resultado formatado   │
│  5. Sidebar é atualizada com registros agrupados por data  │
└─────────────────────────────────────────────────────────────┘
```

#### Opções de Filtro por Seção

- `All` - Todas as seções
- `Manage Users` - Gerenciamento de usuários
- `Security Controls` - Controles de segurança
- `Permission Sets` - Permission Sets
- `Profiles` - Profiles
- `Customize` - Customizações
- `Apex Classes` - Classes Apex
- `Flows` - Flows e processos

---

## 8. Ponto de Entrada (Extension)

### Arquivo: `src/extension.ts`

#### Função `activate`

```typescript
export async function activate(context: vscode.ExtensionContext): Promise<void>
```

Chamada quando a extensão é ativada. Responsável por:

1. **Inicializar serviços**
   - Inicializa o AuditService para carregar log existente

2. **Criar Tree Providers**
   - ConnectionTreeProvider
   - MetadataTreeProvider
   - DeploySelectionTreeProvider
   - AuditTreeProvider

3. **Registrar Tree Views**
   - `sfdevops-connection`
   - `sfdevops-metadata`
   - `sfdevops-deploy-selection`
   - `sfdevops-audit`

4. **Criar e registrar comandos**
   - AuthCommands
   - MetadataCommands
   - DeployCommands
   - DiffCommands
   - AuditCommands

5. **Verificar instalação do SF CLI**

6. **Carregar org padrão automaticamente**

#### Função `deactivate`

```typescript
export function deactivate(): void
```

Chamada quando a extensão é desativada. Libera recursos como o Output Channel do logger.

#### Eventos de Ativação

Configurados no `package.json`:

```json
{
  "activationEvents": [
    "workspaceContains:sfdx-project.json",
    "onCommand:sfdevops.authenticate"
  ]
}
```

A extensão é ativada quando:
- O workspace contém um arquivo `sfdx-project.json` (projeto Salesforce)
- O usuário executa o comando `sfdevops.authenticate`

---

## 9. Configurações da Extensão

### Arquivo: `package.json` (seção `contributes.configuration`)

```json
{
  "configuration": {
    "title": "Salesforce DevOps Assistant",
    "properties": {
      "sfdevops.defaultOrg": {
        "type": "string",
        "default": "",
        "description": "Alias ou username da org padrão"
      },
      "sfdevops.outputDirectory": {
        "type": "string",
        "default": "./deploy-packages",
        "description": "Diretório para geração de pacotes de deploy"
      },
      "sfdevops.enableAuditLog": {
        "type": "boolean",
        "default": true,
        "description": "Habilitar log de auditoria"
      },
      "sfdevops.auditLogPath": {
        "type": "string",
        "default": "./.sfdevops/audit.log",
        "description": "Caminho do arquivo de log de auditoria"
      },
      "sfdevops.autoGenerateCommitMessage": {
        "type": "boolean",
        "default": true,
        "description": "Gerar automaticamente sugestão de mensagem de commit"
      },
      "sfdevops.metadataApiVersion": {
        "type": "string",
        "default": "59.0",
        "description": "Versão da Metadata API do Salesforce"
      }
    }
  }
}
```

---

## 10. Fluxos de Trabalho

### 10.1 Fluxo Completo de Deploy

```
┌─────────────────────────────────────────────────────────────┐
│                    INÍCIO DO FLUXO                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  1. CONEXÃO                                                 │
│     - Usuário abre projeto Salesforce no VS Code            │
│     - Extensão é ativada automaticamente                    │
│     - Verifica SF CLI instalado                             │
│     - Carrega org padrão                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  2. EXPLORAÇÃO DE METADADOS                                 │
│     - Usuário navega pela Tree View de Metadados            │
│     - Expande categorias (Permission Sets, Objects, etc.)   │
│     - Visualiza detalhes de cada componente                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  3. SELEÇÃO DE COMPONENTES                                  │
│     - Usuário clica em "+" para adicionar componentes       │
│     - OU executa "Montagem Assistida de Deploy"             │
│     - Escolhe incluir componentes relacionados              │
│     - Componentes aparecem na Tree View de Seleção          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  4. REVISÃO DA SELEÇÃO                                      │
│     - Usuário revisa componentes selecionados               │
│     - Remove itens indesejados                              │
│     - Adiciona mais componentes se necessário               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  5. GERAÇÃO DO PACOTE                                       │
│     - Usuário executa "Criar Pacote de Deploy"              │
│     - Informa org de destino (opcional)                     │
│     - Extensão gera package.xml e XMLs de metadados         │
│     - Arquivos são salvos em ./deploy-packages/             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  6. AUDITORIA                                               │
│     - Operação é registrada no log de auditoria             │
│     - Inclui timestamp, usuário, componentes                │
│     - Log pode ser consultado na Tree View de Auditoria     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  7. COMMIT (OPCIONAL)                                       │
│     - Usuário executa "Gerar Mensagem de Commit"            │
│     - Extensão sugere mensagem baseada nos componentes      │
│     - Mensagem é copiada para área de transferência         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     FIM DO FLUXO                            │
│     Pacote pronto para deploy via SF CLI ou CI/CD           │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Fluxo de Comparação (Diff)

```
┌─────────────────────────────────────────────────────────────┐
│  1. Usuário executa "Comparar Metadados"                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Seleciona tipo de comparação                            │
│     - Org vs Org                                            │
│     - Local vs Org (futuro)                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Seleciona org de ORIGEM                                 │
│     - Lista todas as orgs autenticadas                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Seleciona org de DESTINO                                │
│     - Lista orgs (exceto a selecionada como origem)         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Seleciona tipo de metadado                              │
│     - Permission Sets                                       │
│     - (outros tipos no futuro)                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  6. Extensão executa comparação                             │
│     - Conecta à org de origem                               │
│     - Carrega metadados                                     │
│     - Conecta à org de destino                              │
│     - Carrega metadados                                     │
│     - Compara e identifica diferenças                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  7. Exibe resultado                                         │
│     - Abre documento com relatório formatado                │
│     - Mostra resumo (adicionados, removidos, modificados)   │
│     - Lista detalhes de cada diferença                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  8. Registra no log de auditoria                            │
└─────────────────────────────────────────────────────────────┘
```

### 10.3 Fluxo de Setup Audit Trail

```
┌─────────────────────────────────────────────────────────────┐
│  1. Usuário executa comando                                  │
│     - "SF DevOps: Carregar Setup Audit Trail"               │
│     - Ou clica no botão na sidebar                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Verifica conexão com org                                 │
│     - Se não conectado, exibe mensagem de erro              │
│     - Se conectado, prossegue                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Executa SOQL na org                                      │
│     SELECT Id, Action, Section, Display, CreatedDate,       │
│            CreatedById, CreatedBy.Name, DelegateUser        │
│     FROM SetupAuditTrail                                    │
│     ORDER BY CreatedDate DESC                               │
│     LIMIT 200                                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Processa e formata resultados                            │
│     - Converte datas                                        │
│     - Agrupa por data                                       │
│     - Aplica filtros (seção, texto)                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Exibe documento formatado no editor                      │
│     - Cabeçalho com org e data                              │
│     - Registros agrupados por dia                           │
│     - Detalhes: usuário, seção, ação, descrição            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  6. Atualiza sidebar                                         │
│     - Cache é atualizado                                    │
│     - Tree View mostra registros                            │
│     - Usuário pode expandir para detalhes                   │
└─────────────────────────────────────────────────────────────┘
```

#### Opções de Exportação

```
┌─────────────────────────────────────────────────────────────┐
│  Usuário executa "SF DevOps: Exportar Audit Trail"          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Seleciona formato de exportação:                            │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐│
│  │  Texto (.txt)   │  │   JSON (.json)  │  │  CSV (.csv)  ││
│  │  Formatado      │  │   Estruturado   │  │  Planilha    ││
│  │  para leitura   │  │   processamento │  │  Excel/Sheets││
│  └─────────────────┘  └─────────────────┘  └──────────────┘│
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Arquivo salvo em: .sfdevops/audit-trail-TIMESTAMP.ext      │
│  Opções: Abrir arquivo ou Abrir pasta                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Apêndice A: Dependências

### Dependências de Produção

| Pacote | Versão | Uso |
|--------|--------|-----|
| `fast-xml-parser` | ^4.3.2 | Parsing e construção de XML |
| `xml2js` | ^0.6.2 | Parsing de XML (backup) |

### Dependências de Desenvolvimento

| Pacote | Versão | Uso |
|--------|--------|-----|
| `@types/vscode` | ^1.85.0 | Tipos do VS Code API |
| `@types/node` | ^20.10.0 | Tipos do Node.js |
| `@types/xml2js` | ^0.4.14 | Tipos do xml2js |
| `typescript` | ^5.3.2 | Compilador TypeScript |
| `@typescript-eslint/eslint-plugin` | ^6.13.0 | Linting TypeScript |
| `@typescript-eslint/parser` | ^6.13.0 | Parser TypeScript para ESLint |
| `eslint` | ^8.55.0 | Linting |
| `@vscode/vsce` | ^2.22.0 | Empacotamento da extensão |
| `@vscode/test-electron` | ^2.3.8 | Testes da extensão |
| `mocha` | ^10.2.0 | Framework de testes |

---

## Apêndice B: Glossário

| Termo | Definição |
|-------|-----------|
| **Org** | Instância do Salesforce (organização) |
| **Sandbox** | Ambiente de desenvolvimento/teste do Salesforce |
| **Metadata** | Configurações e customizações do Salesforce (campos, objetos, etc.) |
| **Permission Set** | Conjunto de permissões atribuíveis a usuários |
| **Profile** | Perfil de usuário com permissões base |
| **package.xml** | Arquivo manifest que lista componentes para deploy |
| **destructiveChanges.xml** | Arquivo que lista componentes para remoção |
| **SF CLI** | Salesforce Command Line Interface |
| **SFDX** | Salesforce Developer Experience (nome antigo do CLI) |
| **SOQL** | Salesforce Object Query Language |
| **Metadata API** | API do Salesforce para manipular metadados |
| **Tooling API** | API do Salesforce para operações de desenvolvimento |
| **Setup Audit Trail** | Histórico de alterações administrativas feitas no Setup do Salesforce |
| **SetupAuditTrail** | Objeto SOQL que armazena o histórico de alterações do Setup |

---

## Apêndice C: Referências

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Salesforce Metadata API](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/)
- [Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/)
- [Salesforce DX Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

---

*Documentação gerada para SF DevOps Assistant v1.0.0*
