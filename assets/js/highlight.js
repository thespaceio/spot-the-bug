// Minimal syntax highlighter for the game's backend code (JavaScript, Python,
// PHP), mobile code (Kotlin, Dart, Android XML) and config files (Firebase
// rules, SQL, Dockerfile, YAML, nginx).
// It builds DOM nodes with textContent only, never innerHTML, because many
// snippets deliberately contain HTML and script payloads.

const KW = {
  javascript: 'async await break case catch class const continue default delete do else export extends false finally for function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield require module',
  python: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield',
  kotlin: 'as break class companion const continue data do else enum false for fun if import in interface is lateinit lazy null object open override package private protected public return sealed super suspend this throw true try typealias val var when while by',
  dart: 'abstract as async await break case catch class const continue default else enum extends false final finally for if import in is late new null required return static super switch this throw true try var void while with',
  rules: 'allow if match service function return let true false null in is rules_version',
  sql: 'add alter and as by cascade check create default delete drop enable exists for foreign from grant in insert into is key level not null on or policy primary references revoke row security select set table to true false update using values where with',
  dockerfile: 'FROM AS RUN CMD COPY ADD ENV ARG WORKDIR USER EXPOSE ENTRYPOINT LABEL VOLUME HEALTHCHECK SHELL',
  yaml: 'true false null yes no on',
  nginx: 'server listen server_name root index location alias autoindex proxy_pass try_files include fastcgi_pass fastcgi_param ssl_certificate ssl_certificate_key return deny allow expires internal auth_request http2 ssl on off',
  php: 'array as break case catch class const continue declare default do echo else elseif empty endforeach endif exit false finally fn for foreach function global if include isset list match new null print private protected public require require_once return static switch throw true try use while',
};

const STR = String.raw`'(?:\\.|[^'\\])*'?|"(?:\\.|[^"\\])*"?`;

const RULES = {
  javascript: new RegExp(String.raw`(?<comment>\/\/.*$|\/\*.*?\*\/)|(?<string>${STR}|` + '`(?:\\\\.|[^`\\\\])*`?' + String.raw`)|(?<number>\b\d[\d_]*(?:\.\d+)?(?:e\d+)?\b)|(?<word>[A-Za-z_$][\w$]*)`, 'g'),
  python: new RegExp(String.raw`(?<comment>#.*$)|(?<string>[rRbBfFuU]{0,2}(?:${STR}))|(?<deco>@[A-Za-z_][\w.]*)|(?<number>\b\d[\d_]*(?:\.\d+)?\b)|(?<word>[A-Za-z_]\w*)`, 'g'),
  php: new RegExp(String.raw`(?<tag><\?php|<\?=|\?>|<\/?[a-zA-Z][\w-]*>?)|(?<comment>\/\/.*$|#.*$|\/\*.*?\*\/)|(?<string>${STR})|(?<variable>\$[A-Za-z_]\w*)|(?<number>\b\d[\d_]*(?:\.\d+)?\b)|(?<word>[A-Za-z_]\w*)`, 'g'),
};

// Config and markup languages: comments, strings, numbers and their own names.
const C_LIKE = (extra = '') => new RegExp(String.raw`(?<comment>\/\/.*$|\/\*.*?\*\/)|(?<string>${STR})${extra}|(?<number>\b\d[\d_]*(?:\.\d+)?\b)|(?<word>[A-Za-z_$][\w$]*)`, 'g');
RULES.kotlin = C_LIKE(String.raw`|(?<deco>@[A-Za-z_]\w*)`);
RULES.dart = C_LIKE(String.raw`|(?<deco>@[A-Za-z_]\w*)`);
RULES.rules = C_LIKE();
RULES.sql = new RegExp(String.raw`(?<comment>--.*$)|(?<string>'(?:''|[^'])*'?)|(?<number>\b\d+\b)|(?<word>[A-Za-z_][\w.]*)`, 'gi');
RULES.dockerfile = new RegExp(String.raw`(?<comment>^\s*#.*$)|(?<string>${STR})|(?<variable>\$\{?\w+\}?)|(?<number>\b\d+\b)|(?<word>[A-Za-z_][\w-]*)`, 'g');
RULES.yaml = new RegExp(String.raw`(?<comment>(?:^|\s)#.*$)|(?<variable>\$\{\{.*?\}\})|(?<key>[\w.\-/]+(?=\s*:(?:\s|$)))|(?<string>${STR})|(?<number>\b\d[\d.]*\b)|(?<word>[A-Za-z_][\w-]*)`, 'g');
RULES.nginx = new RegExp(String.raw`(?<comment>#.*$)|(?<string>${STR})|(?<variable>\$\w+)|(?<number>\b\d+[smhd]?\b)|(?<word>[A-Za-z_/.][\w./-]*)`, 'g');   // a path is one word
RULES.xml = new RegExp(String.raw`(?<comment><!--.*?-->|<!--.*$)|(?<tag><\/?[\w.:-]+|\/?>|<\?xml|\?>)|(?<key>[\w.:-]+(?==))|(?<string>"[^"]*"?)`, 'g');

const keywordSets = Object.fromEntries(Object.entries(KW).map(([k, v]) => [k, new Set(v.split(' '))]));
keywordSets.sql = new Set(KW.sql.split(' '));   // matched case-insensitively below
keywordSets.xml = new Set();

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
      if (keywords.has(language === 'sql' ? g.word.toLowerCase() : g.word)) frag.append(span('keyword', g.word));
      else if (after.startsWith('(')) frag.append(span('fn', g.word));
      else frag.append(document.createTextNode(g.word));
    } else {
      const cls = Object.keys(g).find((k) => g[k] !== undefined);
      frag.append(span(cls === 'key' ? 'fn' : cls, m[0]));
    }
    last = rule.lastIndex;
  }
  if (last < text.length) frag.append(document.createTextNode(text.slice(last)));
  return frag;
}

export const LANGUAGE_LABEL = {
  javascript: 'JavaScript', python: 'Python', php: 'PHP',
  kotlin: 'Kotlin', dart: 'Dart', xml: 'Android XML',
  rules: 'Security Rules', sql: 'SQL', dockerfile: 'Dockerfile', yaml: 'YAML', nginx: 'nginx',
};
