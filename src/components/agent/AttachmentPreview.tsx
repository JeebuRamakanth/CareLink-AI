/**
 * Compact attachment preview shown on user messages in the conversation.
 * Smaller than the composer tray's AttachmentItem — shows what was uploaded,
 * with a processing-state chip (Uploading → Processing → Ready) and a demo
 * badge so mock analysis is never mistaken for real cloud processing.
 */

import { cn } from '../common/cn';
import { IconReport, IconClose, IconShield } from './AgentIcons';
import type { AgentAttachment } from '../../services/agent/agentTypes';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function stateChip(att: AgentAttachment): { label: string; tone: string } | null {
  switch (att.status) {
    case 'uploading':
      return { label: 'Uploading', tone: 'text-brand-200' };
    case 'reading':
    case 'extracting':
    case 'organizing':
    case 'preparing':
      return { label: 'Processing', tone: 'text-brand-200' };
    case 'ready':
      return { label: 'Ready', tone: 'text-emerald-200' };
    case 'error':
      return { label: 'Failed', tone: 'text-rose-200' };
    default:
      return null;
  }
}

interface Props {
  attachment: AgentAttachment;
  onRemove?: () => void;
  compact?: boolean;
}

export function AttachmentPreview({ attachment, onRemove, compact = false }: Props) {
  const chip = stateChip(attachment);
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
        <div className="flex items-center gap-1.5">
          <span className="text-[0.64rem] text-ink-400">{formatBytes(attachment.fileSize)}</span>
          {chip ? (
            <span className={cn('inline-flex items-center gap-0.5 text-[0.62rem] font-medium', chip.tone)}>
              {attachment.status === 'ready' ? <IconShield width={10} height={10} aria-hidden /> : null}
              {chip.label}
              <span className="text-ink-500">· demo</span>
            </span>
          ) : null}
        </div>
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
