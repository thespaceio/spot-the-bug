// Minimal syntax highlighter for JavaScript, Python and PHP.
// It builds DOM nodes with textContent only, never innerHTML, because many
// snippets deliberately contain HTML and script payloads.

const KW = {
  javascript: 'async await break case catch class const continue default delete do else export extends false finally for function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield require module',
  python: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield',
  php: 'array as break case catch class const continue declare default do echo else elseif empty endforeach endif exit false finally fn for foreach function global if include isset list match new null print private protected public require require_once return static switch throw true try use while',
};

const STR = String.raw`'(?:\\.|[^'\\])*'?|"(?:\\.|[^"\\])*"?`;

const RULES = {
  javascript: new RegExp(String.raw`(?<comment>\/\/.*$|\/\*.*?\*\/)|(?<string>${STR}|` + '`(?:\\\\.|[^`\\\\])*`?' + String.raw`)|(?<number>\b\d[\d_]*(?:\.\d+)?(?:e\d+)?\b)|(?<word>[A-Za-z_$][\w$]*)`, 'g'),
  python: new RegExp(String.raw`(?<comment>#.*$)|(?<string>[rRbBfFuU]{0,2}(?:${STR}))|(?<deco>@[A-Za-z_][\w.]*)|(?<number>\b\d[\d_]*(?:\.\d+)?\b)|(?<word>[A-Za-z_]\w*)`, 'g'),
  php: new RegExp(String.raw`(?<tag><\?php|<\?=|\?>|<\/?[a-zA-Z][\w-]*>?)|(?<comment>\/\/.*$|#.*$|\/\*.*?\*\/)|(?<string>${STR})|(?<variable>\$[A-Za-z_]\w*)|(?<number>\b\d[\d_]*(?:\.\d+)?\b)|(?<word>[A-Za-z_]\w*)`, 'g'),
};

const keywordSets = Object.fromEntries(Object.entries(KW).map(([k, v]) => [k, new Set(v.split(' '))]));

function span(cls, text) {
  const el = document.createElement('span');
  el.className = `tok-${cls}`;
  el.textContent = text;
  return el;
}

export function highlightLine(text, language) {
  const frag = document.createDocumentFragment();
  const rule = RULES[language];
  if (!rule) {
    frag.append(document.createTextNode(text));
    return frag;
  }
  const keywords = keywordSets[language];
  rule.lastIndex = 0;
  let last = 0;
  let m;
  while ((m = rule.exec(text)) !== null) {
    if (m[0] === '') { rule.lastIndex++; continue; }
    if (m.index > last) frag.append(document.createTextNode(text.slice(last, m.index)));
    const g = m.groups;
    if (g.word !== undefined) {
      const after = text.slice(rule.lastIndex).trimStart();
      if (keywords.has(g.word)) frag.append(span('keyword', g.word));
      else if (after.startsWith('(')) frag.append(span('fn', g.word));
      else frag.append(document.createTextNode(g.word));
    } else {
      const cls = Object.keys(g).find((k) => g[k] !== undefined);
      frag.append(span(cls, m[0]));
    }
    last = rule.lastIndex;
  }
  if (last < text.length) frag.append(document.createTextNode(text.slice(last)));
  return frag;
}

export const LANGUAGE_LABEL = { javascript: 'JavaScript', python: 'Python', php: 'PHP' };
