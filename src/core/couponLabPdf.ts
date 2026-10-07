import type { CouponSnapshot } from './couponLabDomain';

const esc=(value:string)=>value.split('\\').join('\\\\').split('(').join('\\(').split(')').join('\\)');
export function renderCouponPdf(snapshot:CouponSnapshot):Uint8Array {
  const rows:string[]=[];
  rows.push('BET BUILDER | COUPON LAB');
  rows.push(`Data: ${snapshot.createdAt}`);
  rows.push(`Kurs: x${snapshot.coupon.combinedOdds.toFixed(2)} | Stawka: ${snapshot.stake.toFixed(2)} PLN`);
  rows.push(`Potencjalny zwrot: ${snapshot.coupon.potentialReturn.toFixed(2)} PLN | Zysk: ${snapshot.coupon.potentialProfit.toFixed(2)} PLN`);
  rows.push(`Profil ryzyka: ${snapshot.risk.profile}`);
  rows.push('---');
  for(const [i,leg] of snapshot.coupon.legs.entries()){
    const ex=snapshot.explanation.find(e=>e.selectionId===leg.selectionId);
    rows.push(`${i+1}. ${leg.eventLabel}`);
    rows.push(`   Rynek: ${leg.label} | Kurs: x${leg.marketOdds.toFixed(2)} | P: ${(leg.probability*100).toFixed(1)}% | Edge: ${(leg.edge*100).toFixed(1)}%`);
    if(ex) rows.push(`   AI: ${ex.short}`);
  }
  rows.push('---');
  rows.push(`Źródło: ${String((snapshot.provenance as {provider?:string})?.provider ?? 'unknown')}`);
  rows.push(`Timestamp danych: ${String((snapshot.provenance as {normalizedAt?:string})?.normalizedAt ?? 'unknown')}`);
  rows.push(`Certification: ${String((snapshot.certification as {status?:string})?.status ?? 'unknown')}`);
  rows.push('Kupon jest propozycją analityczną. Automatyczne obstawienie pozostaje wyłączone.');
  const stream=rows.map((r,i)=>`BT /F1 9 Tf 36 ${790-i*18} Td (${esc(r.slice(0,120))}) Tj ET`).join(' ');
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf='%PDF-1.4\n'; const offsets=[0]; 
  for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=pdf.length; pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i++) pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
export function pdfBase64(snapshot:CouponSnapshot){return Buffer.from(renderCouponPdf(snapshot)).toString('base64');}
