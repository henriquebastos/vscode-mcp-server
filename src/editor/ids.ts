export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type AnnotationId = Brand<string, 'AnnotationId'>;
export type DiffId = Brand<string, 'DiffId'>;
export type FeedbackSessionId = Brand<string, 'FeedbackSessionId'>;
export type FeedbackItemId = Brand<string, 'FeedbackItemId'>;

function toNonEmptyBrandedId<Name extends string>(value: string, name: Name): Brand<string, Name> {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        throw new Error(`${name} must not be empty.`);
    }

    return trimmed as Brand<string, Name>;
}

export function toAnnotationId(value: string): AnnotationId {
    return toNonEmptyBrandedId(value, 'AnnotationId');
}

export function toDiffId(value: string): DiffId {
    return toNonEmptyBrandedId(value, 'DiffId');
}

export function toFeedbackSessionId(value: string): FeedbackSessionId {
    return toNonEmptyBrandedId(value, 'FeedbackSessionId');
}

export function toFeedbackItemId(value: string): FeedbackItemId {
    return toNonEmptyBrandedId(value, 'FeedbackItemId');
}
