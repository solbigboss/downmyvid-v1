import React, { Fragment, ReactNode } from 'react';

function inlineParts(value: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) parts.push(value.slice(lastIndex, match.index));
    if (match[2] && match[3]) {
      parts.push(<a key={`link-${match.index}`} href={match[3]} target="_blank" rel="noopener noreferrer" className="text-[#1d9bf0] underline underline-offset-2">{match[2]}</a>);
    } else if (match[4]) {
      parts.push(<strong key={`bold-${match.index}`}>{match[4]}</strong>);
    } else if (match[5]) {
      parts.push(<em key={`italic-${match.index}`}>{match[5]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) parts.push(value.slice(lastIndex));
  return parts;
}

export const MarkdownContent: React.FC<{ value: string; className?: string }> = ({ value, className = '' }) => {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const output: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(<p key={`p-${output.length}`} className="mb-5">{inlineParts(paragraph.join(' '))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    output.push(<ul key={`ul-${output.length}`} className="mb-5 list-disc space-y-2 pl-6">{list.map((item, index) => <li key={`${item}-${index}`}>{inlineParts(item)}</li>)}</ul>);
    list = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph(); flushList(); return; }
    const heading = /^(#{1,2})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph(); flushList();
      const Tag = heading[1].length === 1 ? 'h2' : 'h3';
      output.push(<Tag key={`h-${index}`} className={`${Tag === 'h2' ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'} font-black tracking-tight mb-4 mt-8`}>{inlineParts(heading[2])}</Tag>);
      return;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) { flushParagraph(); list.push(bullet[1]); return; }
    flushList(); paragraph.push(trimmed);
  });
  flushParagraph(); flushList();

  return <div className={`leading-8 ${className}`}>{output.map((node, index) => <Fragment key={index}>{node}</Fragment>)}</div>;
};
