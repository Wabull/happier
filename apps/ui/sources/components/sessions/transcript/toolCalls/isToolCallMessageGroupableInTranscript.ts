import type { Message, ToolCallMessage } from '@/sync/domains/messages/messageTypes';
import { readTurnChangeToolMetadataFromToolCall } from '@/sync/domains/session/changes/parsing/readTurnChangeToolMetadata';
import { isPendingUserActionRequest } from '@/utils/sessions/permissions/permissionPromptPolicy';
import { readDiscussionTurn } from '@/components/sessions/discussion/discussionModel';

export function isToolCallMessageGroupableInTranscript(message: Message): message is ToolCallMessage {
    if (message.kind !== 'tool-call') return false;

    if (readTurnChangeToolMetadataFromToolCall(message.tool) != null) {
        return false;
    }

    // Shared-chat discussion turns render as chat bubbles in their own rows.
    if (readDiscussionTurn(message.tool) != null) {
        return false;
    }

    return !isPendingUserActionRequest({
        toolName: message.tool.name,
        requestKind: message.tool.permission?.kind,
        permissionStatus: message.tool.permission?.status,
    });
}
