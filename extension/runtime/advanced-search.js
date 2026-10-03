// Structured filters stay in the same input. Values are Datalog parameters,
// never query source; regex metacharacters are escaped as literal text.
export function parseSearch(value) {
  const result = {terms: [], exclude: [], page: null, refs: [], type: null, advanced: false};
  if (value.length > 512) throw new Error('Keep the search under 512 characters.');
  let rest = value.trim();
  while (rest) {
    const prefix = rest.match(/^(in:|ref:|type:|-)/i)?.[0] || '';
    rest = rest.slice(prefix.length);
    let token, consumed;
    if (rest.startsWith('"')) {
      const match = rest.match(/^"((?:\\.|[^"\\])*)"/);
      if (!match) throw new Error('Close the quote to search.');
      token = match[1].replace(/\\(["\\])/g, '$1'); consumed = match[0].length; result.advanced = true;
    } else if (rest.startsWith('[[')) {
      const end = rest.indexOf(']]');
      if (end < 0) throw new Error('Close the page reference with ]].');
      token = rest.slice(2, end); consumed = end + 2;
    } else {token = rest.match(/^\S*/)[0]; consumed = token.length;}
    if (!token) throw new Error('Add a value after the filter.');
    rest = rest.slice(consumed);
    if (rest && !/^\s/.test(rest)) throw new Error('Separate search terms with spaces.');
    rest = rest.trimStart();
    if (prefix) result.advanced = true;
    switch (prefix.toLowerCase()) {
      case 'in:': result.page = token; break;
      case 'ref:': result.refs.push(token); break;
      case 'type:':
        if (!['page', 'block'].includes(token.toLowerCase())) throw new Error('Use type:page or type:block.');
        result.type = token.toLowerCase(); break;
      case '-': result.exclude.push(token); break;
      default: result.terms.push(token);
    }
    if (result.terms.length + result.exclude.length + result.refs.length > 12) throw new Error('Use up to 12 search terms.');
  }
  return result;
}
const literal = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function advancedQuery(spec) {
  const inputs = [], values = [], clauses = [];
  const bind = value => {const name = `?arg${inputs.length}`; inputs.push(name); values.push(value); return name;};
  // A page's containing page is itself; a block's is its :block/page.
  clauses.push(`(or-join [?e ?text ?kind ?page]
    (and [?e :node/title ?text] [(ground "page") ?kind] [(identity ?e) ?page])
    (and [?e :block/string ?text] [?e :block/page ?page] [(ground "block") ?kind]))`);
  clauses.push('[?e :block/uid ?uid]', '[?page :node/title ?pageTitle]');
  if (spec.type) clauses.push(`[(= ?kind ${bind(spec.type)})]`);
  if (spec.page) clauses.push(`[(= ?pageTitle ${bind(spec.page)})]`);
  for (const title of spec.refs) {
    const ref = `?ref${inputs.length}`;
    clauses.push(`[${ref} :node/title ${bind(title)}]`, `[?e :block/refs ${ref}]`);
  }
  for (const [text, exclude] of [...spec.terms.map(t => [t, false]), ...spec.exclude.map(t => [t, true])]) {
    const regex = `?re${inputs.length}`, value = bind(`(?i)${literal(text)}`);
    clauses.push(`[(re-pattern ${value}) ${regex}]`);
    clauses.push(exclude ? `(not [(re-find ${regex} ?text)])` : `[(re-find ${regex} ?text)]`);
  }
  return {query: `[:find ?uid ?text ?kind ?pageTitle :in $ ${inputs.join(' ')} :where ${clauses.join(' ')} :timeout 2000]`, values};
}
export async function advancedSearch(api, spec) {
  const owner = api?.data?.async;
  if (typeof owner?.q !== 'function') throw new Error('Advanced filters need Roam’s async query API.');
  const {query, values} = advancedQuery(spec);
  const rows = await owner.q(query, ...values);
  return (Array.isArray(rows) ? rows : []).slice(0, 40).map(([uid, label, kind, page]) => ({uid, label, kind, detail: kind === 'page' ? 'Page' : page}));
}
