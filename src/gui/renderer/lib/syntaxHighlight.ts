export interface HighlightSegment {
  text: string
  className?: string
}

const keywordMap: Record<string, Set<string>> = {
  javascript: new Set([
    'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'export', 'extends', 'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'instanceof',
    'let', 'new', 'of', 'return', 'static', 'switch', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'yield',
    'true', 'false', 'null', 'undefined',
  ]),
  python: new Set([
    'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
    'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'None', 'nonlocal', 'not',
    'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield',
  ]),
  shell: new Set(['case', 'do', 'done', 'elif', 'else', 'esac', 'export', 'fi', 'for', 'function', 'if', 'in', 'then', 'while']),
  go: new Set(['break', 'case', 'chan', 'const', 'continue', 'defer', 'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var', 'true', 'false', 'nil']),
  rust: new Set(['as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while']),
  java: new Set(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null']),
  c: new Set(['auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'inline', 'int', 'long', 'register', 'restrict', 'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while', 'true', 'false', 'NULL']),
  css: new Set(['@media', '@import', '@keyframes', 'from', 'to', 'important']),
}

const aliases: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'javascript',
  tsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  bash: 'shell',
  sh: 'shell',
  zsh: 'shell',
  shell: 'shell',
  rs: 'rust',
  cpp: 'c',
  cxx: 'c',
  cc: 'c',
  h: 'c',
  hpp: 'c',
  json: 'json',
  html: 'html',
  xml: 'html',
  css: 'css',
}

export function normalizeLanguage(language?: string): string {
  const raw = (language ?? '').trim().toLowerCase().split(/\s+/)[0] ?? ''
  return aliases[raw] ?? raw
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function highlightLineSegments(line: string, language?: string): HighlightSegment[] {
  const lang = normalizeLanguage(language)
  if (lang === 'html') return highlightHtmlLike(line)
  if (lang === 'json') return highlightJsonLike(line)

  const comments = lang === 'python' || lang === 'shell'
    ? '#.*'
    : lang === 'css'
      ? '/\\*.*?\\*/'
      : '//.*|/\\*.*?\\*/'
  const tokenPattern = new RegExp(
    `(${comments})|("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`)|` +
    `(\\b\\d+(?:\\.\\d+)?\\b)|(\\b[A-Za-z_$][\\w$]*\\b)|([{}()[\\].,;:+\\-*/%=&|!<>?]+)`,
    'g',
  )
  const keywords = keywordMap[lang] ?? keywordMap.javascript
  return tokenize(line, tokenPattern, (match) => {
    const token = match[0]
    if (match[1]) return 'syntax-comment'
    if (match[2]) return 'syntax-string'
    if (match[3]) return 'syntax-number'
    if (match[4]) {
      if (keywords.has(token)) return 'syntax-keyword'
      if (/^[A-Z][\w$]*$/.test(token)) return 'syntax-type'
      return undefined
    }
    if (match[5]) return 'syntax-punctuation'
    return undefined
  })
}

export function highlightCodeHtml(code: string, language?: string): string {
  const lines = code.split('\n')
  return lines.map((line) =>
    highlightLineSegments(line, language)
      .map((segment) => segment.className
        ? `<span class="${segment.className}">${escapeHtml(segment.text)}</span>`
        : escapeHtml(segment.text))
      .join(''),
  ).join('\n')
}

function tokenize(
  line: string,
  pattern: RegExp,
  classify: (match: RegExpExecArray) => string | undefined,
): HighlightSegment[] {
  const segments: HighlightSegment[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) segments.push({ text: line.slice(cursor, match.index) })
    segments.push({ text: match[0], className: classify(match) })
    cursor = match.index + match[0].length
  }
  if (cursor < line.length) segments.push({ text: line.slice(cursor) })
  return segments
}

function highlightJsonLike(line: string): HighlightSegment[] {
  const pattern = /("(?:\\.|[^"\\])*")(\s*:)?|(\b-?\d+(?:\.\d+)?\b)|\b(true|false|null)\b|[{}[\],:]/g
  return tokenize(line, pattern, (match) => {
    if (match[1]) return match[2] ? 'syntax-property' : 'syntax-string'
    if (match[3]) return 'syntax-number'
    if (match[4]) return 'syntax-keyword'
    return 'syntax-punctuation'
  })
}

function highlightHtmlLike(line: string): HighlightSegment[] {
  const pattern = /(<!--.*?-->)|(&?<\/?)([A-Za-z][\w:-]*)([^>]*)(>?)/g
  return tokenize(line, pattern, (match) => {
    if (match[1]) return 'syntax-comment'
    if (match[3]) return 'syntax-keyword'
    return undefined
  })
}
