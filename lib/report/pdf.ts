import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { performanceLabels } from "./performance";
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
  critical: rgb(0.702, 0.251, 0.251),
  recovery: rgb(0.137, 0.435, 0.533),
};

function performanceColor(snapshot: NormalizedSnapshot) {
  if (snapshot.performance.status === "critical") return colors.critical;
  if (snapshot.performance.status === "attention") return colors.warning;
  if (snapshot.performance.status === "strong") return colors.positive;
  if (snapshot.performance.status === "recovery") return colors.recovery;
  return colors.muted;
}

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
  drawBase(page, fonts, snapshot, 1, snapshot.config.clientName, "Onde estamos");
  page.drawText(safeText(performanceLabels[snapshot.performance.status].toUpperCase()), {
    x: MARGIN,
    y: 665,
    size: 9,
    font: fonts.bold,
    color: performanceColor(snapshot),
  });
  drawWrapped(page, fonts.bold, analysis.narrative.headline, {
    x: MARGIN,
    y: 640,
    width: CONTENT_WIDTH,
    size: 18,
    lineHeight: 22,
    maxLines: 2,
  });
  drawWrapped(page, fonts.regular, analysis.executiveSummary, {
    x: MARGIN,
    y: 582,
    width: CONTENT_WIDTH,
    size: 11,
    lineHeight: 16,
    maxLines: 5,
    color: colors.muted,
  });

  const gap = 12;
  const cardWidth = (CONTENT_WIDTH - gap) / 2;
  metricRefs(snapshot).forEach((ref, index) => {
    const metric = snapshot.evidence[ref];
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + column * (cardWidth + gap);
    const y = 370 - row * 116;
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
    const lowerIsBetter = ["costPerPurchase", "costPerLead", "cpc", "cpm"].includes(metric.metric);
    const favorable =
      metric.percentChange !== null &&
      (lowerIsBetter ? metric.percentChange <= 0 : metric.percentChange >= 0);
    page.drawText(fitText(fonts.medium, change, 9, cardWidth - 24), {
      x: x + 12,
      y: y + 14,
      size: 9,
      font: fonts.medium,
      color: metric.metric === "spend" || metric.percentChange === null
        ? colors.muted
        : favorable
          ? colors.positive
          : colors.warning,
    });
  });
  page.drawText(`Leitura: ${safeText(snapshot.performance.rationale)}`, {
    x: MARGIN,
    y: 214,
    size: 9,
    font: fonts.regular,
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
  drawBase(
    page,
    fonts,
    snapshot,
    2,
    snapshot.config.audience === "client" ? "O que identificamos" : "Indicadores e diagnóstico",
    snapshot.config.audience === "client" ? "Leitura objetiva" : "O que mudou",
  );
  let y = 642;
  const findings = snapshot.config.audience === "client"
    ? analysis.narrative.findings
    : [...analysis.facts.slice(0, 3), ...analysis.interpretations.slice(0, 2)];
  for (const [index, finding] of findings.slice(0, 5).entries()) {
    drawCard(page, MARGIN, y - 66, CONTENT_WIDTH, 81);
    page.drawText(String(index + 1).padStart(2, "0"), {
      x: MARGIN + 14,
      y: y - 20,
      size: 16,
      font: fonts.bold,
      color: colors.accent,
    });
    drawWrapped(page, fonts.medium, finding.text, {
      x: MARGIN + 56,
      y: y - 10,
      width: CONTENT_WIDTH - 72,
      size: 10,
      lineHeight: 14,
      maxLines: 4,
    });
    y -= 94;
  }
  if (snapshot.config.audience === "client") {
    const taxonomyCards = (["audience", "format"] as const).flatMap((dimension) => {
      if (!snapshot.creativeAnalysis.coverage[dimension].eligibleForNarrative) return [];
      const rows = dimension === "audience"
        ? snapshot.creativeAnalysis.audience
        : snapshot.creativeAnalysis.format;
      const top = rows.find((item) => item.key !== "unclassified" && (item.current.spend ?? 0) > 0);
      return top ? [{ dimension, item: top }] : [];
    });
    if (taxonomyCards.length > 0 && y > 190) {
      page.drawText("Recortes pela nomenclatura", {
        x: MARGIN,
        y: y - 2,
        size: 13,
        font: fonts.bold,
        color: colors.ink,
      });
      y -= 28;
      const gap = 12;
      const width = (CONTENT_WIDTH - gap) / 2;
      taxonomyCards.slice(0, 2).forEach(({ dimension, item }, index) => {
        const x = MARGIN + index * (width + gap);
        const prefix = `breakdown.${dimension}.${item.key}`;
        const efficiencyMetric = snapshot.config.objective === "ecommerce" ? "roas" : "costPerLead";
        const spend = snapshot.evidence[`${prefix}.spend`];
        const efficiency = snapshot.evidence[`${prefix}.${efficiencyMetric}`];
        drawCard(page, x, y - 75, width, 86);
        page.drawText(fitText(fonts.bold, item.label, 10, width - 24), {
          x: x + 12,
          y: y - 10,
          size: 10,
          font: fonts.bold,
          color: colors.ink,
        });
        page.drawText(fitText(fonts.regular, `Investimento: ${spend.formattedCurrent}`, 9, width - 24), {
          x: x + 12,
          y: y - 34,
          size: 9,
          font: fonts.regular,
          color: colors.muted,
        });
        page.drawText(fitText(fonts.regular, `${efficiency.label}: ${efficiency.formattedCurrent}`, 9, width - 24), {
          x: x + 12,
          y: y - 54,
          size: 9,
          font: fonts.regular,
          color: colors.muted,
        });
      });
      drawWrapped(page, fonts.regular, "Classificação baseada nos nomes; não comprova targeting ou causalidade.", {
        x: MARGIN,
        y: y - 94,
        width: CONTENT_WIDTH,
        size: 8,
        lineHeight: 11,
        maxLines: 2,
        color: colors.muted,
      });
    }
  }
}

function drawTaxonomySection(
  page: PDFPage,
  fonts: { regular: PDFFont; medium: PDFFont; bold: PDFFont },
  snapshot: NormalizedSnapshot,
  dimension: "audience" | "format",
  y: number,
) {
  const coverage = snapshot.creativeAnalysis.coverage[dimension];
  const rows = (dimension === "audience"
    ? snapshot.creativeAnalysis.audience
    : snapshot.creativeAnalysis.format).slice(0, 4);
  const title = dimension === "audience" ? "Por tipo de público" : "Por formato de anúncio";
  const coverageText = coverage.rateBySpend === null
    ? "Sem cobertura"
    : `${Math.round(coverage.rateBySpend * 100)}% classificado`;
  page.drawText(title, { x: MARGIN, y, size: 14, font: fonts.bold, color: colors.ink });
  page.drawText(coverageText, {
    x: PAGE_WIDTH - MARGIN - fonts.medium.widthOfTextAtSize(coverageText, 8),
    y: y + 2,
    size: 8,
    font: fonts.medium,
    color: coverage.eligibleForNarrative ? colors.positive : colors.warning,
  });
  y -= 23;
  const headers = ["Grupo", "Investimento", "Resultados", "Eficiência"];
  const columns = [MARGIN + 10, MARGIN + 210, MARGIN + 330, MARGIN + 420];
  page.drawRectangle({ x: MARGIN, y: y - 22, width: CONTENT_WIDTH, height: 27, color: rgb(0.93, 0.945, 0.97) });
  headers.forEach((header, index) => page.drawText(header.toUpperCase(), {
    x: columns[index], y: y - 12, size: 7, font: fonts.bold, color: colors.muted,
  }));
  y -= 27;
  const resultMetric = snapshot.config.objective === "ecommerce" ? "purchases" : "leads";
  const efficiencyMetric = snapshot.config.objective === "ecommerce" ? "roas" : "costPerLead";
  for (const item of rows) {
    const prefix = `breakdown.${dimension}.${item.key}`;
    drawCard(page, MARGIN, y - 37, CONTENT_WIDTH, 42);
    const values = [
      item.label,
      snapshot.evidence[`${prefix}.spend`].formattedCurrent,
      snapshot.evidence[`${prefix}.${resultMetric}`].formattedCurrent,
      snapshot.evidence[`${prefix}.${efficiencyMetric}`].formattedCurrent,
    ];
    values.forEach((value, index) => page.drawText(fitText(index === 0 ? fonts.bold : fonts.regular, value, 8, index === 0 ? 180 : 90), {
      x: columns[index], y: y - 21, size: 8, font: index === 0 ? fonts.bold : fonts.regular, color: colors.ink,
    }));
    y -= 46;
  }
  return y;
}

function addCampaignPage(
  document: PDFDocument,
  fonts: { regular: PDFFont; medium: PDFFont; bold: PDFFont },
  snapshot: NormalizedSnapshot,
  analysis: ReportAnalysis,
) {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  if (snapshot.config.audience === "client") {
    drawBase(page, fonts, snapshot, 3, "Plano de ação", "O que foi feito e o que vem agora");
    let y = 642;
    const groups = [
      { title: "O que já foi feito", items: analysis.narrative.actionsTaken },
      { title: "Próximos passos", items: analysis.narrative.nextSteps },
    ];
    for (const group of groups) {
      page.drawText(group.title, { x: MARGIN, y, size: 15, font: fonts.bold, color: colors.ink });
      y -= 27;
      if (group.items.length === 0) {
        drawWrapped(page, fonts.regular, "Nenhuma ação foi confirmada pela equipe.", {
          x: MARGIN,
          y,
          width: CONTENT_WIDTH,
          size: 10,
          lineHeight: 14,
          maxLines: 2,
          color: colors.muted,
        });
        y -= 48;
      }
      for (const item of group.items.slice(0, 3)) {
        drawCard(page, MARGIN, y - 65, CONTENT_WIDTH, 78);
        page.drawText(fitText(fonts.bold, item.title, 10, CONTENT_WIDTH - 120), {
          x: MARGIN + 12,
          y: y - 11,
          size: 10,
          font: fonts.bold,
          color: colors.ink,
        });
        page.drawText(fitText(fonts.bold, item.status.replaceAll("_", " ").toUpperCase(), 7, 85), {
          x: PAGE_WIDTH - MARGIN - 95,
          y: y - 11,
          size: 7,
          font: fonts.bold,
          color: item.status === "aplicado" ? colors.positive : colors.accent,
        });
        drawWrapped(page, fonts.regular, item.detail, {
          x: MARGIN + 12,
          y: y - 31,
          width: CONTENT_WIDTH - 24,
          size: 9,
          lineHeight: 13,
          maxLines: 3,
          color: colors.muted,
        });
        y -= 90;
      }
      y -= 13;
    }
    return;
  }
  if (
    snapshot.creativeAnalysis.mode === "strict" &&
    (snapshot.creativeAnalysis.coverage.audience.eligibleAds > 0 ||
      snapshot.creativeAnalysis.coverage.format.eligibleAds > 0)
  ) {
    drawBase(page, fonts, snapshot, 3, "Públicos e criativos", "Leitura pela nomenclatura");
    let taxonomyY = drawTaxonomySection(page, fonts, snapshot, "audience", 642);
    taxonomyY -= 18;
    drawTaxonomySection(page, fonts, snapshot, "format", taxonomyY);
    drawWrapped(page, fonts.regular, "A classificação deriva somente dos nomes de campanha, conjunto e anúncio. Ela não substitui o targeting configurado no Meta.", {
      x: MARGIN,
      y: 74,
      width: CONTENT_WIDTH,
      size: 8,
      lineHeight: 11,
      maxLines: 2,
      color: colors.muted,
    });
    return;
  }
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
  drawBase(
    page,
    fonts,
    snapshot,
    4,
    snapshot.config.audience === "client" ? "O que esperar" : "Hipóteses e ações prioritárias",
    snapshot.config.audience === "client" ? "Perspectiva sem promessa" : "O que avaliar primeiro",
  );
  let y = 635;
  if (snapshot.config.audience === "client") {
    for (const [index, item] of analysis.narrative.outlook.slice(0, 3).entries()) {
      page.drawText(String(index + 1).padStart(2, "0"), {
        x: MARGIN,
        y,
        size: 15,
        font: fonts.bold,
        color: performanceColor(snapshot),
      });
      y = drawWrapped(page, fonts.medium, item.text, {
        x: MARGIN + 36,
        y: y + 1,
        width: CONTENT_WIDTH - 36,
        size: 10,
        lineHeight: 14,
        maxLines: 4,
      }) - 15;
    }
    page.drawLine({
      start: { x: MARGIN, y: y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.8,
      color: colors.line,
    });
    y -= 28;
    page.drawText("Decisões de mídia paga", { x: MARGIN, y, size: 15, font: fonts.bold, color: colors.ink });
    y -= 26;
  }
  analysis.recommendations.slice(0, 3).forEach((recommendation, index) => {
    drawCard(page, MARGIN, y - 126, CONTENT_WIDTH, 140);
    page.drawText(String(index + 1).padStart(2, "0"), {
      x: MARGIN + 14,
      y: y - 18,
      size: 18,
      font: fonts.bold,
      color: colors.accent,
    });
    let innerY = drawWrapped(page, fonts.bold, recommendation.action, {
      x: MARGIN + 56,
      y: y - 8,
      width: CONTENT_WIDTH - 70,
      size: 12,
      lineHeight: 16,
      maxLines: 2,
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
    y -= 151;
  });
}

function addMethodPage(
  document: PDFDocument,
  fonts: { regular: PDFFont; medium: PDFFont; bold: PDFFont },
  snapshot: NormalizedSnapshot,
  analysis: ReportAnalysis,
) {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawBase(
    page,
    fonts,
    snapshot,
    5,
    snapshot.config.audience === "client" ? "Próxima leitura" : "Pendências e método",
    snapshot.config.audience === "client" ? "Próximo marco de decisão" : "O que falta validar",
  );
  let y = 643;
  drawCard(page, MARGIN, y - 83, CONTENT_WIDTH, 98);
  page.drawText("QUANDO E POR QUÊ", {
    x: MARGIN + 14,
    y: y - 13,
    size: 8,
    font: fonts.bold,
    color: colors.accent,
  });
  drawWrapped(page, fonts.medium, analysis.narrative.nextReview.text, {
    x: MARGIN + 14,
    y: y - 35,
    width: CONTENT_WIDTH - 28,
    size: 11,
    lineHeight: 15,
    maxLines: 4,
  });
  y -= 123;
  if (snapshot.config.audience === "internal") {
    page.drawText("O que ainda precisamos", { x: MARGIN, y, size: 15, font: fonts.bold, color: colors.ink });
    y -= 28;
    for (const item of analysis.narrative.internalNeeds.slice(0, 4)) {
      y = drawWrapped(page, fonts.regular, `- ${item.text}`, {
        x: MARGIN,
        y,
        width: CONTENT_WIDTH,
        size: 10,
        lineHeight: 14,
        maxLines: 3,
        color: colors.muted,
      }) - 8;
    }
    y -= 7;
  }
  const methodology = [
    `Fonte: ${snapshot.source}`,
    `Período: ${snapshot.config.period.start} a ${snapshot.config.period.end}`,
    `Moeda e fuso: ${snapshot.account.currency} | ${snapshot.account.timezone}`,
    `Atribuição: ${snapshot.account.attribution.description}`,
    `Qualidade dos dados: ${snapshot.quality.score}% | ${snapshot.quality.status}`,
    `Snapshot: ${snapshot.sourceHash.slice(0, 16)}`,
  ];
  page.drawText("Base da leitura", { x: MARGIN, y, size: 15, font: fonts.bold, color: colors.ink });
  y -= 28;
  for (const item of methodology) {
    page.drawText(fitText(fonts.medium, `- ${item}`, 10, CONTENT_WIDTH), {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.medium,
      color: colors.ink,
    });
    y -= 20;
  }
  page.drawText("Limitações declaradas", { x: MARGIN, y: y - 4, size: 13, font: fonts.bold, color: colors.ink });
  y -= 30;
  for (const limitation of analysis.limitations.slice(0, 4)) {
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
  addCampaignPage(document, fonts, snapshot, analysis);
  addActionsPage(document, fonts, snapshot, analysis);
  addMethodPage(document, fonts, snapshot, analysis);
  return document.save({ useObjectStreams: false });
}
