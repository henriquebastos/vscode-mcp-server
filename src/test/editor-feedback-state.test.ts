import * as assert from 'assert';
import { feedbackReducer, FeedbackSessionState } from '../editor/feedback-state';
import { toFeedbackSessionId } from '../editor/ids';

interface TestFeedbackItem {
    id: string;
}

suite('Editor Feedback State', () => {
    const sessionId = toFeedbackSessionId('feedback-session-1');
    const firstItem: TestFeedbackItem = { id: 'feedback-item-1' };
    const secondItem: TestFeedbackItem = { id: 'feedback-item-2' };

    function draft(items: TestFeedbackItem[] = [firstItem]): FeedbackSessionState<TestFeedbackItem> {
        return { id: sessionId, status: 'draft', items };
    }

    test('adds draft items and rejects adding after a session is ready', () => {
        const created = feedbackReducer(undefined, { type: 'add', sessionId, item: firstItem }).state;
        const appended = feedbackReducer(created, { type: 'add', sessionId, item: secondItem }).state;

        assert.strictEqual(created?.status, 'draft');
        assert.deepStrictEqual(appended?.items, [firstItem, secondItem]);
        assert.throws(
            () => feedbackReducer({ ...draft(), status: 'ready' }, { type: 'add', sessionId, item: secondItem }),
            /Cannot add feedback while the current feedback session is ready/
        );
    });

    test('rejects illegal finish and drain transitions', () => {
        assert.throws(
            () => feedbackReducer<TestFeedbackItem>(undefined, { type: 'finish' }),
            /No feedback has been captured yet/
        );
        assert.throws(
            () => feedbackReducer({ ...draft([]) }, { type: 'finish' }),
            /No feedback has been captured yet/
        );
        assert.throws(
            () => feedbackReducer(draft(), { type: 'drain' }),
            /No ready feedback session is available to drain/
        );
    });

    test('finishes, drains, cancels, and scoped-clears sessions predictably', () => {
        const ready = feedbackReducer(draft(), { type: 'finish' }).state;
        const drained = feedbackReducer(ready, { type: 'drain' });
        const scopedMismatch = feedbackReducer(ready, { type: 'clear', scope: 'draft' });
        const scopedClear = feedbackReducer(ready, { type: 'clear', scope: 'ready' });
        const cancelled = feedbackReducer(draft(), { type: 'cancel' }).state;

        assert.strictEqual(ready?.status, 'ready');
        assert.strictEqual(drained.drained?.status, 'ready');
        assert.strictEqual(drained.state?.status, 'drained');
        assert.strictEqual(drained.state?.items.length, 1);
        assert.strictEqual(scopedMismatch.cleared, false);
        assert.strictEqual(scopedMismatch.state?.status, 'ready');
        assert.strictEqual(scopedClear.cleared, true);
        assert.strictEqual(scopedClear.state?.status, 'cancelled');
        assert.deepStrictEqual(scopedClear.state?.items, []);
        assert.strictEqual(cancelled?.status, 'cancelled');
        assert.deepStrictEqual(cancelled?.items, []);
    });
});
