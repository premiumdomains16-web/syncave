// Minimal Excel (.xlsx) writer: one sheet, a bold frozen header row, autofilter,
// column widths, text cells (so phone numbers keep their leading 0). No heavy
// dependency; fflate does the zipping and runs in Edge Functions and Node.
import { strToU8, zipSync } from "fflate";

export interface Sheet {
  name: string;
  columns: { header: string; width: number }[];
  rows: string[][];
  /** Right-to-left sheet (Arabic). */
  rtl?: boolean;
}

// XML 1.0 forbids most control characters; drop them, then escape.
const clean = (s: string) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
const esc = (s: string) => clean(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const col = (i: number) => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function cell(ref: string, value: string, style: number) {
  // Inline strings: no shared-strings table needed; text stays text (no date/number guessing).
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

export function buildXlsx(sheet: Sheet): Uint8Array {
  const lastCol = col(sheet.columns.length - 1);
  const lastRow = sheet.rows.length + 1;
  const header = `<row r="1">${sheet.columns.map((c, i) => cell(`${col(i)}1`, c.header, 1)).join("")}</row>`;
  const body = sheet.rows.map((r, ri) => `<row r="${ri + 2}">${r.map((v, ci) => cell(`${col(ci)}${ri + 2}`, v, 2)).join("")}</row>`).join("");
  const cols = sheet.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join("");

  const worksheet = `${HEAD}<worksheet xmlns="${NS}" xmlns:r="${REL}">` +
    `<sheetViews><sheetView workbookViewId="0"${sheet.rtl ? ' rightToLeft="1"' : ""}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${header}${body}</sheetData>` +
    (sheet.rows.length ? `<autoFilter ref="A1:${lastCol}${lastRow}"/>` : "") +
    `</worksheet>`;

  const styles = `${HEAD}<styleSheet xmlns="${NS}">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF157A6E"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="3">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
    `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>` +
    `</cellXfs></styleSheet>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`),
    "_rels/.rels": strToU8(`${HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`${HEAD}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="${esc(sheet.name).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>` +
      (sheet.rows.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${esc(sheet.name).slice(0, 31)}'!$A$1:$${lastCol}$${lastRow}</definedName></definedNames>` : "") +
      `</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`${HEAD}<Relationships xmlns="${PKG_REL}">` +
      `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(worksheet),
    "xl/styles.xml": strToU8(styles),
  };
  return zipSync(files, { level: 6 });
}
