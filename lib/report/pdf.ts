import type { NormalizedSnapshot, ReportAnalysis } from "./types";

const WIDTH = 1240;
const HEIGHT = 1754;
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const encoder = new TextEncoder();

function canvasContext() {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("O navegador não conseguiu preparar o PDF.");
  return { canvas, context };
}

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 20,
) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let lineIndex = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, y + lineIndex * lineHeight);
      lineIndex += 1;
      line = word;
      if (lineIndex >= maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (line && lineIndex < maxLines) {
    context.fillText(line, x, y + lineIndex * lineHeight);
    lineIndex += 1;
  }
  return y + lineIndex * lineHeight;
}

function basePage(
  context: CanvasRenderingContext2D,
  snapshot: NormalizedSnapshot,
  page: number,
  title: string,
  kicker: string,
) {
  context.fillStyle = "#f9fafc";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#5675f5";
  context.fillRect(78, 68, 18, 18);
  context.fillStyle = "#17191d";
  context.font = "700 22px 'Google Sans Flex', Arial";
  context.fillText("PROJETO WASHINGTON", 112, 86);
  context.textAlign = "right";
  context.fillStyle = "#68707e";
  context.font = "500 18px 'Google Sans Flex', Arial";
  context.fillText(`${snapshot.config.objective === "ecommerce" ? "E-commerce" : "Leads"}  •  Página ${page} de 5`, WIDTH - 78, 86);
  context.textAlign = "left";
  context.strokeStyle = "#dfe4eb";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(78, 118);
  context.lineTo(WIDTH - 78, 118);
  context.stroke();
  context.fillStyle = "#5675f5";
  context.font = "700 18px 'Google Sans Flex', Arial";
  context.fillText(kicker.toUpperCase(), 78, 174);
  context.fillStyle = "#17191d";
  context.font = "700 54px 'Google Sans Flex', Arial";
  context.fillText(title, 78, 238);
  context.fillStyle = "#68707e";
  context.font = "400 17px 'Google Sans Flex', Arial";
  context.fillText(
    `${snapshot.config.clientName}  •  ${snapshot.config.period.start} a ${snapshot.config.period.end}`,
    78,
    278,
  );
  context.fillStyle = "#68707e";
  context.font = "400 16px 'Google Sans Flex', Arial";
  context.fillText(
    `Meta Ads  •  ${snapshot.account.currency}  •  ${snapshot.account.timezone}`,
    78,
    HEIGHT - 62,
  );
}

function card(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#dfe4eb";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(x, y, width, height, 22);
  context.fill();
  context.stroke();
}

function metricRefs(snapshot: NormalizedSnapshot) {
  return snapshot.config.objective === "ecommerce"
    ? ["account.spend", "account.purchaseValue", "account.roas", "account.costPerPurchase"]
    : ["account.spend", "account.leads", "account.costPerLead", "account.ctr"];
}

