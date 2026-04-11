export type NativeAppSemanticArea = {
    id: string;
    keywords: string[];
    preferredControlTypes: string[];
};
export type NativeAppAdapter = {
    id: string;
    appMatches: RegExp[];
    preferredControlTypes: string[];
    semanticAreas: NativeAppSemanticArea[];
    dangerousActionLabels?: string[];
};
export declare function matchNativeAppAdapter(appName?: string | null, windowTitle?: string | null): NativeAppAdapter | null;
export declare function isDangerousNativeAction(label: string, adapter: NativeAppAdapter | null): boolean;
