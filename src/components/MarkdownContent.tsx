import React, { Fragment, ReactNode } from 'react';

function inlineParts(value: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) parts.push(value.slice(lastIndex, match.index));
    if (match[2] !== undefined && match[3]) {
      parts.push(<img key={`image-${match.index}`} src={match[3]} alt={match[2]} loading="lazy" referrerPolicy="no-referrer" className="my-6 mx-auto max-h-[560px] max-w-full rounded-2xl object-contain" />);
    } else if (match[4] && match[5]) {
      parts.push(<a key={`link-${match.index}`} href={match[5]} target="_blank" rel="noopener noreferrer" className="text-[#1d9bf0] underline underline-offset-2">{match[4]}</a>);
    } else if (match[6]) {
      parts.push(<strong key={`bold-${match.index}`}>{match[6]}</strong>);
    } else if (match[7]) {
      parts.push(<em key={`italic-${match.index}`}>{match[7]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) parts.push(value.slice(lastIndex));
  return parts;
}

type Alignment = 'left' | 'center' | 'right';

export const MarkdownContent: React.FC<{ value: string; className?: string; dir?: 'ltr' | 'rtl' }> = ({ value, className = '', dir }) => {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const output: ReactNode[] = [];
  const alignmentStack: Alignment[] = [];
  let alignment: Alignment = dir === 'rtl' ? 'right' : 'left';
  const alignmentClass: Record<Alignment, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(<p key={`p-${output.length}`} className={`mb-5 ${alignmentClass[alignment]}`}>{inlineParts(paragraph.join(' '))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    output.push(<ul key={`ul-${output.length}`} className="mb-5 list-disc space-y-2 pl-6">{list.map((item, index) => <li key={`${item}-${index}`}>{inlineParts(item)}</li>)}</ul>);
    list = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const alignStart = /^\[align:(left|center|right)\]$/i.exec(trimmed);
    if (alignStart) { flushParagraph(); flushList(); alignmentStack.push(alignment); alignment = alignStart[1].toLowerCase() as typeof alignment; return; }
    if (trimmed === '[/align]') { flushParagraph(); flushList(); alignment = alignmentStack.pop() || 'right'; return; }
    if (!trimmed) { flushParagraph(); flushList(); return; }
    const heading = /^(#{1,2})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph(); flushList();
      const Tag = heading[1].length === 1 ? 'h2' : 'h3';
      output.push(<Tag key={`h-${index}`} className={`${Tag === 'h2' ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'} ${alignmentClass[alignment]} font-black tracking-tight mb-4 mt-8`}>{inlineParts(heading[2])}</Tag>);
      return;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) { flushParagraph(); list.push(bullet[1]); return; }
    flushList(); paragraph.push(trimmed);
  });
  flushParagraph(); flushList();

  return <div dir={dir} className={`leading-8 ${className}`}>{output.map((node, index) => <Fragment key={index}>{node}</Fragment>)}</div>;
};
