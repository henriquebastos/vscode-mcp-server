import * as vscode from 'vscode';
import type { FeedbackSessionSnapshot} from './feedback-service';
import { getFeedbackCaptureService } from './feedback-service';

export const FEEDBACK_ADD_COMMAND = 'vscode-mcp-server.feedback.add';
export const FEEDBACK_FINISH_COMMAND = 'vscode-mcp-server.feedback.finish';
export const FEEDBACK_CANCEL_COMMAND = 'vscode-mcp-server.feedback.cancel';

export const FEEDBACK_ACTIVE_CONTEXT = 'vscodeMcpServer.feedbackActive';
export const FEEDBACK_READY_CONTEXT = 'vscodeMcpServer.feedbackReady';
export const FEEDBACK_ITEM_COUNT_CONTEXT = 'vscodeMcpServer.feedbackItemCount';

function isSessionActive(session: FeedbackSessionSnapshot | undefined): boolean {
    return Boolean(session && session.count > 0 && (session.status === 'draft' || session.status === 'ready'));
}

export async function updateFeedbackContext(session?: FeedbackSessionSnapshot): Promise<void> {
    const active = isSessionActive(session);
    await vscode.commands.executeCommand('setContext', FEEDBACK_ACTIVE_CONTEXT, active);
    await vscode.commands.executeCommand('setContext', FEEDBACK_READY_CONTEXT, session?.status === 'ready');
    await vscode.commands.executeCommand('setContext', FEEDBACK_ITEM_COUNT_CONTEXT, active ? session?.count ?? 0 : 0);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function registerFeedbackCommands(): vscode.Disposable[] {
    void updateFeedbackContext();

    const addFeedback = vscode.commands.registerCommand(FEEDBACK_ADD_COMMAND, async () => {
        try {
            const feedbackText = await vscode.window.showInputBox({
                title: 'Add Feedback',
                prompt: 'Capture feedback for the current selection.',
                placeHolder: 'Type feedback for the selected code',
                ignoreFocusOut: true,
                validateInput: value => value.trim().length === 0 ? 'Enter feedback before submitting.' : undefined
            });
            if (feedbackText === undefined) {
                return;
            }

            const session = await getFeedbackCaptureService().addFeedback({ feedbackText });
            await updateFeedbackContext(session);
            vscode.window.showInformationMessage(`Captured feedback ${session.count}.`);
        } catch (error) {
            vscode.window.showErrorMessage(`Could not add feedback: ${errorMessage(error)}`);
        }
    });

    const finishFeedback = vscode.commands.registerCommand(FEEDBACK_FINISH_COMMAND, async () => {
        try {
            const session = await getFeedbackCaptureService().finishFeedback();
            await updateFeedbackContext(session);
            vscode.window.showInformationMessage(`Feedback ready for the agent (${session.count} item${session.count === 1 ? '' : 's'}).`);
        } catch (error) {
            vscode.window.showErrorMessage(`Could not finish feedback: ${errorMessage(error)}`);
        }
    });

    const cancelFeedback = vscode.commands.registerCommand(FEEDBACK_CANCEL_COMMAND, async () => {
        try {
            const feedbackService = getFeedbackCaptureService();
            const currentSession = feedbackService.getFeedback();
            if (currentSession && currentSession.count > 1) {
                const choice = await vscode.window.showWarningMessage(
                    `Discard ${currentSession.count} captured feedback items?`,
                    { modal: true },
                    'Discard Feedback'
                );
                if (choice !== 'Discard Feedback') {
                    return;
                }
            }

            const session = await feedbackService.cancelFeedback();
            await updateFeedbackContext(session);
            vscode.window.showInformationMessage('Feedback session cancelled.');
        } catch (error) {
            vscode.window.showErrorMessage(`Could not cancel feedback: ${errorMessage(error)}`);
        }
    });

    return [addFeedback, finishFeedback, cancelFeedback];
}
