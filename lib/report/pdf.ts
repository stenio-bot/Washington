import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { NormalizedSnapshot, ReportAnalysis } from "./types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const colors = {
  paper: rgb(0.976, 0.98, 0.988),
  white: rgb(1, 1, 1),
  ink: rgb(0.09, 0.098, 0.114),
  muted: rgb(0.36, 0.392, 0.447),
  line: rgb(0.87, 0.89, 0.92),
  accent: rgb(0.337, 0.459, 0.961),
  positive: rgb(0.071, 0.514, 0.373),
  warning: rgb(0.784, 0.435, 0.086),
};

function safeText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[•●▪]/g, "-")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function fitText(font: PDFFont, value: string, size: number, maxWidth: number) {
  const normalized = safeText(value);
  if (font.widthOfTextAtSize(normalized, size) <= maxWidth) return normalized;
  let output = normalized;
  while (output.length > 1 && font.widthOfTextAtSize(`${output}...`, size) > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output.trimEnd()}...`;
}

function wrappedLines(font: PDFFont, value: string, size: number, maxWidth: number, maxLines: number) {
  const words = safeText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  let consumed = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
      consumed += 1;
      continue;
    }
    lines.push(line);
    if (lines.length === maxLines) break;
    line = word;
    consumed += 1;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (consumed < words.length && lines.length > 0) {
    lines[lines.length - 1] = fitText(font, `${lines.at(-1)}...`, size, maxWidth);
  }
  return lines;
}

function drawWrapped(
  page: PDFPage,
  font: PDFFont,
  value: string,
  options: {
    x: number;
    y: number;
    width: number;
    size: number;
    lineHeight: number;
    maxLines: number;
    color?: ReturnType<typeof rgb>;
  },
) {
  const lines = wrappedLines(font, value, options.size, options.width, options.maxLines);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: options.x,
      y: options.y - index * options.lineHeight,
      size: options.size,
      font,
      color: options.color ?? colors.ink,
    });
  });
  return options.y - lines.length * options.lineHeight;
}

function drawCard(page: PDFPage, x: number, y: number, width: number, height: number) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: colors.white,
    borderColor: colors.line,
    borderWidth: 0.8,
  });
}

function drawBase(
  page: PDFPage,
  fonts: { regular: PDFFont; medium: PDFFont; bold: PDFFont },
  snapshot: NormalizedSnapshot,
  pageNumber: number,
  title: string,
  kicker: string,
) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: colors.paper });
  page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - 52, width: 9, height: 9, color: colors.accent });
  page.drawText("PROJETO WASHINGTON", {
    x: MARGIN + 17,
    y: PAGE_HEIGHT - 52,
    size: 10,
    font: fonts.bold,
    color: colors.ink,
  });
  const objective = snapshot.config.objective === "ecommerce" ? "E-commerce" : "Leads";
  const pageLabel = `${objective}  |  Página ${pageNumber} de 5`;
  page.drawText(pageLabel, {
    x: PAGE_WIDTH - MARGIN - fonts.medium.widthOfTextAtSize(pageLabel, 9),
    y: PAGE_HEIGHT - 52,
    size: 9,
    font: fonts.medium,
    color: colors.muted,
  });
  page.drawLine({
    start: { x: MARGIN, y: PAGE_HEIGHT - 67 },
    end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 67 },
    thickness: 0.8,
    color: colors.line,
  });
  page.drawText(safeText(kicker.toUpperCase()), {
    x: MARGIN,
    y: PAGE_HEIGHT - 98,
    size: 9,
    font: fonts.bold,
    color: colors.accent,
  });
  page.drawText(fitText(fonts.bold, title, 26, CONTENT_WIDTH), {
    x: MARGIN,
    y: PAGE_HEIGHT - 133,
    size: 26,
    font: fonts.bold,
    color: colors.ink,
  });
  page.drawText(
    fitText(
      fonts.regular,
      `${snapshot.config.clientName}  |  ${snapshot.config.period.start} a ${snapshot.config.period.end}`,
      9,
      CONTENT_WIDTH,
    ),
    { x: MARGIN, y: PAGE_HEIGHT - 153, size: 9, font: fonts.regular, color: colors.muted },
  );
  page.drawText(
    fitText(
      fonts.regular,
      `Meta Ads  |  ${snapshot.account.currency}  |  ${snapshot.account.timezone}`,
      8,
      CONTENT_WIDTH,
    ),
    { x: MARGIN, y: 28, size: 8, font: fonts.regular, color: colors.muted },
  );
}

function metricRefs(snapshot: NormalizedSnapshot) {
  return snapshot.config.objective === "ecommerce"
    ? ["account.spend", "account.purchaseValue", "account.roas", "account.costPerPurchase"]
    : ["account.spend", "account.leads", "account.costPerLead", "account.ctr"];
}

function addSummaryPage(
  document: PDFDocument,
  fonts: { regular: PDFFont; medium: PDFFont; bold: PDFFont },
  snapshot: NormalizedSnapshot,
  analysis: ReportAnalysis,
) {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawBase(page, fonts, snapshot, 1, snapshot.config.clientName, "Resumo executivo");
  drawWrapped(page, fonts.medium, analysis.executiveSummary, {
    x: MARGIN,
    y: 646,
    width: CONTENT_WIDTH,
    size: 14,
    lineHeight: 20,
    maxLines: 5,
  });

  const gap = 12;
  const cardWidth = (CONTENT_WIDTH - gap) / 2;
  metricRefs(snapshot).forEach((ref, index) => {
    const metric = snapshot.evidence[ref];
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + column * (cardWidth + gap);
    const y = 430 - row * 116;
    drawCard(page, x, y, cardWidth, 98);
    page.drawText(fitText(fonts.medium, metric.label, 9, cardWidth - 24), {
      x: x + 12,
      y: y + 72,
      size: 9,
      font: fonts.medium,
      color: colors.muted,
    });
    page.drawText(fitText(fonts.bold, metric.formattedCurrent, 21, cardWidth - 24), {
      x: x + 12,
      y: y + 39,
      size: 21,
      font: fonts.bold,
      color: colors.ink,
    });
    const change = `${metric.formattedPercentChange} vs. anterior`;
    page.drawText(fitText(fonts.medium, change, 9, cardWidth - 24), {
      x: x + 12,
      y: y + 14,
      size: 9,
      font: fonts.medium,
      color:
        metric.percentChange !== null && metric.percentChange < 0
          ? colors.warning
          : colors.positive,
    });
  });
  page.drawText(`Qualidade dos dados: ${snapshot.quality.score}%`, {
    x: MARGIN,
    y: 274,
    size: 10,
    font: fonts.medium,
    color: colors.muted,
  });
}

function addDiagnosisPage(
  document: PDFDocument,
  fonts: { regular: PDFFont; medium: PDFFont; bold: PDFFont },
  snapshot: NormalizedSnapshot,
  analysis: ReportAnalysis,
) {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawBase(page, fonts, snapshot, 2, "Indicadores e diagnóstico", "O que mudou");
  let y = 642;
  for (const fact of analysis.facts.slice(0, 5)) {
    drawCard(page, MARGIN, y - 47, CONTENT_WIDTH, 62);
    page.drawText("FATO", { x: MARGIN + 12, y: y - 10, size: 8, font: fonts.bold, color: colors.accent });
    drawWrapped(page, fonts.medium, fact.text, {
      x: MARGIN + 58,
      y: y - 9,
      width: CONTENT_WIDTH - 72,
      size: 10,
      lineHeight: 14,
      maxLines: 3,
    });
    y -= 73;
  }
  page.drawText("Leitura", { x: MARGIN, y: y - 2, size: 15, font: fonts.bold, color: colors.ink });
  y -= 30;
  for (const interpretation of analysis.interpretations.slice(0, 3)) {
    y = drawWrapped(page, fonts.regular, interpretation.text, {
      x: MARGIN,
      y,
      width: CONTENT_WIDTH,
      size: 11,
      lineHeight: 16,
      maxLines: 4,
      color: colors.muted,
    }) - 12;
  }
}

function addCampaignPage(
  document: PDFDocument,
  fonts: { regular: PDFFont; medium: PDFFont; bold: PDFFont },
  snapshot: NormalizedSnapshot,
) {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawBase(page, fonts, snapshot, 3, "Campanhas e exceções", "Onde o resultado aconteceu");
  let y = 641;
  const metricKey = snapshot.config.objective === "ecommerce" ? "roas" : "costPerLead";
  for (const campaign of snapshot.campaigns.slice(0, 7)) {
    drawCard(page, MARGIN, y - 56, CONTENT_WIDTH, 67);
    page.drawText(fitText(fonts.bold, campaign.name, 10, CONTENT_WIDTH - 24), {
      x: MARGIN + 12,
      y: y - 10,
      size: 10,
      font: fonts.bold,
      color: colors.ink,
    });
    const spend = snapshot.evidence[`campaign.${campaign.id}.spend`];
    const efficiency = snapshot.evidence[`campaign.${campaign.id}.${metricKey}`];
    page.drawText(`Investimento: ${spend.formattedCurrent}`, {
      x: MARGIN + 12,
      y: y - 31,
      size: 9,
      font: fonts.regular,
      color: colors.muted,
    });
    page.drawText(`${safeText(efficiency.label)}: ${efficiency.formattedCurrent}`, {
      x: MARGIN + 174,
      y: y - 31,
      size: 9,
      font: fonts.regular,
      color: colors.muted,
    });
    const classification = {
      highlight: "Destaque",
      attention: "Atenção",
      stable: "Estável",
      insufficient_volume: "Volume insuficiente",
    }[campaign.classification];
    page.drawText(fitText(fonts.medium, classification, 8, 100), {
      x: PAGE_WIDTH - MARGIN - 100,
      y: y - 31,
      size: 8,
      font: fonts.medium,
      color:
        campaign.classification === "attention"
          ? colors.warning
          : campaign.classification === "highlight"
            ? colors.positive
            : colors.muted,
    });
    y -= 78;
  }
}

function addActionsPage(
  document: PDFDocument,
  fonts: { regular: PDFFont; medium: PDFFont; bold: PDFFont },
  snapshot: NormalizedSnapshot,
  analysis: ReportAnalysis,
) {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawBase(page, fonts, snapshot, 4, "Ações prioritárias", "O que avaliar primeiro");
  let y = 635;
  analysis.recommendations.slice(0, 3).forEach((recommendation, index) => {
    drawCard(page, MARGIN, y - 147, CONTENT_WIDTH, 164);
    page.drawText(String(index + 1).padStart(2, "0"), {
      x: MARGIN + 14,
      y: y - 20,
      size: 22,
      font: fonts.bold,
      color: colors.accent,
    });
    let innerY = drawWrapped(page, fonts.bold, recommendation.action, {
      x: MARGIN + 56,
      y: y - 8,
      width: CONTENT_WIDTH - 70,
      size: 12,
      lineHeight: 16,
      maxLines: 3,
    });
    innerY = drawWrapped(page, fonts.regular, `Por quê: ${recommendation.rationale}`, {
      x: MARGIN + 56,
      y: innerY - 7,
      width: CONTENT_WIDTH - 70,
      size: 9,
      lineHeight: 13,
      maxLines: 2,
      color: colors.muted,
    });
    innerY = drawWrapped(page, fonts.regular, `Risco: ${recommendation.risk}`, {
      x: MARGIN + 56,
      y: innerY - 5,
      width: CONTENT_WIDTH - 70,
      size: 9,
      lineHeight: 13,
      maxLines: 2,
      color: colors.muted,
    });
    drawWrapped(page, fonts.regular, `Validação: ${recommendation.validation}`, {
      x: MARGIN + 56,
      y: innerY - 5,
      width: CONTENT_WIDTH - 70,
      size: 9,
      lineHeight: 13,
      maxLines: 2,
      color: colors.muted,
    });
    y -= 180;
  });
}

function addMethodPage(
  document: PDFDocument,
  fonts: { regular: PDFFont; medium: PDFFont; bold: PDFFont },
  snapshot: NormalizedSnapshot,
  analysis: ReportAnalysis,
) {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawBase(page, fonts, snapshot, 5, "Metodologia e limitações", "Até onde confiar");
  const methodology = [
    `Fonte: ${snapshot.source}`,
    `Período: ${snapshot.config.period.start} a ${snapshot.config.period.end}`,
    `Moeda e fuso: ${snapshot.account.currency} | ${snapshot.account.timezone}`,
    `Atribuição: ${snapshot.account.attribution.description}`,
    `Qualidade dos dados: ${snapshot.quality.score}% | ${snapshot.quality.status}`,
    `Snapshot: ${snapshot.sourceHash.slice(0, 16)}`,
  ];
  let y = 643;
  for (const item of methodology) {
    page.drawText(fitText(fonts.medium, `- ${item}`, 10, CONTENT_WIDTH), {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.medium,
      color: colors.ink,
    });
    y -= 23;
  }
  page.drawText("Limitações declaradas", { x: MARGIN, y: y - 7, size: 15, font: fonts.bold, color: colors.ink });
  y -= 38;
  for (const limitation of analysis.limitations.slice(0, 7)) {
    y = drawWrapped(page, fonts.regular, `- ${limitation}`, {
      x: MARGIN,
      y,
      width: CONTENT_WIDTH,
      size: 10,
      lineHeight: 14,
      maxLines: 4,
      color: colors.muted,
    }) - 10;
  }
  page.drawText(`Confiança da análise: ${analysis.confidence}`, {
    x: MARGIN,
    y: Math.max(y - 8, 58),
    size: 10,
    font: fonts.bold,
    color: colors.accent,
  });
}

export async function createReportPdfBytes(
  snapshot: NormalizedSnapshot,
  analysis: ReportAnalysis,
) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const medium = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, medium, bold };
  document.setTitle(`Projeto Washington - ${safeText(snapshot.config.clientName)}`);
  document.setAuthor("Projeto Washington");
  document.setCreator("Projeto Washington");
  document.setSubject(`sourceHash:${snapshot.sourceHash}`);
  document.setKeywords(["Meta Ads", snapshot.config.objective, snapshot.sourceHash]);
  document.setCreationDate(new Date(snapshot.capturedAt));
  document.setModificationDate(new Date());

  addSummaryPage(document, fonts, snapshot, analysis);
  addDiagnosisPage(document, fonts, snapshot, analysis);
  addCampaignPage(document, fonts, snapshot);
  addActionsPage(document, fonts, snapshot, analysis);
  addMethodPage(document, fonts, snapshot, analysis);
  return document.save({ useObjectStreams: false });
}