async function renderPages(snapshot: NormalizedSnapshot, analysis: ReportAnalysis) {
  const pages: Blob[] = [];

  {
    const { canvas, context } = canvasContext();
    basePage(context, snapshot, 1, snapshot.config.clientName, "Resumo executivo");
    context.fillStyle = "#17191d";
    context.font = "500 29px 'Google Sans Flex', Arial";
    drawText(context, analysis.executiveSummary, 78, 350, WIDTH - 156, 42, 6);
    const refs = metricRefs(snapshot);
    refs.forEach((ref, index) => {
      const item = snapshot.evidence[ref];
      const x = 78 + (index % 2) * 550;
      const y = 590 + Math.floor(index / 2) * 225;
      card(context, x, y, 520, 185);
      context.fillStyle = "#68707e";
      context.font = "500 20px 'Google Sans Flex', Arial";
      context.fillText(item.label, x + 28, y + 44);
      context.fillStyle = "#17191d";
      context.font = "700 44px 'Google Sans Flex', Arial";
      context.fillText(item.formattedCurrent, x + 28, y + 105);
      context.fillStyle = item.percentChange !== null && item.percentChange < 0 ? "#c86f16" : "#12835f";
      context.font = "600 20px 'Google Sans Flex', Arial";
      context.fillText(`${item.formattedPercentChange} vs. anterior`, x + 28, y + 148);
    });
    context.fillStyle = "#68707e";
    context.font = "500 20px 'Google Sans Flex', Arial";
    context.fillText(`Qualidade dos dados: ${snapshot.quality.score}%`, 78, 1130);
    pages.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao renderizar página.")), "image/jpeg", 0.92)));
  }

  {
    const { canvas, context } = canvasContext();
    basePage(context, snapshot, 2, "Indicadores e diagnóstico", "O que mudou");
    let y = 350;
    context.fillStyle = "#17191d";
    for (const fact of analysis.facts.slice(0, 5)) {
      card(context, 78, y - 34, WIDTH - 156, 126);
      context.fillStyle = "#5675f5";
      context.font = "700 17px 'Google Sans Flex', Arial";
      context.fillText("FATO", 106, y);
      context.fillStyle = "#17191d";
      context.font = "500 22px 'Google Sans Flex', Arial";
      drawText(context, fact.text, 106, y + 38, WIDTH - 212, 31, 2);
      y += 152;
    }
    context.fillStyle = "#17191d";
    context.font = "700 28px 'Google Sans Flex', Arial";
    context.fillText("Leitura", 78, y + 24);
    context.font = "400 23px 'Google Sans Flex', Arial";
    for (const interpretation of analysis.interpretations.slice(0, 3)) {
      y = drawText(context, interpretation.text, 78, y + 70, WIDTH - 156, 34, 4) + 18;
    }
    pages.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao renderizar página.")), "image/jpeg", 0.92)));
  }

  {
    const { canvas, context } = canvasContext();
    basePage(context, snapshot, 3, "Campanhas e exceções", "Onde o resultado aconteceu");
    let y = 350;
    for (const campaign of snapshot.campaigns.slice(0, 7)) {
      card(context, 78, y - 34, WIDTH - 156, 138);
      context.fillStyle = "#17191d";
      context.font = "700 22px 'Google Sans Flex', Arial";
      context.fillText(campaign.name.slice(0, 58), 106, y + 3);
      context.fillStyle = "#68707e";
      context.font = "500 18px 'Google Sans Flex', Arial";
      const efficiency = snapshot.evidence[`campaign.${campaign.id}.${snapshot.config.objective === "ecommerce" ? "roas" : "costPerLead"}`];
      const spend = snapshot.evidence[`campaign.${campaign.id}.spend`];
      context.fillText(`Investimento: ${spend.formattedCurrent}`, 106, y + 47);
      context.fillText(`${efficiency.label}: ${efficiency.formattedCurrent}`, 480, y + 47);
      context.fillStyle = campaign.classification === "attention" ? "#c86f16" : campaign.classification === "highlight" ? "#12835f" : "#68707e";
      context.font = "600 18px 'Google Sans Flex', Arial";
      context.fillText(campaign.classification.replaceAll("_", " "), 900, y + 47);
      y += 162;
    }
    pages.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao renderizar página.")), "image/jpeg", 0.92)));
  }

  {
    const { canvas, context } = canvasContext();
    basePage(context, snapshot, 4, "Ações prioritárias", "O que avaliar primeiro");
    let y = 365;
    analysis.recommendations.slice(0, 3).forEach((recommendation, index) => {
      card(context, 78, y - 42, WIDTH - 156, 330);
      context.fillStyle = "#5675f5";
      context.font = "700 42px 'Google Sans Flex', Arial";
      context.fillText(String(index + 1).padStart(2, "0"), 106, y + 12);
      context.fillStyle = "#17191d";
      context.font = "700 27px 'Google Sans Flex', Arial";
      let innerY = drawText(context, recommendation.action, 178, y, WIDTH - 290, 35, 3) + 20;
      context.fillStyle = "#4f5663";
      context.font = "400 19px 'Google Sans Flex', Arial";
      innerY = drawText(context, `Por quê: ${recommendation.rationale}`, 178, innerY, WIDTH - 290, 28, 3) + 12;
      drawText(context, `Cuidado: ${recommendation.risk}`, 178, innerY, WIDTH - 290, 28, 3);
      y += 365;
    });
    pages.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao renderizar página.")), "image/jpeg", 0.92)));
  }

  {
    const { canvas, context } = canvasContext();
    basePage(context, snapshot, 5, "Metodologia e limitações", "Até onde confiar");
    const methodology = [
      `Fonte: ${snapshot.source}`,
      `Período: ${snapshot.config.period.start} a ${snapshot.config.period.end}`,
      `Moeda e fuso: ${snapshot.account.currency} • ${snapshot.account.timezone}`,
      `Atribuição: ${snapshot.account.attribution.description}`,
      `Qualidade dos dados: ${snapshot.quality.score}% • ${snapshot.quality.status}`,
      `Snapshot: ${snapshot.sourceHash.slice(0, 16)}`,
    ];
    let y = 355;
    context.font = "500 23px 'Google Sans Flex', Arial";
    context.fillStyle = "#17191d";
    for (const item of methodology) {
      context.fillText(`• ${item}`, 92, y);
      y += 48;
    }
    context.font = "700 28px 'Google Sans Flex', Arial";
    context.fillText("Limitações declaradas", 78, y + 38);
    context.font = "400 22px 'Google Sans Flex', Arial";
    for (const limitation of analysis.limitations) {
      y = drawText(context, `• ${limitation}`, 92, y + 88, WIDTH - 184, 33, 4) + 8;
    }
    pages.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao renderizar página.")), "image/jpeg", 0.92)));
  }

  return Promise.all(pages.map(async (page) => new Uint8Array(await page.arrayBuffer())));
}

