import { useState, useMemo } from "preact/hooks";
import { marked } from "marked";
import DOMPurify from "dompurify";
import markedKatex from "marked-katex-extension";
import "katex/dist/katex.min.css";
import { AlertTriangle, Copy, Pencil, Loader2, RefreshCw } from "lucide-preact";

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function parseMessageChunks(text) {
  const chunks = [];
  const regex = /<think>([\s\S]*?)(<\/think>|$)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      chunks.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }
    const isClosed = match[2] === '</think>';
    chunks.push({ type: 'think', content: match[1], isClosed });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    chunks.push({ type: 'text', content: text.substring(lastIndex) });
  }
  return chunks.filter(c => c.type === 'think' || c.content.trim() !== '');
}

function closeOpenDelimiters(text) {
  const ddMatches = text.match(/\$\$/g) || [];
  if (ddMatches.length % 2 !== 0) text += '$$';
  if (text.lastIndexOf('\\[') > text.lastIndexOf('\\]')) text += '\\]';
  if (text.lastIndexOf('\\(') > text.lastIndexOf('\\)')) text += '\\)';
  return text;
}

marked.use(markedKatex({
  throwOnError: false,
  nonStandard: true
}));

marked.use({
  renderer: {
    code(token) {
      const code = token.text;
      const lang = token.lang || '';
      return `<div class="code-block-container">
        <pre><code class="language-${lang}">${token.escaped ? token.text : escapeHtml(token.text)}</code></pre>
        <button class="copy-btn" data-code="${encodeURIComponent(code)}" type="button">Copy</button>
      </div>`;
    }
  }
});

function parseWithKatex(rawText) {
  let text = rawText;
  const codeMatches = text.match(/```/g) || [];
  if (codeMatches.length % 2 !== 0) {
    text += '\n```';
  } else {
    text = closeOpenDelimiters(text);
  }

  // Convert \[ ... \] to $$ ... $$ and \( ... \) to $ ... $
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, "$$$$$1$$$$");
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$$");

  const rawHtml = marked.parse(text);
  return DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ['math', 'annotation', 'semantics', 'mrow', 'mi', 'mn', 'mo', 'ms', 'mspace', 'mtext', 'menclose', 'merror', 'mfenced', 'mfrac', 'mpadded', 'mphantom', 'mroot', 'msqrt', 'mstyle', 'mmultiscripts', 'mover', 'mprescripts', 'msub', 'msubsup', 'msup', 'munder', 'munderover', 'none', 'annotation-xml', 'svg', 'path', 'g', 'line', 'rect', 'circle', 'ellipse', 'polygon', 'polyline'],
    ADD_ATTR: ['target', 'class', 'style', 'd', 'viewBox', 'preserveAspectRatio', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'aria-hidden']
  });
}

const CopyMessageButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };
  return (
    <button type="button" class="action-btn" title="Copy text" onClick={handleCopy}>
      {copied ? <span style={{ fontSize: '11px', color: '#8fd6a8', fontWeight: 'bold' }}>Copied!</span> : <Copy size={13} />}
    </button>
  );
};

export default function MessageItem({
  msg,
  idx,
  isStreaming,
  showTokenCount,
  isEditing,
  editInput,
  onEditInput,
  onEditCancel,
  onEditSubmit,
  onStartEdit,
  onRetry,
  disableRetry
}) {
  const chunks = useMemo(() => parseMessageChunks(msg.text || ""), [msg.text]);
  const responseText = useMemo(() => chunks.filter(c => c.type === 'text').map(c => c.content).join('').trim(), [chunks]);

  const renderedChunks = useMemo(() => {
    return chunks.map((chunk, cIdx) => {
      if (chunk.type === 'think') {
        const showAsStreaming = !chunk.isClosed && isStreaming;
        if (showAsStreaming) {
          const lines = chunk.content.trim().split('\n').filter(l => l.trim());
          const lastLine = lines[lines.length - 1] || 'Thinking...';
          return { type: 'think-stream', lastLine, cIdx };
        } else {
          const html = parseWithKatex(chunk.content);
          return { type: 'think', html, cIdx };
        }
      } else {
        const html = parseWithKatex(chunk.content);
        return { type: 'text', html, cIdx };
      }
    });
  }, [chunks, isStreaming]);

  return (
    <div class="msg-wrapper">
      {isEditing ? (
        <div class="edit-mode-container">
          <textarea
            class="edit-msg-input"
            value={editInput}
            onInput={onEditInput}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onEditSubmit(idx);
              }
            }}
          />
          <div class="edit-actions">
            <button type="button" class="edit-btn cancel" onClick={onEditCancel}>Cancel</button>
            <button type="button" class="edit-btn submit" onClick={() => onEditSubmit(idx)}>Submit</button>
          </div>
        </div>
      ) : (
        <>
          {renderedChunks.map((rChunk) => {
            if (rChunk.type === 'think-stream') {
              return (
                <div key={rChunk.cIdx} class="think-loading-indicator">
                  <Loader2 size={14} class="spin-icon" />
                  <span class="think-line" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{rChunk.lastLine}</span>
                </div>
              );
            } else if (rChunk.type === 'think') {
              return (
                <details key={rChunk.cIdx} class="think-block completed outside-bubble">
                  <summary><span class="think-icon"></span>Thought</summary>
                  <div class="think-content markdown-body" dangerouslySetInnerHTML={{ __html: rChunk.html }} />
                </details>
              );
            } else {
              return (
                <div key={rChunk.cIdx} class={`msg ${msg.role}${msg.isError ? ' error' : ''}`}>
                  {msg.isError && rChunk.cIdx === 0 && <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />}
                  <div class="markdown-body" dangerouslySetInnerHTML={{ __html: rChunk.html }} />
                </div>
              );
            }
          })}
          <div class={`msg-actions ${msg.role}`}>
            {msg.role === "ai" && showTokenCount && msg.tokens > 0 ? (
              <div class="token-count">Tokens used: {msg.tokens}</div>
            ) : <div />}
            <div class="action-icons">
              {msg.role === "user" && (
                <button type="button" class="action-btn" title="Edit message" onClick={() => onStartEdit(idx, msg.text)}>
                  <Pencil size={13} />
                </button>
              )}
              {msg.role === "ai" && idx > 0 && responseText.length > 0 && (
                <button type="button" class="action-btn" title="Retry" onClick={() => onRetry(idx)} disabled={disableRetry}>
                  <RefreshCw size={13} />
                </button>
              )}
              {msg.role === "ai" && idx > 0 && responseText.length > 0 && <CopyMessageButton text={responseText} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
