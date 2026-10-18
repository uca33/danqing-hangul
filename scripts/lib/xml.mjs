// 极简 XML 解析器(零依赖)。
// 够用于 RSS / Atom / KCI / RISS 的响应。不处理 DTD,不展开自定义实体,因此不受 XXE、实体膨胀攻击影响。
const MAX_SIZE = 20 * 1024 * 1024;

function decode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try {
      return String.fromCodePoint(code);
    } catch {
      return m;
    }
  });
}

function parseAttrs(s) {
  const attrs = {};
  const re = /([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) attrs[m[1]] = decode(m[2] ?? m[3] ?? '');
  return attrs;
}

/** 解析 XML,返回根节点(虚拟根,children[0] 为文档元素)。节点:{name, attrs, children, text} */
export function parseXml(src) {
  if (typeof src !== 'string') throw new TypeError('XML 输入必须是字符串');
  if (src.length > MAX_SIZE) throw new RangeError('XML 太大');
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      top().text += decode(src.slice(i));
      break;
    }
    if (lt > i) top().text += decode(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      i = e < 0 ? n : e + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      top().text += src.slice(lt + 9, e < 0 ? n : e);
      i = e < 0 ? n : e + 3;
    } else if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt + 2);
      i = e < 0 ? n : e + 2;
    } else if (src.startsWith('<!', lt)) {
      const e = src.indexOf('>', lt + 2);
      i = e < 0 ? n : e + 1;
    } else if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt + 2);
      const name = src.slice(lt + 2, e < 0 ? n : e).trim();
      // 容错:向上找到同名节点再弹出
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = e < 0 ? n : e + 1;
    } else {
      // 开始标签:找不在引号内的 '>'
      let j = lt + 1;
      let q = '';
      while (j < n) {
        const c = src[j];
        if (q) {
          if (c === q) q = '';
        } else if (c === '"' || c === "'") q = c;
        else if (c === '>') break;
        j++;
      }
      let inner = src.slice(lt + 1, j);
      const selfClose = inner.endsWith('/');
      if (selfClose) inner = inner.slice(0, -1);
      const sp = inner.search(/\s/);
      const name = sp < 0 ? inner : inner.slice(0, sp);
      const node = { name, attrs: sp < 0 ? {} : parseAttrs(inner.slice(sp)), children: [], text: '' };
      top().children.push(node);
      if (!selfClose) stack.push(node);
      i = j + 1;
    }
  }
  const finish = (node) => {
    node.text = node.text.trim();
    node.children.forEach(finish);
  };
  finish(root);
  return root;
}

/** 递归收集所有指定名称的节点 */
export function findAll(node, name, out = []) {
  for (const c of node.children) {
    if (c.name === name) out.push(c);
    findAll(c, name, out);
  }
  return out;
}

/** 第一个指定名称的后代节点 */
export function find(node, name) {
  for (const c of node.children) {
    if (c.name === name) return c;
    const r = find(c, name);
    if (r) return r;
  }
  return null;
}

/** 沿路径取直接子节点,如 child(n, 'title-group', 'article-title') */
export function child(node, ...path) {
  let cur = node;
  for (const p of path) {
    if (!cur) return null;
    cur = cur.children.find((c) => c.name === p) || null;
  }
  return cur;
}

export function childrenOf(node, name) {
  return node ? node.children.filter((c) => c.name === name) : [];
}

export function textOf(node, ...path) {
  const n = path.length ? child(node, ...path) : node;
  return n ? n.text : '';
}
