// A tiny PDF maker for tests: one page per label, big text on a coloured page (pdf.js can draw it with its standard fonts)
export function makePdf(labels) {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesRef = add('PAGES');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const kids = [];
  labels.forEach((label, i) => {
    const hue = [[0.9, 0.3, 0.3], [0.2, 0.6, 0.9], [0.3, 0.75, 0.4], [0.95, 0.75, 0.2]][i % 4];
    const content = `${hue.join(' ')} rg 0 0 640 400 re f 1 1 1 rg BT /F1 72 Tf 60 170 Td (${label}) Tj ET`;
    const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 640 400] /Contents ${c} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`));
  });
  objs[pagesRef - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const offsets = [];
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
