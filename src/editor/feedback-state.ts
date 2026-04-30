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

export function feedbackReducer<TItem>(state: FeedbackSessionState<TItem> | undefined, event: FeedbackEvent<TItem>): FeedbackTransition<TItem> {
    switch (event.type) {
        case 'add': {
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
        case 'finish': {
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
        case 'cancel': {
            if (!state) {
                throw new Error('No feedback session is active.');
            }

            return { state: cancelledSession(state) };
        }
        case 'drain': {
            if (!state || state.status !== 'ready') {
                throw new Error('No ready feedback session is available to drain.');
            }

            return {
                state: { ...state, status: 'drained' },
                drained: cloneSession(state)
            };
        }
        case 'clear': {
            if (!state) {
                return { state, cleared: false };
            }
            if (event.scope !== 'all' && state.status !== event.scope) {
                return { state, cleared: false };
            }

            return { state: cancelledSession(state), cleared: true };
        }
    }
}
