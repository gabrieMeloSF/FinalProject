/**
 * Tipos e interfaces principais da extensão SF DevOps Assistant
 */

// ============================================================================
// TIPOS DE CONEXÃO E ORG
// ============================================================================

export interface OrgInfo {
    alias?: string;
    username: string;
    orgId: string;
    instanceUrl: string;
    accessToken?: string;
    isDefault: boolean;
    isSandbox: boolean;
    connectedStatus: 'Connected' | 'Disconnected' | 'Unknown';
}

export interface AuthResult {
    success: boolean;
    org?: OrgInfo;
    error?: string;
}

export interface OrgConnection {
    org: OrgInfo;
    apiVersion: string;
    lastRefresh: Date;
}

// ============================================================================
// TIPOS DE METADADOS
// ============================================================================

export type MetadataType = 
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

export interface MetadataComponent {
    id?: string;
    fullName: string;
    type: MetadataType;
    label?: string;
    description?: string;
    lastModifiedDate?: Date;
    lastModifiedBy?: string;
    createdDate?: Date;
    createdBy?: string;
}

export interface PermissionSet extends MetadataComponent {
    type: 'PermissionSet';
    license?: string;
    hasActivationRequired?: boolean;
    isCustom: boolean;
    objectPermissions: ObjectPermission[];
    fieldPermissions: FieldPermission[];
    classAccesses: ClassAccess[];
    userPermissions: UserPermission[];
    tabSettings: TabSetting[];
    recordTypeVisibilities: RecordTypeVisibility[];
}

export interface Profile extends MetadataComponent {
    type: 'Profile';
    isCustom: boolean;
    userLicense?: string;
    objectPermissions: ObjectPermission[];
    fieldPermissions: FieldPermission[];
    classAccesses: ClassAccess[];
    layoutAssignments: LayoutAssignment[];
    recordTypeVisibilities: RecordTypeVisibility[];
    tabVisibilities: TabVisibility[];
}

export interface CustomObject extends MetadataComponent {
    type: 'CustomObject';
    isCustom: boolean;
    fields: CustomField[];
    recordTypes: RecordType[];
    validationRules: ValidationRule[];
}

export interface CustomField extends MetadataComponent {
    type: 'CustomField';
    objectName: string;
    fieldType: string;
    isRequired: boolean;
    isUnique: boolean;
    isExternalId: boolean;
    length?: number;
    precision?: number;
    scale?: number;
    referenceTo?: string;
}

export interface ApexClass extends MetadataComponent {
    type: 'ApexClass';
    apiVersion: string;
    status: 'Active' | 'Deleted';
    isValid: boolean;
    lengthWithoutComments: number;
}

export interface Flow extends MetadataComponent {
    type: 'Flow';
    processType: string;
    status: 'Active' | 'Inactive' | 'Draft' | 'Obsolete';
    apiVersion: string;
}

// ============================================================================
// TIPOS DE PERMISSÕES
// ============================================================================

export interface ObjectPermission {
    object: string;
    allowCreate: boolean;
    allowRead: boolean;
    allowEdit: boolean;
    allowDelete: boolean;
    viewAllRecords: boolean;
    modifyAllRecords: boolean;
}

export interface FieldPermission {
    field: string;
    readable: boolean;
    editable: boolean;
}

export interface ClassAccess {
    apexClass: string;
    enabled: boolean;
}

export interface UserPermission {
    name: string;
    enabled: boolean;
}

export interface TabSetting {
    tab: string;
    visibility: 'DefaultOn' | 'DefaultOff' | 'Hidden';
}

export interface TabVisibility {
    tab: string;
    visibility: 'DefaultOn' | 'DefaultOff' | 'Hidden';
}

export interface RecordTypeVisibility {
    recordType: string;
    visible: boolean;
    default: boolean;
}

export interface LayoutAssignment {
    layout: string;
    recordType?: string;
}

