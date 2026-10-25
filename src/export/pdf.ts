import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import PDFDocument from "pdfkit";
import type { z } from "zod";
import { itineraryExportSchema } from "./schema";

export type ItineraryExport = z.infer<typeof itineraryExportSchema>;

export interface PdfExporter {
  export(tripId: string, itinerary: ItineraryExport): Promise<string>;
}

export class LocalPdfExporter implements PdfExporter {
  constructor(
    private readonly exportDirectory = resolve(
      process.env.PDF_EXPORT_DIR ?? join(process.cwd(), "storage", "pdfs")
    )
  ) {}

  async export(tripId: string, itinerary: ItineraryExport): Promise<string> {
    const path = join(this.exportDirectory, `trip-${tripId}.pdf`);
    const pdf = await renderItineraryPdf(itinerary);
    await mkdir(this.exportDirectory, { recursive: true });
    await writeFile(path, pdf);
    return path;
  }
}

export function renderItineraryPdf(itinerary: ItineraryExport): Promise<Buffer> {
  return new Promise((resolvePdf, rejectPdf) => {
    const document = new PDFDocument({ margin: 54, size: "A4" });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", rejectPdf);
    document.on("end", () => resolvePdf(Buffer.concat(chunks)));

    document.fontSize(10).fillColor("#28594b").text("ICEPOT  /  THOUGHTFUL TRAVEL");
    document.moveDown(1.4);
    document.fontSize(27).fillColor("#202a27").text(itinerary.title);
    document.moveDown(0.5);
    document.fontSize(11).fillColor("#64716a").text(itinerary.summary, {
      lineGap: 4
    });
    if (itinerary.estimatedTotalCost !== undefined) {
      document.moveDown(0.7);
      document
        .fontSize(12)
        .fillColor("#28594b")
        .text(`Estimated total: ${itinerary.currency} ${itinerary.estimatedTotalCost.toFixed(2)}`);
    }

    for (const [index, day] of itinerary.days.entries()) {
      document.moveDown(1.2);
      if (document.y > 690) document.addPage();
      document
        .fontSize(9)
        .fillColor("#c27f5d")
        .text(`DAY ${String(index + 1).padStart(2, "0")}  /  ${day.date}`);
      document.moveDown(0.2);
      document.fontSize(17).fillColor("#202a27").text(day.title);
      document.moveDown(0.4);
      for (const activity of day.activities) {
        document.fontSize(10).fillColor("#53615a").text(`-  ${activity}`, {
          indent: 8,
          lineGap: 3
        });
      }
    }

    document.moveDown(1.5);
    document
      .fontSize(8)
      .fillColor("#929b95")
      .text("Planning draft only. Confirm availability and details before booking.");
    document.end();
  });
}
