/**
 * Compact attachment preview shown on user messages in the conversation.
 * Smaller than the composer tray's AttachmentItem — just shows what was uploaded.
 */

import { cn } from '../common/cn';
import { IconReport, IconClose } from './AgentIcons';
import type { AgentAttachment } from '../../services/agent/agentTypes';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface Props {
  attachment: AgentAttachment;
  onRemove?: () => void;
  compact?: boolean;
}

export function AttachmentPreview({ attachment, onRemove, compact = false }: Props) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-[0.7rem] border border-white/12 bg-white/8',
        compact ? 'px-2 py-1.5' : 'px-2.5 py-2'
      )}
    >
      {attachment.kind === 'image' && attachment.previewUrl ? (
        <img src={attachment.previewUrl} alt="" className="size-7 rounded-[0.4rem] border border-white/10 object-cover" />
      ) : (
        <span className="flex size-7 items-center justify-center rounded-[0.4rem] border border-white/10 bg-white/8 text-ink-300">
          <IconReport width={14} height={14} />
        </span>
      )}
      <div className="min-w-0">
        <p className="max-w-[140px] truncate text-[0.74rem] font-medium text-white">{attachment.fileName}</p>
        <p className="text-[0.64rem] text-ink-400">{formatBytes(attachment.fileSize)}</p>
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${attachment.fileName}`}
          className="ml-1 flex size-6 items-center justify-center rounded-full text-ink-400 transition hover:bg-rose-400/10 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
        >
          <IconClose width={13} height={13} />
        </button>
      ) : null}
    </div>
  );
}