export interface RecordType {
    fullName: string;
    label: string;
    active: boolean;
    description?: string;
}

export interface ValidationRule {
    fullName: string;
    active: boolean;
    errorConditionFormula: string;
    errorMessage: string;
}

// ============================================================================
// TIPOS DE DEPLOY
// ============================================================================

export interface DeploySelection {
    id: string;
    items: DeployItem[];
    createdAt: Date;
    updatedAt: Date;
    sourceOrg?: string;
    targetOrg?: string;
}

export interface DeployItem {
    id: string;
    component: MetadataComponent;
    includeRelated: boolean;
    relatedItems?: DeployItem[];
    action: 'add' | 'update' | 'delete';
}

export interface PackageManifest {
    version: string;
    types: PackageType[];
}

export interface PackageType {
    name: MetadataType;
    members: string[];
}

export interface DeployPackage {
    packageXml: string;
    destructiveChangesXml?: string;
    metadataFiles: MetadataFile[];
    manifest: PackageManifest;
    generatedAt: Date;
    generatedBy: string;
    sourceOrg: string;
    targetOrg?: string;
}

export interface MetadataFile {
    path: string;
    content: string;
    type: MetadataType;
    componentName: string;
}

// ============================================================================
// TIPOS DE DIFF
// ============================================================================

export interface DiffResult {
    source: DiffSource;
    target: DiffSource;
    componentType: MetadataType;
    differences: DiffItem[];
    summary: DiffSummary;
    generatedAt: Date;
}

export interface DiffSource {
    type: 'local' | 'org';
    identifier: string; // path para local, alias/username para org
}

export interface DiffItem {
    path: string;
    componentName: string;
    type: MetadataType;
    status: 'added' | 'removed' | 'modified' | 'unchanged';
    sourceValue?: string;
    targetValue?: string;
    details?: DiffDetail[];
}

export interface DiffDetail {
    property: string;
    sourceValue: string | boolean | number;
    targetValue: string | boolean | number;
}

export interface DiffSummary {
    totalComponents: number;
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
}

// ============================================================================
// TIPOS DE AUDITORIA
// ============================================================================

export interface AuditEntry {
    id: string;
    timestamp: Date;
    action: AuditAction;
    user: string;
    sourceOrg?: string;
    targetOrg?: string;
    details: AuditDetails;
}

export type AuditAction = 
    | 'PACKAGE_CREATED'
    | 'PACKAGE_EXPORTED'
    | 'DIFF_EXECUTED'
    | 'METADATA_RETRIEVED'
    | 'SELECTION_UPDATED'
    | 'ORG_CONNECTED'
    | 'ORG_DISCONNECTED';

export interface AuditDetails {
    componentsCount?: number;
    componentTypes?: MetadataType[];
    packagePath?: string;
    diffSummary?: DiffSummary;
    additionalInfo?: Record<string, unknown>;
}

export interface AuditLog {
    entries: AuditEntry[];
    lastUpdated: Date;
}

// ============================================================================
// TIPOS DE TREE VIEW
// ============================================================================

export interface TreeItemData {
    id: string;
    label: string;
    description?: string;
    tooltip?: string;
    icon?: string;
    contextValue?: string;
    collapsibleState?: 'none' | 'collapsed' | 'expanded';
    children?: TreeItemData[];
    metadata?: MetadataComponent;
}

// ============================================================================
// TIPOS DE CONFIGURAÇÃO
// ============================================================================

export interface ExtensionConfig {
    defaultOrg: string;
    outputDirectory: string;
    enableAuditLog: boolean;
    auditLogPath: string;
    autoGenerateCommitMessage: boolean;
    metadataApiVersion: string;
}

// ============================================================================
// TIPOS DE RESULTADO DE OPERAÇÃO
// ============================================================================

export interface OperationResult<T = void> {
    success: boolean;
    data?: T;
    error?: string;
    warnings?: string[];
}
