import type { FeedbackSessionId } from './ids';

export type FeedbackSessionStatus = 'draft' | 'ready' | 'drained' | 'cancelled';
export type FeedbackClearScope = FeedbackSessionStatus | 'all';

export interface FeedbackSessionState<TItem> {
    id: FeedbackSessionId;
    status: FeedbackSessionStatus;
    items: TItem[];
}

export type FeedbackEvent<TItem> =
    | { type: 'add'; sessionId: FeedbackSessionId; item: TItem }
    | { type: 'finish' }
    | { type: 'cancel' }
    | { type: 'drain' }
    | { type: 'clear'; scope: FeedbackClearScope };

export interface FeedbackTransition<TItem> {
    state: FeedbackSessionState<TItem> | undefined;
    drained?: FeedbackSessionState<TItem>;
    cleared?: boolean;
}

function cloneSession<TItem>(session: FeedbackSessionState<TItem>): FeedbackSessionState<TItem> {
    return {
        id: session.id,
        status: session.status,
        items: [...session.items]
    };
}

function cancelledSession<TItem>(session: FeedbackSessionState<TItem>): FeedbackSessionState<TItem> {
    return {
        id: session.id,
        status: 'cancelled',
        items: []
    };
}

function reduceAdd<TItem>(
    state: FeedbackSessionState<TItem> | undefined,
    event: { sessionId: FeedbackSessionId; item: TItem },
): FeedbackTransition<TItem> {
    if (!state || state.status === 'cancelled' || state.status === 'drained') {
        return {
            state: {
                id: event.sessionId,
                status: 'draft',
                items: [event.item]
            }
        };
    }
    if (state.status !== 'draft') {
        throw new Error(`Cannot add feedback while the current feedback session is ${state.status}. Finish processing or clear it first.`);
    }

    return {
        state: {
            ...state,
            items: [...state.items, event.item]
        }
    };
}

function reduceFinish<TItem>(state: FeedbackSessionState<TItem> | undefined): FeedbackTransition<TItem> {
    if (!state || state.items.length === 0) {
        throw new Error('No feedback has been captured yet.');
    }
    if (state.status === 'draft') {
        return { state: { ...state, status: 'ready' } };
    }
    if (state.status === 'ready') {
        return { state };
    }

    throw new Error(`Cannot finish a feedback session that is ${state.status}.`);
}

function reduceCancel<TItem>(state: FeedbackSessionState<TItem> | undefined): FeedbackTransition<TItem> {
    if (!state) {
        throw new Error('No feedback session is active.');
    }

    return { state: cancelledSession(state) };
}

function reduceDrain<TItem>(state: FeedbackSessionState<TItem> | undefined): FeedbackTransition<TItem> {
    if (!state || state.status !== 'ready') {
        throw new Error('No ready feedback session is available to drain.');
    }

    return {
        state: { ...state, status: 'drained' },
        drained: cloneSession(state)
    };
}

function reduceClear<TItem>(
    state: FeedbackSessionState<TItem> | undefined,
    scope: FeedbackClearScope,
): FeedbackTransition<TItem> {
    if (!state) {
        return { state, cleared: false };
    }
    if (scope !== 'all' && state.status !== scope) {
        return { state, cleared: false };
    }

    return { state: cancelledSession(state), cleared: true };
}

export function feedbackReducer<TItem>(state: FeedbackSessionState<TItem> | undefined, event: FeedbackEvent<TItem>): FeedbackTransition<TItem> {
    switch (event.type) {
        case 'add': return reduceAdd(state, event);
        case 'finish': return reduceFinish(state);
        case 'cancel': return reduceCancel(state);
        case 'drain': return reduceDrain(state);
        case 'clear': return reduceClear(state, event.scope);
    }
}
