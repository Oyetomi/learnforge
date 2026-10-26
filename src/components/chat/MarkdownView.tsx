import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Copy, Check, Terminal } from 'lucide-react';
import { DerivationLadder, parseLadderMarkdown } from './DerivationLadder';

interface MarkdownViewProps {
  content: string;
  onApplyCode?: (code: string) => void;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, onApplyCode }) => {
  const [copiedIndex, setCopiedIndex] = React.useState<string | null>(null);

  const copyToClipboard = async (text: string, index: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      setCopiedIndex(null);
    }
  };

  return (
    <div className="prose prose-invert max-w-none text-forge-text text-sm leading-relaxed space-y-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-forge-heading mt-3 mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-forge-heading mt-3 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-forge-accent mt-2 mb-1">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-forge-text">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-forge-accent/60 pl-3 italic text-forge-muted my-2 bg-forge-surface/40 py-1 rounded-r">
              {children}
            </blockquote>
          ),
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const lang = match ? match[1] : '';
            const codeString = String(children).replace(/\n$/, '');

            if (!inline && (lang === 'ladder' || lang === 'steps')) {
              const ladderData = parseLadderMarkdown(codeString);
              if (ladderData) {
                return <DerivationLadder {...ladderData} />;
              }
            }

            if (!inline && lang) {
              const blockId = codeString;
              return (
                <div className="my-3 rounded-lg overflow-hidden border border-forge-border bg-forge-bg">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-forge-surface border-b border-forge-border text-xs text-forge-muted">
                    <span className="flex items-center gap-1.5 font-mono text-forge-accent font-medium uppercase tracking-wider text-[11px]">
                      <Terminal size={13} />
                      {lang}
                    </span>
                    <div className="flex items-center gap-2">
                      {onApplyCode && (
                        <button
                          onClick={() => onApplyCode(codeString)}
                          className="px-2 py-0.5 rounded bg-forge-accent/20 hover:bg-forge-accent/30 text-forge-accent text-[11px] font-medium transition-colors"
                          title="Copy to Live Editor"
                        >
                          Send to Editor →
                        </button>
                      )}
                      <button
                        onClick={() => copyToClipboard(codeString, blockId)}
                        className="flex items-center gap-1 hover:text-forge-heading transition-colors"
                        title="Copy Code"
                      >
                        {copiedIndex === blockId ? (
                          <Check size={12} className="text-forge-success" />
                        ) : (
                          <Copy size={12} />
                        )}
                        <span>{copiedIndex === blockId ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                  <pre className="p-3 font-mono text-xs overflow-x-auto text-[#e6edf3]">
                    <code>{codeString}</code>
                  </pre>
                </div>
              );
            }

            return (
              <code
                className="px-1.5 py-0.5 rounded bg-forge-surface border border-forge-border/60 font-mono text-[12px] text-forge-accent"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