function concat(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function textBytes(value: string) {
  return encoder.encode(value);
}

function buildPdf(images: Uint8Array[]) {
  const objectCount = 2 + images.length * 3;
  const objects = new Map<number, Uint8Array>();
  const pageIds = images.map((_, index) => 3 + index * 3);
  objects.set(1, textBytes("<< /Type /Catalog /Pages 2 0 R >>"));
  objects.set(2, textBytes(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${images.length} >>`));

  images.forEach((image, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    objects.set(
      pageId,
      textBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`),
    );
    objects.set(
      imageId,
      concat([
        textBytes(`<< /Type /XObject /Subtype /Image /Width ${WIDTH} /Height ${HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`),
        image,
        textBytes("\nendstream"),
      ]),
    );
    const content = `q\n${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm\n/Im0 Do\nQ\n`;
    objects.set(contentId, textBytes(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`));
  });

  const parts: Uint8Array[] = [textBytes("%PDF-1.4\n%âãÏÓ\n")];
  const offsets = new Array<number>(objectCount + 1).fill(0);
  let offset = parts[0].length;
  for (let id = 1; id <= objectCount; id += 1) {
    const body = objects.get(id);
    if (!body) throw new Error(`Objeto PDF ausente: ${id}`);
    const prefix = textBytes(`${id} 0 obj\n`);
    const suffix = textBytes("\nendobj\n");
    offsets[id] = offset;
    parts.push(prefix, body, suffix);
    offset += prefix.length + body.length + suffix.length;
  }
  const xrefOffset = offset;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objectCount; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(textBytes(xref));
  return new Blob([concat(parts)], { type: "application/pdf" });
}

export async function createReportPdf(snapshot: NormalizedSnapshot, analysis: ReportAnalysis) {
  return buildPdf(await renderPages(snapshot, analysis));
}

export function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
