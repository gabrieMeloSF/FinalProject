import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { 
    PackageManifest, 
    MetadataType, 
    PermissionSet, 
    Profile,
    ObjectPermission,
    FieldPermission,
    ClassAccess
} from '../types';

/**
 * Utilitário para construção e parsing de XML do Salesforce
 */
export class XmlBuilderUtil {
    private static readonly XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';
    private static readonly METADATA_NS = 'http://soap.sforce.com/2006/04/metadata';

    private parser: XMLParser;
    private builder: XMLBuilder;

    constructor() {
        this.parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            parseAttributeValue: true,
            trimValues: true,
        });

        this.builder = new XMLBuilder({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            format: true,
            indentBy: '    ',
            suppressEmptyNode: true,
        });
    }

    /**
     * Gera o package.xml a partir do manifest
     */
    public generatePackageXml(manifest: PackageManifest): string {
        const packageObj = {
            Package: {
                '@_xmlns': XmlBuilderUtil.METADATA_NS,
                types: manifest.types.map(type => ({
                    members: type.members,
                    name: type.name,
                })),
                version: manifest.version,
            },
        };

        return XmlBuilderUtil.XML_DECLARATION + this.builder.build(packageObj);
    }

    /**
     * Gera o destructiveChanges.xml
     */
    public generateDestructiveChangesXml(manifest: PackageManifest): string {
        return this.generatePackageXml(manifest);
    }

    /**
     * Gera o XML de um Permission Set
     */
    public generatePermissionSetXml(permissionSet: PermissionSet): string {
        const psObj: Record<string, unknown> = {
            PermissionSet: {
                '@_xmlns': XmlBuilderUtil.METADATA_NS,
                label: permissionSet.label || permissionSet.fullName,
                description: permissionSet.description,
                hasActivationRequired: permissionSet.hasActivationRequired,
                license: permissionSet.license,
            },
        };

        const ps = psObj.PermissionSet as Record<string, unknown>;

        // Object Permissions
        if (permissionSet.objectPermissions?.length > 0) {
            ps.objectPermissions = permissionSet.objectPermissions.map(op => ({
                object: op.object,
                allowCreate: op.allowCreate,
                allowDelete: op.allowDelete,
                allowEdit: op.allowEdit,
                allowRead: op.allowRead,
                modifyAllRecords: op.modifyAllRecords,
                viewAllRecords: op.viewAllRecords,
            }));
        }

        // Field Permissions
        if (permissionSet.fieldPermissions?.length > 0) {
            ps.fieldPermissions = permissionSet.fieldPermissions.map(fp => ({
                field: fp.field,
                editable: fp.editable,
                readable: fp.readable,
            }));
        }

        // Class Accesses
        if (permissionSet.classAccesses?.length > 0) {
            ps.classAccesses = permissionSet.classAccesses.map(ca => ({
                apexClass: ca.apexClass,
                enabled: ca.enabled,
            }));
        }

        // User Permissions
        if (permissionSet.userPermissions?.length > 0) {
            ps.userPermissions = permissionSet.userPermissions.map(up => ({
                enabled: up.enabled,
                name: up.name,
            }));
        }

        // Tab Settings
        if (permissionSet.tabSettings?.length > 0) {
            ps.tabSettings = permissionSet.tabSettings.map(ts => ({
                tab: ts.tab,
                visibility: ts.visibility,
            }));
        }

        // Record Type Visibilities
        if (permissionSet.recordTypeVisibilities?.length > 0) {
            ps.recordTypeVisibilities = permissionSet.recordTypeVisibilities.map(rtv => ({
                recordType: rtv.recordType,
                visible: rtv.visible,
            }));
        }

        return XmlBuilderUtil.XML_DECLARATION + this.builder.build(psObj);
    }

    /**
     * Gera o XML de um Profile
     */
    public generateProfileXml(profile: Profile): string {
        const profileObj: Record<string, unknown> = {
            Profile: {
                '@_xmlns': XmlBuilderUtil.METADATA_NS,
            },
        };

        const p = profileObj.Profile as Record<string, unknown>;

        // Object Permissions
        if (profile.objectPermissions?.length > 0) {
            p.objectPermissions = profile.objectPermissions.map(op => ({
                object: op.object,
                allowCreate: op.allowCreate,
                allowDelete: op.allowDelete,
                allowEdit: op.allowEdit,
                allowRead: op.allowRead,
                modifyAllRecords: op.modifyAllRecords,
                viewAllRecords: op.viewAllRecords,
            }));
        }

        // Field Permissions
        if (profile.fieldPermissions?.length > 0) {
            p.fieldPermissions = profile.fieldPermissions.map(fp => ({
                field: fp.field,
                editable: fp.editable,
                readable: fp.readable,
            }));
        }

        // Class Accesses
        if (profile.classAccesses?.length > 0) {
            p.classAccesses = profile.classAccesses.map(ca => ({
                apexClass: ca.apexClass,
                enabled: ca.enabled,
            }));
        }

        // Layout Assignments
        if (profile.layoutAssignments?.length > 0) {
            p.layoutAssignments = profile.layoutAssignments.map(la => ({
                layout: la.layout,
                ...(la.recordType && { recordType: la.recordType }),
            }));
        }

        // Record Type Visibilities
        if (profile.recordTypeVisibilities?.length > 0) {
            p.recordTypeVisibilities = profile.recordTypeVisibilities.map(rtv => ({
                recordType: rtv.recordType,
                visible: rtv.visible,
                default: rtv.default,
            }));
        }

        // Tab Visibilities
        if (profile.tabVisibilities?.length > 0) {
            p.tabVisibilities = profile.tabVisibilities.map(tv => ({
                tab: tv.tab,
                visibility: tv.visibility,
            }));
        }

        return XmlBuilderUtil.XML_DECLARATION + this.builder.build(profileObj);
    }

    /**
     * Gera XML parcial de Object Permissions
     */
    public generateObjectPermissionsXml(permissions: ObjectPermission[]): string {
        const obj = {
            objectPermissions: permissions.map(op => ({
                object: op.object,
                allowCreate: op.allowCreate,
                allowDelete: op.allowDelete,
                allowEdit: op.allowEdit,
                allowRead: op.allowRead,
                modifyAllRecords: op.modifyAllRecords,
                viewAllRecords: op.viewAllRecords,
            })),
        };

        return this.builder.build(obj);
    }

    /**
     * Gera XML parcial de Field Permissions
     */
    public generateFieldPermissionsXml(permissions: FieldPermission[]): string {
        const obj = {
            fieldPermissions: permissions.map(fp => ({
                field: fp.field,
                editable: fp.editable,
                readable: fp.readable,
            })),
        };

        return this.builder.build(obj);
    }

    /**
     * Gera XML parcial de Class Accesses
     */
    public generateClassAccessesXml(accesses: ClassAccess[]): string {
        const obj = {
            classAccesses: accesses.map(ca => ({
                apexClass: ca.apexClass,
                enabled: ca.enabled,
            })),
        };

        return this.builder.build(obj);
    }

    /**
     * Parse de XML para objeto
     */
    public parseXml<T>(xml: string): T {
        return this.parser.parse(xml) as T;
    }

    /**
     * Valida se o XML é bem formado
     */
    public validateXml(xml: string): { valid: boolean; error?: string } {
        try {
            this.parser.parse(xml);
            return { valid: true };
        } catch (error) {
            return { 
                valid: false, 
                error: error instanceof Error ? error.message : 'Unknown XML parsing error'
            };
        }
    }

    /**
     * Formata XML existente
     */
    public formatXml(xml: string): string {
        try {
            const parsed = this.parser.parse(xml);
            return XmlBuilderUtil.XML_DECLARATION + this.builder.build(parsed);
        } catch {
            return xml;
        }
    }

    /**
     * Cria manifest a partir de tipos e membros
     */
    public createManifest(
        types: Map<MetadataType, string[]>,
        version: string
    ): PackageManifest {
        const packageTypes = Array.from(types.entries()).map(([name, members]) => ({
            name,
            members: members.sort(),
        }));

        return {
            version,
            types: packageTypes.sort((a, b) => a.name.localeCompare(b.name)),
        };
    }
}

export const xmlBuilder = new XmlBuilderUtil();
