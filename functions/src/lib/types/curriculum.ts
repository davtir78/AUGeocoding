
export interface CompetencyAtom {
    id: string; // UUID v4 or v5
    canonical_code: string; // e.g., "AC9M7N02"
    type: 'Standard' | 'Cluster' | 'PerformanceExpectation' | 'Signpost' | 'ContentDescription';

    jurisdiction: {
        country: string; // "AUS", "USA", "GBR", "NZL"
        region: string; // "National"
        authority: string; // "ACARA"
    };

    educational_context: {
        subject: string;
        native_label: string; // "Year 7"
        normalized_year_levels: number[]; // [7]
        age_range?: {
            min: number;
            max: number;
        };
    };

    hierarchy_context: {
        parent_id?: string;
        taxonomy_path: string[]; // ["Mathematics", "Number", "Operations"]
        native_node_type: string;
    };

    statement: {
        full_text: string;
        plain_english?: string;
        keywords: string[];
        elaborations?: string[];
        assessment_boundary?: string;
    };

    dimensions?: {
        sep?: string[];
        dci?: string[];
        ccc?: string[];
        general_capabilities?: string[];
        cross_curriculum_priorities?: string[];
    };

    audit: {
        version: string;
        last_updated: string; // ISO date
        status: 'Active' | 'Deprecated';
    };
}
