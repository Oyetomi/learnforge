import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { MATH_RENDER_OPTIONS } from "../../services/learning/math";
import { LearningTable } from "../learning/LearningTable";
import { CodeBlock, highlightSource } from "./CodeBlock";
import { DerivationLadder, parseLadderMarkdown } from "./DerivationLadder";
import {
  PictogramCard,
  SvgIllustration,
  parsePictogramSpec,
  sanitizeSvgMarkup,
} from "../learning/SvgIllustration";
import { CanvasSandbox } from "../learning/CanvasSandbox";
import { MermaidDiagram } from "../learning/MermaidDiagram";
import { parseCanvasFence } from "../../services/learning/canvasSim";
import { stripInternalSourceCitations } from "../../services/learning/grounding";

interface MarkdownViewProps {
  content: string;
  onApplyCode?: (code: string) => void;
  languageHint?: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  content,
  onApplyCode,
  languageHint,
}) => {
  const cleanContent = React.useMemo(
    () => stripInternalSourceCitations(content),
    [content]
  );
  return (
    <div className="prose prose-invert max-w-none text-forge-text text-sm leading-relaxed space-y-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, MATH_RENDER_OPTIONS]]}
        components={{
          table: ({ children }) => <LearningTable>{children}</LearningTable>,
          th: ({ children, style }) => <th scope="col" style={style}>{children}</th>,
          pre: ({ children }) => {
            const element = React.Children.toArray(children).find((child) =>
              React.isValidElement(child)
            );
            if (
              !React.isValidElement<{
                className?: string;
                children?: React.ReactNode;
              }>(element)
            )
              return <pre>{children}</pre>;
            const language =
              /language-([^\s]+)/.exec(element.props.className || "")?.[1] ||
              "";
            const source = String(element.props.children || "").replace(
              /\n$/,
              ""
            );
            if (language === "ladder" || language === "steps") {
              const ladder = parseLadderMarkdown(source);
              if (ladder) return <DerivationLadder {...ladder} />;
            }
            if (language === "mermaid") {
              return <MermaidDiagram code={source} />;
            }
            if (language === "forge-canvas" || language === "canvas-sim") {
              const parsed = parseCanvasFence(source);
              if (parsed) {
                return (
                  <CanvasSandbox
                    spec={parsed.spec}
                    title={parsed.title}
                    summary={parsed.summary}
                    takeaway={parsed.takeaway}
                    standalone
                  />
                );
              }
              return (
                <div className="canvas-sandbox-pending" role="status">
                  Preparing interactive simulation…
                </div>
              );
            }
            if (
              language === "pictogram" ||
              language === "diagram" ||
              language === "palette"
            ) {
              const spec = parsePictogramSpec(source);
              if (spec) return <PictogramCard spec={spec} />;
              if (sanitizeSvgMarkup(source)) {
                return <SvgIllustration rawSvg={source} />;
              }
            }
            if (
              language === "svg" ||
              language === "illustration" ||
              /^<svg\b[\s\S]*<\/svg>\s*$/i.test(source.trim())
            ) {
              return <SvgIllustration rawSvg={source} />;
            }
            return (
              <CodeBlock
                code={source}
                language={language || languageHint}
                onApplyCode={onApplyCode}
              />
            );
          },
          hr: () => <div className="prose-section-break" aria-hidden="true" />,
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-forge-heading mt-3 mb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-forge-heading mt-3 mb-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-forge-accent mt-2 mb-1">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-2 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="text-forge-text">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-forge-accent/60 pl-3 italic text-forge-muted my-2 bg-forge-surface/40 py-1 rounded-r">
              {children}
            </blockquote>
          ),
          img: ({ src, alt }) =>
            src && /^(?:data:image\/|blob:)/i.test(src) ? (
              <img
                src={src}
                alt={alt || "Uploaded reference"}
                className="prose-uploaded-image"
              />
            ) : null,
          code({ node: _node, children, ...props }) {
            const highlighted = highlightSource(
              String(children || ""),
              languageHint
            );
            if (highlighted !== null)
              return (
                <code
                  {...props}
                  className="inline-code"
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                />
              );
            return (
              <code className="inline-code" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  );
};
